# Explainer film: "SortMyCover, end to end"

About 6 minutes, 1080p30 H.264 with AAC narration (Microsoft neural en-US-AndrewNeural, rate -3%) and burned-in captions. It shows the system as at 18 October 2026, for Jono:
- the ads (the 4 real reels, the 4:5 feed cuts, Mark's 8 ads);
- the redesigned website (the c750015 build) and the four /learn/ guides;
- the client's WhatsApp journey, using the approved wording;
- the reminders, the cancel flow and the emails (rendered by the production `smc-client-email` template);
- Mark's side, the 15 live n8n workflows, safety and compliance, and what's left before launch.

The film says plainly what isn't live yet: the site upload, 3 reminder templates, WhatsApp alerts, and the desktop Cal.com link.

| File | What |
|---|---|
| `smc-what-we-built-1080p.mp4` | Master (git-ignored) |
| `smc-what-we-built-720p.mp4` | Smaller copy for WhatsApp (git-ignored) |
| `script.md` | Narration ("Say"), on-screen content ("Show") and sources. This is the source of truth. |
| `facts.md` | Fact sheet with a source for every claim (18 Oct 07:30-07:50 SAST), including the gaps found |
| `scenes/sNN.html` | One 1920x1080 page per scene (16). `film.js`/`film.css`/`chat.js` are shared; `timings.js` is generated |
| `build/` | `tts.py` (voice + word timings), `render.mjs` (frames, then ffmpeg), `stills.mjs` (quick stills), `emails.mts` (renders the real client emails), `site-capture/` (site screenshots) |

Pipeline: copied from `../status-film`. Additions:
- `vid()` plays real video, seeking frame-accurately and waiting for the frame to present.
- `chat.js` is a WhatsApp phone-sim with typing dots, buttons, list sheets and taps.
- Embedded emails load through iframes.
- The SortMyCover look (DM Sans, Instrument Serif, `#1F2933` charcoal, `#F5A623` amber, white base) is taken from the site build.

## Rebuild

Needs Node 22+, ffmpeg and Chrome. The voice is made on the EMMA VPS: Edge TTS 403s from Jono's laptop, and the Read Aloud endpoint moved in Oct 2026 (`tts.py` patches edge-tts 7.2.8 to `api.msedgeservices.com`).

```sh
# 1. voice on the VPS (resumable: a scene whose text is unchanged keeps its MP3)
ssh root@76.13.252.92 'mkdir -p /root/smcfilm/build /root/smcfilm/scenes'
scp script.md root@76.13.252.92:/root/smcfilm/ && scp build/tts.py root@76.13.252.92:/root/smcfilm/build/
ssh root@76.13.252.92 'cd /root/smcfilm && docker run --rm -v $PWD:/w -w /w/build -e EDGE_TTS_CHROMIUM=143.0.3650.96 python:3.12-slim \
  sh -c "apt-get update -qq && apt-get install -y -qq ffmpeg && pip install -q edge-tts==7.2.8 && python tts.py"'
scp -r root@76.13.252.92:/root/smcfilm/build/{audio,timings.json} build/
scp root@76.13.252.92:/root/smcfilm/scenes/timings.js scenes/
# 2. render
cd build && npm install && node render.mjs      # every scene, join, both MP4s + poster.jpg
node stills.mjs s06:12 s09:18                   # quick stills of chosen scenes/times
```

## Assets (git-ignored, regenerated)

`scenes/assets/manifest-ads-content.json` and `manifest-site.json` list every file and its source.
- **`ads/`:** the cycle-1 reels and stills, from `EMMA/checklist/creative/ads/cycle1` (commit f2693a0).
  - `ads/sm/` holds 540x960 copies with a keyframe every 6 frames, for fast seeking: `ffmpeg -i reel-X.mp4 -an -vf scale=540:960 -c:v libx264 -crf 22 -g 6 -bf 0`.
- **`content/`:**
  - logos, WhatsApp headers and cards, and the learn images (from the site build and EMMA creative);
  - `email-*.html`, from `node build/emails.mts`;
  - `portal-*.jpg`, the admin preview of Mark's portal.
- **`site/`:** run `node build/site-capture/server.cjs <unzipped build> 8737`, then `node build/site-capture/capture.cjs`. The build is `lv-site/smc-dist-redesign-2026-10-18.zip`, commit c750015.
- **`img/`, `fonts/`:** copied from the site build (`/img`, `/fonts`).
