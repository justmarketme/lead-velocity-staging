# Narration: one MP3 per scene via edge-tts (en-US-AndrewNeural), plus word timings.
# Reads the "Say" lines verbatim from ../script.md. Writes audio/sNN.mp3 and
# ../scenes/timings.js (window.TIMINGS) + timings.json, used by the scenes and the renderer.
import asyncio, json, os, re, subprocess, sys
import edge_tts
# Microsoft periodically 403s the Edge version edge-tts pins. Until edge-tts ships a fix, override it:
#   EDGE_TTS_CHROMIUM=143.0.3650.96 python tts.py
if os.environ.get("EDGE_TTS_CHROMIUM"):
    import edge_tts.constants as _c, edge_tts.communicate as _cm
    _v = os.environ["EDGE_TTS_CHROMIUM"]
    _c.CHROMIUM_FULL_VERSION, _c.CHROMIUM_MAJOR_VERSION = _v, _v.split(".")[0]
    _c.SEC_MS_GEC_VERSION = _cm.SEC_MS_GEC_VERSION = "1-" + _v
    # the User-Agent baked into the header dicts at import time must carry the same major version
    for _h in (_c.BASE_HEADERS, _c.WSS_HEADERS, _c.VOICE_HEADERS):
        if "User-Agent" in _h:
            _h["User-Agent"] = re.sub(r"(Chrome|Edg)/\d+\.0\.0\.0", lambda m: f"{m.group(1)}/{_v.split('.')[0]}.0.0.0", _h["User-Agent"])
# Oct 2026: Microsoft moved Edge Read Aloud off speech.platform.bing.com (403 on the old URL); edge-tts 7.2.8 still points
# there (github.com/rany2/edge-tts/issues/490). Same fix as lv-release ads-launch-film/build/tts.py. Old URL: EDGE_TTS_LEGACY=1.
if not os.environ.get("EDGE_TTS_LEGACY"):
    from edge_tts import communicate as _comm
    from edge_tts.constants import TRUSTED_CLIENT_TOKEN as _tok
    _comm.WSS_URL = f"wss://api.msedgeservices.com/tts/cognitiveservices/websocket/v1?Ocp-Apim-Subscription-Key={_tok}"

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
VOICE = "en-US-AndrewNeural"
RATE = os.environ.get("TTS_RATE", "-3%")
LEAD, TAIL = 1.0, 1.3          # silence before/after speech within each scene clip (s)
# Spoken-only expansions so acronyms are spelled out. Captions keep the original word.
SPELL = {"n8n": ["n", "eight", "n"], "CRM": ["C", "R", "M"], "SortMyCover": ["Sort", "My", "Cover"],
         "FSP": ["F", "S", "P"], "VPS": ["V", "P", "S"], "KG": ["K", "G"], "DMARC": ["D", "Mark"]}
# Caption-only rewrites: the script spells domains out for the voice; subtitles show them normally.
CAPTION = [(r"\b(\w+) dot co dot za", lambda m: m.group(1).lower() + ".co.za"),
           (r"sixteen thousand five hundred rand", "R16,500"), (r"eight and a half thousand", "R8,500"),
           (r"eight hundred and fifty rand", "R850"), (r"fifteen hundred rand", "R1,500"),
           (r"seven hundred and fifty rand", "R750"), (r"three hundred and fifty rand a day", "R350 a day"),
           (r"seventy-five rand", "R75"), (r"four by five", "4:5"), (r"\bhello at (\w+\.co\.za)", r"hello@\1")]

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
    for attempt in range(5):  # the new endpoint rate-limits (429): back off and retry
        try:
            com = edge_tts.Communicate(text, VOICE, rate=RATE, boundary="WordBoundary")
            words, audio = [], bytearray()
            async for ch in com.stream():
                if ch["type"] == "audio":
                    audio += ch["data"]
                elif ch["type"] == "WordBoundary":
                    words.append({"text": ch["text"], "t": ch["offset"] / 1e7, "d": ch["duration"] / 1e7})
            open(mp3, "wb").write(audio)
            return words
        except Exception as e:
            if attempt == 4 or "429" not in str(e):
                raise
            await asyncio.sleep(5 * (attempt + 1))

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

def write(result):
    json.dump(result, open(os.path.join(HERE, "timings.json"), "w"), indent=1)
    with open(os.path.join(ROOT, "scenes", "timings.js"), "w", encoding="utf-8") as f:
        f.write("// generated by build/tts.py, do not edit\nwindow.TIMINGS = " + json.dumps(result) + ";\n")

async def main():
    # Resumable: a scene whose spoken text is unchanged and whose MP3 exists is kept (the free Edge endpoint
    # can 403 mid-run, so a re-run picks up where the last one stopped). --force re-voices everything.
    os.makedirs(os.path.join(HERE, "audio"), exist_ok=True)
    scenes = scenes_from_script()
    prev, tj = {}, os.path.join(HERE, "timings.json")
    if os.path.exists(tj) and "--force" not in sys.argv:
        prev = {s["id"]: s for s in json.load(open(tj, encoding="utf-8"))["scenes"]}
    result = {"lead": LEAD, "tail": TAIL, "voice": VOICE, "rate": RATE, "scenes": []}
    for i, sc in enumerate(scenes, 1):
        toks = sc["say"].split()
        exps = []
        for tok in toks:
            core = re.sub(r"[^A-Za-z0-9]", "", tok)
            exps.append(SPELL.get(core, [tok]))
        # spoken form: swap a spelled token for its expansion, keeping trailing punctuation
        spoken = " ".join(" ".join(SPELL[re.sub(r'[^A-Za-z0-9]', '', t)]) + re.search(r'[^A-Za-z0-9]*$', t).group(0)
                          if re.sub(r'[^A-Za-z0-9]', '', t) in SPELL else t for t in toks)
        sid = f"s{i:02d}"
        mp3 = os.path.join(HERE, "audio", f"{sid}.mp3")
        old = prev.get(sid)
        if old and old.get("spoken") == spoken and os.path.exists(mp3):
            old["title"] = sc["title"]; result["scenes"].append(old); print(f"{sid} kept"); continue
        bounds = await synth(spoken, mp3)
        dur = duration(mp3)
        words = align(toks, exps, bounds)
        for w in words: w["t"] = round(w["t"] + LEAD, 3); w["e"] = round(w["e"] + LEAD, 3)
        cs = cues(words)
        clip = round(LEAD + dur + TAIL, 3)
        result["scenes"].append({"id": sid, "title": sc["title"], "spoken": spoken,
                                 "audio": dur, "clip": clip, "words": words, "cues": cs})
        print(f"{sid} {sc['title']:<32} audio {dur:6.2f}s  clip {clip:6.2f}s  words {len(words)} cues {len(cs)}")
        write({**result, "scenes": result["scenes"] + [prev[k] for k in sorted(prev) if k > sid]})
    write(result)
    print("speech total", round(sum(s["audio"] for s in result["scenes"]), 1), "s")

asyncio.run(main())
