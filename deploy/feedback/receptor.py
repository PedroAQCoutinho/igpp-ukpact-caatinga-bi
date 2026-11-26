#!/usr/bin/env python3
"""Receptor de feedback do BI Caatinga (VM Oracle).

Serviço mínimo, só biblioteca padrão do Python (3.8+). Fica atrás do Caddy, que já
exige a senha do BI; este processo não é exposto à internet.

  POST /api/feedback         JSON {categoria, nome, texto, contexto, imagem_b64?, imagem_tipo?, audio_b64?, audio_tipo?}
  GET  /api/feedback/saude   {"ok": true}  (o BI usa para decidir se mostra o botão)

Cada envio vira uma pasta em FEEDBACK_DIR/<AAAAmmdd-HHMMSS>-<id>/ com:
  feedback.json, captura.<png|jpg|webp> (opcional), audio.<webm|ogg|mp4|m4a|mp3|wav> (opcional)

Feedback direto como issue (especificação 10.4): logo depois de salvar, uma thread cria a issue no GitHub
(issues.py) e grava issue.json na pasta; se o GitHub falhar, tenta de novo a cada minuto, sem duplicar.
Depois avisa no celular pelo ntfy (se NTFY_URL estiver definido). A transcrição do áudio fica com transcrever.py.

Variáveis: FEEDBACK_DIR (padrão ~/feedback/bi-caatinga), BIND (padrão 127.0.0.1), PORT (padrão 8090),
e as de issues.py (GITHUB_TOKEN, GH_REPO, BI_URL, NTFY_URL, NTFY_AUTH). Nenhum segredo no código.
"""
import base64
import binascii
import json
import os
import secrets
import threading
import time
from collections import defaultdict, deque
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import issues

DIR = Path(os.environ.get("FEEDBACK_DIR", str(Path.home() / "feedback" / "bi-caatinga")))
BIND = os.environ.get("BIND", "127.0.0.1")
PORT = int(os.environ.get("PORT", "8090"))
MAX_CORPO = 22 * 1024 * 1024          # JSON inteiro (base64 aumenta ~33%)
MAX_IMG = 5 * 1024 * 1024             # depois de decodificar
MAX_AUD = 10 * 1024 * 1024
LIMITE_MIN = 10                       # envios por minuto por IP
LIMITE_HORA = 20                      # envios por hora por IP
CATEGORIAS = {"problema", "melhoria", "duvida", "elogio"}
EXT_IMG = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}
EXT_AUD = {"audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "mp4", "audio/x-m4a": "m4a",
           "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-wav": "wav"}
_envios = defaultdict(deque)
_lock = threading.Lock()
_acorda = threading.Event()


def _limite_ok(ip: str) -> bool:
    with _lock:
        agora, fila = time.time(), _envios[ip]
        while fila and agora - fila[0] > 3600:
            fila.popleft()
        if len(fila) >= LIMITE_HORA or sum(1 for t in fila if agora - t <= 60) >= LIMITE_MIN:
            return False
        fila.append(agora)
        return True


def _trabalhador():
    """Cria as issues pendentes (pastas sem issue.json). Acorda a cada envio ou a cada minuto."""
    rotulos_ok = False
    while True:
        _acorda.wait(60)
        _acorda.clear()
        if not issues.configurado():
            continue
        for jf in sorted(DIR.glob("*/feedback.json")):
            pasta = jf.parent
            if (pasta / "issue.json").exists():
                continue
            try:
                f = json.loads(jf.read_text(encoding="utf-8"))
                if not rotulos_ok:
                    issues.garantir_rotulos()
                    rotulos_ok = True
                marca = pasta / ".tentou"
                iss = issues.criar_issue(f, tentativa_anterior=marca.exists())
                (pasta / "issue.json").write_text(json.dumps(iss), encoding="utf-8")
                print(f"issue #{iss['numero']} criada para {f['id']}", flush=True)
                issues.avisar(f, iss)
            except issues.ErroGitHub as e:
                (pasta / ".tentou").touch()
                print(f"{pasta.name}: {e}; nova tentativa em 1 minuto", flush=True)
                break
            except (OSError, ValueError, KeyError) as e:
                print(f"{pasta.name}: {type(e).__name__} ao processar", flush=True)


