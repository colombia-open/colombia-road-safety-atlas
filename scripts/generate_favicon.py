"""Genera el favicon del atlas: un pin de mapa ambar sobre fondo asfalto.

Reutiliza la paleta del sitio ("la carretera de noche") para que el icono
de la pestaña combine con el resto de la identidad visual.

Uso:
    python scripts/generate_favicon.py

Escribe en site/assets/:
    favicon.svg            (vector, usado por navegadores modernos)
    favicon-16.png
    favicon-32.png
    favicon.ico            (16+32+48, fallback universal)
    apple-touch-icon.png    (180x180, fondo solido para iOS)
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

BG = (21, 24, 28, 255)  # --bg-0
AMBER = (243, 165, 61, 255)  # --amber-500
SUPERSAMPLE = 8  # se renderiza grande y se reduce, para bordes limpios


def _draw_pin(size: int) -> Image.Image:
    """Dibuja el pin (circulo + cola) centrado en un lienzo cuadrado `size`."""
    hi_res = size * SUPERSAMPLE
    img = Image.new("RGBA", (hi_res, hi_res), BG)
    draw = ImageDraw.Draw(img)

    # fondo: cuadrado con esquinas redondeadas
    corner = hi_res * 0.22
    draw.rounded_rectangle([0, 0, hi_res - 1, hi_res - 1], radius=corner, fill=BG)

    cx = hi_res / 2
    cy_top = hi_res * 0.38
    r = hi_res * 0.24

    # cola del pin (triangulo apuntando hacia abajo, se funde con el circulo)
    tail = [
        (cx - r * 0.85, cy_top + r * 0.55),
        (cx + r * 0.85, cy_top + r * 0.55),
        (cx, hi_res * 0.82),
    ]
    draw.polygon(tail, fill=AMBER)

    # cabeza del pin
    draw.ellipse([cx - r, cy_top - r, cx + r, cy_top + r], fill=AMBER)

    # agujero del pin (vuelve al color de fondo)
    hole_r = r * 0.42
    draw.ellipse(
        [cx - hole_r, cy_top - hole_r, cx + hole_r, cy_top + hole_r], fill=BG
    )

    return img.resize((size, size), Image.LANCZOS)


SVG_TEMPLATE = """\
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#15181c" />
  <path d="M32 12a10 10 0 0 0-10 10c0 7.5 10 20 10 20s10-12.5 10-20a10 10 0 0 0-10-10Z" fill="#f3a53d" />
  <circle cx="32" cy="22" r="4.2" fill="#15181c" />
</svg>
"""


def main() -> None:
    out_dir = Path(__file__).resolve().parent.parent / "site" / "assets"
    out_dir.mkdir(parents=True, exist_ok=True)

    (out_dir / "favicon.svg").write_text(SVG_TEMPLATE, encoding="utf-8")

    png_16 = _draw_pin(16)
    png_32 = _draw_pin(32)
    png_48 = _draw_pin(48)
    png_180 = _draw_pin(180)

    png_16.save(out_dir / "favicon-16.png")
    png_32.save(out_dir / "favicon-32.png")
    png_180.save(out_dir / "apple-touch-icon.png")

    png_16.save(
        out_dir / "favicon.ico",
        sizes=[(16, 16), (32, 32), (48, 48)],
        append_images=[png_32, png_48],
    )

    print(f"Favicon generado en {out_dir}")


if __name__ == "__main__":
    main()
