#!/usr/bin/env python3
"""Extrai os imóveis do curupira para data/local/imoveis.parquet (fora do git).

- Conexão só por service=curupira (modo só leitura no próprio serviço). Nunca lê ~/.pgpass.
- Roda extract/01_imoveis.sql, aprovada por Pedro, e grava direto no Parquet, sem imprimir linhas.
- Depois gera data/geo_mun_resumo.parquet (agregado por município, versionado) e registra tudo
  em data/manifest.json. A conferência com o Relatório 2 é feita por scripts/conferir_imoveis.py.
Uso: python3 scripts/extrair_imoveis.py
"""
import hashlib
import json
import time
from datetime import datetime
from pathlib import Path

import duckdb
import psycopg
import pyarrow as pa
import pyarrow.parquet as pq

RAIZ = Path(__file__).resolve().parent.parent
SQL = RAIZ / "extract" / "01_imoveis.sql"
SAIDA = RAIZ / "data" / "local" / "imoveis.parquet"
RESUMO = RAIZ / "data" / "geo_mun_resumo.parquet"
LOTE = 200_000

CATEG = ["codmun", "uf", "tipologia", "porte", "aridez", "risco_fund"]


def main():
    sql = SQL.read_text(encoding="utf-8")
    SAIDA.parent.mkdir(parents=True, exist_ok=True)
    tmp = SAIDA.with_suffix(".parquet.tmp")
    t0 = time.time()
    n = 0
    writer = None
    with psycopg.connect("service=curupira") as con:
        ro = con.execute("SHOW default_transaction_read_only").fetchone()[0]
        assert ro == "on", "serviço curupira não está em modo só leitura"
        with con.cursor(name="bi_imoveis") as cur:  # cursor no servidor: lê em lotes
            cur.itersize = LOTE
            cur.execute(sql)
            cols = None
            while True:
                rows = cur.fetchmany(LOTE)
                if not rows:
                    break
                if cols is None:
                    cols = [d.name for d in cur.description]
                    assert "cod_imovel" not in cols and "geom" not in cols
                data = {c: [r[i] for r in rows] for i, c in enumerate(cols)}
                arrays = {}
                for c, v in data.items():
                    if c in CATEG:
                        arrays[c] = pa.array(v, pa.string()).dictionary_encode()
                    elif c.startswith("apto_"):
                        arrays[c] = pa.array(v, pa.bool_())
                    else:
                        arrays[c] = pa.array([None if x is None else float(x) for x in v], pa.float32())
                t = pa.table(arrays)
                if writer is None:
                    writer = pq.ParquetWriter(tmp, t.schema, compression="zstd", compression_level=9)
                writer.write_table(t)
                n += len(rows)
    writer.close()
    tmp.replace(SAIDA)
    seg = time.time() - t0
    mb = SAIDA.stat().st_size / 1e6
    print(f"imoveis.parquet: {n:,} linhas, {mb:.1f} MB, {seg:.0f} s".replace(",", "."))

    # Agregado por município (versionado): visões padrão e variáveis geo sem o arquivo local
    duckdb.sql(f"""COPY (
      SELECT codmun, count(*)::INT AS n, round(sum(area_ha), 1) AS area, round(sum(area_pot_degradada_ha), 1) AS deg,
        round(coalesce(sum(area_pot_degradada_ha) FILTER (WHERE apto_todos), 0), 1) AS elig,
        count(*) FILTER (WHERE apto_todos)::INT AS apt,
        round(coalesce(sum(area_pot_degradada_ha) FILTER (WHERE apto_todos_semucus), 0), 1) AS elig_semucus,
        count(*) FILTER (WHERE apto_todos_semucus)::INT AS apt_semucus,
        {", ".join(f"count(*) FILTER (WHERE {c})::INT AS {c}" for c in ["apto_status", "apto_desm_2023", "apto_desm_2008", "apto_embargo", "apto_fpnd", "apto_uc", "apto_uc_semucus", "apto_ti_tq", "apto_areas_degradadas", "apto_todos", "apto_todos_semucus"])}
      FROM read_parquet('{SAIDA}') GROUP BY codmun ORDER BY codmun
    ) TO '{RESUMO}' (FORMAT parquet, COMPRESSION zstd)""")
    tot = duckdb.sql(f"SELECT count(*), round(sum(area_ha)), round(sum(area_pot_degradada_ha)), count(DISTINCT codmun) FROM read_parquet('{SAIDA}')").fetchone()
    print(f"totais: {tot[0]} imóveis; {tot[1]:.0f} ha; {tot[2]:.0f} ha pot. degradados; {tot[3]} municípios")

    man_p = RAIZ / "data" / "manifest.json"
    man = json.loads(man_p.read_text(encoding="utf-8"))
    man["extracoes"]["imoveis"] = {
        "sql": "extract/01_imoveis.sql", "sha256_sql": hashlib.sha256(sql.encode()).hexdigest(),
        "script": "scripts/extrair_imoveis.py", "servico": "curupira (só leitura)",
        "executado_em": datetime.now().astimezone().isoformat(timespec="seconds"), "duracao_s": round(seg),
        "saida_local": "data/local/imoveis.parquet (fora do git)", "tamanho_mb": round(mb, 1),
        "linhas": tot[0], "area_ha": tot[1], "area_pot_degradada_ha": tot[2], "municipios": tot[3],
        "definicao_area_pot_degradada": "agricultura_degradada_ha + pastagem_degradada_ha, nulos como zero (Pedro, 24/11/2026)",
        "resumo_versionado": "data/geo_mun_resumo.parquet",
    }
    man_p.write_text(json.dumps(man, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