def _decodifica(b64, tipo, tabela, maximo, nome):
    if not b64:
        return None, None
    base = (tipo or "").split(";")[0].strip().lower()
    if base not in tabela:
        raise ValueError(f"tipo de {nome} não aceito: {base or 'vazio'}")
    if "," in b64[:100]:               # aceita data URL
        b64 = b64.split(",", 1)[1]
    try:
        dados = base64.b64decode(b64, validate=True)
    except (binascii.Error, ValueError):
        raise ValueError(f"{nome} inválido")
    if len(dados) > maximo:
        raise ValueError(f"{nome} maior que {maximo // (1024 * 1024)} MB")
    return dados, tabela[base]


class Handler(BaseHTTPRequestHandler):
    server_version = "bi-feedback"

    def _resp(self, cod, obj):
        corpo = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(cod)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(corpo)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(corpo)

    def do_GET(self):
        if self.path.rstrip("/") == "/api/feedback/saude":
            return self._resp(200, {"ok": True})
        self._resp(404, {"ok": False})

    def do_POST(self):
        if self.path.rstrip("/") != "/api/feedback":
            return self._resp(404, {"ok": False})
        ip = (self.headers.get("X-Forwarded-For") or self.client_address[0]).split(",")[0].strip()
        if not _limite_ok(ip):
            return self._resp(429, {"ok": False, "erro": "muitos envios; tente em um minuto"})
        tam = int(self.headers.get("Content-Length") or 0)
        if tam <= 0 or tam > MAX_CORPO:
            return self._resp(413, {"ok": False, "erro": "envio vazio ou grande demais"})
        try:
            p = json.loads(self.rfile.read(tam))
            cat = str(p.get("categoria", "")).strip()
            nome = str(p.get("nome", "")).strip()[:200]
            texto = str(p.get("texto", "")).strip()[:10000]
            if cat not in CATEGORIAS:
                raise ValueError("categoria inválida")
            if not nome:
                raise ValueError("nome é obrigatório")
            img, ext_img = _decodifica(p.get("imagem_b64"), p.get("imagem_tipo"), EXT_IMG, MAX_IMG, "imagem")
            aud, ext_aud = _decodifica(p.get("audio_b64"), p.get("audio_tipo"), EXT_AUD, MAX_AUD, "áudio")
            if not texto and not aud:
                raise ValueError("escreva um texto ou envie um áudio")
            ctx = p.get("contexto") if isinstance(p.get("contexto"), dict) else {}
        except (ValueError, json.JSONDecodeError) as e:
            return self._resp(400, {"ok": False, "erro": str(e)})

        agora = datetime.now(timezone.utc)
        fid = agora.strftime("%Y%m%d-%H%M%S") + "-" + secrets.token_hex(3)
        pasta = DIR / fid
        pasta.mkdir(parents=True, exist_ok=False)
        reg = {"id": fid, "recebido_em": agora.isoformat(), "categoria": cat, "nome": nome, "texto": texto,
               "contexto": ctx, "navegador": self.headers.get("User-Agent", "")[:300],
               "captura": None, "audio": None}
        if img:
            (pasta / f"captura.{ext_img}").write_bytes(img)
            reg["captura"] = f"captura.{ext_img}"
        if aud:
            (pasta / f"audio.{ext_aud}").write_bytes(aud)
            reg["audio"] = f"audio.{ext_aud}"
        (pasta / "feedback.json").write_text(json.dumps(reg, ensure_ascii=False, indent=1), encoding="utf-8")
        _acorda.set()
        self._resp(201, {"ok": True, "id": fid})

    def log_message(self, fmt, *args):   # log curto, sem conteúdo do feedback
        print(f"{self.log_date_time_string()} {self.command} {self.path} {args[1] if len(args) > 1 else ''}", flush=True)


if __name__ == "__main__":
    DIR.mkdir(parents=True, exist_ok=True)
    os.chmod(DIR, 0o700)
    print(f"bi-feedback em {BIND}:{PORT}, gravando em {DIR}; issues {'ligadas' if issues.configurado() else 'DESLIGADAS (sem GITHUB_TOKEN)'}", flush=True)
    threading.Thread(target=_trabalhador, daemon=True).start()
    _acorda.set()
    ThreadingHTTPServer((BIND, PORT), Handler).serve_forever()
