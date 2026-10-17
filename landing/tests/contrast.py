#!/usr/bin/env python3
"""WCAG contrast for the template's colour pairs. Run: python3 landing/tests/contrast.py (exit 1 on any failure)."""
import sys
def lum(h):
    h = h.lstrip('#'); r, g, b = [int(h[i:i+2], 16) / 255 for i in (0, 2, 4)]
    f = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    return .2126 * f(r) + .7152 * f(g) + .0722 * f(b)
def cr(a, b):
    x, y = sorted([lum(a), lum(b)], reverse=True); return (x + .05) / (y + .05)
P = [("text on off-white", "#1F2933", "#FBF8F2", 4.5), ("muted on off-white", "#5C6672", "#FBF8F2", 4.5), ("muted on white card", "#5C6672", "#FFFFFF", 4.5),
     ("muted on off-white-2", "#5C6672", "#F1ECE2", 4.5), ("amber-ink on amber", "#2A1B02", "#F5A623", 4.5), ("off-white on charcoal", "#FBF8F2", "#1F2933", 4.5),
     ("amber on charcoal", "#F5A623", "#1F2933", 4.5), ("hero sub on charcoal", "#D7D2C8", "#1F2933", 4.5), ("top small on charcoal", "#C9C3B8", "#1F2933", 4.5),
     ("error on white", "#A32D2D", "#FFFFFF", 4.5), ("error on off-white", "#A32D2D", "#FBF8F2", 4.5), ("input border on white (non-text)", "#8A94A0", "#FFFFFF", 3.0),
     ("dark text", "#F1EDE5", "#15181C", 4.5), ("dark muted", "#A9AFB7", "#1C2027", 4.5), ("dark error", "#FF9A9A", "#1C2027", 4.5), ("dark control border", "#7C8590", "#1C2027", 3.0),
     ("focus ring on light", "#1F2933", "#FBF8F2", 3.0)]
bad = 0
for n, a, b, need in P:
    r = cr(a, b); ok = r >= need; bad += not ok; print(f"{'PASS' if ok else 'FAIL'} {r:5.2f} (need {need})  {n}")
sys.exit(1 if bad else 0)
