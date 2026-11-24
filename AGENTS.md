# Instruções para agentes — BI iGPP - UK Pact - Caatinga

## Antes de começar

1. Rode `git pull` neste repositório e no `meu-contexto`.
2. Leia, no `meu-contexto`:
   - `AGENTS.md` e `autonomia.md`;
   - `infra/bancos.md`, que define o acesso ao banco;
   - `igpp/uk-pact/caatinga/README.md`, a síntese do projeto;
   - `igpp/uk-pact/caatinga/dados/`, com o catálogo, as salvaguardas e a base municipal.
3. Leia `docs/especificacao.md` neste repositório. Ela é a fonte do que deve ser construído.

## Regras

- **Banco:** só `psql service=curupira` ou `psycopg.connect("service=curupira")`. O serviço já vem em modo só leitura.
  - Nunca leia, exiba ou copie `~/.pgpass`.
  - Nunca use conexão padrão nem o serviço `terraanalytics`. Este projeto é do iGPP.
- **SQL:**
  - Todo SQL fica salvo em `extract/` antes de rodar.
  - Mostre a SQL a Pedro e espere a aprovação antes da primeira execução de cada arquivo.
  - Só `SELECT`. Nada de `CREATE`, `INSERT`, `UPDATE`, `DROP` ou tabela temporária no banco.
- **Dados versionados:** só agregados (município × tipologia ou acima).
  - Proibido em `data/`: `cod_imovel`, `geom`, CPF/CNPJ, nomes de pessoas ou qualquer linha por imóvel.
  - Antes de cada commit, rode `scripts/checar_dados.py`. Ele falha se encontrar essas colunas.
- **Sem segredos no código:** nenhuma credencial em HTML, JS, scripts ou logs. O BI final não acessa banco, só lê arquivos de `data/`.
- **Rastreabilidade:** registre cada extração em `data/manifest.json` com:
  - arquivo `.sql`;
  - data e hora;
  - número de linhas;
  - totais de conferência.
- **Fato × inferência:** regras encontradas no código não são decisões metodológicas aprovadas. Diferenças em relação ao Relatório 2 são relatadas a Pedro, não corrigidas por conta própria.
- **Encerramento:** registre o resumo da sessão em `meu-contexto/infra/diario.md`, sem segredos.
