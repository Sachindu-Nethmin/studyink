"""Draw StudyInk's app icon (a navy notebook cover with a ruled page, a spiral, and red pen
arrows like the notes' points) as a macOS iconset.

    python3 make_icon.py OUT.iconset   →   iconutil -c icns OUT.iconset
"""
import pathlib
import sys

from PIL import Image, ImageDraw, ImageFilter

S = 1024
NAVY, NAVY_2, PAGE, RULE, MARGIN = (36, 55, 94), (26, 40, 70), (251, 247, 236), (195, 213, 234), (230, 163, 160)
INK, RED, METAL, HOLE = (34, 48, 90), (182, 58, 47), (190, 190, 196), (36, 28, 22)


def icon():
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    # the cover: a rounded square with a soft top light
    cover = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(cover)
    d.rounded_rectangle([60, 60, S - 60, S - 60], 200, fill=NAVY)
    light = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(light).ellipse([120, -200, 900, 520], fill=(255, 255, 255, 40))
    light = light.filter(ImageFilter.GaussianBlur(80))
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([60, 60, S - 60, S - 60], 200, fill=255)
    cover.alpha_composite(Image.composite(light, Image.new("RGBA", (S, S), (0, 0, 0, 0)), mask))
    im.alpha_composite(cover)

    # the page, slightly tilted, with its shadow
    page = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    p = ImageDraw.Draw(page)
    x0, y0, x1, y1 = 250, 190, 840, 850
    p.rounded_rectangle([x0, y0, x1, y1], 26, fill=PAGE)
    for y in range(y0 + 150, y1 - 40, 74):
        p.line([(x0 + 10, y), (x1 - 10, y)], fill=RULE, width=6)
    p.line([(x0 + 110, y0 + 10), (x0 + 110, y1 - 10)], fill=MARGIN, width=7)
    # three points: a red pen arrow, then an ink line
    for i, (y, w) in enumerate([(y0 + 214, 0.78), (y0 + 362, 0.62), (y0 + 510, 0.7)]):
        ax = x0 + 150
        p.line([(ax, y), (ax + 70, y - 2)], fill=RED, width=16)
        p.line([(ax + 44, y - 26), (ax + 74, y - 2), (ax + 44, y + 22)], fill=RED, width=16, joint="curve")
        lx = ax + 110
        p.rounded_rectangle([lx, y - 13, lx + (x1 - lx - 60) * w, y + 13], 13, fill=INK)
        if i == 1:
            p.rounded_rectangle([lx + 30, y + 61, lx + 30 + (x1 - lx - 120) * 0.55, y + 81], 10, fill=(120, 132, 170))
    shadow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle([x0 + 18, y0 + 26, x1 + 18, y1 + 26], 26, fill=(0, 0, 0, 120))
    shadow = shadow.filter(ImageFilter.GaussianBlur(22))
    page = Image.alpha_composite(shadow, page).rotate(-3, resample=Image.BICUBIC, center=(S / 2, S / 2))
    im.alpha_composite(page)

    # the spiral binding down the left edge of the page
    d = ImageDraw.Draw(im)
    for y in range(250, 820, 70):
        d.ellipse([268, y - 12, 292, y + 12], fill=HOLE)
        d.arc([196, y - 34, 296, y + 26], 160, 350, fill=(70, 70, 76), width=16)
        d.arc([192, y - 38, 292, y + 22], 160, 350, fill=METAL, width=12)
    return im


def main(out):
    out = pathlib.Path(out)
    out.mkdir(parents=True, exist_ok=True)
    big = icon()
    for size in (16, 32, 128, 256, 512):
        big.resize((size, size), Image.LANCZOS).save(out / f"icon_{size}x{size}.png")
        big.resize((size * 2, size * 2), Image.LANCZOS).save(out / f"icon_{size}x{size}@2x.png")


if __name__ == "__main__":
    main(sys.argv[1])
