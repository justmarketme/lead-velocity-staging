# Status film: "Where we are"

About 2 min 50 s, 1080p30 H.264 with AAC narration (Microsoft neural en-US-AndrewNeural, rate -3%). Status as at 7 October 2026, for Jonathan.

| File | What |
|---|---|
| `where-we-are-1080p.mp4` | Master (under 25 MB) |
| `where-we-are-720p.mp4` | Under 16 MB, for WhatsApp |
| `poster.jpg` | Thumbnail (end of scene 1) |
| `script.md` | Narration ("Say") and on-screen text ("Show"), the source of truth |
| `scenes/sNN.html` | One 1920x1080 page per scene. `film.js`/`film.css` are shared. `timings.js` is generated |
| `build/` | `tts.py` (voice + word timings), `render.mjs` (frames, then ffmpeg) |

Pipeline and house design are copied from `../broker-success/onboarding-film/` (see its README for the full how-it-works). The MP4s and build artefacts are git-ignored.

## Rebuild

Needs Python with `edge-tts` (7.x, needs internet), Node 20+, ffmpeg and Chrome.

```sh
cd build
npm install                 # puppeteer-core only (or junction node_modules to the onboarding film's)
python tts.py               # build/audio/sNN.mp3 + timings.json + ../scenes/timings.js
node render.mjs             # renders every scene, joins them, writes both MP4s + poster.jpg
```

- `node render.mjs --stills [t ...]` writes PNG stills to `build/stills/`; `--only s03 s05` re-renders those clips; `--join` only re-joins.
- Preview a scene: open `scenes/s03.html` and click to play with its voice, or add `?t=12` to freeze at 12 s.

## Differences from the onboarding film

- Voice-only spellings in `tts.py` (`SPELL`): n8n is said "n eight n", CRM "C R M", SortMyCover "Sort My Cover". Subtitles keep the normal spelling.
- Caption-only rewrites (`CAPTION`): the script spells domains out for the voice ("leadvelocity dot co dot za"); subtitles show `leadvelocity.co.za` / `sortmycover.co.za`, and spoken rand amounts show as R16,500, R8,500, R850 and R1,500.
- `film.js` header reads "Status update · 7 Oct 2026 / Where we are" and adds a shared `tick()` helper (self-drawing check mark).
