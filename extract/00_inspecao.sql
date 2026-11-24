-- Etapa 0 — inspeção do curupira (só leitura; só metadados e totais, nenhuma linha de imóvel)
-- Rodar: psql service=curupira -X -v ON_ERROR_STOP=1 -f extract/00_inspecao.sql
\pset pager off

-- 1. Conexão certa e em modo só leitura
SELECT current_database() AS banco, current_user AS usuario,
       current_setting('default_transaction_read_only') AS so_leitura;

-- 2. Colunas das duas tabelas-base (nome, tipo, nulabilidade)
SELECT table_name, ordinal_position AS pos, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'proj_ukpact_caatinga'
  AND table_name IN ('car_20260901_caatinga', 'bi_ca_car_20260106_salvaguardas_aptos')
ORDER BY table_name, ordinal_position;

-- 3. Malha municipal já existe no banco? (só nomes de tabelas)
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_name ILIKE ANY (ARRAY['%munic%', '%ibge%', '%malha%', '%bioma%'])
ORDER BY 1, 2;

-- 4. Unicidade de cod_imovel e totais (comparar com Relatório 2: 2.478.646 imóveis; 71.897.270 ha)
SELECT 'salvaguardas_aptos' AS tabela, count(*) AS linhas, count(DISTINCT cod_imovel) AS cod_distintos,
       round(sum(area_ha)::numeric) AS area_ha
FROM proj_ukpact_caatinga.bi_ca_car_20260106_salvaguardas_aptos
UNION ALL
SELECT 'car_20260901_caatinga', count(*), count(DISTINCT cod_imovel), round(sum(area_ha)::numeric)
FROM proj_ukpact_caatinga.car_20260901_caatinga;
