# Broker onboarding film: "What happens next"

About 3 min 54 s, 1080p30 H.264 with AAC narration (Microsoft neural en-US-AndrewNeural, rate -3%).

| File | What |
|---|---|
| `what-happens-next-1080p.mp4` | Master for email and web |
| `what-happens-next-720p.mp4` | About 10 MB, for WhatsApp and the web (hosted, see Publish) |
| `poster.jpg` | Thumbnail (end of scene 1) |
| `script.md` | Narration ("Say") and on-screen text ("Show"), the source of truth |
| `research-ads.md` | Fact sources for the Meta claims |
| `scenes/sNN.html` | One 1920x1080 page per scene. `film.js`/`film.css` are shared. `timings.js` is generated |
| `build/` | `tts.py` (voice + word timings), `render.mjs` (frames, then ffmpeg) |

## Rebuild

Needs Python with `edge-tts` (7.x, needs internet), Node 20+, ffmpeg and Chrome.

```sh
cd build
npm install                 # puppeteer-core only
python tts.py               # build/audio/sNN.mp3 + timings.json + ../scenes/timings.js
                            # --only s03 s04 re-voices just those scenes and keeps the rest
node render.mjs             # renders every scene, joins them, writes both MP4s + poster.jpg
```

- Edge TTS 403s: Microsoft rejects the Edge version edge-tts pins (7.2.8 pins 143.0.3650.75) and blocks some IPs. Set `EDGE_TTS_CHROMIUM=143.0.3650.96` (worked 12 Oct 2026); if this machine is still refused, run `tts.py` on another host (the 12 Oct narration was voiced on the EMMA VPS in a throwaway `python:3.12-slim` container) and copy back `audio/`, `timings.json` and `../scenes/timings.js`.
- `node render.mjs --stills [t ...]` writes PNG stills to `build/stills/` (default: each scene's midpoint and last frame).
- `node render.mjs --only s03 s05` re-renders those clips, then re-joins. `--join` only re-joins existing clips.
- Chrome path: set `CHROME=...` if it isn't at `C:/Program Files (x86)/Google/Chrome/Application/chrome.exe`.
- Preview a scene in a browser: open `scenes/s03.html` and click to play it with its voice, or add `?t=12` to freeze at 12 s.

## How it works

- `tts.py` reads each scene's **Say** line verbatim from `script.md`. It spells out FSP and FSCA for the voice only and records when each word is spoken. Subtitles show the original wording.
- Each scene is a pure function of time: `window.seek(t)`. There are no CSS animations or wall-clock timers, so every render is identical. Visual beats are keyed to spoken words (`cue('calendar')`), so editing the script and re-running `tts.py` keeps them in sync.
- `render.mjs` screenshots each scene at 30 fps in headless Chrome and pipes the frames straight into ffmpeg (nothing is written to disk). It then joins the scenes with 1 s crossfades and places each scene's MP3 at that scene's start + 1.0 s (speech begins just as the crossfade ends). Loudness is normalised to -16 LUFS.
- To change the copy, edit `script.md`, then run `python tts.py && node render.mjs`. If the "Show" text changed, update the matching `scenes/sNN.html` too.

## Publish

`node build/publish.mjs --env <file with SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY>` uploads the 720p film and poster to the public `marketing-media` bucket (Lead Velocity Supabase, migration `supabase/migrations/20261012_smc_20_marketing_media.sql`) under `broker-onboarding/`, then checks HTTP 200, the content type, size and a range request. Never use `broker-media` for this: it is private and holds broker headshots and no-show proof.

- Video: https://cmsylaupctrbsvzrgzwy.supabase.co/storage/v1/object/public/marketing-media/broker-onboarding/what-happens-next-720p.mp4
- Poster: https://cmsylaupctrbsvzrgzwy.supabase.co/storage/v1/object/public/marketing-media/broker-onboarding/poster.jpg
