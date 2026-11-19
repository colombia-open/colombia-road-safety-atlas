---
name: editorial-art-direction
description: Usar al escribir CSS/tipografía del sitio o al definir/consumir slots de imagen — tipografía editorial, sistema de slots con placeholder elegante, <picture> responsive, tratamiento visual uniforme de fotos, créditos de imagen generada con IA y presupuestos de peso.
---

# editorial-art-direction

## Identidad visual: respetar, no inventar

Si existe un diseño de referencia del usuario (paleta, tipografía,
tono), **ese diseño manda** — esta skill define cómo ejecutarlo bien
técnicamente, no qué colores o fuentes usar. Si no hay ningún diseño de
referencia todavía, decirlo explícitamente antes de inventar una
identidad visual nueva; no asumir "estilo periodístico genérico" como
sustituto silencioso de una dirección de arte real.

Si algo del diseño de referencia choca con legibilidad o accesibilidad
(contraste insuficiente, texto sobre foto sin protección, tamaño de
letra bajo 16px en cuerpo), decirlo en vez de ignorarlo — nunca
sacrificar legibilidad en silencio para calzar con la referencia.

## Tipografía

- Display grande para titulares y cifras protagonistas: escala fluida
  con `clamp()`, nunca un tamaño fijo en píxeles para un titular que
  debe funcionar de 360px a 2560px de ancho.
- Cuerpo de lectura: 18–20px, `line-height` 1.5–1.6, máximo ~65
  caracteres por línea.
- Mono (`ui-monospace` o similar) reservado para datos: cifras en
  tablas/fichas donde deben alinear verticalmente, códigos DIVIPOLA,
  coordenadas. Nunca mono para prosa.

```css
.hero-figure { font-size: clamp(3rem, 12vw, 8rem); }
.data-mono { font-variant-numeric: tabular-nums; font-family: ui-monospace, "SF Mono", Consolas, monospace; }
```

## Fotografía: atmósfera, no decoración

- Hero y cortes de capítulo: a sangre (`width: 100vw` o contenedor sin
  márgenes), ocupan el ancho completo del viewport.
- Imágenes inline: grid editorial (no una sola columna centrada de
  imágenes sueltas) — pensar en composición de página, no en adjuntos.
- Tratamiento uniforme vía CSS para que el color narrativo lo pongan
  los datos (el mapa, los gráficos), no las fotos:

```css
.editorial-photo {
  filter: grayscale(0.3) sepia(0.15) saturate(0.85);
  /* o duotono real con la paleta del proyecto: */
  /* filter: grayscale(1) brightness(1.1); mix-blend-mode aplicado sobre un overlay de --accent-dark */
}
```

Elegir grayscale+sepia (desaturado) o duotono real según lo que pida el
diseño de referencia — ambos están aquí como opciones, no los dos a la
vez.

## Sistema de slots

Cada imagen del sitio es un slot con contrato fijo, definido en
`site/assets/img/IMAGE_BRIEF.md`:

| Campo | Ejemplo |
|---|---|
| id | `escena-ciudad` |
| archivo esperado | `escena-ciudad.jpg` (en `originals/`) |
| proporción | `16:9` |
| alt | descripción real de qué debe mostrar, para accesibilidad y para que quien tome la foto sepa qué encargar |
| crédito | nombre del fotógrafo/fuente, o "Imagen ilustrativa generada con IA" |

Si el archivo original no existe todavía, el slot **nunca rompe la
página**: muestra un placeholder con degradado de la paleta del
proyecto + etiqueta del slot (el id, visible, para que quede claro qué
falta) — la página se ve terminada aunque falten fotos reales.

```css
.img-slot[data-missing] {
  background: linear-gradient(135deg, var(--accent), var(--accent-dark));
  display: flex; align-items: center; justify-content: center;
  color: white; font-size: 0.8rem; opacity: 0.85;
}
```

```html
<div class="img-slot" data-slot="escena-ciudad" data-missing style="aspect-ratio: 16/9">
  escena-ciudad — pendiente
</div>
```

## `<picture>` responsive, cero CLS

```html
<picture>
  <source type="image/avif" srcset="img/hero-640.avif 640w, img/hero-1280.avif 1280w, img/hero-1920.avif 1920w, img/hero-2560.avif 2560w">
  <source type="image/webp" srcset="img/hero-640.webp 640w, img/hero-1280.webp 1280w, img/hero-1920.webp 1920w, img/hero-2560.webp 2560w">
  <img src="img/hero-1280.jpg" srcset="img/hero-640.jpg 640w, img/hero-1280.jpg 1280w, img/hero-1920.jpg 1920w, img/hero-2560.jpg 2560w"
       sizes="100vw" width="2560" height="1440" alt="…" loading="eager">
</picture>
```

- `width`/`height` siempre presentes (las dimensiones reales de la
  imagen más grande) — sin esto el navegador no puede reservar el
  espacio y hay salto de layout (CLS) al cargar.
- `loading="lazy"` en toda imagen excepto el hero (`loading="eager"`,
  es lo primero que se ve).
- AVIF si `pillow-avif-plugin` está disponible al generar; si no, el
  build sigue funcionando solo con WebP+JPG (ver
  `scripts/optimize_images.py`), nunca falla por falta de ese plugin.

## Créditos de imagen generada con IA

Toda imagen generada con IA lleva un crédito visible en la propia
página (no solo en un metadato oculto): **"Imagen ilustrativa generada
con IA"**, cerca de la imagen (pie de foto o overlay discreto). Nunca
se presenta como fotografía documental de un lugar, evento o persona
real — esto es especialmente delicado en una pieza sobre víctimas
reales de siniestros de tránsito.

## Presupuestos de peso

- Hero: ≤ 300 KB (la variante que realmente se descarga en el ancho de
  pantalla del visitante, no el original).
- Carga inicial de la página (HTML + CSS + JS + imágenes above-the-fold),
  sin contar los datos del mapa: ≤ 1,5 MB.
- Los datos del mapa (`tasas.geojson` y afines) cargan diferidos
  (después del primer render, o solo cuando la sección del mapa entra
  en viewport) — nunca bloquean la carga inicial de la página.
- Verificar con las pestañas Network reales en la Fase 4, no estimar.
