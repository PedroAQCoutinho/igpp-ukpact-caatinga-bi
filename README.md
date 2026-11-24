# BI — iGPP - UK Pact - Caatinga

BI exploratório e local para as reuniões do projeto. É uma página estática com DuckDB no navegador, que lê dados agregados de `data/` e não conecta a banco nenhum.

> Em construção. A especificação está em [docs/especificacao.md](docs/especificacao.md) e as regras para agentes, em [AGENTS.md](AGENTS.md).

## Como abrir (colegas)

1. `git clone git@github.com:PedroAQCoutinho/igpp-ukpact-caatinga-bi.git`
2. `cd igpp-ukpact-caatinga-bi`
3. Linux/Mac: `./run.sh`. Windows: dê dois cliques em `run.bat`. É preciso ter Python 3.
4. O navegador abre em `http://localhost:8000`.
5. Para encerrar, feche o terminal.

Não abra o `index.html` com dois cliques: o navegador bloqueia o DuckDB em `file://`.
