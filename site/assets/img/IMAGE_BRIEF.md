# Brief de imágenes — Atlas de siniestralidad vial

Cada fila es un slot. Pon el archivo original en `originals/<archivo>`
(cualquier resolución igual o mayor a la columna "tamaño mínimo") y
corre `python scripts/optimize_images.py` — genera las variantes
responsive automáticamente. Un slot sin archivo muestra un placeholder
elegante (degradado de la paleta) y la página se ve terminada igual.

Tratamiento visual uniforme en todas: desaturado/duotono vía CSS
(`filter: grayscale(0.3) sepia(0.15) saturate(0.85)` o el duotono que
se defina), para que el color narrativo lo pongan los datos, no las
fotos. Ver `.claude/skills/editorial-art-direction/SKILL.md`.

| id | archivo esperado | proporción | tamaño mínimo | qué debe mostrar | alt |
|---|---|---|---|---|---|
| `hero` | `originals/hero.jpg` | 16:9 apaisado | 2560×1440 | Una vía colombiana de noche, luces de carretera, atmósfera — nunca un accidente real ni víctimas identificables. | "Carretera colombiana de noche, vista desde el carril" |
| `hero-mobile` | `originals/hero-mobile.jpg` | 4:5 vertical | 1080×1350 | El mismo encuadre que `hero`, recortado para pantalla vertical (el centro de interés debe quedar en el tercio central). | igual que `hero` |
| `escena-ciudad` | `originals/escena-ciudad.jpg` | 4:3 | 1280×960 | Tráfico nocturno en una avenida de una ciudad grande colombiana (Bogotá/Medellín/Cali) — congestión, luces de freno. | "Tráfico en una avenida de una ciudad colombiana de noche" |
| `escena-pueblo` | `originals/escena-pueblo.jpg` | 4:3 | 1280×960 | Una carretera nacional de dos carriles atravesando un municipio pequeño — casas bajas, poca infraestructura peatonal. | "Carretera nacional atravesando un municipio pequeño de Colombia" |
| `capitulo-corredor` | `originals/capitulo-corredor.jpg` | 16:9 apaisado | 1920×1080 | Una vía nacional vista desde arriba o en perspectiva larga — sensación de distancia/recorrido. | "Vista de una carretera nacional colombiana" |
| `capitulo-memoria` | `originals/capitulo-memoria.jpg` | 16:9 apaisado | 1920×1080 | Algo que evoque el paso del tiempo en una vía: señalización gastada, un cruce con velas/flores (sin identificar personas reales), o un odómetro/reloj de carretera. | "Un cruce vial con marcas del paso del tiempo" |
| `textura-asfalto` | `originals/textura-asfalto.jpg` | cualquiera, repetible | 1280×1280 | Primer plano de asfalto — textura, no escena. Se usa a baja opacidad como fondo de la metodología. | (decorativa, sin alt — `aria-hidden` en el contenedor) |

## Imagen Open Graph

`scripts/generate_og_image.py` genera `assets/img/og-image.jpg`
(1200×630) a partir de `hero-1920.jpg` (o el placeholder si todavía no
existe) + el título de la página. Correrlo después de poner el hero
real:

```bash
python scripts/generate_og_image.py
```

## Si una imagen es generada con IA

Debe decirlo la propia página, no solo este archivo: agregar el
crédito "Imagen ilustrativa generada con IA" visible junto a esa
imagen (pie de foto u overlay discreto) antes de publicar. Nunca se
presenta como fotografía documental de un lugar, hecho o persona real
— el tema de esta pieza son víctimas reales.
