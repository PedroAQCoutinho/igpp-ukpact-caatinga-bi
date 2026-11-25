#!/usr/bin/env python3
"""APLs do Observatório Brasileiro de APLs (MDIC) → apl_municipio (seção 12.2 da especificação).

Entrada:  data/raw/Lista APLs_outubro2022_publico.xlsx (planilha oficial, aba "Completa"; fora do git,
          porque traz nome, e-mail e telefone dos gestores — baixe da URL em FONTE_URL)
Saída:    data/apl_municipio.parquet — uma linha por (município da base × APL), muitos-para-muitos:
          codmun, apl_id, nome_apl, setor (grafia da planilha), setor_grupo (11 grupos, GRUPOS), uf, cidade_polo, fonte, ano_ref
          Só entram os municípios dos 1.095 da base socioeconômica. Nenhum dado de contato é copiado.
Uso:      python3 -I scripts/preparar_apl.py   (-I: a planilha é arquivo baixado)
"""
import hashlib
import json
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

import duckdb
import openpyxl

RAIZ = Path(__file__).resolve().parent.parent
XLSX = RAIZ / "data" / "raw" / "Lista APLs_outubro2022_publico.xlsx"
SOCIO = RAIZ / "data" / "socio_municipal.parquet"
OUT = RAIZ / "data" / "apl_municipio.parquet"
MANIFEST = RAIZ / "data" / "manifest.json"
FONTE_URL = ("https://www.gov.br/empresas-e-negocios/pt-br/observatorioapl/apls-brasileiros/apls.xlsx/"
             "@@download/file/Lista%20APLs_outubro2022_publico.xlsx")
FONTE = "Observatório Brasileiro de APLs (MDIC), Lista APLs_outubro2022_publico.xlsx"
ANO_REF = 2022

# Grafias da planilha → nome na base (conferidas à mão em 25/11/2026; só casos sem ambiguidade).
# Ficaram de fora: "São do Cariri" (PB, ambíguo) e nomes de municípios que existem mas estão fora da base.
ALIAS = {
    ("AL", "Olho D’Água Grande"): "Olho d'Água Grande", ("AL", "Major Izidoro"): "Major Isidoro",
    ("BA", "Monte Santos"): "Monte Santo", ("BA", "Morro do Chapel"): "Morro do Chapéu",
    ("BA", "Quinjengue"): "Quijingue", ("BA", "Santa Luz"): "Santaluz", ("BA", "Porções"): "Poções",
    ("BA", "Iritinga"): "Biritinga", ("BA", "Mari"): "Mairi",
    ("CE", "Baturte"): "Baturité", ("CE", "Grangeiro"): "Granjeiro", ("CE", "Enaforte"): "Penaforte",
    ("CE", "Dep. Irapuan Carneiro"): "Deputado Irapuan Pinheiro", ("CE", "Porteira"): "Porteiras",
    ("PB", "Bonito Santa Fé"): "Bonito de Santa Fé", ("PB", "Salgado de São Feliz"): "Salgado de São Félix",
    ("PB", "Tenória"): "Tenório", ("PB", "Bomsucesso"): "Bom Sucesso",
    ("PB", "São José dos Espinharas"): "São José de Espinharas",
    ("PE", "Alagoinhas"): "Alagoinha", ("PE", "Certânia"): "Sertânia", ("PE", "Porção"): "Poção",
    ("PE", "São Bento do Uma"): "São Bento do Una", ("PE", "Itapetin"): "Itapetim", ("PE", "Serubim"): "Surubim",
    ("RN", "São José do Mipibu"): "São José de Mipibu", ("RN", "Fernando Pedrosa"): "Fernando Pedroza",
    ("RN", "Assú"): "Açu", ("RN", "Avelino"): "Pedro Avelino", ("RN", "Pedro"): "Pedro Avelino",  # "Pedro; Avelino" partido
    ("SE", "Canindé do São Francisco"): "Canindé de São Francisco", ("SE", "Portoda Folha"): "Porto da Folha",
}


# Grupos de setor (aprovados por Pedro em 25/11/2026). "Pecuária" genérica entra em bovinocultura.
# Chave = grupo usado nas variáveis tem_apl_setor_<grupo>; valores = grafias da coluna "Setor Produtivo*".
GRUPOS = {
    "bovinocultura": ["Bovinocultura/ Pecuária", "Pecuária"],
    "caprinovinocultura": ["Ovinocaprinocultura/ Pecuária", "Caprinovinocultura", "Criação de Caprinos", "Caprino; Ovinocultura",
                           "Produtos Lácteos; Carnes Caprina e Ovina"],
    "agricultura": ["Agricultura", "Agropecuária", "Agronegócio", "Agricultura Familiar", "Agropecuário", "Agricultura; Agropecuária",
                    "Mandiocultura", "Café", "Cafeicultura", "Licuri"],
    "fruticultura": ["Fruticultura", "Polpa de Frutas", "Cajucultura", "Fruticultura; Apicultura; Mandiocultura"],
    "apicultura": ["Apicultura", "Mel", "Apicultura; Meliponicultura"],
    "avicultura": ["Avicultura Caipira", "Avicultura"],
    "pesca": ["Pesca e Aquicultura"],
    "textil": ["Têxtil; Confecção", "Confecção de Roupas", "Têxtil e Confecções", "Têxtil", "Confecção", "Artesanato", "Renda Renascença", "Calçados"],
    "mineral": ["Setor Mineral", "Base Mineral", "Cerâmica Vermelha", "Água Mineral"],
    "turismo": ["Turismo", "Turismo e Produção Associada"],
    "outros": ["Alimentos", "Alimentício", "Panificação", "Cachaça", "Metalmecânico", "Tecnologia Digital", "Tecnologia da Informação",
               "Geração e Distribuída de Energia Elétrica", "Fabricação de Móveis"],
}
SETOR2GRUPO = {norm_s: g for g, l in GRUPOS.items() for norm_s in l}


