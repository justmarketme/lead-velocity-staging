# Broker film: Connect your Outlook calendar

About 2 min 24 s, portrait 720x1280, H.264 + AAC, faststart, captions burned in. For brokers, shown in the portal
next to "Connect my Outlook calendar" (`src/components/broker/smc/CalendarHowToVideo.tsx`; URLs in
`src/lib/brokerMedia.ts`, empty until uploaded). Voice: Microsoft neural en-US-AndrewNeural, rate -3%.

| File | What |
|---|---|
| `script.md` | Narration ("Say") and on-screen content ("Show"), with sources. The source of truth |
| `index.html` | The film as a page. `?render` = frame mode for the renderer; without it, a small preview player |
| `tts.py` | Voices each Say line: `audio/sNN.mp3` + `timings.js` / `timings.json` (word times, captions) |
| `render.mjs` | Headless Chrome, 30 fps, `window.seek(t)` per frame, ffmpeg -> `out/connect-outlook-calendar-720p.mp4` + `out/poster.jpg` |
| `audio/`, `out/` | Generated, not in git |

## Rebuild

```sh
# 1. voice (Edge TTS 403s from Jono's laptop: run on the EMMA VPS in a throwaway container; tts.py is resumable)
scp script.md tts.py root@76.13.252.92:/root/brokerfilm/
ssh root@76.13.252.92 'cd /root/brokerfilm && docker run --rm -v $PWD:/w -w /w -e EDGE_TTS_CHROMIUM=143.0.3650.96 python:3.12-slim \
  sh -c "apt-get update -qq && apt-get install -y -qq ffmpeg && pip install -q edge-tts==7.2.8 && python tts.py"'
scp -r root@76.13.252.92:/root/brokerfilm/{audio,timings.js,timings.json} .
# 2. render (needs Chrome + ffmpeg)
npm install && node render.mjs                # node render.mjs --stills 12 70  for spot checks
```

Every visual is a pure function of the clock (no CSS transitions), so frames are exact. Elements name the word
they appear on (`data-at="Accept."`, `data-until=`, `data-click=` for the pointer tap); change a Say line, re-voice,
re-render.

## Verified / not verified (13 Oct 2026)

Code: scopes and tenant (`ms-oauth/lib.mjs`), card copy and states (`OutlookConnectCard.tsx`), free/busy only
(`w04.mjs` getSchedule), event in the broker's calendar with the client as attendee so the invite comes from his
mailbox (`w05.mjs`, since f443eed; howzit@ is only the fallback), move/cancel (W10 PATCH/DELETE), Disconnect deletes
the stored refresh token (`smc_ms_disconnect`). Microsoft Learn/Support: admin consent page ("Permissions requested",
"Accept for your organization"), revoking via My Apps (myapplications.microsoft.com > ... > Manage your application >
Revoke Permissions). Shown as "may look slightly different": the account-picker title, the per-permission lines and
the "Need admin approval" body text, which Microsoft documents only in screenshots.
