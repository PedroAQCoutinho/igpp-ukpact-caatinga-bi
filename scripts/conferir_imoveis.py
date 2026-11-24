#!/usr/bin/env python3
"""Confere data/local/imoveis.parquet com o Relatório 2 (só totais; nenhuma linha impressa).
Sai com código 1 se algo não bater. Diferença não se corrige aqui: relata-se a Pedro.
Uso: python3 scripts/conferir_imoveis.py
"""
import sys
from pathlib import Path

import duckdb

RAIZ = Path(__file__).resolve().parent.parent
ARQ = RAIZ / "data" / "local" / "imoveis.parquet"

# Relatório 2 (especificação v2, seção 4.2)
ESPERADO = {
    "universo": {"imoveis": 2478646, "area_ha": 71897270},
    "tipologia": {"AST": 35825, "PCT": 1963, "PRONAF": 156277, "PRONAF B": 653074, "Minifúndio": 684726,
                  "Pequeno": 913217, "Médio": 27213, "Grande": 6351},
    "risco_fund": {"MUITO_BAIXO": 84567, "BAIXO": 126591, "MODERADO_BAIXO": 2134088, "MODERADO": 113916, "ALTO": 19484},
    "aridez_AB": 664532,
}


def main():
    con = duckdb.connect()
    con.execute(f"CREATE VIEW i AS SELECT * FROM read_parquet('{ARQ}')")
    linhas, erros = [], 0

    def cmp(grupo, chave, obs, esp, tol=0):
        nonlocal erros
        ok = abs((obs or 0) - esp) <= tol
        erros += not ok
        linhas.append(f"{'OK ' if ok else 'DIF'} {grupo:<11} {chave:<16} obs={obs:>14,.0f} esp={esp:>14,.0f} dif={(obs or 0) - esp:>+12,.0f}")

    n, area = con.execute("SELECT count(*), sum(area_ha) FROM i").fetchone()
    cmp("universo", "imóveis", n, ESPERADO["universo"]["imoveis"])
    # áreas arredondadas a 0,1 ha por imóvel: tolerância de 0,05 ha × nº de imóveis no pior caso, mas o normal é < 1.000 ha
    cmp("universo", "área (ha)", area, ESPERADO["universo"]["area_ha"], tol=1000)
    for col, grupo in (("tipologia", "tipologia"), ("risco_fund", "risco_fund")):
        obs = dict(con.execute(f"SELECT {col}, count(*) FROM i GROUP BY 1").fetchall())
        for k, esp in ESPERADO[grupo].items():
            cmp(grupo, k, obs.pop(k, 0), esp)
        for k, v in obs.items():  # categorias que não estão no relatório
            cmp(grupo, f"(extra) {k}", v, 0)
    ab = con.execute("SELECT count(*) FROM i WHERE aridez IN ('A','B')").fetchone()[0]
    cmp("aridez", "A + B", ab, ESPERADO["aridez_AB"])
    print("\n".join(linhas))
    print(f"\n{'TUDO BATE' if not erros else f'{erros} DIFERENÇA(S): parar e mostrar a Pedro'}")
    print("aridez (n):", dict(con.execute("SELECT aridez, count(*) FROM i GROUP BY 1 ORDER BY 1").fetchall()))
    return 1 if erros else 0


if __name__ == "__main__":
    sys.exit(main())
