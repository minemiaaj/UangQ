"""Membuat ikon aplikasi, splash, logo, dan gambar latar bawaan.
Jalankan ulang (butuh: pip install pillow numpy) jika ingin mengubah warna/desain:  python tools/make_art.py
Atau cukup timpa file hasilnya dengan gambar Anda sendiri (nama & ukuran sama)."""
import math, os, random
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def P(*p):
    f = os.path.join(ROOT, *p); os.makedirs(os.path.dirname(f), exist_ok=True); return f

# ---------- ikon (raster) ----------
def aa(v): return np.clip(v + 0.5, 0, 1)

def bg_icon(S):
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32) / S
    top = np.array([11, 18, 32], np.float32); bot = np.array([15, 48, 58], np.float32)
    img = top * (1 - yy[..., None]) + bot * yy[..., None]
    def glow(cx, cy, rad, col, k):
        a = np.clip(1 - np.hypot(xx - cx, yy - cy) / rad, 0, 1) ** 2 * k
        return a[..., None] * np.array(col, np.float32)
    img = img + glow(.2, .85, .7, [52, 211, 153], .55) + glow(.85, .12, .6, [251, 191, 36], .35)
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).convert('RGBA')

def coin(S, rf=.30):
    N = S * 2
    yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)
    c = N / 2; R = N * rf
    dx, dy = xx - c, yy - c; d = np.hypot(dx, dy)
    rgb = np.zeros((N, N, 3), np.float32); al = np.zeros((N, N, 1), np.float32)
    def over(a, color):
        nonlocal rgb, al
        a = a[..., None]; rgb = rgb * (1 - a) + np.asarray(color, np.float32) * a; al = al * (1 - a) + a
    t = np.clip(((dx + dy) / (2 * R)) * .5 + .5, 0, 1)[..., None]
    over(aa(R - d), np.array([255, 226, 138], np.float32) * (1 - t) + np.array([214, 140, 16], np.float32) * t)
    over(aa(.90 * R - d) * aa(d - .80 * R) * .55, [176, 106, 10])
    k = np.clip(d / (.78 * R), 0, 1)[..., None]
    over(aa(.78 * R - d), np.array([255, 238, 168], np.float32) * (1 - k) + np.array([240, 176, 40], np.float32) * k)
    ring = aa(.50 * R - d) * aa(d - .33 * R)
    a0 = np.array([.12 * R, .10 * R]); b0 = np.array([.56 * R, .54 * R]); ab = b0 - a0
    tt = np.clip(((dx - a0[0]) * ab[0] + (dy - a0[1]) * ab[1]) / (ab @ ab), 0, 1)
    seg = np.hypot(dx - (a0[0] + tt * ab[0]), dy - (a0[1] + tt * ab[1]))
    over(np.maximum(ring, aa(.085 * R - seg)), [11, 18, 32])
    hl = np.clip(1 - np.hypot(dx + .35 * R, dy + .40 * R) / (.9 * R), 0, 1) ** 2 * .25 * aa(.78 * R - d)
    over(hl, [255, 255, 255])
    out = np.concatenate([rgb / np.maximum(al, 1e-6), al * 255], axis=2)
    out[..., :3] = np.clip(out[..., :3], 0, 255)
    return Image.fromarray(out.astype(np.uint8), 'RGBA').resize((S, S), Image.LANCZOS)

