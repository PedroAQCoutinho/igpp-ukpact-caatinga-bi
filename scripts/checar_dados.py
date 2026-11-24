#!/usr/bin/env python3
"""Bloqueia dados proibidos nos arquivos versionados.

Varre data/ e prototipo/ (exceto data/local/, que fica fora do git) e falha se
encontrar colunas proibidas ou arquivos grandes demais para o repositório.
Rode antes de cada commit:  python3 scripts/checar_dados.py
"""
import csv
import json
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
PASTAS = [RAIZ / "data", RAIZ / "prototipo"]
IGNORAR = RAIZ / "data" / "local"
PROIBIDAS = {"cod_imovel", "geom", "geometry", "the_geom", "cpf", "cnpj", "cpf_cnpj", "nome_proprietario", "nome"}
LIMITE_MB = 50


def colunas(arq: Path):
    suf = arq.suffix.lower()
    if suf == ".csv":
        with arq.open(newline="", encoding="utf-8", errors="replace") as f:
            primeira = f.readline()
        delim = ";" if primeira.count(";") > primeira.count(",") else ","
        return next(csv.reader([primeira], delimiter=delim), [])
    if suf == ".json":
        dados = json.loads(arq.read_text(encoding="utf-8"))
        if isinstance(dados, dict):
            cols = set(dados.keys())
            for v in ("cols", "columns"):
                if isinstance(dados.get(v), list):
                    cols |= set(map(str, dados[v]))
                if isinstance(dados.get(v), dict):
                    cols |= set(dados[v].keys())
            return cols
        if isinstance(dados, list) and dados and isinstance(dados[0], dict):
            return dados[0].keys()
        return []
    if suf == ".parquet":
        try:
            import duckdb
            return [r[0] for r in duckdb.sql(f"DESCRIBE SELECT * FROM read_parquet('{arq}')").fetchall()]
        except ImportError:
            import pyarrow.parquet as pq
            return pq.read_schema(arq).names
    return []


def main() -> int:
    erros = []
    for pasta in PASTAS:
        if not pasta.exists():
            continue
        for arq in pasta.rglob("*"):
            if not arq.is_file() or IGNORAR in arq.parents:
                continue
            mb = arq.stat().st_size / 1e6
            if mb > LIMITE_MB:
                erros.append(f"{arq.relative_to(RAIZ)}: {mb:.0f} MB (limite {LIMITE_MB} MB; dados grandes vão em data/local/)")
            try:
                ruins = {c.lower() for c in colunas(arq)} & PROIBIDAS
            except Exception as e:  # arquivo ilegível também bloqueia
                erros.append(f"{arq.relative_to(RAIZ)}: não foi possível ler ({e})")
                continue
            if ruins:
                erros.append(f"{arq.relative_to(RAIZ)}: colunas proibidas {sorted(ruins)}")
    if erros:
        print("FALHOU:\n  " + "\n  ".join(erros))
        return 1
    print("OK: nenhum dado proibido nos arquivos versionados.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
