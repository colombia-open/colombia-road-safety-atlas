// El explorador interactivo final (ver
// .claude/skills/choropleth-atlas/SKILL.md): buscador tolerante a
// tildes, slider de año con play/pause, ficha al click/tap, URL
// compartible ?mpio=&anio=.
function initExplorerMap(ui, { geojson, porMunicipio, meta, sources }) {
  const anios = meta.anios_disponibles.map(String);
  let anioActual = anios[anios.length - 1];
  let mpioActual = null;

  const params = new URLSearchParams(location.search);
  if (params.get("anio") && anios.includes(params.get("anio"))) {
    anioActual = params.get("anio");
  }

  const map = new maplibregl.Map({
    container: ui.mapEl,
    style: { version: 8, sources: {}, layers: [] },
    center: [-74.3, 4.6],
    zoom: 4.8,
    attributionControl: false,
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

  const propsByMpio = {};
  for (const f of geojson.features) propsByMpio[f.properties.cod_mpio] = f.properties;

  map.on("load", () => {
    map.addSource("municipios", { type: "geojson", data: geojson, promoteId: "cod_mpio" });

    // Nota: MapLibre no permite expresiones de feature-state dentro de
    // `filter` (solo en `paint`), así que "sin dato" se diferencia con
    // un gris sólido propio (ver fillColorExpression) en vez de un
    // patrón rayado sobre el polígono — el rayado sí se usa en la
    // leyenda estática (CSS), que no tiene esa restricción.
    map.addLayer({
      id: "choropleth",
      type: "fill",
      source: "municipios",
      paint: { "fill-color": fillColorExpression(meta.breaks_tasa), "fill-opacity": 0.88 },
    });
    map.addLayer({
      id: "borders",
      type: "line",
      source: "municipios",
      paint: { "line-color": "#15181c", "line-width": 0.4 },
    });
    map.addLayer({
      id: "seleccion",
      type: "line",
      source: "municipios",
      filter: ["==", ["get", "cod_mpio"], ""],
      paint: { "line-color": "#f3a53d", "line-width": 2.5 },
    });

    applyYearFeatureState(map, "municipios", porMunicipio, anioActual);
    renderLegendMapa(ui.legendEl, meta.breaks_tasa);
    ui.yearLabel.textContent = anioActual;
    ui.slider.min = "0";
    ui.slider.max = String(anios.length - 1);
    ui.slider.value = String(anios.indexOf(anioActual));

    const mpioInicial = params.get("mpio");
    if (mpioInicial && propsByMpio[mpioInicial]) {
      seleccionar(mpioInicial, { fly: true });
    }

    map.on("click", "choropleth", (e) => {
      const cod_mpio = e.features[0].properties.cod_mpio;
      seleccionar(cod_mpio, { fly: false });
    });
  });

  function setYear(anio) {
    anioActual = anio;
    ui.yearLabel.textContent = anio;
    if (map.getLayer("choropleth")) applyYearFeatureState(map, "municipios", porMunicipio, anio);
    updateUrl();
    if (mpioActual) renderCard(mpioActual);
  }

  function seleccionar(cod_mpio, { fly }) {
    mpioActual = cod_mpio;
    map.setFilter("seleccion", ["==", ["get", "cod_mpio"], cod_mpio]);
    if (fly) {
      const p = propsByMpio[cod_mpio];
      map.flyTo({ center: [p.longitud, p.latitud], zoom: 9, duration: prefersReducedMotion() ? 0 : 1200 });
    }
    renderCard(cod_mpio);
    updateUrl();
  }

  function updateUrl() {
    const p = new URLSearchParams();
    p.set("anio", anioActual);
    if (mpioActual) p.set("mpio", mpioActual);
    history.replaceState(null, "", "?" + p.toString());
  }

  function renderCard(cod_mpio) {
    const props = propsByMpio[cod_mpio];
    const datos = porMunicipio[cod_mpio][anioActual];
    if (!datos) {
      ui.cardEl.innerHTML = `<p class="card-sin-dato">${props.nombre_mpio}: sin dato para ${anioActual}.</p>`;
      ui.cardEl.hidden = false;
      return;
    }
    const ranking = rankingDe(porMunicipio, geojson, cod_mpio, anioActual);
    const aviso = datos.poblacion_pequena
      ? `<p class="card-aviso">Población pequeña — tasa inestable. Promedio de 3 años: ${datos.tasa_prom3}.</p>`
      : "";
    const spark = sparklineSvg(porMunicipio, cod_mpio, anios, anioActual, 180, 40);
    const srcHom = sources.delincuencia_homicidios_transito;
    ui.cardEl.innerHTML = `
      <button type="button" class="card-close" aria-label="Cerrar ficha">×</button>
      <p class="card-dpto">${props.nombre_dpto}</p>
      <h3 class="card-nombre">${props.nombre_mpio}</h3>
      <p class="card-tasa">${datos.tasa}<span class="card-tasa-unit">por 100.000 hab. · ${anioActual}</span></p>
      ${aviso}
      <dl class="card-dl">
        <dt>Homicidios</dt><dd>${fmtEs(datos.homicidios)}</dd>
        <dt>Población</dt><dd>${fmtEs(datos.poblacion)}</dd>
        <dt>Puesto nacional</dt><dd>${ranking.puestoNacional} de ${ranking.totalNacional}</dd>
        <dt>Puesto en ${props.nombre_dpto}</dt><dd>${ranking.puestoDepto} de ${ranking.totalDepto}</dd>
      </dl>
      <div class="card-spark">${spark}</div>
      <a class="card-fuente" href="${srcHom.source_url}" target="_blank" rel="noopener">Fuente: ${srcHom.source_name}</a>
    `;
    ui.cardEl.hidden = false;
    ui.cardEl.querySelector(".card-close").addEventListener("click", () => {
      ui.cardEl.hidden = true;
      mpioActual = null;
      map.setFilter("seleccion", ["==", ["get", "cod_mpio"], ""]);
      updateUrl();
    });
  }

  // --- buscador tolerante a tildes ---
  const indice = Object.values(propsByMpio).map((p) => ({
    cod_mpio: p.cod_mpio,
    label: `${p.nombre_mpio}, ${p.nombre_dpto}`,
    norm: normalizeEs(p.nombre_mpio),
  }));

  ui.searchInput.addEventListener("input", () => {
    const q = normalizeEs(ui.searchInput.value.trim());
    if (q.length < 2) {
      ui.searchResults.innerHTML = "";
      ui.searchResults.hidden = true;
      return;
    }
    const matches = indice.filter((i) => i.norm.includes(q)).slice(0, 8);
    ui.searchResults.innerHTML = matches
      .map((m) => `<li role="option" data-cod="${m.cod_mpio}">${m.label}</li>`)
      .join("");
    ui.searchResults.hidden = matches.length === 0;
  });

  ui.searchResults.addEventListener("click", (e) => {
    const li = e.target.closest("li[data-cod]");
    if (!li) return;
    seleccionar(li.dataset.cod, { fly: true });
    ui.searchResults.hidden = true;
    ui.searchInput.value = li.textContent;
  });

  // --- slider + autoplay ---
  ui.slider.addEventListener("input", () => setYear(anios[Number(ui.slider.value)]));
  let timer = null;
  ui.playBtn.addEventListener("click", () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
      ui.playBtn.textContent = "▶";
      return;
    }
    ui.playBtn.textContent = "⏸";
    timer = setInterval(() => {
      const next = (Number(ui.slider.value) + 1) % anios.length;
      ui.slider.value = String(next);
      setYear(anios[next]);
      if (next === anios.length - 1) {
        clearInterval(timer);
        timer = null;
        ui.playBtn.textContent = "▶";
      }
    }, 1100);
  });

  return { map, setYear, seleccionar };
}

function renderLegendMapa(container, breaks) {
  const labels = [];
  for (let i = 0; i < MAP_COLOR_SCALE.length; i++) {
    if (i === 0) labels.push(`≤ ${breaks[0]}`);
    else if (i < MAP_COLOR_SCALE.length - 1) labels.push(`${breaks[i - 1]} – ${breaks[i]}`);
    else labels.push(`> ${breaks[i - 1]}`);
  }
  const items = MAP_COLOR_SCALE.map(
    (c, i) => `<span class="legend-item"><span class="legend-swatch" style="background:${c}"></span>${labels[i]}</span>`
  );
  items.push(
    `<span class="legend-item"><span class="legend-swatch legend-swatch-hatch"></span>Sin dato</span>`
  );
  container.innerHTML = items.join("");
}
