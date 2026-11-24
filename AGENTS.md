# Instruções para agentes — BI iGPP - UK Pact - Caatinga

## Antes de começar

1. Rode `git pull` neste repositório e no `meu-contexto`.
2. Leia, no `meu-contexto`:
   - `AGENTS.md` e `autonomia.md`;
   - `infra/bancos.md` (acesso ao banco);
   - `igpp/uk-pact/caatinga/README.md`;
   - `igpp/uk-pact/caatinga/dados/` (catálogo, salvaguardas e base municipal).
3. Leia `docs/especificacao.md`, que é a fonte da verdade. Abra `prototipo/`, que é a interface aprovada por Pedro.

## Regras

- **Banco:**
  - Só `psql service=curupira` ou `psycopg.connect("service=curupira")`, que já vem em modo só leitura.
  - Nunca leia, exiba ou copie `~/.pgpass`.
  - Nunca use conexão padrão nem `terraanalytics`. Este projeto é do iGPP.
- **SQL:**
  - Todo SQL fica salvo em `extract/` antes de rodar.
  - Mostre a SQL a Pedro e espere o "ok" antes da primeira execução de cada arquivo.
  - Só `SELECT`. Nada de `CREATE`, `INSERT`, `UPDATE`, `DROP` ou tabela temporária.
- **Dados (decisão de Pedro, 24/11/2026):**
  - Os dados são de fontes públicas.
  - O arquivo por imóvel (`data/local/imoveis.parquet`) é permitido, mas **fica fora do git**, sem `cod_imovel` e sem geometria.
  - Ele é gerado na máquina de Pedro por script, e o agente não imprime linhas, só totais de conferência.
  - O que é versionado em `data/` são agregados, a base socioeconômica e a malha.
  - Rode `python3 scripts/checar_dados.py` antes de cada commit.
- **Sem segredos no código:** nenhuma credencial em HTML, JS, scripts ou logs. O BI não acessa banco; ele só lê arquivos.
- **Interface:** mantenha o comportamento do `prototipo/`. Mudanças de interface são propostas a Pedro, não decididas pelo agente.
- **Fato × inferência:**
  - Regras do código não são decisões metodológicas aprovadas.
  - Diferenças em relação ao Relatório 2 são relatadas, não "corrigidas".
- **Rastreabilidade:** registre cada extração em `data/manifest.json` e cada sessão em `meu-contexto/infra/diario.md`.
