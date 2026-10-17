#!/usr/bin/env python3
"""Flesch-Kincaid grade over the visible copy of a built page (stdlib only).
Usage: python3 landing/tests/reading_level.py [landing/dist/employer-gap/index.html] [--max 7]
Block elements (h1-h4, p, li, summary, label, span.note...) each count as one sentence unit; a trailing full stop is added when missing,
so UI labels do not inflate the grade by running together."""
import re, sys, html
from html.parser import HTMLParser

SKIP = {'script', 'style', 'svg', 'symbol', 'noscript', 'head'}
BLOCK = {'h1', 'h2', 'h3', 'h4', 'p', 'li', 'summary', 'label', 'legend', 'small', 'blockquote', 'button', 'a'}

class P(HTMLParser):
    def __init__(self):
        super().__init__(); self.skip = 0; self.hide = []; self.cur = []; self.units = []; self.stack = []
    def flush(self):
        t = re.sub(r'\s+', ' ', ''.join(self.cur)).strip()
        if t: self.units.append(t)
        self.cur = []
    def handle_starttag(self, tag, attrs):
        a = dict(attrs); cls = a.get('class', '') or ''
        hidden = ('hidden' in a) or 'hp' in cls.split() or 'sr' in cls.split() or a.get('aria-hidden') == 'true'
        self.stack.append((tag, hidden))
        if tag in SKIP: self.skip += 1
        if hidden: self.skip += 1
        if tag in BLOCK or tag in ('div', 'span', 'section'): self.flush()
    def handle_endtag(self, tag):
        if tag in BLOCK or tag in ('div', 'span', 'section'): self.flush()
        while self.stack:
            t, h = self.stack.pop()
            if h: self.skip -= 1
            if t in SKIP: self.skip -= 1
            if t == tag: break
    def handle_data(self, d):
        if self.skip <= 0: self.cur.append(d)

def syl(w):
    w = re.sub(r'[^a-z]', '', w.lower())
    if not w: return 0
    if len(w) <= 3: return 1
    w = re.sub(r'(?:[^laeiouy]es|ed|[^laeiouy]e)$', '', w); w = re.sub(r'^y', '', w)
    return max(1, len(re.findall(r'[aeiouy]{1,2}', w)))

def grade(units):
    sents = 0; words = 0; syls = 0
    for u in units:
        # split inside a unit on sentence enders; each unit is at least one sentence
        parts = [x for x in re.split(r'(?<=[.?!])\s+', u) if re.search(r'[A-Za-z]', x)]
        sents += max(1, len(parts))
        for w in re.findall(r"[A-Za-z0-9’'\-–×]+", u):
            if re.search(r'[A-Za-z]', w) or w.isdigit():
                words += 1; syls += syl(w) if re.search(r'[A-Za-z]', w) else 1
    return 0.39 * words / sents + 11.8 * syls / words - 15.59, words, sents

if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    mx = float(sys.argv[sys.argv.index('--max') + 1]) if '--max' in sys.argv else 7.0
    if '--max' in sys.argv: args = [a for a in args if a != str(sys.argv[sys.argv.index('--max') + 1])]
    f = args[0] if args else 'landing/dist/employer-gap/index.html'
    p = P(); p.feed(html.unescape(open(f, encoding='utf-8').read()).replace('&nbsp;', ' ')); p.flush()
    # drop footer legal disclosure (verbatim required text) and the consent block (verbatim legal text) from the page grade, report both
    full = p.units
    g, w, s = grade(full)
    legal = [u for u in full if u.startswith('I agree that SortMyCover') or u.startswith('SortMyCover gives no financial advice')]
    body = [u for u in full if u not in legal]
    gb, wb, sb = grade(body)
    print(f'{f}\n  all visible copy:      grade {g:4.1f}  ({w} words, {s} sentences)')
    print(f'  excl. verbatim legal:  grade {gb:4.1f}  ({wb} words, {sb} sentences)')
    prose = [u for u in body if len(u.split()) >= 8]
    gp, wp, sp = grade(prose)
    print(f'  prose only (>= 8-word blocks, stricter): grade {gp:4.1f}  ({wp} words, {sp} sentences)')
    ok = max(g, gp) <= mx
    print(('PASS' if ok else 'FAIL') + f' (max {mx})'); sys.exit(0 if ok else 1)
