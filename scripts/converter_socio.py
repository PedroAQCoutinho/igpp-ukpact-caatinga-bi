#!/usr/bin/env python3
"""Converte a base municipal do Felipe (xlsx) para Parquet.

Entrada:  data/raw/tabelao_municipal.xlsx (abas 'dados' e 'dicionario')
Saídas:   data/socio_municipal.parquet  (codmun texto 7 dígitos, valores em R$, célula vazia = NULL)
          data/socio_dicionario.parquet (coluna, descricao, unidade, periodo, fonte)
Uso:      python3 scripts/converter_socio.py
"""
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import duckdb
import pandas as pd

RAIZ = Path(__file__).resolve().parent.parent
XLSX = RAIZ / "data" / "raw" / "tabelao_municipal.xlsx"
OUT_D = RAIZ / "data" / "socio_municipal.parquet"
OUT_DIC = RAIZ / "data" / "socio_dicionario.parquet"


def main():
    d = pd.read_excel(XLSX, "dados", dtype={"codmun": str})
    dic = pd.read_excel(XLSX, "dicionario", dtype=str)
    d["codmun"] = d["codmun"].str.strip().str.zfill(7)
    assert d["codmun"].str.fullmatch(r"\d{7}").all(), "codmun fora do padrão de 7 dígitos"
    assert d["codmun"].is_unique, "codmun repetido"
    # Pandas lê célula vazia como NaN; convertemos NaN em NULL explicitamente
    nulos_antes = int(d.isna().sum().sum())
    con = duckdb.connect()
    con.register("d", d)
    con.register("dic", dic)
    num = [c for c in d.columns if c not in ("codmun", "municipio", "uf")]
    sel = ", ".join(["codmun::VARCHAR AS codmun", "municipio::VARCHAR AS municipio", "uf::VARCHAR AS uf"] +
                    [f'CASE WHEN isnan("{c}"::DOUBLE) THEN NULL ELSE "{c}" END AS "{c}"' for c in num])
    con.execute(f"COPY (SELECT {sel} FROM d ORDER BY codmun) TO '{OUT_D}' (FORMAT parquet, COMPRESSION zstd)")
    con.execute(f"COPY (SELECT coluna, descricao, unidade, periodo, fonte FROM dic) TO '{OUT_DIC}' (FORMAT parquet)")
    n = con.execute(f"SELECT count(*) FROM '{OUT_D}'").fetchone()[0]
    # conta NULLs gravados (devem ser os mesmos do xlsx)
    cols = [r[0] for r in con.execute(f"DESCRIBE SELECT * FROM '{OUT_D}'").fetchall()]
    nulos_dep = sum(con.execute(f'SELECT count(*) - count("{c}") FROM \'{OUT_D}\'').fetchone()[0] for c in cols)
    assert nulos_dep == nulos_antes, f"NULLs mudaram: {nulos_antes} -> {nulos_dep}"
    print(f"socio_municipal: {n} municípios, {len(cols)} colunas, {nulos_dep} células NULL (preservadas)")
    registrar(n, len(cols), nulos_dep)


def registrar(n, ncols, nulos):
    """Atualiza a entrada 'socio_municipal' em data/manifest.json."""
    man_p = RAIZ / "data" / "manifest.json"
    man = json.loads(man_p.read_text(encoding="utf-8")) if man_p.exists() else {"extracoes": {}}
    man.setdefault("extracoes", {})["socio_municipal"] = {
        "origem": "data/raw/tabelao_municipal.xlsx (Felipe Gandra, 19/11/2026)",
        "sha256_origem": hashlib.sha256(XLSX.read_bytes()).hexdigest(),
        "script": "scripts/converter_socio.py",
        "gerado_em": datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
        "saidas": ["data/socio_municipal.parquet", "data/socio_dicionario.parquet"],
        "linhas": n, "colunas": ncols, "celulas_null": nulos,
        "unidades": "reais em R$ de 2025 (não R$ mil como no protótipo)",
    }
    man_p.write_text(json.dumps(man, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
