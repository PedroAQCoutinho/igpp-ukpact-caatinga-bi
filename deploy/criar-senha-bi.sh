#!/usr/bin/env bash
# Roda NA VM, de forma interativa, por Pedro. Cria ~/.agentes-segredos/bi-caddy.env (600) com
# BI_USER e o hash bcrypt da senha. A senha não aparece na tela, em argumentos de processo nem em log.
set -euo pipefail
umask 077
read -rp "Usuário do BI (compartilhado com a equipe): " U
read -rsp "Senha: " P1; echo
read -rsp "Repita a senha: " P2; echo
[ "$P1" = "$P2" ] || { echo "As senhas não conferem."; exit 1; }
[ ${#P1} -ge 10 ] || { echo "Use pelo menos 10 caracteres."; exit 1; }
H=$(printf '%s\n' "$P1" | docker exec -i caddy-caddy-1 caddy hash-password)
unset P1 P2
case "$H" in \$2a\$*) ;; *) echo "Falha ao gerar o hash."; exit 1;; esac
printf "BI_USER=%s\nBI_HASH='%s'\n" "$U" "$H" > ~/.agentes-segredos/bi-caddy.env
chmod 600 ~/.agentes-segredos/bi-caddy.env
echo "Gravado em ~/.agentes-segredos/bi-caddy.env (600). Pode voltar ao Claude."
