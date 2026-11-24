#!/usr/bin/env bash
# Publica o BI na VM Oracle (site estático servido pelo Caddy do agentes.chat, com senha).
# Uso: scripts/publicar_vm.sh            (envia os arquivos e testa)
# Para trocar o domínio: mude BI_HOST aqui E no environment do caddy (~/caddy/docker-compose.yml na VM).
# Ver meu-contexto/infra/vm-oracle.md, seção "BI Caatinga".
set -euo pipefail
BI_HOST="${BI_HOST:-bi.147-15-67-178.sslip.io}"   # único lugar do host neste lado
VM="${VM:-opc@147.15.67.178}"
CHAVE="${CHAVE:-$HOME/oracle/oracle-vm-1.key}"
DESTINO="sites/bi-caatinga"                      # ~/sites/bi-caatinga na VM, montado como /srv/bi-caatinga
cd "$(dirname "$0")/.."

python3 scripts/checar_dados.py
[ -f data/local/imoveis.parquet ] || { echo "Falta data/local/imoveis.parquet"; exit 1; }

# Só o que o navegador usa. Nada de prototipo/ (imoveis_simulados.json), data/raw, scripts, extract ou .git.
LISTA=$(mktemp)
{ echo index.html; find js vendor -type f; ls data/*.parquet data/malha_municipios.json data/manifest.json; echo data/local/imoveis.parquet; } > "$LISTA"
grep -q prototipo "$LISTA" && { echo "prototipo/ não pode ser publicado"; exit 1; }

# Cópia de trabalho com versões .gz (o Caddy serve com "precompressed gzip"; nada é comprimido na VM)
STAGE=$(mktemp -d); trap 'rm -f "$LISTA"; rm -rf "$STAGE"' EXIT
rsync -a --files-from="$LISTA" ./ "$STAGE/"
find "$STAGE" -type f \( -name '*.wasm' -o -name '*.js' -o -name '*.mjs' -o -name '*.json' -o -name '*.html' -o -name '*.md' \) -exec gzip -9 -k -n {} +
cp deploy/caddy-bi.caddy "$STAGE/.caddy-bi.caddy"

SSH="ssh -i $CHAVE -o ConnectTimeout=30"
$SSH "$VM" "mkdir -p ~/$DESTINO ~/sites/bi-caatinga-caddy"
rsync -az --delete --exclude .caddy-bi.caddy -e "$SSH" "$STAGE/" "$VM:$DESTINO/"
rsync -az -e "$SSH" "$STAGE/.caddy-bi.caddy" "$VM:sites/bi-caatinga-caddy/bi.caddy"
$SSH "$VM" "chmod -R a+rX ~/$DESTINO ~/sites/bi-caatinga-caddy"
echo "Arquivos enviados ($(wc -l < "$LISTA") arquivos + .gz). Bloco do Caddy em ~/sites/bi-caatinga-caddy/bi.caddy."
echo "Se o bloco mudou: ssh na VM e 'docker exec caddy-caddy-1 caddy reload --config /etc/caddy/Caddyfile'."

# Testes: sem senha deve dar 401
code=$(curl -s -o /dev/null -w "%{http_code}" -m 30 "https://$BI_HOST/" || true)
echo "https://$BI_HOST/ sem senha -> $code (esperado 401)"
for u in https://radar.147-15-67-178.sslip.io; do
  echo "$u -> $(curl -s -o /dev/null -w "%{http_code}" -m 30 "$u" || true)"
done
