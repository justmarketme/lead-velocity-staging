# Step clip: Add your photo and a short bio

About 36 s, portrait 720x1280, H.264 + AAC, faststart, captions burned in. Voice: Microsoft neural
en-US-AndrewNeural, rate -3% (Edge TTS, voiced on the EMMA VPS). For the Getting started step
"Add your photo and a short bio" on /broker-elite.

What it shows, on a phone: Getting started → tap **Add them** → **Your intro card** (More tab) → **Take photo** opens the
phone's camera → photo in the circle, "A headshot" ticked, "New photo ready. Tap Save my intro card to keep it." →
**Choose file** for an existing photo → typing **Two lines about you** (counter to /220, callouts "40 to 220 characters"
and the hint under the box) → **Save my intro card** → "Saving…" → "Saved. Your card updates in a minute." →
**Preview: what the client sees** (the WhatsApp intro card and message). Names, FSP number and bio are fictional.

| File | What |
|---|---|
| `script.md` | Narration ("Say") and on-screen content ("Show"), with sources. The source of truth |
| `index.html` | The film as a page. `?render` = frame mode; `?poster` = title card; without either, a small preview player |
| `tts.py` | Voices each Say line: `audio/sNN.mp3` + `timings.js` / `timings.json`. Spells 40 / 220 out for the voice |
| `render.mjs` | Headless Chrome, 30 fps, `window.seek(t)` per frame, ffmpeg -> `out/intro-card-720p.mp4` + `out/poster.jpg` |
| `audio/`, `out/` | Generated |

## Rebuild

```sh
# 1. voice (Edge TTS 403s from Jono's laptop: run on the EMMA VPS in a throwaway container; tts.py is resumable)
K=~/.ssh/emma_vps_ed25519; V=root@76.13.252.92; D=/root/stepclips/intro-card
ssh -i $K $V "mkdir -p $D" && scp -i $K script.md tts.py $V:$D/
ssh -i $K $V "cd $D && docker run --rm -v \$PWD:/w -w /w -e EDGE_TTS_CHROMIUM=143.0.3650.96 python:3.12-slim \
  sh -c 'apt-get update -qq && apt-get install -y -qq ffmpeg && pip install -q edge-tts==7.2.8 && python tts.py'"
mkdir -p audio && scp -i $K $V:$D/audio/s01.mp3 $V:$D/audio/s02.mp3 audio/ && scp -i $K $V:$D/timings.js $V:$D/timings.json .
# 2. render (needs Chrome + ffmpeg)
npm install && node render.mjs               # node render.mjs --stills 5.2 22.3   spot checks; --poster   poster only
```

Every visual is a pure function of the clock (no CSS transitions). Elements name the spoken word they react to
(`data-at`, `data-until`, `data-click` = tap, `data-point` = finger rests); `data-s="s02"` binds a phone element to a
scene, and `s02:Save+0.7` names a word in another scene. The phone keeps its state across scenes; `data-scroll` and
`data-zoom` keyframes move the content and the camera. Change a Say line, re-voice, re-render.

## Verified (13 Oct 2026, release/smc-nurture)

- `src/components/broker/GettingStarted.tsx`: step "Add your photo and a short bio", detail "Clients see these when they
  book a call with you.", button "Add them" opens the intro tab; done = headshot saved and bio of 40+ characters.
- `src/components/broker/BrokerPortalShell.tsx`: tab "Your intro card" is under **More** in the phone bottom bar.
- `src/components/broker/smc/IntroCardEditor.tsx`: title, description, status "Almost there. Finish the items below.",
  checklist labels, field labels and hints, 40 to 220 characters (`save()` check + `maxLength={220}`), counter,
  "Save my intro card", "Saving…", "Saved. Your card updates in a minute.", preview copy (template `broker_intro_booked`).
- `src/components/broker/smc/HeadshotPicker.tsx`: "Take photo" opens the front camera on phones (`capture="user"`), a
  webcam dialog on computers; "Choose file" opens the photo picker. `src/lib/imagePrep.ts`: any photo becomes a JPEG
  of at most 1600 px ("Any photo works; we resize it").
- The phone's camera screen is a generic camera, labelled "Your phone's camera": each phone's own app looks different.
