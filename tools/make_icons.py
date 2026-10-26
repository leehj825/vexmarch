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
    """A stone keep with two towers and red roofs on a green hill, a banner on top and the road to the gate, inside a gold ring
    (drawn 4x larger, then shrunk)."""
    S = n * 4
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    INK = (14, 10, 18, 255)
    ow = max(2, int(S * 0.012))
    def box(x0, y0, x1, y1, fill, outline=INK, w=ow):
        d.rectangle((x0 * S, y0 * S, x1 * S, y1 * S), fill=fill, outline=outline, width=w)
    def poly(pts, fill, outline=INK, w=ow):
        d.polygon([(x * S, y * S) for x, y in pts], fill=fill); d.line([(x * S, y * S) for x, y in pts + [pts[0]]], fill=outline, width=w, joint='curve')
    # gold ring and the hill
    d.ellipse((S * 0.05, S * 0.05, S * 0.95, S * 0.95), outline=GOLD + (255,), width=int(S * 0.022))
    d.ellipse((S * 0.13, S * 0.62, S * 0.87, S * 0.92), fill=(86, 142, 58, 255), outline=INK, width=ow)
    d.ellipse((S * 0.22, S * 0.66, S * 0.78, S * 0.86), fill=(108, 164, 70, 255))
    STONE, STONE_D, STONE_L = (176, 170, 188, 255), (128, 122, 146, 255), (206, 200, 216, 255)
    ROOF, ROOF_D = RED + (255,), (170, 46, 38, 255)
    # side towers
    for x0, x1 in ((0.17, 0.33), (0.67, 0.83)):
        box(x0, 0.46, x1, 0.77, STONE); box((x0 + x1) / 2, 0.46, x1, 0.77, STONE_D, outline=None)
        d.rectangle((x0 * S, 0.46 * S, x1 * S, 0.77 * S), outline=INK, width=ow)
        poly([(x0 - 0.02, 0.46), (x1 + 0.02, 0.46), ((x0 + x1) / 2, 0.29)], ROOF)
        poly([((x0 + x1) / 2, 0.46), (x1 + 0.02, 0.46), ((x0 + x1) / 2, 0.29)], ROOF_D)
        box((x0 + x1) / 2 - 0.012, 0.54, (x0 + x1) / 2 + 0.012, 0.62, INK, outline=None)
    # the keep: wall, battlements, roof, banner
    box(0.30, 0.40, 0.70, 0.78, STONE); box(0.5, 0.40, 0.70, 0.78, STONE_D, outline=None)
    d.rectangle((0.30 * S, 0.40 * S, 0.70 * S, 0.78 * S), outline=INK, width=ow)
    for i in range(5):
        x = 0.30 + i * 0.08
        box(x, 0.365, x + 0.045, 0.40, STONE_L if i < 3 else STONE_D)
    poly([(0.27, 0.365), (0.73, 0.365), (0.5, 0.15)], ROOF)
    poly([(0.5, 0.365), (0.73, 0.365), (0.5, 0.15)], ROOF_D)
    d.line((0.5 * S, 0.15 * S, 0.5 * S, 0.075 * S), fill=(60, 44, 30, 255), width=int(S * 0.016))
    poly([(0.5, 0.078), (0.64, 0.092), (0.60, 0.115), (0.64, 0.138), (0.5, 0.15)], RED + (255,), outline=GOLD + (255,), w=max(2, int(S * 0.01)))
    d.ellipse((0.5 * S - S * 0.018, 0.15 * S - S * 0.018, 0.5 * S + S * 0.018, 0.15 * S + S * 0.018), fill=GOLD + (255,))
    # gate and windows
    d.rectangle((0.44 * S, 0.60 * S, 0.56 * S, 0.78 * S), fill=INK); d.pieslice((0.44 * S, 0.54 * S, 0.56 * S, 0.66 * S), 180, 360, fill=INK)
    for x in (0.36, 0.60):
        box(x, 0.47, x + 0.04, 0.55, INK, outline=None)
    # the road to the gate
    d.polygon([(0.47 * S, 0.78 * S), (0.53 * S, 0.78 * S), (0.66 * S, 0.93 * S), (0.34 * S, 0.93 * S)], fill=(214, 196, 150, 255))
    d.line([(0.47 * S, 0.78 * S), (0.34 * S, 0.93 * S)], fill=INK, width=ow); d.line([(0.53 * S, 0.78 * S), (0.66 * S, 0.93 * S)], fill=INK, width=ow)
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
