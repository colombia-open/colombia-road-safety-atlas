// Utilidades compartidas entre el mapa narrativo (scrolly) y el
// explorador. Carga diferida de site/data/geometria.topo.json +
// tasas_por_anio.json (ver .claude/skills/choropleth-atlas/SKILL.md).

function normalizeEs(str) {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

// MapLibre (~1MB) + topojson-client no se cargan en el HTML: solo
// cuando el visitante se acerca a la sección del mapa (ver
// initMapTrigger en app.js), para que la carga inicial de la página
// no cuente ese peso (presupuesto de editorial-art-direction skill).
let _maplibreAssetsPromise = null;

function loadMapLibreAssets() {
  if (_maplibreAssetsPromise) return _maplibreAssetsPromise;

  const css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = "https://unpkg.com/maplibre-gl@5.24.1/dist/maplibre-gl.css";
  css.integrity = "sha256-qx5w1Z7EBGW65+cDDaLzzPKBM/1QLmK9WY7vut/XpzI=";
  css.crossOrigin = "";
  document.head.appendChild(css);

  function loadScript(src, integrity) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.integrity = integrity;
      s.crossOrigin = "";
      s.onload = resolve;
      s.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
      document.head.appendChild(s);
    });
  }

  _maplibreAssetsPromise = Promise.all([
    loadScript(
      "https://unpkg.com/maplibre-gl@5.24.1/dist/maplibre-gl.js",
      "sha256-qcniqjbU1bY7Ex8nwScvGiiIPu7MDt3R4Nv65AM7x8k="
    ),
    loadScript(
      "https://unpkg.com/topojson-client@3.1.0/dist/topojson-client.min.js",
      "sha256-Jc0CrkhsxQY+AhWk5M+xXeg3AMh6xIusTVfcaq8+u4k="
    ),
  ]);
  return _maplibreAssetsPromise;
}

// Los datos del mapa son dos archivos pesados (~1.9MB + ~1.2MB)
// cargados diferidos: un timeout explícito + reintento con backoff los
// hace resistentes tanto a una caída real como a una conexión colgada
// que nunca resuelve ni rechaza por sí sola.
async function fetchJsonWithRetry(url, retries = 2, timeoutMs = 8000) {
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt >= retries) throw err;
      await new Promise((resolve) => setTimeout(resolve, 300 * 3 ** attempt));
    } finally {
      clearTimeout(timer);
    }
  }
}

let _mapDataPromise = null;

function loadMapData() {
  if (_mapDataPromise) return _mapDataPromise;
  _mapDataPromise = Promise.all([
    fetchJsonWithRetry("data/geometria.topo.json"),
    fetchJsonWithRetry("data/tasas_por_anio.json"),
  ]).then(([topo, tasasArr]) => {
    const geojson = topojson.feature(topo, topo.objects.municipios);
    const porMunicipio = {};
    for (const row of tasasArr) {
      const anios = {};
      for (const key of Object.keys(row)) {
        const m = key.match(/^(homicidios|poblacion|tasa|tasa_prom3|poblacion_pequena)_(\d+)$/);
        if (!m) continue;
        const [, campo, anio] = m;
        anios[anio] = anios[anio] || {};
        anios[anio][campo] = row[key];
      }
      porMunicipio[row.cod_mpio] = anios;
    }
    return { geojson, porMunicipio };
  });
  return _mapDataPromise;
}

// Rampa secuencial azul oscuro → casi blanco (un solo hue, ver
// editorial-art-direction/choropleth-atlas skills). La tasa más alta
// es la más luminosa a propósito: sobre el fondo nocturno (#15181c),
// la clase anterior (#0d366b) se fundía con el fondo y el mayor riesgo
// quedaba invisible. Contraste WCAG vs #15181c verificado: 1.16 / 1.69
// / 2.88 / 6.08 / 15.02 — monótono creciente, la clase alta resalta.
const MAP_COLOR_SCALE = ["#122540", "#1d3f6e", "#2f62a3", "#5c9bdb", "#dceeff"];
const SIN_DATO_COLOR = "#4a5058";

function fillColorExpression(breaks) {
  // ['case', sin-dato -> gris, ['step', tasa, color0, b0, color1, b1, ...]]
  // La condición usa "!= true" (no "== false"): si feature-state aún no
  // se ha aplicado para una feature (tieneDatos es null, no false), debe
  // caer igual en "sin dato" en vez de colar un `tasa` null al `step`
  // numérico (producía un warning de consola por cada feature así).
  const stepExpr = ["step", ["feature-state", "tasa"], MAP_COLOR_SCALE[0]];
  for (let i = 0; i < breaks.length; i++) {
    stepExpr.push(breaks[i], MAP_COLOR_SCALE[i + 1]);
  }
  return ["case", ["!=", ["feature-state", "tieneDatos"], true], SIN_DATO_COLOR, stepExpr];
}

