# Especificação — BI exploratório iGPP - UK Pact - Caatinga

Versão 1, de 24/11/2026. Uso: reunião presencial de 25/11/2026 sobre o próximo relatório. Pedro conduz a tela e a equipe acompanha e propõe queries ao vivo.

## 1. Objetivo

O BI é uma página local que permite:

- explorar o diagnóstico socioeconômico (IBGE e SICOR) e o diagnóstico territorial (CAR, tipologias, uso, degradação, clima, situação fundiária e salvaguardas);
- cruzar os dois diagnósticos por município;
- rodar **SQL livre** durante a reunião.

## 2. Arquitetura (decidida)

- **Página estática**, `index.html` com módulos ES em `js/`. Não há etapa de build nem backend.
- **DuckDB-WASM** no navegador consulta os arquivos Parquet de `data/`. Todos os gráficos são queries DuckDB.
- **Bibliotecas copiadas para `vendor/`**, para funcionar sem internet:
  - DuckDB-WASM: `@duckdb/duckdb-wasm` e os bundles `mvp`/`eh` com os workers;
  - um pacote de gráficos, por exemplo Vega + Vega-Lite + vega-embed, ou Observable Plot.
  - Prefira poucas dependências. Registre as versões em `vendor/VERSIONS.md`.
- **Execução:** `run.sh` (Linux/Mac) e `run.bat` (Windows) sobem `python3 -m http.server` na pasta e abrem o navegador. Não funciona por `file://`.
- **Banco:** nenhuma conexão durante o uso. Os dados chegam por extrações agregadas feitas antes (seção 4).
- **Visual:** sóbrio e legível em projetor. Use fonte grande, sem enfeites, com números no formato pt-BR (`1.234.567,8`) e moeda em `R$`.

## 3. Estrutura do repositório

```
index.html
js/                       app, uma aba por módulo, utilitários de query e gráficos
css/
vendor/                   bibliotecas copiadas + VERSIONS.md
data/
  raw/tabelao_municipal.xlsx    base de Felipe (entrada, já versionada)
  socio_municipal.parquet
  socio_dicionario.parquet
  geo_*.parquet
  manifest.json           tabelas, descrições, origem, linhas, data e totais
extract/                  SQL de extração do curupira (só SELECT)
scripts/
  converter_socio.py      xlsx -> parquet
  extrair_geo.py          roda extract/*.sql via service=curupira e grava parquet
  checar_dados.py         bloqueia cod_imovel, geom e outras colunas proibidas
run.sh / run.bat
README.md                 como clonar e abrir (para colegas)
```

## 4. Dados

### 4.1 Socioeconômico (`data/raw/tabelao_municipal.xlsx`)

- **Origem:** Felipe Gandra (iGPP), 19/11/2026. A documentação completa está em `meu-contexto/igpp/uk-pact/caatinga/dados/base-municipal-bi.md`.
- **Abas:**
  - `dados`: 1.095 linhas, uma por município, chave `codmun` (código IBGE de 7 dígitos);
  - `dicionario`: colunas, descrição, unidade, período e fonte.
- **Prefixos:**
  - `cr_`: Sicor/BCB, 2019–2024;
  - `pr_`: PAM/PEVS/PPM, 2019–2024;
  - `ca_`: Censo Agro 2017;
  - `cx_`: cruzamentos;
  - `cr_ag_*` e `pr_ag_*`: agrupamentos produtivos, em formato largo.
- **Reais:** IPCA, em R$ de 2025.
- **Vazio ≠ zero:** vazio quer dizer que o município não consta na fonte, e zero quer dizer que consta com valor nulo. Preservar NULL × 0 na conversão.
- **Converter para Parquet:**
  - Converta para `socio_municipal.parquet` com `codmun` como texto de 7 dígitos.
  - Gere também uma tabela longa `socio_agrupamento(codmun, agrupamento, fonte, metrica, valor)` a partir de `cr_ag_*` e `pr_ag_*`, que facilita gráficos e SQL.
- **Alertas para mostrar na interface:**
  - Os agrupamentos de crédito e de produção **não coincidem**: crédito tem `base_forrageira`, produção tem `nao_classificado`.
  - As três linhas de crédito somam 98,8% de `cr_volume_rs`.
  - Os períodos são diferentes: 2019–2024 contra o Censo de 2017.

### 4.2 Territorial (curupira, `service=curupira`, só leitura)

- **Tabela-base:** `proj_ukpact_caatinga.bi_ca_car_20260106_salvaguardas_aptos`. Os campos estão em `meu-contexto/.../dados/salvaguardas.md`:
  - `tipologia_car2`, `porte_imovel`, `area_ha`;
  - critérios `apto_*` e `apto_todos` / `apto_todos_semucus`;
  - áreas de uso degradado e não degradado (`*_degradad*_ha`);
  - `carac_fund` (risco fundiário) e `classe` (aridez, A–F).
- **Município:** vem de `proj_ukpact_caatinga.car_20260901_caatinga`.

**Etapa 0, inspeção de metadados (primeira execução):**

1. Salve as colunas e tipos das tabelas do projeto, via `information_schema.columns`, em `extract/00_colunas.sql`. A saída também vai para o catálogo do meu-contexto, como pendência de documentação.
2. Descubra a coluna de município no CAR. Pode ser `cod_municipio_ibge`, `municipio`, `cod_mun` ou parecida. A consulta U do código institucional usa `uf`.
3. Se não houver código IBGE do município no CAR:
   - procure no banco uma tabela de municípios do IBGE (`information_schema.tables` com `ilike '%munic%'`);
   - **pare e proponha a Pedro** um join espacial do centroide do imóvel com a malha municipal. Não rode join espacial sem aprovação.
