# Builds public/email/broker-onboarding-video.jpg, the video card in create-password.html.
# Visual system = the live /onboarding page: navy #030712 base, slate-900/60 cards with white/5 borders,
# Inter 700 headings (-0.025em), "epiphany" gradient text (#e600ff > #ff00cc > #ff7f50 70% > #ff8c00),
# tracked uppercase eyebrow in primary #b83df5, primary/20 numbered circles, solid primary button (12px radius).
# Run from this folder: python make-video-thumb.py   (needs Pillow; Inter TTFs in ./fonts or pass INTER_DIR)
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = os.environ.get("INTER_DIR", os.path.join(HERE, "fonts"))
OUT = os.path.join(HERE, "..", "..", "public", "email", "broker-onboarding-video.jpg")
LOGO = os.path.join(HERE, "..", "..", "public", "email", "lead-velocity-logo.png")

W, H, S = 1104, 621, 4
BASE = (18, 12, 31)          # #120c1f, the email page purple
SLATE = (35, 26, 61)         # #231a3d, the email panel purple
PRIMARY = (184, 61, 245)     # #b83df5
PINK = (236, 72, 153)        # pink-500
EPIPHANY = [(0.0, (230, 0, 255)), (0.33, (255, 0, 204)), (0.70, (255, 127, 80)), (1.0, (255, 140, 0))]

def F(weight, size):
    return ImageFont.truetype(os.path.join(FONTS, f"Inter-{weight}.ttf"), size)

im = Image.new("RGBA", (W, H), BASE + (255,))

def comp(layer):
    global im
    im = Image.alpha_composite(im, layer)

def glow(cx, cy, r, col, a):
    g = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(g).ellipse([cx - r, cy - r, cx + r, cy + r], fill=col + (a,))
    return g.filter(ImageFilter.GaussianBlur(r * 0.65))

def rmask(w, h, r, outline=0):
    m = Image.new("L", (w * S, h * S), 0)
    d = ImageDraw.Draw(m)
    if outline:
        d.rounded_rectangle([0, 0, w * S - 1, h * S - 1], radius=r * S, outline=255, width=outline * S)
    else:
        d.rounded_rectangle([0, 0, w * S - 1, h * S - 1], radius=r * S, fill=255)
    return m.resize((w, h), Image.LANCZOS)

def put(src, xy, mask):
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    layer.paste(src, xy, mask)
    comp(layer)

def solid(w, h, rgba):
    return Image.new("RGBA", (w, h), rgba)

def grad_stops(w, h, stops):
    g = Image.new("RGBA", (w, h))
    d = ImageDraw.Draw(g)
    for x in range(w):
        t = x / max(1, w - 1)
        for (t0, c0), (t1, c1) in zip(stops, stops[1:]):
            if t0 <= t <= t1:
                k = (t - t0) / max(1e-6, t1 - t0)
                d.line([(x, 0), (x, h)], fill=tuple(int(c0[i] + (c1[i] - c0[i]) * k) for i in range(3)) + (255,))
                break
    return g

def tracked(d, x, y, text, font, fill, spacing):
    for ch in text:
        d.text((x, y), ch, font=font, fill=fill)
        x += d.textlength(ch, font=font) + spacing
    return x

# Background: navy base, slate-900/30 band, soft primary/pink glows (onboarding hero orbs)
comp(glow(140, 60, 280, PRIMARY, 46))
comp(glow(990, 600, 300, PINK, 40))
comp(glow(560, 300, 340, (40, 28, 72), 150))   # #281c48 lift behind the headline