function applyYearFeatureState(map, sourceId, porMunicipio, anio) {
  for (const cod_mpio of Object.keys(porMunicipio)) {
    const d = porMunicipio[cod_mpio][anio];
    if (d && d.tasa !== undefined) {
      map.setFeatureState(
        { source: sourceId, id: cod_mpio },
        {
          tasa: d.tasa,
          homicidios: d.homicidios,
          poblacion: d.poblacion,
          tasaProm3: d.tasa_prom3,
          poblacionPequena: d.poblacion_pequena,
          tieneDatos: true,
        }
      );
    } else {
      map.setFeatureState({ source: sourceId, id: cod_mpio }, { tieneDatos: false });
    }
  }
}

function rankingDe(porMunicipio, geojson, cod_mpio, anio) {
  const deptoDe = {};
  for (const f of geojson.features) deptoDe[f.properties.cod_mpio] = f.properties.cod_dpto;
  const rows = Object.keys(porMunicipio)
    .filter((cm) => porMunicipio[cm][anio] && porMunicipio[cm][anio].tasa !== undefined)
    .map((cm) => ({ cod_mpio: cm, tasa: porMunicipio[cm][anio].tasa }));
  rows.sort((a, b) => b.tasa - a.tasa);
  const puestoNacional = rows.findIndex((r) => r.cod_mpio === cod_mpio) + 1;
  const deptoObjetivo = deptoDe[cod_mpio];
  const rowsDepto = rows.filter((r) => deptoDe[r.cod_mpio] === deptoObjetivo);
  const puestoDepto = rowsDepto.findIndex((r) => r.cod_mpio === cod_mpio) + 1;
  return {
    puestoNacional,
    totalNacional: rows.length,
    puestoDepto,
    totalDepto: rowsDepto.length,
  };
}

function sparklineSvg(porMunicipio, cod_mpio, anios, anioActivo, width, height) {
  const valores = anios.map((a) => {
    const d = porMunicipio[cod_mpio][a];
    return d ? d.tasa : null;
  });
  const validas = valores.filter((v) => v !== null);
  if (validas.length < 2) return "";
  const max = Math.max(...validas);
  const min = Math.min(...validas);
  const range = max - min || 1;
  const stepX = width / (anios.length - 1);
  let path = "";
  let activeX = null;
  let activeY = null;
  valores.forEach((v, i) => {
    if (v === null) return;
    const x = i * stepX;
    const y = height - ((v - min) / range) * height;
    path += (path ? "L" : "M") + x.toFixed(1) + "," + y.toFixed(1);
    if (anios[i] === anioActivo) {
      activeX = x;
      activeY = y;
    }
  });
  const dot =
    activeX !== null
      ? `<circle cx="${activeX.toFixed(1)}" cy="${activeY.toFixed(1)}" r="3" fill="var(--headlight)" />`
      : "";
  return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Serie histórica de la tasa">
    <path d="${path}" fill="none" stroke="var(--data-1)" stroke-width="2" />
    ${dot}
  </svg>`;
}

// Leyenda compartida entre el mapa narrativo (compacta, sobre el mapa)
// y el explorador (barra horizontal) — mismo contrato de breaks que
// fillColorExpression. "≤ 0" se muestra como "0 muertes" (regla #1:
// nunca una cifra sin su unidad).
function renderLegendMapa(container, breaks) {
  const labels = [];
  for (let i = 0; i < MAP_COLOR_SCALE.length; i++) {
    if (i === 0) labels.push(breaks[0] === 0 ? "0 muertes" : `≤ ${fmtBreak(breaks[0])}`);
    else if (i < MAP_COLOR_SCALE.length - 1) labels.push(`${fmtBreak(breaks[i - 1])} – ${fmtBreak(breaks[i])}`);
    else labels.push(`> ${fmtBreak(breaks[i - 1])}`);
  }
  const items = MAP_COLOR_SCALE.map(
    (c, i) => `<span class="legend-item"><span class="legend-swatch" style="background:${c}"></span>${labels[i]}</span>`
  );
  items.push(
    `<span class="legend-item"><span class="legend-swatch legend-swatch-hatch"></span>Sin dato</span>`
  );
  container.innerHTML = items.join("");
}
