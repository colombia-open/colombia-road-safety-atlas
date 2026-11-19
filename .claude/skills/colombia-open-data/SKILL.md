---
name: colombia-open-data
description: Usar siempre que se toque scripts/build_data.py o cualquier código que lea datasets de colombia-open para este atlas — API pública, join por año, regla de tasas inestables en municipios pequeños, y qué debe reportar el build.
---

# colombia-open-data

## API pública únicamente

- Siempre `from colombia_open import ColombiaOpen`, nunca imports desde
  `colombia_open.extractors` ni `colombia_open.builders` ni desde el
  repo de `colombia-open` directamente.
- Métodos usados en este proyecto: `load_polars(dataset)`,
  `provenance(dataset)`. No se necesita nada más.
- `colombia-open` todavía no tiene release de PyPI con el dataset
  `delincuencia_homicidios_transito` (se agregó después de la 0.12.0).
  `scripts/requirements.txt` instala desde un commit fijo de GitHub —
  revisar ese pin cuando se actualice el dataset o colombia-open
  publique un release nuevo.

## Datasets y sus columnas reales

| Dataset | Columnas clave | Grano |
|---|---|---|
| `delincuencia_homicidios_transito` | `fecha`, `anio`, `cod_mpio` (string, 5 dígitos), `cantidad` | una fila por (fecha, cod_mpio); días sin víctimas no existen como fila |
| `demografia` | `cod_mpio`, `anio`, `area_geografica`, `poblacion` | filtrar siempre `area_geografica == "Total"` — las otras dos filas (Cabecera / Centros Poblados) suman al Total, usarlas también sería doble conteo |
| `municipios_geometria` | `cod_mpio`, `area_km2`, `geometry_wkt` | una fila por municipio; incluye un `cod_mpio = "00000"` espurio que no existe en `municipios` |
| `municipios` | `cod_mpio`, `cod_dpto`, `nombre_dpto`, `nombre_mpio` (MAYÚSCULAS, oficial DANE) | nombre/departamento canónico — no tomar el nombre de `delincuencia_homicidios_transito`, úsalo solo para el join |

`cod_mpio` y `cod_dpto` son **siempre string**, nunca castear a int (se
pierde el cero inicial).

## El join (nunca cambiar el orden)

1. Agregar homicidios: `group_by(["cod_mpio", "anio"]).agg(sum("cantidad"))`.
2. Cruzar con población del **mismo año**: `join(poblacion, on=["cod_mpio","anio"])`.
3. `tasa = homicidios / poblacion * 100_000`, redondeada a 4 decimales.
4. Features del mapa = `municipios_geometria` ⋈ `municipios` (inner, por
   `cod_mpio`) — así se excluyen geometrías sin nombre oficial y
   municipios sin geometría publicada todavía.

Reglas de huecos (no negociables):

- Población ausente ese año para ese municipio → se **omite** esa
  celda por completo. Nunca se infiere una tasa sin población real.
- Población presente pero sin fila en homicidios → se cuenta como
  **0** víctimas (ausencia de registro, no ausencia de dato).
- El año en curso (incompleto) se excluye siempre de
  `anios_disponibles`.

## Nunca una cifra absoluta sola

Toda cifra de homicidios que se muestre (mapa, ranking, ficha de
municipio, texto narrativo) va **siempre** acompañada de: su tasa por
100.000 hab., el año, y la población usada para calcularla. Esto aplica
también a textos generados dinámicamente (JS), no solo al HTML estático.

## Tasas inestables en municipios pequeños

Un municipio pequeño con una sola muerte produce una tasa enorme que no
es comparable con la de una ciudad grande. Medido sobre los datos reales
de este proyecto (coeficiente de variación de la tasa de cada municipio
a través de los años disponibles, agrupado por población media):

| Población media | CV mediana de la tasa |
|---|---|
| 2.000–5.000 hab. | 1,38 |
| 5.000–10.000 hab. | 1,20 |
| 10.000–20.000 hab. | 0,83 |
| 20.000–50.000 hab. | 0,61 |
| 50.000–100.000 hab. | 0,42 |
| > 100.000 hab. | 0,31 |

La volatilidad baja de forma clara por debajo de 20.000 habitantes (CV
> 0,8, es decir la variación año a año supera a la propia tasa). Regla:

- **Umbral: población < 20.000 hab.** → marcar `poblacion_pequena: true`
  en los datos derivados.
- **Nunca rankear** (top-N nacional o departamental) usando la tasa de
  un solo año para un municipio con `poblacion_pequena`. Usar el
  promedio de los últimos 3 años disponibles (`tasa_prom3` en el
  esquema) para ordenar el ranking.
- El mapa y la ficha del municipio sí pueden mostrar la tasa del año
  seleccionado, pero con una nota visible "población pequeña, tasa
  inestable" junto al número — nunca ocultar el dato, solo advertir.
- Este umbral se recalcula solo si cambia sustancialmente la serie de
  años disponible; no es un número fijo de por vida, es una
  observación sobre los datos actuales.

```python
# scripts/build_data.py — snippet de referencia, no copiar literal
tasa_prom3 = (
    grid.sort(["cod_mpio", "anio"])
    .with_columns(
        pl.col("tasa").rolling_mean(window_size=3, min_samples=1)
        .over("cod_mpio")
        .alias("tasa_prom3")
    )
)
```

## El build reporta cobertura del join

`build_data.py` debe imprimir en consola y escribir en `meta.json`:

- cuántos municipios de `municipios_geometria` quedaron sin match en
  `municipios` (sin nombre oficial → excluidos del mapa),
- cuántos municipios de `municipios` quedaron sin geometría (no se
  pueden dibujar, aunque tengan datos),
- cuántos pares (municipio, año) quedaron sin población (excluidos de
  `tasas.geojson` ese año).

```json
"cobertura_join": {
  "municipios_sin_geometria": 1,
  "geometrias_sin_municipio": 1,
  "municipio_anio_sin_poblacion": 0
}
```

## Trazabilidad visible

`provenance(dataset)` da `source_name`, `source_url`, `reuse_policy`.
Cada número derivado de un dataset debe poder enlazar a su fuente real
(nunca inventar una URL ni mostrar el dataset sin su nombre oficial).
La fecha de corte (`refreshed_at_utc` o el año máximo de los datos) debe
ser visible en la página, no solo en el JSON.

## Presupuesto de peso de los JSON del sitio

Los archivos de `site/data/` son productos derivados, no un volcado del
dataset. Si `tasas.geojson` pasa de ~2 MB, ver la skill
`choropleth-atlas` para simplificación/TopoJSON — no es aceptable que
el build genere un archivo grande "porque los datos son grandes"; el
trabajo de reducir el peso es del build, no del navegador del usuario.
