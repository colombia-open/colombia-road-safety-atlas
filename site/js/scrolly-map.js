// El mapa narrativo de las escenas "absolutos" → "el giro" → "los
// extremos". Un solo mapa que persiste y cambia de estado por paso
// (ver .claude/skills/data-scrollytelling/SKILL.md). El explorador
// final es un mapa separado (ver explorer-map.js).
//
// Códigos DIVIPOLA fijos de las 3 ciudades con más población del país,
// para la escena "El panorama parece claro" (bubble map) — se etiquetan
// porque sin nombres visibles no se puede identificar ninguna ciudad.
const CIUDADES_ETIQUETADAS = ["11001", "05001", "76001"];

function initScrollyMap(containerEl, { geojson, porMunicipio, anioFoco, breaks, legendEl }) {
  const reduced = prefersReducedMotion();
  const dur = reduced ? 0 : 650;

  const map = new maplibregl.Map({
    container: containerEl,
    // Sin basemap de terceros (ver choropleth-atlas skill): solo
    // "glyphs" apunta a un servicio público de fuentes (texto, no
    // tiles/imagen) para poder dibujar los 3 rótulos de ciudad.
    style: { version: 8, sources: {}, layers: [], glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf" },
    center: [-74.3, 4.6],
    zoom: 4.6,
    interactive: false, // narrativo: el scroll manda, no el gesto del mapa
    attributionControl: false,
  });

  const topN = getTopNPorTasa(porMunicipio, geojson, anioFoco, 4);
  const topNCodes = new Set(topN.map((d) => d.cod_mpio));

  map.on("load", () => {
    map.addSource("municipios", { type: "geojson", data: geojson, promoteId: "cod_mpio" });

    // Silueta del país (paso "El panorama parece claro"): el relleno de
    // todos los municipios, siempre visible, da contexto geográfico a
    // las burbujas antes de que aparezca la coropleta por tasa.
    map.addLayer({
      id: "silueta-fill",
      type: "fill",
      source: "municipios",
      paint: { "fill-color": "#2a3038", "fill-opacity": 1 },
    });
    map.addLayer({
      id: "silueta-borders",
      type: "line",
      source: "municipios",
      paint: { "line-color": "#3a4149", "line-width": 0.3, "line-opacity": 0.6 },
    });

    // Burbujas más pequeñas encima de las grandes: se ordena el propio
    // array de features del source (descendente por homicidios) en vez
    // de usar circle-sort-key, porque ese valor depende del año y viene
    // de feature-state, que no es utilizable fuera de `paint` (ver nota
    // de MapLibre en CLAUDE.md) — el orden de inserción en un source
    // GeoJSON sí controla el orden de dibujo de un layer circle.
    const valorPorMpio = {};
    for (const cod_mpio of Object.keys(porMunicipio)) {
      const d = porMunicipio[cod_mpio][String(anioFoco)];
      valorPorMpio[cod_mpio] = d ? d.homicidios : -1;
    }
    const centroidesFeatures = geojson.features
      .map((f) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [f.properties.longitud, f.properties.latitud] },
        properties: { cod_mpio: f.properties.cod_mpio },
      }))
      .sort((a, b) => valorPorMpio[b.properties.cod_mpio] - valorPorMpio[a.properties.cod_mpio]);
    map.addSource("centroides", { type: "geojson", data: { type: "FeatureCollection", features: centroidesFeatures }, promoteId: "cod_mpio" });

    map.addLayer({
      id: "bubbles",
      type: "circle",
      source: "centroides",
      paint: {
        // Radio ∝ raíz cuadrada del valor ⇒ área ∝ valor (requisito de
        // la escena: el área, no el radio, representa la magnitud).
        // coalesce a 0: un municipio sin dato ese año no trae
        // feature-state.homicidios (queda null), y "max"/"sqrt" no
        // aceptan null — generaba un warning de consola por feature.
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["sqrt", ["max", ["coalesce", ["feature-state", "homicidios"], 0], 0]],
          0,
          2,
          25,
          42,
        ],
        "circle-color": "#f3a53d",
        "circle-opacity": 0.75,
        "circle-stroke-width": 1,
        "circle-stroke-color": "#15181c",
        "circle-opacity-transition": { duration: dur },
      },
    });

    map.addLayer({
      id: "choropleth",
      type: "fill",
      source: "municipios",
      paint: {
        "fill-color": fillColorExpression(breaks),
        "fill-opacity": 0,
        "fill-opacity-transition": { duration: dur },
      },
    });

    map.addLayer({
      id: "borders",
      type: "line",
      source: "municipios",
      paint: { "line-color": "#15181c", "line-width": 0.4, "line-opacity": 0 },
    });

    // Resaltado de "Los extremos" con doble trazo (halo oscuro ancho +
    // línea clara delgada): la rampa de color ahora va de azul oscuro a
    // casi blanco, así que un solo color de contorno no se ve igual de
    // bien contra las 5 clases — el halo oscuro resalta sobre las
    // clases claras y la línea clara resalta sobre las oscuras.
    map.addLayer({
      id: "destacados-halo",
      type: "line",
      source: "municipios",
      filter: ["in", ["get", "cod_mpio"], ["literal", [...topNCodes]]],
      paint: { "line-color": "#15181c", "line-width": 0, "line-opacity": 0 },
    });
    map.addLayer({
      id: "destacados",
      type: "line",
      source: "municipios",
      filter: ["in", ["get", "cod_mpio"], ["literal", [...topNCodes]]],
      paint: { "line-color": "#f3efe6", "line-width": 0, "line-opacity": 0 },
    });

    // Rótulos fijos de las 3 ciudades más grandes (paso "El panorama
    // parece claro"): sin esto no se puede identificar ninguna ciudad
    // en el mapa de burbujas.
    const propsByMpio = {};
    for (const f of geojson.features) propsByMpio[f.properties.cod_mpio] = f.properties;
    const ciudadesFeatures = CIUDADES_ETIQUETADAS.filter((cm) => propsByMpio[cm]).map((cm) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [propsByMpio[cm].longitud, propsByMpio[cm].latitud] },
      properties: { nombre_mpio: propsByMpio[cm].nombre_mpio },
    }));
    map.addSource("ciudades-grandes", { type: "geojson", data: { type: "FeatureCollection", features: ciudadesFeatures } });
    map.addLayer({
      id: "ciudades-grandes-label",
      type: "symbol",
      source: "ciudades-grandes",
      layout: {
        "text-field": ["get", "nombre_mpio"],
        "text-font": ["Noto Sans Regular"],
        "text-size": 13,
        "text-offset": [0, 1.3],
        "text-anchor": "top",
      },
      paint: {
        "text-color": "#f3efe6",
        "text-halo-color": "#15181c",
        "text-halo-width": 1.4,
      },
    });

    applyYearFeatureState(map, "municipios", porMunicipio, String(anioFoco));
    applyYearFeatureState(map, "centroides", porMunicipio, String(anioFoco));

    if (legendEl) renderLegendMapa(legendEl, breaks);

    containerEl.dataset.ready = "true";
    if (containerEl._pendingStep !== undefined) goToStep(containerEl._pendingStep);
  });

  // Cada paso fija TODO su estado (no solo lo que cambia respecto al
  // anterior): si el usuario scrollea rápido y salta un paso de por
  // medio, el mapa igual termina correcto en el paso donde aterrizó.
  function goToStep(index) {
    if (!map.isStyleLoaded() || !map.getLayer("bubbles")) {
      // No solo se guarda para el chequeo único tras "load": el estilo
      // puede quedar "no listo" otra vez más tarde (p.ej. mientras
      // carga el glyph del rótulo de ciudades), y si un paso llega justo
      // en esa ventana se perdía para siempre. "idle" reintenta.
      containerEl._pendingStep = index;
      map.once("idle", () => {
        if (containerEl._pendingStep !== undefined) {
          const pending = containerEl._pendingStep;
          containerEl._pendingStep = undefined;
          goToStep(pending);
        }
      });
      return;
    }
    // Estado base de cada paso ≥ 1: burbujas apagadas, coropleta
    // visible. Los pasos 1 y 2 solo difieren en el flyTo y el
    // resaltado de "destacados".
    const choroplethVisible = index >= 1;
    map.setPaintProperty("bubbles", "circle-opacity", choroplethVisible ? 0 : 0.75);
    map.setPaintProperty("choropleth", "fill-opacity", choroplethVisible ? 0.9 : 0);
    map.setPaintProperty("borders", "line-opacity", choroplethVisible ? 0.5 : 0);
    map.setPaintProperty("destacados-halo", "line-width", 5);
    map.setPaintProperty("destacados-halo", "line-opacity", index === 2 ? 0.9 : 0);
    map.setPaintProperty("destacados", "line-width", 2.5);
    map.setPaintProperty("destacados", "line-opacity", index === 2 ? 1 : 0);
    if (legendEl) legendEl.classList.toggle("is-visible", choroplethVisible);

    if (index === 0 || index === 1) {
      map.flyTo({ center: [-74.3, 4.6], zoom: 4.6, duration: dur });
    } else if (index === 2) {
      const lons = topN.map((d) => d.longitud);
      const lats = topN.map((d) => d.latitud);
      map.fitBounds(
        [
          [Math.min(...lons) - 1.2, Math.min(...lats) - 1.2],
          [Math.max(...lons) + 1.2, Math.max(...lats) + 1.2],
        ],
        { duration: dur * 2, padding: 20 }
      );
    }
  }

  return { map, goToStep, topN };
}

