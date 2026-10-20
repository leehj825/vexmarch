#!/usr/bin/env python3
"""Draws Vexmarch's icon in code (a banner planted on a node where three roads meet) and writes every image the web page,
the Android app and the Play Store listing need (needs Pillow):
  icons/icon-1024.png, icon-512.png, icon-192.png       web / Play Store icon (full square)
  icons/feature-1024x500.png                            Play Store feature graphic
  resources/android/res/...                             launcher icons (legacy, round, adaptive foreground) and splash screens;
                                                        tools/android_patch.js copies them into android/
Run: python3 tools/make_icons.py"""
import math
import pathlib
from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
BG_TOP, BG_BOT = (26, 18, 36), (6, 5, 10)
GOLD = (242, 210, 122)
RED = (224, 72, 58)
BLUE = (90, 160, 216)
GREEN = (143, 191, 74)
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf'


def gradient(w, h, top, bot):
    img = Image.new('RGB', (w, h)); px = img.load()
    for y in range(h):
        for x in range(w):
            t = min(1, math.hypot((x - w / 2) / (w / 2), (y - h * 0.62) / (h / 2)) / 1.25)
            px[x, y] = tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3))
    return img


def emblem(n):
    """Three nodes joined by roads, and a banner on a pole in the middle one (drawn 4x larger, then shrunk)."""
    S = n * 4
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    c = (S * 0.5, S * 0.70)
    a, b = (S * 0.17, S * 0.84), (S * 0.85, S * 0.86)
    d.line((a, c, b), fill=(238, 230, 214, 110), width=int(S * 0.03), joint='curve')
    top = (S * 0.5, S * 0.46)
    for p, col, r in ((a, BLUE, 0.075), (b, GREEN, 0.075)):
        d.ellipse((p[0] - S * r, p[1] - S * r, p[0] + S * r, p[1] + S * r), fill=col + (255,), outline=(10, 8, 12, 255), width=int(S * 0.012))
    d.ellipse((c[0] - S * 0.12, c[1] - S * 0.12, c[0] + S * 0.12, c[1] + S * 0.12), fill=RED + (255,), outline=(10, 8, 12, 255), width=int(S * 0.016))
    d.ellipse((c[0] - S * 0.16, c[1] - S * 0.16, c[0] + S * 0.16, c[1] + S * 0.16), outline=GOLD + (255,), width=int(S * 0.014))
    # the banner
    px = S * 0.5
    d.line((px, c[1], px, S * 0.12), fill=(60, 44, 30, 255), width=int(S * 0.024))
    d.ellipse((px - S * 0.025, S * 0.095, px + S * 0.025, S * 0.145), fill=GOLD + (255,))
    flag = [(px, S * 0.17), (px + S * 0.34, S * 0.19), (px + S * 0.27, S * 0.285), (px + S * 0.34, S * 0.38), (px, S * 0.36)]
    d.polygon(flag, fill=RED + (255,), outline=GOLD + (255,))
    d.line(flag + [flag[0]], fill=GOLD + (255,), width=int(S * 0.014))
    d.line((px + S * 0.04, S * 0.21, px + S * 0.2, S * 0.215), fill=GOLD + (255,), width=int(S * 0.012))
    d.line((px + S * 0.04, S * 0.33, px + S * 0.2, S * 0.325), fill=GOLD + (255,), width=int(S * 0.012))
    return im.resize((n, n), Image.LANCZOS)


def icon(n, round_mask=False):
    bg = gradient(n, n, BG_TOP, BG_BOT).convert('RGBA')
    e = emblem(int(n * 0.92)); bg.alpha_composite(e, ((n - e.width) // 2, int(n * 0.03)))
    if round_mask:
        mk = Image.new('L', (n * 4, n * 4), 0); ImageDraw.Draw(mk).ellipse((0, 0, n * 4 - 1, n * 4 - 1), fill=255)
        bg.putalpha(mk.resize((n, n), Image.LANCZOS))
    return bg


def foreground(n):
    """Adaptive-icon foreground: the emblem inside the central 66% safe zone, transparent around it."""
    im = Image.new('RGBA', (n, n), (0, 0, 0, 0)); e = emblem(int(n * 0.62))
    im.alpha_composite(e, ((n - e.width) // 2, (n - e.height) // 2)); return im


def word(img, text, cx, y, size):
    d = ImageDraw.Draw(img); f = ImageFont.truetype(FONT, size)
    sp = int(size * 0.28); widths = [d.textlength(c, font=f) for c in text]; total = sum(widths) + sp * (len(text) - 1)
    x = cx - total / 2
    for c, cw in zip(text, widths):
        d.text((x + size * 0.03, y + size * 0.05), c, font=f, fill=(0, 0, 0, 200)); d.text((x, y), c, font=f, fill=GOLD + (255,)); x += cw + sp


def splash(w, h):
    bg = gradient(w, h, BG_TOP, BG_BOT).convert('RGBA')
    s = int(min(w, h) * 0.42); e = emblem(s)
    y = int(h * 0.5 - s * 0.62)
    bg.alpha_composite(e, ((w - s) // 2, y))
    word(bg, 'VEXMARCH', w // 2, y + s + int(s * 0.04), int(s * 0.16))
    return bg.convert('RGB')


def main():
    ic = ROOT / 'icons'; ic.mkdir(exist_ok=True)
    big = icon(1024); big.save(ic / 'icon-1024.png')
    for n in (512, 192): big.resize((n, n), Image.LANCZOS).save(ic / f'icon-{n}.png')
    fg = gradient(1024, 500, BG_TOP, BG_BOT).convert('RGBA')
    e = emblem(420); fg.alpha_composite(e, (40, 40)); word(fg, 'VEXMARCH', 730, 180, 62)
    ImageDraw.Draw(fg).text((730, 285), 'Thirty nodes. One march.', font=ImageFont.truetype(FONT, 30), fill=(200, 190, 170), anchor='mt')
    fg.convert('RGB').save(ic / 'feature-1024x500.png')
    res = ROOT / 'resources' / 'android' / 'res'
    for dname, n in {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}.items():
        dd = res / f'mipmap-{dname}'; dd.mkdir(parents=True, exist_ok=True)
        icon(n).save(dd / 'ic_launcher.png'); icon(n, True).save(dd / 'ic_launcher_round.png')
    for dname, n in {'mdpi': 108, 'hdpi': 162, 'xhdpi': 216, 'xxhdpi': 324, 'xxxhdpi': 432}.items():
        foreground(n).save(res / f'mipmap-{dname}' / 'ic_launcher_foreground.png')
    (res / 'values').mkdir(exist_ok=True)
    (res / 'values' / 'ic_launcher_background.xml').write_text('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#100C16</color>\n</resources>\n')
    sizes = {'land-mdpi': (480, 320), 'land-hdpi': (800, 480), 'land-xhdpi': (1280, 720), 'land-xxhdpi': (1600, 960), 'land-xxxhdpi': (1920, 1280)}
    sizes.update({k.replace('land', 'port'): (h, w) for k, (w, h) in list(sizes.items())})
    for dname, (w, h) in sizes.items():
        dd = res / f'drawable-{dname}'; dd.mkdir(parents=True, exist_ok=True); splash(w, h).save(dd / 'splash.png')
    (res / 'drawable').mkdir(exist_ok=True); splash(480, 320).save(res / 'drawable' / 'splash.png')
    print('icons/ and resources/android/res/ written')


if __name__ == '__main__':
    main()
