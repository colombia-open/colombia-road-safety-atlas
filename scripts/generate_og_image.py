"""Genera site/assets/img/og-image.jpg (1200x630) a partir del hero +
el título de la página. Si el hero todavía no existe, usa un
degradado placeholder (la página sigue "viéndose terminada" al
compartirse, ver editorial-art-direction skill).

Uso:
    python scripts/generate_og_image.py
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
IMG_DIR = ROOT / "site" / "assets" / "img"
OUT_PATH = IMG_DIR / "og-image.jpg"
W, H = 1200, 630
TITLE = "Atlas de siniestralidad vial de Colombia"
ASPHALT = (21, 24, 28)
DATA_BLUE = (37, 106, 191)
LINE = (243, 239, 230)

FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",  # ubuntu-latest (CI)
    "C:/Windows/Fonts/arialbd.ttf",  # Windows dev
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",  # macOS dev
]


def load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for candidate in FONT_CANDIDATES:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default(size=size)


def base_image() -> Image.Image:
    for width in (2560, 1920, 1280):
        hero_path = IMG_DIR / f"hero-{width}.jpg"
        if hero_path.exists():
            with Image.open(hero_path) as img:
                img = img.convert("RGB")
                ratio = max(W / img.width, H / img.height)
                resized = img.resize((round(img.width * ratio), round(img.height * ratio)))
                left = (resized.width - W) // 2
                top = (resized.height - H) // 2
                return resized.crop((left, top, left + W, top + H))
    # Sin hero todavía: placeholder con degradado de la paleta.
    placeholder = Image.new("RGB", (W, H), ASPHALT)
    for x in range(W):
        t = x / W
        r = round(ASPHALT[0] + (DATA_BLUE[0] - ASPHALT[0]) * t)
        g = round(ASPHALT[1] + (DATA_BLUE[1] - ASPHALT[1]) * t)
        b = round(ASPHALT[2] + (DATA_BLUE[2] - ASPHALT[2]) * t)
        for y in range(H):
            placeholder.putpixel((x, y), (r, g, b))
    return placeholder


def main() -> None:
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    img = base_image().convert("RGBA")

    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    draw.rectangle([0, H - 260, W, H], fill=(*ASPHALT, 210))
    img = Image.alpha_composite(img, overlay).convert("RGB")

    draw = ImageDraw.Draw(img)
    title_font = load_font(56)
    sub_font = load_font(26)

    # Envolver el título a mano en hasta 2 líneas (sin libs de layout).
    words = TITLE.split(" ")
    lines: list[str] = []
    current = ""
    for word in words:
        trial = (current + " " + word).strip()
        if draw.textlength(trial, font=title_font) > W - 140:
            lines.append(current)
            current = word
        else:
            current = trial
    if current:
        lines.append(current)

    y = H - 220
    for line in lines:
        draw.text((70, y), line, font=title_font, fill=LINE)
        y += 66

    draw.text(
        (70, y + 10),
        "Homicidios en siniestros de tránsito, por municipio y año",
        font=sub_font,
        fill=(154, 163, 171),
    )

    img.save(OUT_PATH, "JPEG", quality=85)
    print(f"escrito {OUT_PATH} ({W}x{H})")


if __name__ == "__main__":
    main()
