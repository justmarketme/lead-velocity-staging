# Status film: "Where we are"

About 3 min 55 s, 1080p30 H.264 with AAC narration (Microsoft neural en-US-AndrewNeural, rate -3%), captions burned in. Status as at 13 October 2026, for Jono. Rebuilt on 13 Oct from read-only checks run that day (live curl, Supabase SELECTs and logs, n8n on the EMMA VPS, Twilio API reads, git). Every Say/Show line traces to one of those checks; `script.md` lists the source under each scene.

| File | What |
|---|---|
| `where-we-are-1080p.mp4` | Master |
| `where-we-are-720p.mp4` | Under 16 MB, for WhatsApp |
| `poster.jpg` | Branded title frame (end of scene 1). Also baked into frames 0-2 of both MP4s so chat apps and players thumbnail the title, not a blank fade-in |
| `script.md` | Narration ("Say"), on-screen content ("Show") and sources: the source of truth |
| `scenes/sNN.html` | One 1920x1080 page per scene (9). `film.js`/`film.css` are shared. `timings.js` is generated |
| `build/` | `tts.py` (voice + word timings), `render.mjs` (frames, then ffmpeg) |

Scenes: 1 Where we are · 2 Mark and the broker portal (phone-sim of Getting started, 4 of 6) · 3 The welcome email · 4 SortMyCover and n8n · 5 Outlook calendar groundwork · 6 What blocks Mark's first lead (owner + "Blocks:" per item) · 7 Smaller jobs · 8 Where we go next (five milestones) · 9 Close.

Pipeline and house design are copied from `../broker-success/onboarding-film/`. The MP4s and build artefacts are git-ignored.

## Rebuild

Needs Node 20+, ffmpeg and Chrome locally; the voice is made on the EMMA VPS because Edge TTS 403s from Jono's laptop.

```sh
# 1. voice on the VPS (throwaway container; tts.py is resumable, so just re-run it if Edge 403s mid-way)
ssh root@76.13.252.92 'mkdir -p /root/statusfilm/build /root/statusfilm/scenes'
scp script.md root@76.13.252.92:/root/statusfilm/ && scp build/tts.py root@76.13.252.92:/root/statusfilm/build/
ssh root@76.13.252.92 'cd /root/statusfilm && docker run --rm -v $PWD:/w -w /w/build -e EDGE_TTS_CHROMIUM=143.0.3650.96 python:3.12-slim \
  sh -c "apt-get update -qq && apt-get install -y -qq ffmpeg && pip install -q edge-tts==7.2.8 && python tts.py"'
scp -r root@76.13.252.92:/root/statusfilm/build/{audio,timings.json} build/
scp root@76.13.252.92:/root/statusfilm/scenes/timings.js scenes/
# 2. render
cd build
npm install                 # puppeteer-core only (or junction node_modules to ../broker-success/calendar-connect-film's)
node render.mjs             # renders every scene, joins them, writes both MP4s + poster.jpg
```

- `node render.mjs --stills [t ...]` writes PNG stills to `build/stills/`; `--only s03 s05` re-renders those clips; `--join` only re-joins.
- Preview a scene: open `scenes/s03.html` and click to play with its voice, or add `?t=12` to freeze at 12 s.
- `tts.py --force` re-voices every scene; otherwise a scene whose spoken text is unchanged keeps its MP3.

## Differences from the onboarding film

- Voice-only spellings in `tts.py` (`SPELL`): n8n "n eight n", CRM "C R M", SortMyCover "Sort My Cover", FSP / VPS / KG spelled out, DMARC "D Mark". Subtitles keep the normal spelling.
- Caption-only rewrites (`CAPTION`): domains spelled out for the voice show as `sortmycover.co.za` / `leadvelocity.co.za`; spoken rand amounts show as R16,500, R750 and R350.
- `film.js` header reads "Status update · 13 Oct 2026 / Where we are" and adds a shared `tick()` helper. `film.css` adds owner badges (`.who.jono/.kg/.claude/.mark`) and an open-step state.
- `render.mjs` overlays `poster.jpg` on frames 0-2 of both MP4s.
