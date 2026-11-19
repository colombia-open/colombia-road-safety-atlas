---
name: data-scrollytelling
description: Usar al construir o modificar cualquier sección del sitio donde el scroll controla una visualización (gráfica fija + pasos de texto) — estructura, accesibilidad, móvil y reglas de animación. No aplica al explorador de mapa final (ver choropleth-atlas) salvo por las reglas de movimiento/accesibilidad, que sí son comunes.
---

# data-scrollytelling

## Patrón: gráfica fija (sticky) + pasos de texto

Sin framework, sin build step. Dos columnas en desktop:

```html
<section class="scrolly" data-scrolly>
  <div class="scrolly-sticky">
    <div id="viz-escena-1"><!-- la visualización, un solo nodo persistente --></div>
  </div>
  <div class="scrolly-steps">
    <div class="step" data-step="0">texto del paso 1</div>
    <div class="step" data-step="1">texto del paso 2</div>
    <!-- ... -->
  </div>
</section>
```

```css
.scrolly { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; }
.scrolly-sticky { position: sticky; top: 10svh; height: 80svh; }
```

La visualización es **un solo elemento que persiste** entre pasos y
cambia de estado (color, zoom, capa visible) — nunca se recrea ni se
destruye al cambiar de paso. Cada paso cambia exactamente UNA cosa en
la visualización, y el texto de ese paso explica exactamente ese
cambio, nada más. Si un paso necesita explicar dos cambios, son dos
pasos.

## Detección de paso activo: IntersectionObserver, no Scrollama

Vanilla JS, sin librería nueva. Un observer por grupo de pasos, umbral
amplio para decidir "este paso es el activo" cerca del centro de la
pantalla:

```js
function initScrolly(sectionEl, onStepChange) {
  const steps = [...sectionEl.querySelectorAll(".step")];
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          onStepChange(Number(entry.target.dataset.step));
        }
      }
    },
    { rootMargin: "-45% 0px -45% 0px" } // franja angosta en el centro
  );
  steps.forEach((s) => observer.observe(s));
}
```

`rootMargin` negativo arriba y abajo crea una franja delgada en el
centro del viewport: el paso que la cruza es "el activo". Ajustar el
porcentaje si los pasos son muy cortos o muy largos, nunca con scroll
listeners + cálculos de posición a mano.

## Cero scroll-jacking

El scroll nativo del navegador nunca se intercepta ni se redirige. No
`preventDefault()` en wheel/touchmove, no scroll-to animado al cambiar
de paso, no "snap" forzado entre secciones. El usuario siempre controla
la velocidad y dirección del scroll con su gesto normal.

## Móvil primero: la visualización sigue visible

En móvil la gráfica fija **nunca se oculta**. Patrón: la visualización
queda pegada arriba (`position: sticky; top: 0`) ocupando ~55svh, y los
pasos de texto pasan por encima en tarjetas con fondo semitransparente
(para que siga siendo legible la visualización detrás):

```css
@media (max-width: 760px) {
  .scrolly { grid-template-columns: 1fr; }
  .scrolly-sticky { position: sticky; top: 0; height: 55svh; z-index: 1; }
  .scrolly-steps { margin-top: -20svh; position: relative; z-index: 2; }
  .step {
    background: color-mix(in srgb, var(--bg) 88%, transparent);
    backdrop-filter: blur(4px);
    border-radius: 12px;
    padding: 1.25rem;
    margin-bottom: 70svh; /* espacio para que el siguiente paso cruce el centro */
  }
  .step:last-child { margin-bottom: 20svh; }
}
```

Usar siempre `svh`/`dvh`, nunca `vh` a secas — `vh` no descuenta la
barra de direcciones móvil y produce saltos de layout al hacer scroll.

## Animación

- Solo `transform` y `opacity` (nunca `width`, `height`, `top/left`,
  `background-position` — fuerzan reflow/repaint).
- Transiciones de datos (recolorear, mover un punto, cambiar una
  barra): 400–800 ms, `ease` o `ease-in-out`.
- `prefers-reduced-motion: reduce` → **sin transición**, salto directo
  al estado final. No es "animación más corta", es cero animación:

```css
@media (prefers-reduced-motion: reduce) {
  * { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
}
```

## Accesibilidad y contenido

- Todo el texto de los pasos vive en el DOM desde el primer render
  (nunca inyectado solo al hacerse visible) — un lector de pantalla o
  `Ctrl+F` debe encontrarlo sin scrollear.
- Navegable con teclado: los pasos son contenido normal de la página
  (no `div` con `tabindex` artificial), el foco nunca se atrapa dentro
  de la sección scrollytelling.
- Indicador de progreso visible (barra o puntos) que refleja el paso
  activo — ayuda a orientarse en una narrativa larga, especialmente en
  móvil donde no se ve el final de la sección.
- Si `IntersectionObserver` no existe (no debería pasar en navegadores
  modernos, pero por si acaso): mostrar todos los pasos en su estado
  final sin animación, nunca dejar la página en blanco.

## Estructura narrativa de la pieza completa

Contexto → tensión → evidencia → giro → cierre/acción. Cada escena del
guion (ver Fase 2 del proyecto) debe poder nombrarse con uno de estos
papeles — si una escena no encaja en ninguno, probablemente sobra o hay
que fusionarla con la vecina.
