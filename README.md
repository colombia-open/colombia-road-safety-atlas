# Atlas de siniestralidad vial de Colombia

Mapa interactivo, estático (sin backend), de la tasa de homicidios en
accidentes de tránsito por municipio y año en Colombia, por cada 100.000
habitantes.

**Fuente de los datos**: Ministerio de Defensa Nacional / Policía Nacional
de Colombia, publicados en [datos.gov.co](https://www.datos.gov.co/resource/uav5-b85g)
("Homicidio en accidente de tránsito"), consumidos vía la librería
[`colombia-open`](https://github.com/davidcasr/colombia-open), que también
provee la población (DANE) y los polígonos municipales (IGAC, vía SNR).
El link y el nombre de cada fuente se muestran siempre junto al dato en
el mapa — nunca se presenta una cifra absoluta sin su tasa per cápita.

## Skills del proyecto

`.claude/skills/` documenta las reglas de este proyecto para quien (o
lo que) lo siga trabajando:

- [`colombia-open-data`](.claude/skills/colombia-open-data/SKILL.md) — API
  pública, el join, y la regla de tasas inestables en municipios pequeños
  (umbral de 20.000 hab., medido con el coeficiente de variación real de
  los datos, no inventado).
- [`data-scrollytelling`](.claude/skills/data-scrollytelling/SKILL.md) —
  patrón sticky+pasos, accesibilidad, móvil, `prefers-reduced-motion`.
- [`editorial-art-direction`](.claude/skills/editorial-art-direction/SKILL.md)
  — tipografía, sistema de slots de imagen con placeholder, `<picture>`
  responsive, presupuestos de peso.
- [`choropleth-atlas`](.claude/skills/choropleth-atlas/SKILL.md) — MapLibre,
  TopoJSON, clasificación de color, buscador, URL compartible, ficha.

## Arquitectura

Todo estático, cero servidor en producción:

- `scripts/build_data.py` — corre **una sola vez al construir** (local o en
  CI), nunca en el navegador del usuario. Usa `colombia-open` (solo su API
  pública: `ColombiaOpen().load_polars(...)`, nunca su código de
  `extractors/`/`builders/`) para agregar homicidios por `(cod_mpio, anio)`,
  cruzarlos con la población del mismo año, y calcular la tasa. Escribe
  `site/data/geometria.topo.json` + `site/data/tasas_por_anio.json` +
  `site/data/meta.json` + `site/data/story.json`.
- `scripts/optimize_images.py` / `scripts/generate_og_image.py` — generan
  las variantes responsive (JPG/WebP/AVIF) y la imagen Open Graph a partir
  de `site/assets/img/originals/`. Correr a mano cuando se agregan fotos.
- `site/` — HTML/CSS/JS plano, sin build step de frontend. Un
  scrollytelling (gráfica fija + pasos, `IntersectionObserver`, sin
  scroll-jacking): hero → "las ciudades en absolutos" → "el giro" (burbujas
  a coropleta) → "los extremos" (flyTo a los municipios de mayor tasa) →
  "el tiempo" (tendencia nacional) → el explorador. El mapa es
  [MapLibre GL JS](https://maplibre.org/) (gratis, sin token, WebGL, sin
  basemap de terceros), con geometría en TopoJSON (arcos compartidos,
  ~1.9 MB en vez de los ~9.5 MB del GeoJSON original) y las propiedades por
  año aplicadas vía `feature-state` (no se recarga la geometría al cambiar
  de año). MapLibre + los datos del mapa (~4 MB en total) cargan diferidos:
  solo al primer scroll del visitante, nunca en la carga inicial de la
  página (~136 KB). Rampa secuencial de un solo tono (azul), validada con
  `scripts/validate_palette.js` del skill de `dataviz` (monótona, un solo
  hue, contraste del extremo claro ≥ 2:1 contra el fondo). El explorador
  final tiene buscador tolerante a tildes, slider de año con play/pause,
  ficha de municipio (tasa, absolutos, población, ranking nacional y
  departamental, sparkline, fuente) y URL compartible (`?mpio=&anio=`).
- `.github/workflows/build.yml` — cron mensual que corre `build_data.py`
  contra el último bundle de `colombia-open` y abre un PR si los datos
  cambiaron.
- Despliegue a GitHub Pages directamente desde `/site` (ver abajo).

## Esquema de los datos generados

`site/data/geometria.topo.json`: TopoJSON con un objeto `municipios`,
geometría + identidad (`cod_mpio`, `nombre_mpio`, `cod_dpto`,
`nombre_dpto`, `area_km2`, `longitud`, `latitud` del centroide). Se carga
una sola vez; las propiedades por año viven aparte.

`site/data/tasas_por_anio.json`: un objeto por municipio, con las cifras
de cada año con prefijo:

```json
{
  "cod_mpio": "05001",
  "homicidios_2024": 521,
  "poblacion_2024": 2524747,
  "tasa_2024": 20.6357,
  "tasa_prom3_2024": 18.996,
  "poblacion_pequena_2024": false
}
```

`tasa_prom3` es el promedio móvil de 3 años (usado para no rankear
municipios pequeños con la tasa de un solo año — ver la skill
`colombia-open-data`). Si un municipio no tiene dato de población para un
año dado, esas claves simplemente no existen para ese año — nunca se
infiere una tasa sin población real. Si tiene población pero no aparece
ese año en el dataset de homicidios, se cuenta como 0 víctimas.

`site/data/meta.json`: rango de años, cortes de color (`breaks_tasa`,
quantiles sobre toda la serie para que la escala sea comparable entre
años), el umbral de población pequeña, `cobertura_join` (cuántos
municipios/geometrías/pares municipio-año quedaron fuera del cruce y por
qué), y la lista `sources` con `source_name`/`source_url`/licencia de cada
dataset usado.

`site/data/story.json`: las cifras del storytelling, calculadas una sola
vez en el build (no en el navegador): total nacional por año, el patrón
por día de la semana y por mes (sobre el histórico completo), y el top 5
de departamentos del último año.

## Build local

```bash
python -m venv .venv
source .venv/bin/activate  # o .venv\Scripts\activate en Windows
pip install -r scripts/requirements.txt
python scripts/build_data.py
```

Para agregar fotos reales: poner los originales en
`site/assets/img/originals/` según `site/assets/img/IMAGE_BRIEF.md`, luego
`python scripts/optimize_images.py && python scripts/generate_og_image.py`.
Sin originales, cada slot muestra un placeholder y la página se ve
terminada igual.

Para ver el sitio localmente (necesita un servidor HTTP porque `fetch()`
no funciona con `file://`):

```bash
cd site && python -m http.server 8000
```

El servidor de desarrollo de `http.server` por defecto habla HTTP/1.0 sin
confirmar `keep-alive` correctamente — con Chrome/Chromium esto puede
colgar intermitentemente una conexión reutilizada al pedir los archivos
grandes de `data/`. No pasa contra producción real (GitHub Pages), pero si
lo notas probando localmente, fuerza HTTP/1.1 en el handler
(`protocol_version = "HTTP/1.1"`) o usa cualquier otro servidor estático.

### Nota sobre la versión de `colombia-open`

El dataset `delincuencia_homicidios_transito` se agregó a `colombia-open`
**después** de su último release publicado en PyPI (`0.12.0`). Por eso
`scripts/requirements.txt` instala el paquete directamente desde un commit
fijo de GitHub en vez de PyPI — el *bundle* de datos en sí ya está
publicado como GitHub Release (`v0.14.0`) y se descarga igual, vía la API
pública `ColombiaOpen()`; lo único que se pinea es el código del paquete,
para que conozca el nombre del dataset nuevo. Cuando `colombia-open`
publique un release de PyPI ≥ 0.13 con este dataset, cambiar el pin a
`colombia-open>=0.13`.

## Desplegar en GitHub Pages

GitHub Pages no permite servir una subcarpeta como `/site` con el método
clásico "deploy from branch" (solo acepta `/` o `/docs`). Por eso el
despliegue usa el modo "GitHub Actions" de Pages:

1. Una sola vez: Settings → Pages → Source: "GitHub Actions" (o activarlo
   vía `gh api` con `build_type=workflow`).
2. `.github/workflows/pages.yml` publica `site/` en cada push a `main`
   que lo toque, sin API keys ni costo.

## Licencias de los datos

Cada fuente usada tiene su propia licencia (ver `site/data/meta.json` →
`sources[].license` para el detalle exacto generado en cada build):

- Homicidios en accidente de tránsito (MinDefensa/Policía): CC BY-SA 4.0.
- Demografía (DANE): términos de uso del DANE, atribución requerida.
- Geometría municipal (IGAC vía SNR): CC BY 4.0.
- Municipios/DIVIPOLA (DANE): CC BY-SA 4.0.
