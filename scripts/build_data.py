"""Genera site/data/*.json a partir de colombia-open. Corre una sola vez
al construir el sitio (local o en CI), nunca en el navegador del
usuario final. Ver .claude/skills/colombia-open-data/SKILL.md para las
reglas del join y de las tasas inestables en municipios pequeños.

Fuentes (API pública de colombia-open, nunca sus extractors/builders):
- delincuencia_homicidios_transito: víctimas por municipio y fecha.
- demografia: población por municipio, año y área geográfica.
- municipios_geometria: polígonos IGAC (ya simplificados) por municipio.
- municipios: nombre oficial y departamento por municipio (DIVIPOLA).

Salidas:
- site/data/geometria.topo.json: TopoJSON (arcos compartidos + una
  simplificación adicional) con la geometría + identidad de cada
  municipio. Se carga una sola vez.
- site/data/tasas_por_anio.json: un objeto por municipio con las
  propiedades numéricas por año (homicidios, poblacion, tasa, tasa de
  3 años, bandera de población pequeña). Sin geometría.
- site/data/meta.json: rango de años, cortes de color, cobertura del
  join, fuentes y metodología.
- site/data/story.json: cifras agregadas para el storytelling.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import polars as pl
import topojson as tp
from colombia_open import ColombiaOpen
from shapely import wkt
from shapely.geometry import mapping

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "site" / "data"
N_CLASSES = 5
POBLACION_PEQUENA_UMBRAL = 20_000
STOPWORDS = {"de", "del", "la", "las", "los", "y"}
ABBREVIATIONS = {"d.c.": "D.C."}


def titlecase_es(name: str) -> str:
    words = name.lower().split(" ")
    return " ".join(
        ABBREVIATIONS[word]
        if word in ABBREVIATIONS
        else word
        if (word in STOPWORDS and i > 0)
        else word.capitalize()
        for i, word in enumerate(words)
    )


def display_url(raw_url: str) -> str:
    """datos.gov.co expone el mismo recurso en .json (API) y sin
    extensión (página humana) -- preferimos la página humana en los
    links que ve la gente."""
    return raw_url[: -len(".json")] if raw_url.endswith(".json") else raw_url


def es_co_int(n: int) -> str:
    """Formato es-CO de un entero (punto como separador de miles) para
    texto generado en Python -- Python no tiene un formato "es-CO" nativo
    y f"{n:,}" usa coma, que en español se lee como decimal."""
    return f"{n:,}".replace(",", ".")


def compute_breaks(values: list[float], n_classes: int) -> list[float]:
    s = pl.Series("tasa", values).drop_nulls().sort()
    if s.len() == 0:
        return []
    return [
        round(s.quantile(i / n_classes, interpolation="linear"), 4)
        for i in range(1, n_classes)
    ]


def build_rate_grid(
    homicidios: pl.DataFrame, demografia: pl.DataFrame, cod_mpios: list[str]
) -> tuple[pl.DataFrame, list[int], int]:
    current_year = datetime.now(timezone.utc).year
    homicidios_agg = (
        homicidios.filter(pl.col("anio") < current_year)
        .group_by(["cod_mpio", "anio"])
        .agg(pl.col("cantidad").sum().alias("homicidios"))
    )
    poblacion = demografia.filter(pl.col("area_geografica") == "Total").select(
        ["cod_mpio", "anio", "poblacion"]
    )

    anios_disponibles = sorted(
        set(homicidios_agg["anio"].unique().to_list())
        & set(poblacion["anio"].unique().to_list())
    )

    grid = pl.DataFrame({"cod_mpio": cod_mpios}).join(
        pl.DataFrame({"anio": anios_disponibles}), how="cross"
    )
    grid = grid.join(poblacion, on=["cod_mpio", "anio"], how="left")
    grid = grid.join(homicidios_agg, on=["cod_mpio", "anio"], how="left")

    municipio_anio_sin_poblacion = grid.filter(pl.col("poblacion").is_null()).height

    # Sin población ese año para ese municipio: no se puede calcular una
    # tasa real, así que se excluye la celda por completo (nunca se
    # muestra una cifra absoluta sin su tasa per cápita al lado).
    grid = grid.filter(pl.col("poblacion").is_not_null())
    grid = grid.with_columns(pl.col("homicidios").fill_null(0))
    grid = grid.with_columns(
        (pl.col("homicidios") / pl.col("poblacion") * 100_000)
        .round(4)
        .alias("tasa"),
        (pl.col("poblacion") < POBLACION_PEQUENA_UMBRAL).alias("poblacion_pequena"),
    )
    grid = grid.sort(["cod_mpio", "anio"]).with_columns(
        pl.col("tasa")
        .rolling_mean(window_size=3, min_samples=1)
        .round(4)
        .over("cod_mpio")
        .alias("tasa_prom3")
    )
    return grid, anios_disponibles, municipio_anio_sin_poblacion


def build_year_properties(grid: pl.DataFrame) -> dict[str, dict[str, Any]]:
    by_mpio: dict[str, dict[str, Any]] = {}
    for row in grid.iter_rows(named=True):
        props = by_mpio.setdefault(row["cod_mpio"], {})
        anio = row["anio"]
        props[f"homicidios_{anio}"] = row["homicidios"]
        props[f"poblacion_{anio}"] = row["poblacion"]
        props[f"tasa_{anio}"] = row["tasa"]
        props[f"tasa_prom3_{anio}"] = row["tasa_prom3"]
        props[f"poblacion_pequena_{anio}"] = row["poblacion_pequena"]
    return by_mpio


def build_tasas_por_anio(
    base_municipios: pl.DataFrame, year_props_by_mpio: dict[str, dict[str, Any]]
) -> list[dict[str, Any]]:
    return [
        {"cod_mpio": cod_mpio, **year_props_by_mpio.get(cod_mpio, {})}
        for cod_mpio in base_municipios["cod_mpio"].to_list()
    ]


def build_geometry_topojson(base_municipios: pl.DataFrame) -> str:
    geojson = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": mapping(wkt.loads(row["geometry_wkt"])),
                "properties": {
                    "cod_mpio": row["cod_mpio"],
                    "nombre_mpio": titlecase_es(row["nombre_mpio"]),
                    "cod_dpto": row["cod_dpto"],
                    "nombre_dpto": titlecase_es(row["nombre_dpto"]),
                    "area_km2": round(row["area_km2"], 2),
                    "longitud": row["longitud"],
                    "latitud": row["latitud"],
                },
            }
            for row in base_municipios.iter_rows(named=True)
        ],
    }
    # prequantize + toposimplify: arcos compartidos entre municipios
    # vecinos + una simplificación adicional sobre esos arcos (no
    # rompe la coincidencia de bordes). Mantiene el presupuesto de
    # ~2 MB de la skill choropleth-atlas.
    topo = tp.Topology(
        geojson, prequantize=1_000_000, toposimplify=0.002, object_name="municipios"
    )
    return topo.to_json()


DIAS_SEMANA = [
    "lunes",
    "martes",
    "miercoles",
    "jueves",
    "viernes",
    "sabado",
    "domingo",
]
MESES = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
]


def build_story(
    homicidios: pl.DataFrame,
    municipios: pl.DataFrame,
    grid: pl.DataFrame,
    anios_disponibles: list[int],
) -> dict[str, Any]:
    """Cifras para el storytelling (hero, patrones temporales, ranking de
    departamentos). El patron por dia/mes usa TODO el historico del
    dataset (no solo anios_disponibles) porque es un patron de
    comportamiento, no una tasa per capita atada a un anio de poblacion."""
    nacional_por_anio = (
        homicidios.filter(pl.col("anio").is_in(anios_disponibles))
        .group_by("anio")
        .agg(pl.col("cantidad").sum().alias("total"))
        .sort("anio")
    )
    total_nacional_por_anio = dict(
        zip(
            nacional_por_anio["anio"].to_list(),
            nacional_por_anio["total"].to_list(),
        )
    )

    # Tasa nacional = suma de muertes / suma de poblacion * 100_000, por
    # anio (nunca el total absoluto solo: regla editorial del proyecto).
    # Se calcula sobre `grid` (mismo grano que tasas_por_anio.json) para
    # que sea consistente con la tasa por municipio.
    tasa_nacional = (
        grid.group_by("anio")
        .agg(pl.col("homicidios").sum().alias("hom"), pl.col("poblacion").sum().alias("pob"))
        .sort("anio")
        .with_columns((pl.col("hom") / pl.col("pob") * 100_000).round(4).alias("tasa"))
    )
    tasa_nacional_por_anio = dict(
        zip(tasa_nacional["anio"].to_list(), tasa_nacional["tasa"].to_list())
    )

    con_dow = homicidios.with_columns(pl.col("fecha").dt.weekday().alias("dow"))
    dow_totales = (
        con_dow.group_by("dow").agg(pl.col("cantidad").sum().alias("total")).sort("dow")
    )
    total_historico = dow_totales["total"].sum()
    dow_pct = {
        DIAS_SEMANA[row["dow"] - 1]: round(row["total"] / total_historico * 100, 2)
        for row in dow_totales.iter_rows(named=True)
    }

    con_mes = homicidios.with_columns(pl.col("fecha").dt.month().alias("mes"))
    mes_totales = (
        con_mes.group_by("mes").agg(pl.col("cantidad").sum().alias("total")).sort("mes")
    )
    mes_pct = {
        MESES[row["mes"] - 1]: round(row["total"] / total_historico * 100, 2)
        for row in mes_totales.iter_rows(named=True)
    }

    ultimo_anio = anios_disponibles[-1]
    deptos = (
        homicidios.filter(pl.col("anio") == ultimo_anio)
        .join(
            municipios.select(["cod_dpto", "nombre_dpto"]).unique(),
            on="cod_dpto",
            how="left",
        )
        .group_by(["cod_dpto", "nombre_dpto"])
        .agg(pl.col("cantidad").sum().alias("total"))
        .sort("total", descending=True)
        .head(5)
    )

    return {
        "total_nacional_por_anio": total_nacional_por_anio,
        "tasa_nacional_por_anio": tasa_nacional_por_anio,
        "anio_rango_patron_temporal": [
            int(homicidios["anio"].min()),
            int(homicidios["anio"].max()),
        ],
        "dow_pct": dow_pct,
        "mes_pct": mes_pct,
        "top_departamentos_ultimo_anio": {
            "anio": ultimo_anio,
            "departamentos": [
                {
                    "cod_dpto": row["cod_dpto"],
                    "nombre_dpto": titlecase_es(row["nombre_dpto"]),
                    "total": row["total"],
                }
                for row in deptos.iter_rows(named=True)
            ],
        },
    }


def build_sources(hub: ColombiaOpen, dataset_names: list[str]) -> list[dict[str, Any]]:
    sources = []
    for name in dataset_names:
        prov = hub.provenance(name)
        reuse = prov.get("reuse_policy") or {}
        sources.append(
            {
                "dataset": prov["dataset"],
                "source_name": prov["source_name"],
                "source_url": display_url(prov["source_url"]),
                "license": reuse.get("license"),
                "attribution_required": reuse.get("attribution_required"),
            }
        )
    return sources


def main() -> None:
    hub = ColombiaOpen()

    homicidios = hub.load_polars("delincuencia_homicidios_transito")
    demografia = hub.load_polars("demografia")
    geometria = hub.load_polars("municipios_geometria")
    municipios = hub.load_polars("municipios")

    geometrias_sin_municipio = (
        set(geometria["cod_mpio"].to_list()) - set(municipios["cod_mpio"].to_list())
    )
    municipios_sin_geometria = (
        set(municipios["cod_mpio"].to_list()) - set(geometria["cod_mpio"].to_list())
    )

    # Inner join: una feature solo si hay polígono Y nombre/departamento
    # oficial para ese cod_mpio (descarta geometrías huérfanas y
    # municipios nuevos sin geometría publicada todavía).
    base_municipios = geometria.select(
        ["cod_mpio", "area_km2", "geometry_wkt"]
    ).join(
        municipios.select(
            ["cod_mpio", "cod_dpto", "nombre_dpto", "nombre_mpio", "longitud", "latitud"]
        ),
        on="cod_mpio",
        how="inner",
    )

    grid, anios_disponibles, municipio_anio_sin_poblacion = build_rate_grid(
        homicidios, demografia, base_municipios["cod_mpio"].to_list()
    )
    year_props_by_mpio = build_year_properties(grid)
    tasas_por_anio = build_tasas_por_anio(base_municipios, year_props_by_mpio)
    geometria_topo = build_geometry_topojson(base_municipios)
    story = build_story(homicidios, municipios, grid, anios_disponibles)

    cobertura_join = {
        "municipios_sin_geometria": sorted(municipios_sin_geometria),
        "geometrias_sin_municipio": sorted(geometrias_sin_municipio),
        "municipio_anio_sin_poblacion": municipio_anio_sin_poblacion,
    }
    print(
        f"cobertura del join: {len(municipios_sin_geometria)} municipio(s) sin "
        f"geometria {sorted(municipios_sin_geometria)}, "
        f"{len(geometrias_sin_municipio)} geometria(s) sin municipio "
        f"{sorted(geometrias_sin_municipio)}, "
        f"{municipio_anio_sin_poblacion} par(es) municipio-anio sin poblacion"
    )

    meta = {
        "anio_min": anios_disponibles[0],
        "anio_max": anios_disponibles[-1],
        "anios_disponibles": anios_disponibles,
        "breaks_tasa": compute_breaks(grid["tasa"].to_list(), N_CLASSES),
        "n_clases": N_CLASSES,
        "poblacion_pequena_umbral": POBLACION_PEQUENA_UMBRAL,
        "total_municipios": base_municipios.height,
        "cobertura_join": cobertura_join,
        "colombia_open_version": __import__("colombia_open").__version__,
        "fecha_generacion_utc": datetime.now(timezone.utc).isoformat(),
        "sources": build_sources(
            hub,
            [
                "delincuencia_homicidios_transito",
                "demografia",
                "municipios_geometria",
                "municipios",
            ],
        ),
        "nota_metodologica": (
            "Este atlas llama 'muertes en siniestros viales' a lo que la fuente "
            "(MinDefensa/Policia Nacional) clasifica como 'homicidio en accidente "
            "de transito' -- es la categoria legal del dato, no un indicio de que "
            "haya intencionalidad: se usa un termino mas claro para el publico "
            "general. Tasa = (muertes en siniestros viales / poblacion) * 100 000, "
            "por municipio y anio. Poblacion = proyecciones DANE, "
            "area_geografica='Total'. Un municipio-anio sin dato de "
            "poblacion se excluye (nunca se infiere una tasa sin "
            "poblacion real). El anio en curso se excluye por estar "
            "incompleto. breaks_tasa son 4 cortes de quantiles (5 clases) "
            "calculados sobre toda la serie, no por anio individual, para "
            "que la escala de color sea comparable entre anios. Municipios "
            f"con poblacion < {es_co_int(POBLACION_PEQUENA_UMBRAL)} hab. llevan "
            "poblacion_pequena=true: su tasa de un solo anio es inestable "
            "(ver tasa_prom3, promedio movil de 3 anios) y no deben "
            "rankearse con la tasa de un solo anio. Limitacion importante del "
            "denominador: una muerte se registra en el municipio donde ocurre "
            "el siniestro, no donde vive la victima. Un municipio atravesado "
            "por una via nacional de alto trafico puede acumular muertes de "
            "personas que solo estaban de paso, lo que infla su tasa sin que "
            "eso refleje el riesgo real de quienes viven ahi -- no hay en estos "
            "datos una capa de red vial que permita distinguir un caso del otro."
        ),
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "geometria.topo.json").write_text(geometria_topo, encoding="utf-8")
    (OUT_DIR / "tasas_por_anio.json").write_text(
        json.dumps(tasas_por_anio, ensure_ascii=False), encoding="utf-8"
    )
    (OUT_DIR / "meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (OUT_DIR / "story.json").write_text(
        json.dumps(story, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(
        f"{base_municipios.height} municipios, años "
        f"{anios_disponibles[0]}-{anios_disponibles[-1]}"
    )


if __name__ == "__main__":
    main()
