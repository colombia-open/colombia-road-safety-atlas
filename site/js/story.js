function renderHero(story) {
  const years = Object.keys(story.total_nacional_por_anio).map(Number).sort();
  const anio = years[years.length - 1];
  const total = story.total_nacional_por_anio[anio];
  const minutos = Math.round((365 * 24 * 60) / total);

  document.getElementById("hero-minutos").textContent = minutos;
  document.getElementById("hero-sub").textContent =
    `${fmtEs(total)} personas murieron en siniestros de tránsito en Colombia en ${anio}. ` +
    `Este atlas muestra dónde, municipio por municipio, desde ${years[0]}.`;
}

function renderTrend(story) {
  const years = Object.keys(story.total_nacional_por_anio).map(Number).sort();
  const items = years.map((y) => ({
    label: String(y),
    shortLabel: "'" + String(y).slice(2),
    value: story.total_nacional_por_anio[y],
  }));

  let minIdx = 0;
  items.forEach((it, i) => {
    if (it.value < items[minIdx].value) minIdx = i;
  });
  const highlightIndexes = Array.from(new Set([0, minIdx, items.length - 1]));

  renderBarChart(document.getElementById("trend-chart"), {
    items,
    highlightIndexes,
    formatValue: (v) => fmtEs(v),
    ariaLabel: "Homicidios en siniestros de tránsito por año, Colombia",
  });

  const first = items[0];
  const last = items[items.length - 1];
  const valle = items[minIdx];
  const pctCambio = (((last.value - first.value) / first.value) * 100).toFixed(1);
  const subio = Number(pctCambio) >= 0;
  const deltaClass = subio ? "delta-critical" : "delta-good";
  const deltaIcon = subio ? "▲" : "▼";
  const deltaWord = subio ? "subió" : "bajó";

  document.getElementById("trend-text").innerHTML =
    `Entre ${first.label} y ${last.label} la cifra ` +
    `<span class="delta ${deltaClass}">${deltaIcon} ${deltaWord} ${Math.abs(pctCambio)}%</span>. ` +
    `El punto más bajo fue ${valle.label} (${fmtEs(valle.value)}), ` +
    `coincidiendo con los confinamientos por la pandemia. Desde entonces la tendencia es al alza.`;
}

function renderGeoContrast(story, porMunicipio, geojson, anio) {
  const propsByMpio = {};
  for (const f of geojson.features) propsByMpio[f.properties.cod_mpio] = f.properties;

  const rows = Object.keys(porMunicipio)
    .filter((cm) => porMunicipio[cm][anio] && porMunicipio[cm][anio].tasa !== undefined)
    .map((cm) => ({ cod_mpio: cm, ...porMunicipio[cm][anio], ...propsByMpio[cm] }));

  let topAbs = rows[0];
  for (const r of rows) if (r.homicidios > topAbs.homicidios) topAbs = r;

  const ciudadesGrandes = rows.filter((r) => r.poblacion > 500000);
  let topTasaGrande = ciudadesGrandes[0];
  for (const r of ciudadesGrandes) if (r.tasa > topTasaGrande.tasa) topTasaGrande = r;

  document.getElementById("geo-abs-city").textContent = topAbs.nombre_mpio;
  document.getElementById("geo-abs-value").textContent = fmtEs(topAbs.homicidios);
  document.getElementById("geo-abs-tasa").textContent = topAbs.tasa;

  document.getElementById("geo-tasa-city").textContent = topTasaGrande.nombre_mpio;
  document.getElementById("geo-tasa-value").textContent = topTasaGrande.tasa;
  document.getElementById("geo-tasa-abs").textContent = fmtEs(topTasaGrande.homicidios);

  const deptos = story.top_departamentos_ultimo_anio.departamentos;
  const top = deptos[0];
  const second = deptos[1];
  const ratio = (top.total / second.total).toFixed(1);
  document.getElementById("geo-depto-text").textContent =
    `${top.nombre_dpto} concentró ${fmtEs(top.total)} muertes en ${story.top_departamentos_ultimo_anio.anio} — ` +
    `${ratio}x las de ${second.nombre_dpto}, el departamento con el segundo mayor número.`;
}

function renderTopNList(container, topN, anio) {
  container.innerHTML = topN
    .map(
      (m, i) => `
      <li>
        <span class="topn-rank">${i + 1}</span>
        <span class="topn-name">${m.nombre_mpio} <span class="topn-dpto">${m.nombre_dpto}</span></span>
        <span class="topn-value">${m.tasa}</span>
      </li>`
    )
    .join("");
}
