// Gráficas de barras en HTML/CSS plano (sin librería). Un solo hue por
// gráfica (una sola serie = sin leyenda), etiquetas directas solo en las
// barras que importan a la historia (o en todas, con labelAll), eje
// base en hairline. Formato numérico: ver site/js/format.js.
//
// La barra vive dentro de .bar-track, un contenedor de alto FIJO en px
// (ver styles.css), no dentro de la misma columna flex que las
// etiquetas: si el % de altura de .bar se resuelve contra una columna
// flex cuyos otros hijos (etiqueta de valor, etiqueta de eje) tienen
// min-height:auto, flexbox los trata como no-encogibles y descarga TODA
// la compresión sobre .bar — el resultado converge al mismo alto para
// cualquier barra que desborde el contenedor, sin importar su valor
// real (medido: 10,1 y 14,6 renderizaban igual). Separar la barra en su
// propio contenedor de alto fijo elimina ese acople.
function renderBarChart(container, { items, highlightIndexes, labelAll, formatValue, ariaLabel }) {
  const max = Math.max(...items.map((d) => d.value));
  const cols = items
    .map((item, i) => {
      const pct = max > 0 ? (item.value / max) * 100 : 0;
      const highlighted = highlightIndexes.includes(i);
      const showLabel = highlighted || labelAll;
      const valueLabel = showLabel
        ? `<span class="bar-value ${highlighted ? "" : "bar-value-dim"}">${formatValue(item.value)}</span>`
        : "";
      const tooltip = item.tooltipExtra
        ? `${item.label}: ${formatValue(item.value)} · ${item.tooltipExtra}`
        : `${item.label}: ${formatValue(item.value)}`;
      return `
        <div class="bar-col" title="${tooltip}">
          ${valueLabel}
          <div class="bar-track">
            <div class="bar ${highlighted ? "bar-highlight" : ""}" style="height:${pct}%"></div>
          </div>
          <div class="bar-label">${item.shortLabel || item.label}</div>
        </div>`;
    })
    .join("");

  container.innerHTML = `
    <div class="bar-chart" role="img" aria-label="${ariaLabel}">
      <div class="bar-chart-bars">${cols}</div>
    </div>`;
}
