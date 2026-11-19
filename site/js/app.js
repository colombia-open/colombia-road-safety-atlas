function initContentPhotos() {
  document.querySelectorAll(".content-photo").forEach((picture) => {
    const img = picture.querySelector("img");
    const slotId = picture.dataset.slot;
    img.addEventListener("load", () => {
      if (picture.dataset.credit === "ia") addAiCredit(picture);
    });
    img.addEventListener("error", () => {
      const placeholder = document.createElement("div");
      placeholder.className = "img-slot img-slot-inline img-slot-missing";
      placeholder.dataset.slot = slotId;
      placeholder.style.aspectRatio = "4/3";
      placeholder.innerHTML = `<span class="img-slot-label">${slotId} — pendiente</span>`;
      picture.replaceWith(placeholder);
    });
  });
}

const IMG_SLOT_WIDTHS = [2560, 1920, 1280, 640];

// Prueba cada ancho generado, del más grande al más chico (un original
// más chico que 2560 simplemente no tiene esa variante — optimize_images.py
// nunca amplía — así que probar una sola ruta fija era frágil).
function probeImageSlot(slot, widths) {
  if (widths.length === 0) {
    slot.classList.add("img-slot-missing");
    slot.innerHTML = `<span class="img-slot-label">${slot.dataset.slot} — pendiente</span>`;
    return;
  }
  const [width, ...rest] = widths;
  const url = `assets/img/${slot.dataset.slot}-${width}.jpg`;
  const probe = new Image();
  probe.onload = () => {
    slot.style.backgroundImage = `url("${url}")`;
    slot.classList.remove("img-slot-missing");
    if (slot.dataset.credit === "ia") addAiCredit(slot);
  };
  probe.onerror = () => probeImageSlot(slot, rest);
  probe.src = url;
}

function addAiCredit(slot) {
  if (slot.querySelector(".ai-credit")) return;
  const credit = document.createElement("span");
  credit.className = "ai-credit";
  credit.textContent = "Imagen ilustrativa generada con IA";
  slot.appendChild(credit);
}

function initImageSlots() {
  document.querySelectorAll(".img-slot").forEach((slot) => probeImageSlot(slot, IMG_SLOT_WIDTHS));
}

function renderFooter(meta) {
  const items = meta.sources
    .map(
      (s) => `
      <div class="source-item">
        <strong>${s.dataset}</strong>: ${s.source_name} —
        <a href="${s.source_url}" target="_blank" rel="noopener">fuente</a>
        (${s.license}${s.attribution_required ? ", atribución requerida" : ""})
      </div>`
    )
    .join("");

  const cob = meta.cobertura_join;
  document.getElementById("footer-content").innerHTML = `
    <p>${meta.nota_metodologica}</p>
    <p>Años disponibles: ${meta.anio_min}–${meta.anio_max}. ${meta.total_municipios} municipios.
       Datos generados ${new Date(meta.fecha_generacion_utc).toLocaleDateString("es-CO")}
       vía colombia-open v${meta.colombia_open_version}.</p>
    <p class="cobertura-join">Cobertura del cruce de datos: ${cob.geometrias_sin_municipio.length}
       geometría(s) sin municipio oficial, ${cob.municipios_sin_geometria.length}
       municipio(s) sin geometría publicada, ${cob.municipio_anio_sin_poblacion}
       pares municipio-año sin población (excluidos).</p>
    ${items}
    <p>Mapa hecho con <a href="https://maplibre.org/" target="_blank" rel="noopener">MapLibre GL JS</a>.</p>
  `;
}

let _mapFeaturesPromise = null;

// MapLibre (~1MB) + los datos del mapa (~2.9MB) cargan solo cuando el
// visitante se acerca a la sección del mapa, nunca en la carga
// inicial de la página (ver loadMapLibreAssets en map-common.js).
function initMapFeatures(meta, story) {
  if (_mapFeaturesPromise) return _mapFeaturesPromise;
  // loadMapData() usa el global `topojson`, así que debe esperar a que
  // loadMapLibreAssets() termine de inyectar ese script primero.
  _mapFeaturesPromise = loadMapLibreAssets()
    .then(() => loadMapData())
    .then(({ geojson, porMunicipio }) => {
      const anioFoco = meta.anio_max;

      renderGeoContrast(story, porMunicipio, geojson, anioFoco);

      const scrolly = initScrollyMap(document.getElementById("scrolly-map"), {
        geojson,
        porMunicipio,
        anioFoco,
        breaks: meta.breaks_tasa,
      });

      renderTopNList(document.getElementById("topn-list"), scrolly.topN, anioFoco);
      document.getElementById("extremos-text").textContent =
        `${scrolly.topN[0].nombre_mpio}, ${scrolly.topN[0].nombre_dpto}: ${scrolly.topN[0].tasa} ` +
        `muertes por 100.000 hab. en ${anioFoco} — la tasa más alta del país. Son pueblos pequeños, lejos de los titulares.`;

      initScrolly(document.querySelector("[data-scrolly]"), (step) => scrolly.goToStep(step));

      initExplorerMap(
        {
          mapEl: document.getElementById("explorer-map"),
          cardEl: document.getElementById("mpio-card"),
          legendEl: document.getElementById("legend"),
          searchInput: document.getElementById("search-input"),
          searchResults: document.getElementById("search-results"),
          slider: document.getElementById("year-slider"),
          yearLabel: document.getElementById("year-label"),
          playBtn: document.getElementById("year-play"),
        },
        {
          geojson,
          porMunicipio,
          meta,
          sources: Object.fromEntries(meta.sources.map((s) => [s.dataset, s])),
        }
      );

      document.getElementById("year-prev").addEventListener("click", () => {
        const slider = document.getElementById("year-slider");
        slider.value = String(Math.max(0, Number(slider.value) - 1));
        slider.dispatchEvent(new Event("input"));
      });
      document.getElementById("year-next").addEventListener("click", () => {
        const slider = document.getElementById("year-slider");
        slider.value = String(Math.min(Number(slider.max), Number(slider.value) + 1));
        slider.dispatchEvent(new Event("input"));
      });
    }
  );
  return _mapFeaturesPromise.catch((err) => console.error(err));
}

function initMapTrigger(meta, story) {
  // El hero ocupa 100svh exacto, así que el sentinel queda justo en el
  // borde del viewport inicial — un IntersectionObserver (incluso sin
  // margen) puede dispararse ahí por redondeo de subpíxel, cargando
  // los ~4MB de mapa/MapLibre antes de que el visitante haga nada.
  // El primer scroll real es la señal correcta de "se acerca al mapa".
  let fired = false;
  function trigger() {
    if (fired) return;
    fired = true;
    window.removeEventListener("scroll", trigger);
    initMapFeatures(meta, story);
  }
  window.addEventListener("scroll", trigger, { passive: true });
  // Nunca quedarse esperando para siempre: si alguien usa flechas de
  // teclado, Buscar en página, etc. sin disparar scroll, igual carga.
  setTimeout(trigger, 8000);
}

(async function main() {
  initImageSlots();
  initContentPhotos();
  initRevealObserver();

  const [meta, story] = await Promise.all([
    fetch("data/meta.json").then((r) => r.json()),
    fetch("data/story.json").then((r) => r.json()),
  ]);

  renderHero(story);
  renderTrend(story);
  renderFooter(meta);

  initMapTrigger(meta, story);
})().catch((err) => {
  console.error(err);
});
