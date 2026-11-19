"""Genera las variantes responsive (JPG/WebP, AVIF si está disponible)
de cada imagen en site/assets/img/originals/ a partir de un único
archivo fuente por slot. Ver .claude/skills/editorial-art-direction/SKILL.md.

No falla si faltan originales: cada slot sin archivo fuente se omite
(el frontend ya muestra un placeholder para esos casos) y el script
sigue con los demás. Corre manualmente cuando se agregan fotos nuevas,
no es parte del cron de datos.

Uso:
    python scripts/optimize_images.py
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ORIGINALS_DIR = ROOT / "site" / "assets" / "img" / "originals"
OUT_DIR = ROOT / "site" / "assets" / "img"
WIDTHS = [640, 1280, 1920, 2560]
JPEG_QUALITY = 82
WEBP_QUALITY = 80
AVIF_QUALITY = 55

try:
    import pillow_avif  # noqa: F401  (registra el plugin AVIF en Pillow)

    AVIF_AVAILABLE = True
except ImportError:
    AVIF_AVAILABLE = False


def variants_for(path: Path) -> list[int]:
    slot = path.stem
    generated_widths: list[int] = []
    with Image.open(path) as img:
        img = img.convert("RGB")
        original_width = img.width
        for width in WIDTHS:
            if width > original_width:
                # Nunca ampliar más allá de la resolución real.
                continue
            height = round(img.height * (width / original_width))
            resized = img.resize((width, height), Image.LANCZOS)

            resized.save(
                OUT_DIR / f"{slot}-{width}.jpg", "JPEG", quality=JPEG_QUALITY, optimize=True
            )
            resized.save(OUT_DIR / f"{slot}-{width}.webp", "WEBP", quality=WEBP_QUALITY)
            if AVIF_AVAILABLE:
                resized.save(OUT_DIR / f"{slot}-{width}.avif", "AVIF", quality=AVIF_QUALITY)
            generated_widths.append(width)
    print(f"{slot}: generado hasta {min(original_width, max(WIDTHS))}px de ancho")
    return generated_widths


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    if not ORIGINALS_DIR.exists():
        print(f"No existe {ORIGINALS_DIR} todavía — nada que optimizar.")
        return

    originales = sorted(
        p
        for p in ORIGINALS_DIR.iterdir()
        if p.suffix.lower() in (".png", ".jpg", ".jpeg")
    )
    if not originales:
        print(f"{ORIGINALS_DIR} está vacío — nada que optimizar todavía.")
        return

    if not AVIF_AVAILABLE:
        print(
            "pillow-avif-plugin no está instalado: se generan solo JPG y WebP "
            "(`pip install pillow-avif-plugin` para AVIF también)."
        )

    # Manifest de anchos realmente generados por slot (nunca se amplía
    # más allá del original): app.js lo usa para pedir directamente un
    # ancho que existe, en vez de probar 2560/1920/1280/640 de mayor a
    # menor y producir 404 reales en los slots con original < 1920px.
    manifest: dict[str, list[int]] = {}
    for path in originales:
        widths = variants_for(path)
        if widths:
            manifest[path.stem] = sorted(widths, reverse=True)

    (OUT_DIR / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"manifest.json: {len(manifest)} slot(s)")


if __name__ == "__main__":
    main()
