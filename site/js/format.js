// Módulo único de formato numérico (es-CO). Regla no negociable del
// proyecto: ningún número se pinta en la página sin pasar por aquí —
// en es-CO el punto es separador de miles, así que un número crudo
// como "336.1345" se lee como "336 mil" en vez de una tasa de 336,1.
const _nfConteo = new Intl.NumberFormat("es-CO");
const _nfTasa = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// Conteos absolutos (homicidios, población, puestos de ranking): separador de miles, sin decimales.
function fmtConteo(n) {
  return _nfConteo.format(n);
}

// Tasas por 100.000 hab.: 1 decimal, coma decimal ("336,1").
function fmtTasa(n) {
  return _nfTasa.format(n);
}

// Porcentajes: 1 decimal, coma decimal, símbolo "%" ("25,7%").
function fmtPct(n) {
  return `${_nfTasa.format(n)}%`;
}

// Ratios ("1,8×"): 1 decimal, símbolo de multiplicación real (no "x").
function fmtRatio(n) {
  return `${_nfTasa.format(n)}×`;
}

// Cortes de la leyenda del mapa: enteros (son quantiles sobre tasas que
// ya rondan decenas, un entero es suficiente para escanear la leyenda).
function fmtBreak(n) {
  return _nfConteo.format(Math.round(n));
}