// Ranking de "Los extremos": solo municipios de poblacion_pequena_umbral
// (20.000 hab., ver meta.json) hacia arriba, ordenados por tasa_prom3
// (promedio de 3 años) — nunca con la tasa de un solo año de un
// municipio pequeño, que es estadísticamente inestable (ver
// colombia-open-data skill).
function getTopNPorTasa(porMunicipio, geojson, anio, n) {
  const propsByMpio = {};
  for (const f of geojson.features) propsByMpio[f.properties.cod_mpio] = f.properties;
  const rows = Object.keys(porMunicipio)
    .filter((cm) => {
      const d = porMunicipio[cm][anio];
      return d && d.tasa_prom3 !== undefined && d.poblacion_pequena === false;
    })
    .map((cm) => ({
      cod_mpio: cm,
      tasa: porMunicipio[cm][anio].tasa_prom3,
      tasaAnio: porMunicipio[cm][anio].tasa,
      nombre_mpio: propsByMpio[cm].nombre_mpio,
      nombre_dpto: propsByMpio[cm].nombre_dpto,
      longitud: propsByMpio[cm].longitud,
      latitud: propsByMpio[cm].latitud,
    }));
  rows.sort((a, b) => b.tasa - a.tasa);
  return rows.slice(0, n);
}
