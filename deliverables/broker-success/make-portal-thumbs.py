# Branded thumbnails (posters) for the broker-portal videos, so a player never shows a blank frame.
# Visual system = leadvelocity.co.za/onboarding (the portal's look): navy #030712 > #070c19, Inter 700 with -0.025em,
# "epiphany" gradient word (#e600ff > #ff00cc > #ff7f50 70% > #ff8c00), tracked uppercase eyebrow in primary #b83df5,
# slate-900 chips with primary/20 numbered circles, solid primary "Watch" pill (12px radius).
# Run: python make-portal-thumbs.py   (Pillow; Inter TTFs from ../emails/fonts)  -> public/media/broker/*.jpg
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = os.path.join(HERE, "..", "emails", "fonts")
OUTDIR = os.path.join(HERE, "..", "..", "public", "media", "broker")
CLIPDIR = os.path.join(OUTDIR, "clips")
LOGO = os.path.join(HERE, "..", "..", "public", "email", "lead-velocity-logo.png")
S = 4
BASE, SLATE, LIFT = (7, 12, 25), (15, 23, 42), (30, 41, 59)
PRIMARY, PINK = (184, 61, 245), (236, 72, 153)
EPIPHANY = [(0.0, (230, 0, 255)), (0.33, (255, 0, 204)), (0.70, (255, 127, 80)), (1.0, (255, 140, 0))]

def F(weight, size):
    return ImageFont.truetype(os.path.join(FONTS, f"Inter-{weight}.ttf"), size)

