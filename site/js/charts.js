// Gráficas de barras en HTML/CSS plano (sin librería). Un solo hue por
// gráfica (una sola serie = sin leyenda), etiquetas directas solo en las
// barras que importan a la historia, eje base en hairline.
function fmtEs(n, opts) {
  return new Intl.NumberFormat("es-CO", opts).format(n);
}

function renderBarChart(container, { items, highlightIndexes, formatValue, ariaLabel }) {
  const max = Math.max(...items.map((d) => d.value));
  const cols = items
    .map((item, i) => {
      const pct = max > 0 ? (item.value / max) * 100 : 0;
      const highlighted = highlightIndexes.includes(i);
      const valueLabel = highlighted
        ? `<span class="bar-value">${formatValue(item.value)}</span>`
        : "";
      return `
        <div class="bar-col" title="${item.label}: ${formatValue(item.value)}">
          ${valueLabel}
          <div class="bar ${highlighted ? "bar-highlight" : ""}" style="height:${pct}%"></div>
          <div class="bar-label">${item.shortLabel || item.label}</div>
        </div>`;
    })
    .join("");

  container.innerHTML = `
    <div class="bar-chart" role="img" aria-label="${ariaLabel}">
      <div class="bar-chart-bars">${cols}</div>
    </div>`;
}
