# Narration: one MP3 per scene via edge-tts (en-US-AndrewNeural), plus word timings.
# Reads the "Say" lines verbatim from ../script.md. Writes audio/sNN.mp3 and
# ../scenes/timings.js (window.TIMINGS) + timings.json, used by the scenes and the renderer.
import asyncio, json, os, re, subprocess, sys
import edge_tts

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
VOICE = "en-US-AndrewNeural"
RATE = os.environ.get("TTS_RATE", "-3%")
LEAD, TAIL = 1.0, 1.3          # silence before/after speech within each scene clip (s)
# Spoken-only expansions so acronyms are spelled out. Captions keep the original word.
SPELL = {"n8n": ["n", "eight", "n"], "CRM": ["C", "R", "M"], "SortMyCover": ["Sort", "My", "Cover"]}
# Caption-only rewrites: the script spells domains out for the voice; subtitles show them normally.
CAPTION = [(r"\b(\w+) dot co dot za", lambda m: m.group(1).lower() + ".co.za"),
           (r"sixteen thousand five hundred rand", "R16,500"), (r"eight and a half thousand", "R8,500"),
           (r"eight hundred and fifty rand", "R850"), (r"fifteen hundred rand", "R1,500")]

def scenes_from_script():
    md = open(os.path.join(ROOT, "script.md"), encoding="utf-8").read()
    out = []
    for block in re.split(r"^## ", md, flags=re.M)[1:]:
        title = block.splitlines()[0].strip()
        say = re.search(r"\*\*Say:\*\*\s*(.+)", block).group(1).strip()
        out.append({"title": title, "say": say})
    return out

def norm(s):
    return re.sub(r"[^a-z0-9]", "", s.lower())

async def synth(text, mp3):
    com = edge_tts.Communicate(text, VOICE, rate=RATE, boundary="WordBoundary")
    words, audio = [], bytearray()
    async for ch in com.stream():
        if ch["type"] == "audio":
            audio += ch["data"]
        elif ch["type"] == "WordBoundary":
            words.append({"text": ch["text"], "t": ch["offset"] / 1e7, "d": ch["duration"] / 1e7})
    open(mp3, "wb").write(audio)
    return words

def duration(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
                       capture_output=True, text=True, check=True)
    return float(r.stdout.strip())

def align(orig_tokens, expansions, bounds):
    """Map each original token to the time of its first spoken char, via char positions."""
    bchars = []  # boundary index per normalized char
    for i, b in enumerate(bounds):
        bchars += [i] * len(norm(b["text"]))
    out, pos = [], 0
    for tok, exp in zip(orig_tokens, expansions):
        n = len("".join(norm(x) for x in exp))
        if n == 0:
            out.append(None); continue
        i0 = bchars[min(pos, len(bchars) - 1)]
        i1 = bchars[min(pos + n - 1, len(bchars) - 1)]
        out.append({"w": tok, "t": round(bounds[i0]["t"], 3), "e": round(bounds[i1]["t"] + bounds[i1]["d"], 3)})
        pos += n
    if pos != len(bchars):
        print(f"  WARN char mismatch: tokens {pos} vs boundaries {len(bchars)}", file=sys.stderr)
    # fill punctuation-only tokens with neighbour times
    for k, w in enumerate(out):
        if w is None:
            prev = next((x for x in reversed(out[:k]) if x), {"t": 0, "e": 0})
            out[k] = {"w": orig_tokens[k], "t": prev["e"], "e": prev["e"]}
    return out

NUMW = set("a one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand and half rand".split())

def cues(tokens, end_pad=0.35, maxc=68):
    """One-line subtitle cues: whole sentences when they fit, else split at the
    clause break (comma/colon) nearest the middle, else at the most balanced word."""
    txt = lambda g: " ".join(x["w"] for x in g)
    def split(g):
        if len(txt(g)) <= maxc or len(g) < 2:
            return [g]
        best, score = None, None
        for k in range(1, len(g)):
            left, right = txt(g[:k]), txt(g[k:])
            bal = abs(len(left) - len(right))
            pen = 0 if re.search(r"[,:;]$", g[k - 1]["w"]) else 40
            if len(left) < 10 or len(right) < 10: pen += 100
            if norm(g[k - 1]["w"]) in NUMW and norm(g[k]["w"]) in NUMW: pen += 80
            s = bal + pen
            if score is None or s < score: best, score = k, s
        return split(g[:best]) + split(g[best:])
    sentences, cur = [], []
    for w in tokens:
        cur.append(w)
        if re.search(r"[.?!]$", w["w"]): sentences.append(cur); cur = []
    if cur: sentences.append(cur)
    groups = []
    for s in sentences:
        # glue a very short sentence onto the previous line if it still fits
        if groups and len(txt(s)) <= 16 and len(txt(groups[-1]) + " " + txt(s)) <= maxc                 and s[0]["t"] - groups[-1][-1]["e"] < 1.0:
            groups[-1] = groups[-1] + s
            continue
        groups += split(s)
    out = []
    for gi, g in enumerate(groups):
        end = groups[gi + 1][0]["t"] if gi + 1 < len(groups) else g[-1]["e"] + end_pad
        end = min(end, g[-1]["e"] + 0.9)
        text = txt(g)
        for pat, rep in CAPTION: text = re.sub(pat, rep, text)
        out.append({"text": text, "t": round(g[0]["t"], 3), "e": round(end, 3)})
    return out

async def main():
    os.makedirs(os.path.join(HERE, "audio"), exist_ok=True)
    scenes = scenes_from_script()
    result = {"lead": LEAD, "tail": TAIL, "voice": VOICE, "rate": RATE, "scenes": []}
    for i, sc in enumerate(scenes, 1):
        toks = sc["say"].split()
        exps = []
        for tok in toks:
            core = re.sub(r"[^A-Za-z0-9]", "", tok)
            exps.append(SPELL.get(core, [tok]))
        spoken = " ".join(" ".join(SPELL[re.sub(r'[^A-Za-z0-9]', '', t)]) + re.sub(r'^[A-Za-z0-9]+', '', t)
                          if re.sub(r'[^A-Za-z0-9]', '', t) in SPELL else t for t in toks)
        mp3 = os.path.join(HERE, "audio", f"s{i:02d}.mp3")
        bounds = await synth(spoken, mp3)
        dur = duration(mp3)
        words = align(toks, exps, bounds)
        # shift into scene-clip time (speech starts at LEAD)
        for w in words: w["t"] = round(w["t"] + LEAD, 3); w["e"] = round(w["e"] + LEAD, 3)
        cs = cues(words)
        clip = round(LEAD + dur + TAIL, 3)
        result["scenes"].append({"id": f"s{i:02d}", "title": sc["title"], "spoken": spoken,
                                 "audio": dur, "clip": clip, "words": words, "cues": cs})
        print(f"s{i:02d} {sc['title']:<32} audio {dur:6.2f}s  clip {clip:6.2f}s  words {len(words)} cues {len(cs)}")
    json.dump(result, open(os.path.join(HERE, "timings.json"), "w"), indent=1)
    with open(os.path.join(ROOT, "scenes", "timings.js"), "w", encoding="utf-8") as f:
        f.write("// generated by build/tts.py, do not edit\nwindow.TIMINGS = " + json.dumps(result) + ";\n")
    print("speech total", round(sum(s["audio"] for s in result["scenes"]), 1), "s")

asyncio.run(main())
