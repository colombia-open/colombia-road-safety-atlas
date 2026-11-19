// El mapa narrativo de las escenas "absolutos" → "el giro" → "los
// extremos". Un solo mapa que persiste y cambia de estado por paso
// (ver .claude/skills/data-scrollytelling/SKILL.md). El explorador
// final es un mapa separado (ver explorer-map.js).
function initScrollyMap(containerEl, { geojson, porMunicipio, anioFoco, breaks }) {
  const reduced = prefersReducedMotion();
  const dur = reduced ? 0 : 650;

  const map = new maplibregl.Map({
    container: containerEl,
    style: { version: 8, sources: {}, layers: [] },
    center: [-74.3, 4.6],
    zoom: 4.6,
    interactive: false, // narrativo: el scroll manda, no el gesto del mapa
    attributionControl: false,
  });

  const topN = getTopNPorTasa(porMunicipio, geojson, anioFoco, 4);
  const topNCodes = new Set(topN.map((d) => d.cod_mpio));

  map.on("load", () => {
    map.addSource("municipios", { type: "geojson", data: geojson, promoteId: "cod_mpio" });

    const centroides = {
      type: "FeatureCollection",
      features: geojson.features.map((f) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [f.properties.longitud, f.properties.latitud] },
        properties: { cod_mpio: f.properties.cod_mpio },
      })),
    };
    map.addSource("centroides", { type: "geojson", data: centroides, promoteId: "cod_mpio" });

    map.addLayer({
      id: "bubbles",
      type: "circle",
      source: "centroides",
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["sqrt", ["max", ["feature-state", "homicidios"], 0]], 0, 2, 25, 42],
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

    map.addLayer({
      id: "destacados",
      type: "line",
      source: "municipios",
      filter: ["in", ["get", "cod_mpio"], ["literal", [...topNCodes]]],
      paint: { "line-color": "#f3a53d", "line-width": 0, "line-opacity": 0 },
    });

    applyYearFeatureState(map, "municipios", porMunicipio, String(anioFoco));
    applyYearFeatureState(map, "centroides", porMunicipio, String(anioFoco));

    containerEl.dataset.ready = "true";
    if (containerEl._pendingStep !== undefined) goToStep(containerEl._pendingStep);
  });

  // Cada paso fija TODO su estado (no solo lo que cambia respecto al
  // anterior): si el usuario scrollea rápido y salta un paso de por
  // medio, el mapa igual termina correcto en el paso donde aterrizó.
  function goToStep(index) {
    if (!map.isStyleLoaded() || !map.getLayer("bubbles")) {
      containerEl._pendingStep = index;
      return;
    }
    // Estado base de cada paso ≥ 1: burbujas apagadas, coropleta
    // visible. Los pasos 1 y 2 solo difieren en el flyTo y el
    // resaltado de "destacados".
    const choroplethVisible = index >= 1;
    map.setPaintProperty("bubbles", "circle-opacity", choroplethVisible ? 0 : 0.75);
    map.setPaintProperty("choropleth", "fill-opacity", choroplethVisible ? 0.9 : 0);
    map.setPaintProperty("borders", "line-opacity", choroplethVisible ? 0.5 : 0);
    map.setPaintProperty("destacados", "line-width", 2.5);
    map.setPaintProperty("destacados", "line-opacity", index === 2 ? 1 : 0);

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

function getTopNPorTasa(porMunicipio, geojson, anio, n) {
  const propsByMpio = {};
  for (const f of geojson.features) propsByMpio[f.properties.cod_mpio] = f.properties;
  const rows = Object.keys(porMunicipio)
    .filter((cm) => porMunicipio[cm][anio] && porMunicipio[cm][anio].tasa !== undefined)
    .map((cm) => ({
      cod_mpio: cm,
      tasa: porMunicipio[cm][anio].tasa,
      nombre_mpio: propsByMpio[cm].nombre_mpio,
      nombre_dpto: propsByMpio[cm].nombre_dpto,
      longitud: propsByMpio[cm].longitud,
      latitud: propsByMpio[cm].latitud,
    }));
  rows.sort((a, b) => b.tasa - a.tasa);
  return rows.slice(0, n);
}
