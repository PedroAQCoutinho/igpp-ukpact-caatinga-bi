#!/usr/bin/env bash
# Sobe um servidor local e abre o BI. Uso: ./run.sh [porta]
cd "$(dirname "$0")"
PORTA="${1:-8000}"
URL="http://localhost:${PORTA}/"
( sleep 1; command -v xdg-open >/dev/null && xdg-open "$URL" || command -v open >/dev/null && open "$URL" ) >/dev/null 2>&1 &
echo "BI em $URL — feche com Ctrl+C"
python3 -m http.server "$PORTA" --bind 127.0.0.1