def norm(s):
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode().lower()
    return " ".join(re.sub(r"[^a-z0-9 ]", " ", s).split())


def main():
    base = duckdb.sql(f"SELECT codmun, municipio, uf FROM read_parquet('{SOCIO}')").fetchall()
    idx = {(norm(m), u): c for c, m, u in base}
    ufs = {u for _, _, u in base}
    alias = {(u, norm(k)): v for (u, k), v in ALIAS.items()}
    ws = openpyxl.load_workbook(XLSX, read_only=True, data_only=True)["Completa (397)"]
    rows = list(ws.iter_rows(values_only=True))
    cab = [str(c or "").strip() for c in rows[0]]
    col = {n: cab.index(n) for n in ["No.", "Nome do APL*", "Setor Produtivo*", "Estado*", "Cidade Polo*", "Municípios que compõem o APL*"]}
    dados = [r for r in rows[1:] if r[col["No."]] is not None]
    out, sem, sem_grupo = [], set(), set()
    for r in dados:
        uf = str(r[col["Estado*"]]).strip()
        if uf not in ufs:
            continue
        vistos = set()
        for m in re.split(r"[;\n]", str(r[col["Municípios que compõem o APL*"]] or "")):
            m = m.strip()
            if not m:
                continue
            nm = alias.get((uf, norm(m)), m)
            c = idx.get((norm(nm), uf))
            if c is None:
                sem.add((uf, m))
                continue
            if c in vistos:
                continue
            vistos.add(c)
            setor = " ".join(str(r[col["Setor Produtivo*"]]).split())
            if setor not in SETOR2GRUPO:
                sem_grupo.add(setor)
            out.append((c, int(r[col["No."]]), " ".join(str(r[col["Nome do APL*"]]).split()), setor, SETOR2GRUPO.get(setor), uf,
                        " ".join(str(r[col["Cidade Polo*"]] or "").split()), FONTE, ANO_REF))
    assert not sem_grupo, f"setores sem grupo (acrescente em GRUPOS): {sorted(sem_grupo)}"
    con = duckdb.connect()
    con.execute("CREATE TABLE a (codmun VARCHAR, apl_id INTEGER, nome_apl VARCHAR, setor VARCHAR, setor_grupo VARCHAR, uf VARCHAR, cidade_polo VARCHAR, fonte VARCHAR, ano_ref INTEGER)")
    con.executemany("INSERT INTO a VALUES (?,?,?,?,?,?,?,?,?)", out)
    con.execute(f"COPY (SELECT * FROM a ORDER BY codmun, apl_id) TO '{OUT}' (FORMAT parquet, COMPRESSION zstd)")
    n_apl, n_mun = con.execute("SELECT count(DISTINCT apl_id), count(DISTINCT codmun) FROM a").fetchone()
    man = json.loads(MANIFEST.read_text(encoding="utf-8"))
    man["extracoes"]["apl_municipio"] = {
        "origem": FONTE, "url": FONTE_URL,
        "arquivo_local": "data/raw/Lista APLs_outubro2022_publico.xlsx (fora do git: contém contatos dos gestores)",
        "sha256_origem": hashlib.sha256(XLSX.read_bytes()).hexdigest(),
        "script": "scripts/preparar_apl.py", "gerado_em": datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
        "saida": "data/apl_municipio.parquet", "apls_planilha": len(dados), "apls_na_base": n_apl,
        "municipios_com_apl": n_mun, "pares_municipio_apl": len(out),
        "regra": "nomes da coluna 'Municípios que compõem o APL*' casados com a base por UF + nome sem acento; grafias corrigidas em ALIAS",
        "nao_casados_nas_ufs_da_base": len(sem),
        "setor_grupo": "11 grupos aprovados por Pedro em 25/11/2026 (GRUPOS no script); 'Pecuária' genérica em bovinocultura",
    }
    MANIFEST.write_text(json.dumps(man, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{len(dados)} APLs na planilha; {n_apl} com município na base; {n_mun} municípios; {len(out)} pares")


if __name__ == "__main__":
    main()
