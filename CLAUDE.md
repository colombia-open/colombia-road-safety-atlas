# CLAUDE.md

Guía para trabajar en este repositorio. Léela completa antes de tocar
`scripts/` o `site/`.

## Qué es esto

Atlas de datos interactivo y **100% estático** (sin backend, sin API keys)
sobre homicidios en siniestros de tránsito en Colombia, por municipio y
año, por cada 100.000 habitantes. El README tiene el detalle completo de
arquitectura y esquema de datos — este archivo es sobre cómo trabajar
aquí, no un duplicado de ese contenido.

## Primero: las skills del proyecto

Antes de editar código de un área, carga la skill correspondiente con la
herramienta `Skill` — documentan reglas de este proyecto específicas
(umbrales medidos con los datos reales, patrones de accesibilidad,
limitaciones de MapLibre encontradas, etc.) que no son obvias leyendo el
código:

| Al tocar... | Skill |
|---|---|
| `scripts/build_data.py` o cualquier lectura de `colombia-open` | `colombia-open-data` |
| Secciones de scroll (hero, escenas narrativas) | `data-scrollytelling` |
| CSS/tipografía, slots de imagen, créditos de IA | `editorial-art-direction` |
| El explorador de mapa (MapLibre, color, buscador, ficha) | `choropleth-atlas` |

## Reglas no negociables

- **Nunca** una cifra absoluta sin su tasa per cápita, el año y la
  población junto al dato (regla editorial del proyecto, no solo de
  estilo — una cifra absoluta sola engaña sobre el riesgo real).
- **Nunca** importar `colombia-open.extractors`/`.builders` ni nada fuera
  de su API pública (`ColombiaOpen().load_polars(...)`, `.provenance(...)`).
- Municipios con población < 20.000 hab. (umbral medido con el
  coeficiente de variación real de los datos, ver skill
  `colombia-open-data`) deben rankearse con `tasa_prom3`, no con la tasa
  de un solo año.
- Paleta del mapa: secuencial, un solo tono, nunca rojo-verde. Validar
  cualquier cambio de color con `scripts/validate_palette.js` (skill
  `dataviz`) contra el fondo real del sitio.
- Toda imagen representativa (no decorativa) es generada con IA y debe
  llevar el crédito visible — ver `editorial-art-direction`. Si en algún
  momento se reemplaza por fotografía real, quitar el crédito en esa
  foto específica.
- `scripts/build_data.py` corre una sola vez al construir (local o CI),
  nunca en el navegador del usuario.
- MapLibre: `feature-state` no funciona dentro de `filter`, solo en
  `paint` — no reintroducir una capa de hachurado por `filter` +
  `feature-state` (ver el comentario en `explorer-map.js`).

## Comandos

```bash
# build de datos (requiere scripts/requirements.txt instalado)
python scripts/build_data.py

# imágenes responsive + OG image, a partir de site/assets/img/originals/
python scripts/optimize_images.py
python scripts/generate_og_image.py

# favicon (solo si cambia la identidad visual/paleta)
python scripts/generate_favicon.py

# servir el sitio localmente (fetch() no funciona con file://)
cd site && python -m http.server 8000
```

El `http.server` por defecto puede colgarse intermitentemente sirviendo
los archivos grandes de `data/` (bug de keep-alive en HTTP/1.0) — ver
README si pasa, es un problema del servidor de prueba, no del sitio.

## Verificación antes de dar algo por terminado

- Servir local y revisar en al menos 390×844 y 1440×900, con y sin
  `prefers-reduced-motion`.
- Cero errores de consola.
- Verificar 2-3 números visibles contra un cálculo independiente simple
  (no confiar en que el pipeline los calculó bien solo porque corrió).
- Confirmar que el peso inicial de carga (antes del primer scroll) sigue
  bajo: MapLibre + los datos del mapa cargan diferidos, no deben
  aparecer en el HTML inicial ni dispararse antes del primer scroll real.

## Despliegue

Push a `main` que toque `site/**` dispara
`.github/workflows/pages.yml` (GitHub Pages vía Actions —
`configure-pages` + `upload-pages-artifact` + `deploy-pages`). GitHub
Pages **no** soporta servir una subcarpeta como `/site` con el método
clásico "deploy from branch"; por eso el despliegue es vía este
workflow y no vía Settings → Pages → Branch.

El cron mensual (`.github/workflows/build.yml`) regenera `site/data/`
contra el último bundle de `colombia-open` y abre un PR si cambió algo
— revisar `site/data/meta.json` antes de aprobarlo.

## Atribución de commits

Los commits y PRs de Claude Code en este repo llevan los trailers de
atribución estándar (`Co-Authored-By: Claude Sonnet 5 ...` /
`🤖 Generated with Claude Code`) — ver las instrucciones del sistema,
no hace falta repetirlas aquí.
