# BI — iGPP - UK Pact - Caatinga

BI exploratório e local para as reuniões do projeto: construtor de mapas municipais, socioeconomia (IBGE e Sicor), território (CAR) e cruzamento entre eles. É uma página estática com DuckDB no navegador, sem conexão a banco e sem internet.

- Especificação (fonte da verdade): [docs/especificacao.md](docs/especificacao.md)
- Interface aprovada: [prototipo/](prototipo/), com geo **simulado**
- Regras para agentes: [AGENTS.md](AGENTS.md)

## Como abrir (colegas)

1. `git clone git@github.com:PedroAQCoutinho/igpp-ukpact-caatinga-bi.git`
2. `cd igpp-ukpact-caatinga-bi`
3. Linux/Mac: `./run.sh`. Windows: dê dois cliques em `run.bat`. É preciso ter Python 3.
4. O navegador abre em `http://localhost:8000`. Funciona sem internet.
5. Para encerrar, feche o terminal.

As abas 3 e 4 precisam de `data/local/imoveis.parquet` (~15 MB). Esse arquivo **não fica no git**: é gerado por Pedro ou distribuído à parte. Sem ele, o BI abre normalmente e as abas 3 e 4 avisam que o arquivo falta; nas abas 1 e 2, as variáveis Geo usam o resumo municipal versionado.

Não abra o `index.html` com dois cliques: o navegador bloqueia o DuckDB em `file://`.

Para ver só o protótipo: `cd prototipo && python3 -m http.server 8001` e abra `http://localhost:8001`.

## Versão publicada (equipe)

https://bi-caatinga.quilici-coutinho.com.br (usuário e senha com Pedro; reserva por alguns dias: https://bi.147-15-67-178.sslip.io). Para atualizar: `scripts/publicar_vm.sh`. Configuração do servidor em `deploy/` e em `meu-contexto/infra/vm-oracle.md`.

## Feedback

Na versão publicada, o botão **Feedback** (canto inferior direito) envia o relato, uma captura anotada e/ou um áudio para o receptor na VM (`deploy/feedback/`), atrás da mesma senha. Localmente (`run.sh`), o botão não aparece. Para virar issues: `python3 scripts/feedback_para_issues.py` (detalhes na seção 10 da especificação).

## Abas

| Aba | Dados |
|---|---|
| 1 · IBGE, 2 · SICOR | Base municipal de Felipe Gandra (19/11/2026), em R$ de 2025 |
| 3 · Geo, 4 · Geo + socioeconomia | Imóveis do CAR (`proj_ukpact_caatinga`, curupira), um registro por imóvel, sem `cod_imovel` |
| 5 · Console SQL | SQL do DuckDB sobre `socio_municipal`, `socio_dicionario`, `imoveis` e `geo_mun_resumo` |

## Arquivos de dados

| Arquivo | Versionado | Gerado por |
|---|---|---|
| `data/socio_municipal.parquet`, `data/socio_dicionario.parquet` | sim | `python3 scripts/converter_socio.py` (de `data/raw/tabelao_municipal.xlsx`) |
| `data/malha_municipios.json` | sim | `python3 scripts/preparar_malha.py --dir <pasta com os zips do IBGE>` (requer `mapshaper`) |
| `data/local/imoveis.parquet` | **não** | `python3 scripts/extrair_imoveis.py` (só Pedro; `service=curupira`; SQL em `extract/01_imoveis.sql`) |
| `data/geo_mun_resumo.parquet` | sim | o mesmo script, a partir do arquivo acima |
| `data/manifest.json` | sim | todos os scripts: origem, data, linhas e totais de conferência |

Depois de extrair: `python3 scripts/conferir_imoveis.py` (compara com o Relatório 2). Antes de cada commit: `python3 scripts/checar_dados.py`.

## Notas sobre os números (24/11/2026)

- **Conferência com o Relatório 2:** imóveis (2.478.646), tipologias, risco fundiário e aridez A + B batem. A área total do arquivo dá 71.895.906 ha contra 71.897.270 ha (−1.364 ha, −0,0019%), por causa do arredondamento a 0,1 ha; diferença aceita por Pedro.
- **Tipologias:** no banco estão escritas `Pronaf`, `Pronaf B`, `Minifundio` e `Medio`; o BI exibe como no relatório (PRONAF, PRONAF B, Minifúndio, Médio). No console SQL vale a grafia do banco.
- **Área potencialmente degradada:** agricultura + pastagem + mosaico degradados, nulos como zero, fixa (Pedro, 24/11/2026, 20h; antes era agricultura + pastagem). O arquivo local foi recalculado a partir dos componentes (`python3 scripts/extrair_imoveis.py --recalcular-degradada`), sem nova extração. Total: 12.680.091 ha no CAR; 12.361.557 ha nos 1.095 municípios das abas 3 e 4.
- **Salvaguardas:** elegível (Eco Invest) = `apto_todos`. O cenário sem UCUS foi removido do BI; a coluna `apto_todos_semucus` continua no arquivo, para o console SQL.
- **Municípios:** o CAR tem 1.213 municípios; 118 deles (91.699 imóveis, 3,9 mi ha) estão fora dos 1.095 da base socioeconômica e **não entram nas abas 3 e 4**. Por isso os totais dessas abas (2.386.947 imóveis) são menores que o universo do relatório. A lista está em `data/manifest.json`.
