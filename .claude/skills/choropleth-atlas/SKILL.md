---
name: choropleth-atlas
description: Usar al construir o modificar el explorador de mapa (motor de render, geometría, clasificación de color, buscador, slider de año, ficha de municipio, URL compartible). No cubre la narrativa de scroll previa al mapa (ver data-scrollytelling).
---

# choropleth-atlas

## Motor: MapLibre GL JS, sin basemap de terceros

MapLibre GL JS (gratis, sin token, WebGL) en vez de Leaflet. Ganancia
real sobre Leaflet para este caso:

- Transiciones de color suaves al cambiar de año (`paint` interpolado)
  en vez de recolorear cada polígono en el DOM uno por uno.
- `flyTo` con animación de cámara (zoom + pan) para las escenas de
  scrollytelling que saltan a un municipio o corredor.
- Mejor rendimiento con ~1.100 polígonos y un slider que recolorea
  constantemente — Leaflet repinta SVG/Canvas por capa, MapLibre lo
  hace en GPU.

Sin basemap: un `style` vacío con solo nuestras fuentes (`sources`), sin
tiles raster ni vectoriales de terceros — igual que antes con Leaflet,
solo que ahora en WebGL.

```js
const map = new maplibregl.Map({
  container: "map",
  style: { version: 8, sources: {}, layers: [] }, // sin basemap
  center: [-74.3, 4.6],
  zoom: 5,
});
```

Si se migra desde Leaflet, explicar la ganancia al usuario en la
entrega (no asumir que se nota sola), y verificar que el fallback sin
WebGL (navegadores muy viejos) al menos no deja la página en blanco —
un mensaje claro basta, no hace falta reimplementar Leaflet como
fallback.

## Geometría: presupuesto de peso

`tasas.geojson` tal como está (GeoJSON con WKT ya convertido, una
feature por municipio) pesa ~9,5 MB — por encima del presupuesto de
~2 MB de la skill `colombia-open-data`. Opciones, en orden de
preferencia:

1. **TopoJSON**: la misma geometría comparte arcos entre municipios
   vecinos en vez de repetir coordenadas — típicamente reduce el peso
   60–80% en una malla de polígonos contiguos como esta. Requiere
   `topojson-client` en el navegador (CDN, no build step) para
   convertir de vuelta a GeoJSON al cargar.
2. Simplificar más la geometría (mayor tolerancia Douglas-Peucker) si
   TopoJSON solo no basta — perder detalle de borde es aceptable a la
   escala de un mapa nacional, perder un municipio completo no.
3. Separar las propiedades por año de la geometría: un archivo con
   solo geometría + `cod_mpio` (se carga una vez) y archivos pequeños
   por año con solo `cod_mpio` + tasa/homicidios/poblacion (se cargan
   on demand al cambiar de año) — reduce la carga inicial aunque el
   total no baje.

Carga diferida: el mapa no es parte de la carga inicial de la página
(ver presupuesto en `editorial-art-direction`) — se descarga cuando la
sección del mapa entra en viewport o el usuario navega al explorador.

## Clasificación de color

- Cuantiles o Jenks sobre la tasa (no rangos fijos arbitrarios),
  5–7 clases — más de 7 deja de ser legible en una leyenda.
- Paleta secuencial accesible: un solo tono, claro→oscuro, **nunca
  rojo-verde**. Validar siempre con el script del skill `dataviz`
  (`scripts/validate_palette.js --ordinal`) contra el color de fondo
  real del sitio antes de usarla — no a ojo.
- "Sin dato" ≠ "cero": sin dato se pinta en gris con **rayado/textura**
  (no un tono más de la rampa secuencial), con su propia entrada en la
  leyenda. Cero homicidios es un valor real y se pinta con el primer
  escalón de la rampa de color, igual que cualquier otro valor bajo.
- La leyenda está siempre visible (no un botón para desplegarla) —
  sin ella el mapa es decorativo, no informativo.

## Interacción

**Buscador de municipio.** Autocompletado tolerante a tildes y
mayúsculas (normalizar ambos lados: quitar tildes, minúsculas, antes de
comparar — igual que `colombia_open.resolve.py` hace para sus alias,
pero sin copiar ese código, solo el mismo criterio de normalización).
Debe encontrar "bogota" → BOGOTÁ, D.C., "cucuta" → SAN JOSÉ DE CÚCUTA.

**Slider de año con play/pause.** Recorre `anios_disponibles` de
`meta.json`. Pausa automática al llegar al último año (no vuelve a
loopear sola salvo que el usuario la reinicie) — ver patrón ya
implementado en `site/js/slider.js`, extenderlo, no reescribirlo desde
cero.

**Hover/tap con ficha.** Hover en desktop, tap en móvil (el mismo
evento, no dos implementaciones separadas) muestra la ficha del
municipio sin bloquear la interacción con el resto del mapa.

**URL compartible.** `?mpio=<cod_mpio>&anio=<anio>` refleja el estado
del explorador — al cargar con esos parámetros, el mapa abre
directamente en ese municipio/año. Actualizar la URL con
`history.replaceState` (nunca `pushState` en cada cambio de slider —
eso rompe el botón atrás del navegador con decenas de entradas).

## Ficha del municipio

Contenido fijo, en este orden:

1. Nombre del municipio y departamento.
2. Tasa del año seleccionado (con nota "población pequeña, tasa
   inestable" si aplica — ver `colombia-open-data`).
3. Homicidios absolutos y población de ese año (nunca la tasa sola,
   ver regla de `colombia-open-data`).
4. Posición en el ranking nacional y en el ranking departamental ese
   año (ej. "puesto 12 de 1.121 municipios · puesto 2 de 125 en
   Antioquia").
5. Sparkline de la serie completa de `anios_disponibles` para ese
   municipio — una línea simple, sin ejes ni leyenda (el título de la
   ficha ya dice qué es), destacando el año seleccionado.
6. Enlace a la fuente (`source_name`/`source_url` de `provenance()`,
   vía `meta.json`) — nunca se omite.

```js
// snippet: ranking nacional/departamental para un (cod_mpio, anio) dado
function rankingDe(geojson, cod_mpio, anio) {
  const props = geojson.features.map((f) => f.properties).filter((p) => p[`tasa_${anio}`] !== undefined);
  const nacional = [...props].sort((a, b) => b[`tasa_${anio}`] - a[`tasa_${anio}`]);
  const depto = nacional.filter((p) => p.cod_dpto === props.find((p2) => p2.cod_mpio === cod_mpio).cod_dpto);
  return {
    puestoNacional: nacional.findIndex((p) => p.cod_mpio === cod_mpio) + 1,
    totalNacional: nacional.length,
    puestoDepto: depto.findIndex((p) => p.cod_mpio === cod_mpio) + 1,
    totalDepto: depto.length,
  };
}
```
