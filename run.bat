@echo off
cd /d "%~dp0"
start "" http://localhost:8000/
echo BI em http://localhost:8000/ - feche esta janela para encerrar
python -m http.server 8000 --bind 127.0.0.1
