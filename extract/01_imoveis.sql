-- Extração por imóvel para o BI (só leitura). Uma linha por imóvel, SEM cod_imovel e SEM geometria.
-- Executada por scripts/extrair_imoveis.py (service=curupira), que grava direto em data/local/imoveis.parquet
-- e imprime só totais. Áreas arredondadas a 0,1 ha.
-- área potencialmente degradada = agricultura + pastagem + mosaico degradados, nulos como zero (Pedro, 24/11/2026, 20h).
-- A extração de 24/11 (16h) usou agricultura + pastagem; o arquivo local foi recalculado a partir dos componentes
-- (scripts/extrair_imoveis.py --recalcular-degradada). Esta versão ainda não rodou: mostrar a Pedro antes.
SELECT
    lpad(c.cod_municipio_ibge::text, 7, '0')               AS codmun,
    c.uf                                                   AS uf,
    coalesce(s.tipologia_car2, 'Sem tipologia')            AS tipologia,
    s.porte_imovel::text                                   AS porte,
    round(s.area_ha::numeric, 1)::real                     AS area_ha,
    coalesce(s.classe, 'Sem classe')                       AS aridez,
    coalesce(s.carac_fund, 'Sem classe')                   AS risco_fund,
    round(s.agricultura_degradada_ha, 1)::real             AS agri_deg_ha,
    round(s.agricultura_nao_degradada_ha, 1)::real         AS agri_ndeg_ha,
    round(s.pastagem_degradada_ha, 1)::real                AS past_deg_ha,
    round(s.pastagem_nao_degradada_ha, 1)::real            AS past_ndeg_ha,
    round(s.mosaico_degradado_ha, 1)::real                 AS mos_deg_ha,
    round(s.mosaico_nao_degradado_ha, 1)::real             AS mos_ndeg_ha,
    round(s.vn_degradada_ha, 1)::real                      AS vn_deg_ha,
    round(s.vn_nao_degradada_ha, 1)::real                  AS vn_ndeg_ha,
    round(coalesce(s.agricultura_degradada_ha, 0)
        + coalesce(s.pastagem_degradada_ha, 0)
        + coalesce(s.mosaico_degradado_ha, 0), 1)::real    AS area_pot_degradada_ha,
    s.apto_criterio_status                                 AS apto_status,
    s.apto_desmatamento_2023                               AS apto_desm_2023,
    s.apto_desmatamento_2008                               AS apto_desm_2008,
    s.apto_embargo                                         AS apto_embargo,
    s.apto_fpnd                                            AS apto_fpnd,
    s.apto_uc                                              AS apto_uc,
    s.apto_uc_semucus                                      AS apto_uc_semucus,
    s.apto_ti_tq                                           AS apto_ti_tq,
    s.apto_areas_degradadas                                AS apto_areas_degradadas,
    s.apto_todos                                           AS apto_todos,
    s.apto_todos_semucus                                   AS apto_todos_semucus
FROM proj_ukpact_caatinga.bi_ca_car_20260106_salvaguardas_aptos s
JOIN proj_ukpact_caatinga.car_20260901_caatinga c USING (cod_imovel)