# Logo
logo = Image.open(LOGO).convert("RGBA")
lw = 104
logo = logo.resize((lw, int(logo.height * lw / logo.width)), Image.LANCZOS)
TOP = 58
put(logo, ((W - lw) // 2, TOP), logo)
y = TOP + logo.height + 22

# Eyebrow: tracked uppercase, primary/90
d = ImageDraw.Draw(im)
eb_font = F(500, 17)
eb = "BROKER ONBOARDING"
sp = 17 * 0.25
eb_w = sum(d.textlength(c, font=eb_font) + sp for c in eb) - sp
tracked(d, (W - eb_w) / 2, y, eb, eb_font, PRIMARY + (230,), sp)
y += 38

# Headline: "What happens " white + "next" epiphany gradient; Inter 700, -0.025em
hf = F(700, 76)
track = -76 * 0.025
def width(t):
    return sum(d.textlength(c, font=hf) + track for c in t) - track
left, right = "What happens ", "next"
total = width(left) + width(right) + track
x0 = (W - total) / 2
xr = tracked(d, x0, y, left, hf, (255, 255, 255, 255), track)
# gradient word via mask
mask = Image.new("L", (W, H), 0)
tracked(ImageDraw.Draw(mask), xr, y, right, hf, 255, track)
bbox = mask.getbbox()
gw = bbox[2] - bbox[0]
g = grad_stops(gw, H, EPIPHANY)
layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
layer.paste(g, (bbox[0], 0), mask.crop((bbox[0], 0, bbox[2], H)))
comp(layer)
y += 112

# Three chapter cards: slate-900/60, border white/5, radius 16, primary/20 numbered circle
d = ImageDraw.Draw(im)
chips = [("1", "Your leads"), ("2", "Your money"), ("3", "Getting better")]
tf = F(700, 22)
nf = F(700, 16)
widths = [16 + 34 + 14 + int(d.textlength(t, font=tf)) + 24 for _, t in chips]
gap, ch = 18, 66
x = (W - sum(widths) - gap * 2) // 2
for (n, t), w in zip(chips, widths):
    put(solid(w, ch, SLATE + (153,)), (x, y), rmask(w, ch, 16))
    put(solid(w, ch, (255, 255, 255, 13)), (x, y), rmask(w, ch, 16, outline=1))
    cx, cy = x + 16, y + (ch - 34) // 2
    circ = Image.new("L", (34 * S, 34 * S), 0)
    ImageDraw.Draw(circ).ellipse([0, 0, 34 * S - 1, 34 * S - 1], fill=255)
    circ = circ.resize((34, 34), Image.LANCZOS)
    put(solid(34, 34, PRIMARY + (51,)), (cx, cy), circ)
    ring = Image.new("L", (34 * S, 34 * S), 0)
    ImageDraw.Draw(ring).ellipse([0, 0, 34 * S - 1, 34 * S - 1], outline=255, width=S)
    ring = ring.resize((34, 34), Image.LANCZOS)
    put(solid(34, 34, PRIMARY + (51,)), (cx, cy), ring)
    d = ImageDraw.Draw(im)
    d.text((cx + 17, cy + 17), n, font=nf, fill=PRIMARY + (255,), anchor="mm")
    d.text((cx + 34 + 14, y + ch // 2), t, font=tf, fill=(255, 255, 255, 255), anchor="lm")
    x += w + gap
y += ch + 34

# Primary button: solid #b83df5, radius 12, shadow-lg shadow-primary/20
bf = F(500, 24)
label, dur = "Watch the video", "3:54"
lw2, dw = int(d.textlength(label, font=bf)), int(d.textlength(dur, font=bf))
bh, icon = 64, 26
bw = 24 + icon + 14 + lw2 + 22 + dw + 26
bx, by = (W - bw) // 2, min(y, H - bh - 36)
sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
ImageDraw.Draw(sh).rounded_rectangle([bx + 6, by + 12, bx + bw - 6, by + bh + 14], radius=14, fill=PRIMARY + (90,))
comp(sh.filter(ImageFilter.GaussianBlur(16)))
put(solid(bw, bh, PRIMARY + (255,)), (bx, by), rmask(bw, bh, 12))
tri = Image.new("L", (icon * S, icon * S), 0)
ImageDraw.Draw(tri).polygon([(icon * S * 0.18, 0), (icon * S * 0.18, icon * S - 1), (icon * S * 0.95, icon * S / 2)], fill=255)
tri = tri.resize((icon, icon), Image.LANCZOS)
put(solid(icon, icon, (255, 255, 255, 255)), (bx + 24, by + (bh - icon) // 2), tri)
d = ImageDraw.Draw(im)
ty = by + bh // 2
tx = bx + 24 + icon + 14
d.text((tx, ty), label, font=bf, fill=(255, 255, 255, 255), anchor="lm")
sx = tx + lw2 + 11
d.line([(sx, ty - 12), (sx, ty + 12)], fill=(255, 255, 255, 110), width=2)
d.text((sx + 11, ty), dur, font=bf, fill=(255, 255, 255, 230), anchor="lm")

im.convert("RGB").save(OUT, quality=88, optimize=True, progressive=True)
print(os.path.getsize(OUT), OUT)