def make(name, W, H, eyebrow, title_plain, title_grad, chips, duration, scale=1.0, vertical=False):
    im = Image.new("RGBA", (W, H), BASE + (255,))
    def comp(layer):
        nonlocal im
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
    def grad(w, h):
        g = Image.new("RGBA", (w, h)); d = ImageDraw.Draw(g)
        for x in range(w):
            t = x / max(1, w - 1)
            for (t0, c0), (t1, c1) in zip(EPIPHANY, EPIPHANY[1:]):
                if t0 <= t <= t1:
                    k = (t - t0) / max(1e-6, t1 - t0)
                    d.line([(x, 0), (x, h)], fill=tuple(int(c0[i] + (c1[i] - c0[i]) * k) for i in range(3)) + (255,))
                    break
        return g
    def tracked(d, x, y, text, font, fill, sp):
        for ch in text:
            d.text((x, y), ch, font=font, fill=fill); x += d.textlength(ch, font=font) + sp
        return x
    def twidth(d, text, font, sp):
        return sum(d.textlength(c, font=font) + sp for c in text) - sp

    k = scale
    comp(glow(int(W * 0.13), int(H * 0.08), int(280 * k), PRIMARY, 46))
    comp(glow(int(W * 0.9), int(H * 0.97), int(300 * k), PINK, 40))
    comp(glow(W // 2, int(H * 0.48), int(340 * k), LIFT, 120))

    logo = Image.open(LOGO).convert("RGBA")
    lw = int(104 * k)
    logo = logo.resize((lw, int(logo.height * lw / logo.width)), Image.LANCZOS)
    y = int(H * (0.2 if vertical else 0.15))
    put(logo, ((W - lw) // 2, y), logo)
    y += logo.height + int(22 * k)

    d = ImageDraw.Draw(im)
    ef = F(500, int(17 * k)); sp = 17 * k * 0.25
    tracked(d, (W - twidth(d, eyebrow, ef, sp)) / 2, y, eyebrow, ef, PRIMARY + (230,), sp)
    y += int(38 * k)

    # Title: one or two lines; the gradient word(s) last
    hf = F(700, int((64 if vertical else 72) * k)); tr = -hf.size * 0.025
    lines = [(title_plain + " ", title_grad)] if not vertical else [(title_plain, ""), ("", title_grad)]
    for plain, gword in lines:
        wp = twidth(d, plain, hf, tr) if plain else 0
        wg = twidth(d, gword, hf, tr) if gword else 0
        x0 = (W - wp - wg - (tr if plain and gword else 0)) / 2
        xr = tracked(d, x0, y, plain, hf, (255, 255, 255, 255), tr) if plain else x0
        if gword:
            mask = Image.new("L", (W, H), 0)
            tracked(ImageDraw.Draw(mask), xr, y, gword, hf, 255, tr)
            bb = mask.getbbox()
            layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            layer.paste(grad(bb[2] - bb[0], H), (bb[0], 0), mask.crop((bb[0], 0, bb[2], H)))
            comp(layer)
        d = ImageDraw.Draw(im)
        y += int(hf.size * 1.22)
    y += int(18 * k)

    # Chips
    tf, nf = F(700, int(21 * k)), F(700, int(15 * k))
    cs, ch, gap = int(32 * k), int(62 * k), int(16 * k)
    widths = [int(14 * k) + cs + int(12 * k) + int(d.textlength(t, font=tf)) + int(22 * k) for t in chips]
    rows = [[(i, c, w)] for i, (c, w) in enumerate(zip(chips, widths))] if vertical else [list((i, c, w) for i, (c, w) in enumerate(zip(chips, widths)))]
    for row in rows:
        tot = sum(w for _, _, w in row) + gap * (len(row) - 1)
        x = (W - tot) // 2
        if vertical:
            maxw = max(widths); x = (W - maxw) // 2
        for i, t, w in row:
            w = max(widths) if vertical else w
            put(solid(w, ch, SLATE + (153,)), (x, y), rmask(w, ch, int(16 * k)))
            put(solid(w, ch, (255, 255, 255, 13)), (x, y), rmask(w, ch, int(16 * k), outline=1))
            cx, cy = x + int(14 * k), y + (ch - cs) // 2
            circ = Image.new("L", (cs * S, cs * S), 0); ImageDraw.Draw(circ).ellipse([0, 0, cs * S - 1, cs * S - 1], fill=255)
            circ = circ.resize((cs, cs), Image.LANCZOS)
            put(solid(cs, cs, PRIMARY + (51,)), (cx, cy), circ)
            d = ImageDraw.Draw(im)
            d.text((cx + cs // 2, cy + cs // 2), str(i + 1), font=nf, fill=PRIMARY + (255,), anchor="mm")
            d.text((cx + cs + int(12 * k), y + ch // 2), t, font=tf, fill=(255, 255, 255, 255), anchor="lm")
            x += w + gap
        y += ch + (int(12 * k) if vertical else 0)
    y += int(30 * k)

    # Watch pill
    bf = F(500, int(23 * k))
    label = "Watch the video"
    lw2, dw = int(d.textlength(label, font=bf)), int(d.textlength(duration, font=bf))
    bh, icon = int(62 * k), int(24 * k)
    bw = int(22 * k) + icon + int(14 * k) + lw2 + int(22 * k) + dw + int(24 * k)
    bx, by = (W - bw) // 2, min(y, H - bh - int(40 * k))
    sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle([bx + 6, by + 12, bx + bw - 6, by + bh + 14], radius=14, fill=PRIMARY + (90,))
    comp(sh.filter(ImageFilter.GaussianBlur(16)))
    put(solid(bw, bh, PRIMARY + (255,)), (bx, by), rmask(bw, bh, int(12 * k)))
    tri = Image.new("L", (icon * S, icon * S), 0)
    ImageDraw.Draw(tri).polygon([(icon * S * 0.18, 0), (icon * S * 0.18, icon * S - 1), (icon * S * 0.95, icon * S / 2)], fill=255)
    tri = tri.resize((icon, icon), Image.LANCZOS)
    put(solid(icon, icon, (255, 255, 255, 255)), (bx + int(22 * k), by + (bh - icon) // 2), tri)
    d = ImageDraw.Draw(im)
    ty = by + bh // 2; tx = bx + int(22 * k) + icon + int(14 * k)
    d.text((tx, ty), label, font=bf, fill=(255, 255, 255, 255), anchor="lm")
    sx = tx + lw2 + int(11 * k)
    d.line([(sx, ty - int(12 * k)), (sx, ty + int(12 * k))], fill=(255, 255, 255, 110), width=2)
    d.text((sx + int(11 * k), ty), duration, font=bf, fill=(255, 255, 255, 230), anchor="lm")

    out = name if os.path.isabs(name) else os.path.join(OUTDIR, name)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    im.convert("RGB").save(out, quality=86, optimize=True, progressive=True)
    print(os.path.getsize(out), out)

make("what-happens-next-poster.jpg", 1280, 720, "BROKER ONBOARDING", "What happens", "next",
     ["Your leads", "Your money", "Getting better"], "3:54", scale=1.12)
make("onboarding-guide-poster.jpg", 1280, 720, "YOUR BROKER PORTAL", "Your onboarding", "guide",
     ["Sign. Pay. Start.", "Your introduction", "Your lead journey"], "3:53", scale=1.12)
make("connect-outlook-poster.jpg", 720, 1280, "2-MINUTE GUIDE", "Connect your", "Outlook calendar",
     ["What we can see", "How to connect", "Turn it off any time"], "2:24", scale=1.0, vertical=True)

# Getting-started step clips (portrait), chips = what each clip shows (verified against the portal code by the clip agents)
make(os.path.join(CLIPDIR, "fsp-poster.jpg"), 720, 1280, "GETTING STARTED · STEP 3", "Confirm your", "FSP number",
     ["Tap Enter it", "Check FSP and practice", "Save: the step ticks"], "0:31", vertical=True)
make(os.path.join(CLIPDIR, "intro-card-poster.jpg"), 720, 1280, "GETTING STARTED · STEP 4", "Add your photo", "and a short bio",
     ["Take or upload a photo", "Two lines about you", "Save your intro card"], "0:36", vertical=True)
make(os.path.join(CLIPDIR, "whatsapp-poster.jpg"), 720, 1280, "GETTING STARTED · STEP 5", "Confirm your", "WhatsApp number",
     ["Check the number", "Confirm or use another", "Leads and bookings go there"], "0:33", vertical=True)
