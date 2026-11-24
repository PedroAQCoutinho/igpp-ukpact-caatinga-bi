# BI — iGPP - UK Pact - Caatinga

BI exploratório e local para as reuniões do projeto: construtor de mapas municipais, socioeconomia (IBGE e Sicor), território (CAR) e cruzamento entre eles. É uma página estática com DuckDB no navegador, sem conexão a banco.

- Especificação: [docs/especificacao.md](docs/especificacao.md)
- Interface aprovada: [prototipo/](prototipo/), com geo **simulado**
- Regras para agentes: [AGENTS.md](AGENTS.md)

## Como abrir (colegas)

1. `git clone git@github.com:PedroAQCoutinho/igpp-ukpact-caatinga-bi.git`
2. `cd igpp-ukpact-caatinga-bi`
3. Linux/Mac: `./run.sh`. Windows: dê dois cliques em `run.bat`. É preciso ter Python 3.
4. O navegador abre em `http://localhost:8000`.
5. Para encerrar, feche o terminal.

As abas territoriais precisam de `data/local/imoveis.parquet`. Esse arquivo não fica no git e é gerado por Pedro ou distribuído à parte.

Não abra o `index.html` com dois cliques: o navegador bloqueia o DuckDB em `file://`.

Para ver só o protótipo: `cd prototipo && python3 -m http.server 8001` e abra `http://localhost:8001`.
