function renderHero(story) {
  const years = Object.keys(story.total_nacional_por_anio).map(Number).sort();
  const anio = years[years.length - 1];
  const total = story.total_nacional_por_anio[anio];
  const minutos = Math.round((365 * 24 * 60) / total);

  document.getElementById("hero-minutos").textContent = fmtConteo(minutos);
  document.getElementById("hero-sub").textContent =
    `${fmtConteo(total)} personas murieron en siniestros de tránsito en Colombia en ${anio}. ` +
    `Este atlas muestra dónde ocurren esas muertes, municipio por municipio, desde ${years[0]}.`;
}

// Tasa nacional por año (no absolutos: ver regla editorial de la
// skill colombia-open-data). El titular y el texto se generan a partir
// del pico real de la serie, no de una afirmación fija que los datos
// puedan contradecir.
function renderTrend(story) {
  const years = Object.keys(story.tasa_nacional_por_anio).map(Number).sort();
  const items = years.map((y) => ({
    label: String(y),
    shortLabel: "'" + String(y).slice(2),
    value: story.tasa_nacional_por_anio[y],
    tooltipExtra: `${fmtConteo(story.total_nacional_por_anio[y])} muertes`,
  }));

  // El titular compara valores REDONDEADOS a 1 decimal (lo que el
  // lector realmente ve, fmtTasa) — dos años pueden tener valores
  // crudos distintos pero mostrar la misma cifra (ej. 2022 y 2023 =
  // "14,6"); si el titular dijera "el pico fue en 2022, no en 2023"
  // contradiría lo que el propio gráfico muestra al lado. Se trata
  // como empate en vez de elegir uno arbitrariamente.
  const rounded = items.map((it) => Math.round(it.value * 10) / 10);
  const maxRounded = Math.max(...rounded);
  const peakIdxs = rounded.reduce((acc, v, i) => (v === maxRounded ? [...acc, i] : acc), []);
  const peakIdx = peakIdxs[peakIdxs.length - 1];
  let valleyIdx = 0;
  items.forEach((it, i) => {
    if (it.value < items[valleyIdx].value) valleyIdx = i;
  });
  const highlightIndexes = Array.from(new Set([0, ...peakIdxs, valleyIdx, items.length - 1]));

  renderBarChart(document.getElementById("trend-chart"), {
    items,
    highlightIndexes,
    labelAll: true,
    formatValue: (v) => fmtTasa(v),
    ariaLabel: "Tasa nacional de muertes en siniestros viales por 100.000 habitantes, por año, Colombia",
  });

  const first = items[0];
  const last = items[items.length - 1];
  const peak = items[peakIdx];
  const valle = items[valleyIdx];
  const pctVsFirst = ((last.value - first.value) / first.value) * 100;
  const pctVsPeak = ((last.value - peak.value) / peak.value) * 100;

  const subioVsFirst = pctVsFirst >= 0;
  const lastIsPeak = peakIdxs.includes(items.length - 1);
  const peakYearsLabel = peakIdxs.map((i) => items[i].label).join(" y ");
  let headline;
  if (peakIdxs.length > 1) {
    headline = lastIsPeak
      ? `${peakYearsLabel} empatan con la tasa más alta de la serie`
      : `El pico fue en ${peakYearsLabel} (empatados en ${fmtTasa(maxRounded)}), no en ${last.label}`;
  } else {
    headline = lastIsPeak
      ? `${last.label} es el año con la tasa más alta de la serie`
      : `El pico fue en ${peak.label}, no en ${last.label}`;
  }
  document.getElementById("trend-title").textContent = headline;

  const deltaFirstClass = subioVsFirst ? "delta-critical" : "delta-good";
  const deltaFirstIcon = subioVsFirst ? "▲" : "▼";
  const deltaFirstWord = subioVsFirst ? "subió" : "bajó";

  let fraseVsPeak = "";
  if (Math.abs(pctVsPeak) > 0.5) {
    const bajoVsPeak = pctVsPeak < 0;
    fraseVsPeak = bajoVsPeak
      ? ` Frente al pico de ${peak.label} (${fmtTasa(peak.value)}), ${last.label} está ` +
        `<span class="delta delta-good">▼ ${fmtPct(Math.abs(pctVsPeak))} abajo</span>, pero sigue por encima de ${first.label}.`
      : ` Y sigue subiendo: ${last.label} ya superó el pico anterior de ${peak.label}.`;
  }

  document.getElementById("trend-text").innerHTML =
    `Entre ${first.label} y ${last.label} la tasa nacional ` +
    `<span class="delta ${deltaFirstClass}">${deltaFirstIcon} ${deltaFirstWord} ${fmtPct(Math.abs(pctVsFirst))}</span> ` +
    `(de ${fmtTasa(first.value)} a ${fmtTasa(last.value)} por 100.000 hab.).${fraseVsPeak} ` +
    `El punto más bajo fue ${valle.label} (${fmtTasa(valle.value)}), coincidiendo con los confinamientos por la pandemia.`;
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
  document.getElementById("geo-abs-value").textContent = fmtConteo(topAbs.homicidios);
  document.getElementById("geo-abs-tasa").textContent = fmtTasa(topAbs.tasa);

  document.getElementById("geo-tasa-city").textContent = topTasaGrande.nombre_mpio;
  document.getElementById("geo-tasa-value").textContent = fmtTasa(topTasaGrande.tasa);
  document.getElementById("geo-tasa-abs").textContent = fmtConteo(topTasaGrande.homicidios);

  const deptos = story.top_departamentos_ultimo_anio.departamentos;
  const top = deptos[0];
  const second = deptos[1];
  const ratio = top.total / second.total;
  document.getElementById("geo-depto-text").textContent =
    `${top.nombre_dpto} concentró ${fmtConteo(top.total)} muertes en ${story.top_departamentos_ultimo_anio.anio} — ` +
    `${fmtRatio(ratio)} las de ${second.nombre_dpto}, el departamento con el segundo mayor número.`;
}

