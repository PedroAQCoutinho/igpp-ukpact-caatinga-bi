#!/usr/bin/env python3
"""Prepara a malha municipal oficial do IBGE para o BI.

Entradas (baixadas do IBGE, fora do repo; caminho em --dir):
  BR_Municipios_2022.zip  geoftp.ibge.gov.br/organizacao_do_territorio/malhas_territoriais/malhas_municipais/municipio_2022/Brasil/BR/
  Biomas_250mil.zip       geoftp.ibge.gov.br/informacoes_ambientais/estudos_ambientais/biomas/vetores/  (biomas IBGE 2019, 1:250 mil)
  BR_UF_2022.zip          (opcional) mesmo diretório do BR_Municipios_2022.zip; divisas entre UFs completas, além da malha
Saída: data/malha_municipios.json
  {"fonte":..., "mun": {codmun: {"a": area_km2_IBGE, "r": [anéis lon/lat]}}, "bioma": [anéis], "uf": [linhas]}
  Sem BR_UF_2022.zip, "uf" fica de fora e o BI deriva as divisas das bordas compartilhadas entre municípios.
Requer mapshaper no PATH (simplificação com topologia compartilhada preservada).
Uso: python3 scripts/preparar_malha.py --dir /caminho/dos/zips [--pct 4%]
"""
import argparse
import json
import subprocess
import tempfile
import zipfile
from pathlib import Path

import duckdb

RAIZ = Path(__file__).resolve().parent.parent
SAIDA = RAIZ / "data" / "malha_municipios.json"


def rings(geom):
    """Lista plana de anéis (contorno e buracos) de Polygon/MultiPolygon."""
    if geom is None:
        return []
    polys = [geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"]
    return [[[round(x, 4), round(y, 4)] for x, y in ring] for p in polys for ring in p]


def linhas(geom):
    """Lista de linhas de LineString/MultiLineString."""
    if geom is None:
        return []
    ls = [geom["coordinates"]] if geom["type"] == "LineString" else geom["coordinates"]
    return [[[round(x, 4), round(y, 4)] for x, y in l] for l in ls]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True)
    ap.add_argument("--pct", default="4%", help="fração de vértices mantida pelo mapshaper")
    a = ap.parse_args()
    src = Path(a.dir)
    cods = {r[0] for r in duckdb.sql(f"SELECT codmun FROM '{RAIZ/'data'/'socio_municipal.parquet'}'").fetchall()}
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        zipfile.ZipFile(src / "BR_Municipios_2022.zip").extractall(td / "mun")
        zipfile.ZipFile(src / "Biomas_250mil.zip").extractall(td / "bio")
        mun_shp = next((td / "mun").glob("*.shp"))
        bio_shp = next((td / "bio").glob("*.shp"))
        # Municípios: recorte pelos 1.095 codmun, simplificação topológica (arcos compartilhados)
        subprocess.run(["mapshaper", "-i", str(mun_shp), "encoding=utf8",
                        "-filter", f"{json.dumps(sorted(cods))}.indexOf(CD_MUN) > -1",
                        "-simplify", a.pct, "keep-shapes", "planar",
                        "-clean", "-o", str(td / "mun.json"), "format=geojson", "precision=0.0001"], check=True)
        subprocess.run(["mapshaper", "-i", str(bio_shp), "encoding=utf8", "-filter", "Bioma == 'Caatinga'",
                        "-simplify", "1%", "keep-shapes", "planar",
                        "-o", str(td / "bio.json"), "format=geojson", "precision=0.0001"], check=True)
        uf_zip = src / "BR_UF_2022.zip"
        uf = None
        if uf_zip.exists():
            # Divisas entre UFs (sem litoral), recortadas na caixa do bioma com folga de 1 grau
            zipfile.ZipFile(uf_zip).extractall(td / "uf")
            uf_shp = next((td / "uf").glob("*.shp"))
            pts = [p for f in json.loads((td / "bio.json").read_text())["features"] for r in rings(f["geometry"]) for p in r]
            xs, ys = [p[0] for p in pts], [p[1] for p in pts]
            bbox = ",".join(str(v) for v in (min(xs) - 1, min(ys) - 1, max(xs) + 1, max(ys) + 1))
            subprocess.run(["mapshaper", "-i", str(uf_shp), "encoding=utf8", "-clip", f"bbox={bbox}",
                            "-simplify", a.pct, "keep-shapes", "planar", "-innerlines",
                            "-o", str(td / "uf.json"), "format=geojson", "precision=0.0001"], check=True)
            uf = json.loads((td / "uf.json").read_text())
        mun = json.loads((td / "mun.json").read_text())
        bio = json.loads((td / "bio.json").read_text())
    out = {}
    for f in mun["features"]:
        p = f["properties"]
        out[p["CD_MUN"]] = {"a": round(float(p["AREA_KM2"]), 3), "r": rings(f["geometry"])}
    faltam = sorted(cods - out.keys())
    sobra = sorted(out.keys() - cods)
    assert not sobra
    res = {
        "fonte": {
            "municipios": "IBGE, Malha Municipal 2022 (BR_Municipios_2022), área oficial AREA_KM2",
            "bioma": "IBGE, Biomas do Brasil 1:250.000 (2019), feição Caatinga",
            "simplificacao": f"mapshaper -simplify {a.pct} keep-shapes planar (topologia compartilhada preservada)",
            "municipios_base_sem_malha": faltam,
            "uf": "IBGE, BR_UF_2022, divisas internas (mapshaper -innerlines)" if uf else "derivadas no BI das bordas compartilhadas da malha municipal",
        },
        "mun": out,
        "bioma": [r for f in bio["features"] for r in rings(f["geometry"])],
    }
    if uf:
        res["uf"] = [l for f in uf["features"] for l in linhas(f["geometry"])]
    SAIDA.write_text(json.dumps(res, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(out)} municípios na malha; sem malha: {faltam or 'nenhum'}; {SAIDA.stat().st_size/1e6:.2f} MB")


if __name__ == "__main__":
    main()