4. Verifique a unicidade: compare `count(*)` com `count(distinct cod_imovel)` na tabela de salvaguardas. Se houver duplicatas, reporte antes de agregar.

**Extrações agregadas** (só SELECT; grupos por `codmun`, `uf` e `tipologia_car2`; tipologia nula vira `'Sem tipologia'`):

| Arquivo | Conteúdo |
| --- | --- |
| `geo_mun_tipologia.parquet` | `n_car` e `area_ha` totais; somas das áreas de uso degradado e não degradado (agricultura, pastagem, mosaico, VN); para cada critério `apto_*`, número e área dos aptos; `apto_todos` e `apto_todos_semucus` (n e área); **área degradada elegível** = agricultura degradada + pastagem degradada em imóveis `apto_todos`. A mesma métrica também no cenário sem UCUS |
| `geo_mun_aridez.parquet` | `codmun`, `tipologia`, `classe_aridez`: `n_car` e `area_ha` |
| `geo_mun_fundiario.parquet` | `codmun`, `tipologia`, `carac_fund`: `n_car` e `area_ha` |
| `geo_mun_porte.parquet` | `codmun`, `porte_imovel`: `n_car` e `area_ha` |

- **Conferência obrigatória:** o total geral deve bater com o Relatório 2, Tabela 23 (universo analisado): **2.478.646 cadastros e 71.897.270 ha**. As tipologias também devem bater: AST 35.825; PCT 1.963; PRONAF 156.277; PRONAF B 653.074; Minifúndio 684.726; Pequeno 913.217; Médio 27.213; Grande 6.351.
  - Se não bater, **não ajuste a query para forçar o número**. Reporte a diferença a Pedro.
- **Granularidade:** fica em município × tipologia. Nada por imóvel sai do banco.

### 4.3 Integração

- A chave é `codmun`, texto de 7 dígitos.
- Mostre na interface:
  - quantos municípios da base socioeconômica não têm CAR;
  - quantos municípios com CAR estão fora dos 1.095.

## 5. Abas

Todas as abas têm um filtro global de UF que vale em todas elas. Cada gráfico indica a fonte e o período e tem o botão **“Ver SQL”**, que mostra a query DuckDB e permite copiá-la para o console.

| Aba | O que mostra |
| --- | --- |
| **1. Socioeconômico — IBGE** | KPIs: VBP agropecuário, agrícola, pecuária e % da pecuária apurada pelo IBGE (`pr_pec_medido_pct`). VBP por agrupamento produtivo (barras). Ranking de municípios (top N ajustável). Distribuição de agrícola × pecuária. Perfil do Censo 2017: estabelecimentos, agricultura familiar, Pronaf B, dirigente mulher, preto ou pardo e menor de 25 anos, ATER e até 20 ha (histogramas ou boxplots por UF) |
| **2. Socioeconômico — SICOR** | KPIs: volume, contratos e ticket médio. Participação de Pronaf, Pronaf B e fora do Pronaf. Custeio × investimento. Participação de mulheres e de povos tradicionais. Crédito por agrupamento. Ranking de municípios. `cx_credito_por_producao` e `cx_indice_vs_bioma`, com aviso de que o período é misto quando se aplica |
| **3. Territorial (Geo)** | Filtros de UF e tipologia. KPIs: CAR, área, área degradada e área degradada elegível. Uso e degradação por tipologia (barras empilhadas). Aridez por tipologia. Risco fundiário por tipologia. **Funil de salvaguardas**, com n e área aptos em cada critério, `apto_todos` e o cenário sem UCUS. Tabela por município |
| **4. Integração** | Tabela municipal juntando as métricas-chave dos dois lados, com ordenação e busca. Gráficos de dispersão configuráveis, com eixo X e Y escolhidos entre métricas, cor por UF e tooltip com o nome do município. Exemplos: área degradada elegível × volume de crédito; × VBP pecuário; × % Pronaf B. Aviso de que agrupamentos e períodos não se alinham |
| **5. Console SQL** | Editor de SQL com Ctrl+Enter. Resultado em tabela paginada com exportação CSV. Painel lateral com tabelas e colunas, usando os descritivos do dicionário. Botões com 5 a 8 queries de exemplo prontas. Mensagens de erro legíveis |

**Mapa municipal:** é opcional, só se der tempo. Exige o GeoJSON simplificado da malha municipal do IBGE em `data/`, e o tamanho final deve ficar abaixo de 10 MB. Não é prioridade.

## 6. Ordem de entrega (prazo: reunião em 25/11)

1. Esqueleto: `vendor/`, `run.sh`, carregamento do DuckDB e **console SQL** sobre `socio_*`.
2. Abas 1 e 2 (não dependem do banco).
3. Etapa 0 de inspeção do banco, com SQL aprovada por Pedro.
4. Extrações geo, com SQL aprovada, mais a conferência de totais.
5. Abas 3 e 4.
6. README para colegas e um teste final do zero: `git clone`, depois `./run.sh`, sem internet.

## 7. Critérios de aceite

- Abre com `./run.sh` numa máquina sem internet e sem credenciais.
- Todas as abas carregam em poucos segundos, e o console roda SQL arbitrário.
- Os totais geo batem com o Relatório 2, ou há uma nota explícita sobre a diferença.
- `scripts/checar_dados.py` passa: nada de `cod_imovel`, `geom` ou linha por imóvel em `data/`.
- O README explica, em 5 passos, como um colega clona e abre.