function renderTopNList(container, topN, anio) {
  container.innerHTML = topN
    .map(
      (m, i) => `
      <li>
        <span class="topn-rank">${i + 1}</span>
        <span class="topn-name">${m.nombre_mpio} <span class="topn-dpto">${m.nombre_dpto}</span></span>
        <span class="topn-value">${fmtTasa(m.tasa)}</span>
      </li>`
    )
    .join("");
}

// "Cuándo": patrón por día de la semana (dow_pct), histórico completo
// del dataset (no solo anios_disponibles, ver build_data.py). No se
// infiere ninguna causa que los datos no muestren, solo se describe el
// patrón.
function renderDow(story) {
  const orden = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];
  const cortas = { lunes: "Lun", martes: "Mar", miercoles: "Mié", jueves: "Jue", viernes: "Vie", sabado: "Sáb", domingo: "Dom" };
  const items = orden.map((d) => ({
    label: d.charAt(0).toUpperCase() + d.slice(1),
    shortLabel: cortas[d],
    value: story.dow_pct[d],
  }));
  const weekendIdx = [orden.indexOf("sabado"), orden.indexOf("domingo")];

  renderBarChart(document.getElementById("dow-chart"), {
    items,
    highlightIndexes: weekendIdx,
    labelAll: true,
    formatValue: (v) => fmtPct(v),
    ariaLabel: "Porcentaje histórico de muertes en siniestros viales por día de la semana, Colombia",
  });

  const domingo = story.dow_pct.domingo;
  const sabado = story.dow_pct.sabado;
  const finde = domingo + sabado;
  const [y0, y1] = story.anio_rango_patron_temporal;

  const referenciaParejo = (2 / 7) * 100; // si los 7 días pesaran igual, 2 días = 28,6% del total
  document.getElementById("dow-text").innerHTML =
    `Con el histórico completo (${y0}–${y1}): el domingo concentra ${fmtPct(domingo)} de las muertes y el sábado ${fmtPct(sabado)} — ` +
    `<span class="delta delta-critical">${fmtPct(finde)} del total</span> cae en fin de semana. Si los 7 días pesaran igual, el fin de ` +
    `semana (2 de 7 días) tendría ${fmtPct(referenciaParejo)}: la cifra real está bien por encima de esa referencia.`;
}

// Cierre breve antes del explorador: solo síntesis de hallazgos ya
// mostrados arriba, con cifras que ya están en el DOM (no se inventa
// ningún número nuevo aquí). Cuatro viñetas, no un párrafo — una por
// cada cosa que el título promete.
function renderCierre(meta, story) {
  const finde = story.dow_pct.sabado + story.dow_pct.domingo;
  const puntos = [
    `Dividir por población cambia el mapa del riesgo: las ciudades grandes concentran más muertes en números absolutos, pero no ` +
      `tienen las tasas más altas.`,
    `En municipios de menos de ${fmtConteo(meta.poblacion_pequena_umbral)} habitantes la tasa de un solo año es poco confiable — ` +
      `una sola muerte dispara el número — así que compararlos exige promediar varios años.`,
    `Las muertes se cuentan donde ocurre el siniestro, no donde vive la víctima: un municipio atravesado por una vía nacional ` +
      `puede acumular muertes de personas que solo estaban de paso, no de sus propios habitantes.`,
    `El patrón no es parejo en el tiempo: <span class="delta delta-critical">${fmtPct(finde)}</span> de las muertes históricas ` +
      `ocurren en fin de semana.`,
  ];
  document.getElementById("cierre-text").innerHTML = puntos.map((p) => `<li>${p}</li>`).join("");
}