def make_icons():
    S = 1024
    bg = bg_icon(S); only = bg.copy(); only.alpha_composite(coin(S, .30))
    only.convert('RGB').save(P('assets', 'icon-only.png')); only.convert('RGB').save(P('build', 'icon.png'))
    coin(S, .26).save(P('assets', 'icon-foreground.png'))
    bg.convert('RGB').save(P('assets', 'icon-background.png'))
    Z = 2732
    sp = bg_icon(512).resize((Z, Z), Image.BICUBIC)
    sp.alpha_composite(coin(1024, .47).resize((900, 900), Image.LANCZOS), ((Z - 900) // 2, (Z - 900) // 2))
    sp.convert('RGB').save(P('assets', 'splash.png')); sp.convert('RGB').save(P('assets', 'splash-dark.png'))

# ---------- gambar latar (SVG) ----------
W, H = 1600, 1000
def wave(base, amp, freq, ph, step=16):
    pts = [(x, round(base + amp * math.sin(x * freq + ph) + amp * .45 * math.sin(x * freq * 2.3 + ph * 1.7), 1)) for x in range(0, W + step, step)]
    return f'M0,{H} ' + ' '.join(f'L{x},{y}' for x, y in pts) + f' L{W},{H} Z'
def stars(n, ymax, seed, fill='#fff'):
    r = random.Random(seed)
    return ''.join(f'<circle cx="{r.randint(0, W)}" cy="{r.randint(0, ymax)}" r="{r.uniform(.6, 2):.1f}" fill="{fill}" opacity="{r.uniform(.2, .9):.2f}"/>' for _ in range(n))
def coins(seed, col, n=9):
    r = random.Random(seed)
    return ''.join(f'<circle cx="{r.randint(60, W-60)}" cy="{r.randint(80, 700)}" r="{r.randint(10, 34)}" fill="none" stroke="{col}" stroke-width="2" opacity="{r.uniform(.12, .3):.2f}"/>' for _ in range(n))
def svg(defs, body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMid slice"><defs>{defs}</defs>{body}</svg>'
def lg(i, stops, x2=0, y2=1):
    return f'<linearGradient id="{i}" x1="0" y1="0" x2="{x2}" y2="{y2}">' + ''.join(f'<stop offset="{o}" stop-color="{c}"/>' for o, c in stops) + '</linearGradient>'
def rg(i, c, a0=.9):
    return f'<radialGradient id="{i}"><stop offset="0" stop-color="{c}" stop-opacity="{a0}"/><stop offset="1" stop-color="{c}" stop-opacity="0"/></radialGradient>'

def art_aurora():
    ribbon = lambda b, ph, o: f'<path d="{wave(b, 55, .006, ph)}" fill="url(#rib)" opacity="{o}" transform="translate(0,-380)"/>'
    return svg(lg('sky', [(0, '#050912'), (.6, '#0a1d2e'), (1, '#0c2c33')]) + lg('rib', [(0, '#34d399'), (1, '#22d3ee')]) + rg('moon', '#fbbf24', .55),
      f'<rect width="{W}" height="{H}" fill="url(#sky)"/>{stars(110, 520, 7)}'
      f'<circle cx="1250" cy="190" r="190" fill="url(#moon)"/><circle cx="1250" cy="190" r="46" fill="#fde68a"/>'
      + ribbon(520, 0, .20) + ribbon(600, 2, .14) + ribbon(680, 4, .10) + coins(3, '#fbbf24') +
      f'<path d="{wave(760, 40, .004, 1)}" fill="#0f3d3a" opacity=".55"/><path d="{wave(830, 36, .005, 3)}" fill="#0b2f33" opacity=".8"/><path d="{wave(910, 30, .006, 5)}" fill="#071d24"/>')

def art_senja():
    return svg(lg('sky', [(0, '#140a1f'), (.45, '#5b1d5e'), (.75, '#e0457b'), (1, '#fb923c')]) + rg('sun', '#fde047', .9),
      f'<rect width="{W}" height="{H}" fill="url(#sky)"/>{stars(60, 330, 11)}'
      f'<circle cx="800" cy="700" r="330" fill="url(#sun)"/><circle cx="800" cy="700" r="105" fill="#fff1b8"/>' + coins(5, '#fde047', 7) +
      f'<path d="{wave(740, 45, .005, 0)}" fill="#3b1247" opacity=".75"/><path d="{wave(820, 40, .006, 2)}" fill="#2a0d38" opacity=".9"/><path d="{wave(905, 28, .007, 4)}" fill="#160722"/>')

def art_samudra():
    rays = ''.join(f'<polygon points="{x},0 {x+90},0 {x-260},{H}" fill="#7dd3fc" opacity=".05"/>' for x in (240, 520, 820, 1120, 1380))
    r = random.Random(21)
    bubbles = ''.join(f'<circle cx="{r.randint(0, W)}" cy="{r.randint(120, 900)}" r="{r.randint(5, 22)}" fill="none" stroke="#bae6fd" stroke-width="2" opacity="{r.uniform(.15, .4):.2f}"/>' for _ in range(26))
    return svg(lg('sky', [(0, '#04101f'), (.55, '#0a2a52'), (1, '#0b4a78')]),
      f'<rect width="{W}" height="{H}" fill="url(#sky)"/>{rays}{bubbles}'
      f'<path d="{wave(690, 50, .005, 0)}" fill="#0ea5e9" opacity=".18"/><path d="{wave(770, 46, .006, 2)}" fill="#0284c7" opacity=".28"/>'
      f'<path d="{wave(850, 38, .007, 4)}" fill="#075985" opacity=".6"/><path d="{wave(925, 28, .008, 1)}" fill="#082f49"/>')

def art_pagi():
    r = random.Random(31)
    clouds = ''.join(f'<g opacity=".85" fill="#fff"><ellipse cx="{x}" cy="{y}" rx="110" ry="34"/><ellipse cx="{x+60}" cy="{y-24}" rx="70" ry="30"/><ellipse cx="{x-60}" cy="{y-16}" rx="60" ry="26"/></g>' for x, y in ((300, 200), (900, 130), (1330, 280)))
    return svg(lg('sky', [(0, '#bfdbfe'), (.6, '#e0f2fe'), (1, '#fef9c3')]) + rg('sun', '#fbbf24', .6),
      f'<rect width="{W}" height="{H}" fill="url(#sky)"/><circle cx="1230" cy="170" r="200" fill="url(#sun)"/><circle cx="1230" cy="170" r="52" fill="#fcd34d"/>{clouds}' + coins(8, '#d97706', 6) +
      f'<path d="{wave(760, 44, .004, 0)}" fill="#a7f3d0" opacity=".8"/><path d="{wave(840, 38, .005, 2)}" fill="#6ee7b7" opacity=".85"/><path d="{wave(920, 30, .006, 4)}" fill="#34d399"/>')

LOGO = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe28a"/><stop offset="1" stop-color="#d68c10"/></linearGradient></defs>
<rect width="64" height="64" rx="16" fill="#0b1a26"/>
<circle cx="32" cy="32" r="22" fill="url(#g)"/><circle cx="32" cy="32" r="18" fill="none" stroke="#b06a0a" stroke-width="1.5" opacity=".5"/>
<circle cx="31" cy="31" r="9.5" fill="none" stroke="#0b1220" stroke-width="4.6"/>
<path d="M33 33l9 9" stroke="#0b1220" stroke-width="4.6" stroke-linecap="round"/></svg>'''

if __name__ == '__main__':
    make_icons()
    for name, fn in (('aurora', art_aurora), ('senja', art_senja), ('samudra', art_samudra), ('pagi', art_pagi)):
        open(P('www', 'theme', f'bg-{name}.svg'), 'w', encoding='utf-8').write(fn())
    open(P('www', 'theme', 'logo.svg'), 'w', encoding='utf-8').write(LOGO)
    print('selesai')
