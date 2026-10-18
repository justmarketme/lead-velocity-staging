# Step clip: Confirm your business WhatsApp number

About 33 s, portrait 720x1280, H.264 + AAC, faststart, captions burned in. Voice: Microsoft neural
en-US-AndrewNeural, rate -3%. For brokers, in the portal's Getting started checklist, step 5 of 6
(`src/components/broker/GettingStarted.tsx`, the `whatsapp` step; its panel is `WhatsAppForm` in `ProfileForms.tsx`).

What it shows, on a phone running the portal Dashboard:
1. **Confirm the number we suggest.** The step reads "Is +27 82 123 4567 your business WhatsApp? New leads and bookings
   are sent to it." Tap Confirm, the panel opens (number, Confirm, Use another number), tap Confirm: the step is ticked,
   "New leads and bookings reach you on ...", the button becomes Change, and the count goes from 2 to 3 of 6.
2. **Use another number.** Tap Use another number, the "Business WhatsApp number" field, type, Save, ticked. South
   African numbers only. Later, while he receives leads: tap Change, "Locked while you receive leads. Ask Lead Velocity
   to change it."

The numbers on screen are illustrations (the form's own example, +27 82 123 4567, and +27 71 234 5678), and so are
"Your practice" and the paid date on step 2.

| File | What |
|---|---|
| `script.md` | Narration ("Say") and on-screen content ("Show"), with sources. The source of truth |
| `index.html` | The clip as a page. `?render` = frame mode; `?render&poster` = the title card; without either, a preview player |
| `tts.py` | Voices each Say line: `audio/sNN.mp3` + `timings.js` / `timings.json` (word times, captions). Same as the reference film |
| `render.mjs` | Headless Chrome, 30 fps, `window.seek(t)` per frame, ffmpeg -> `out/whatsapp-720p.mp4` + `out/poster.jpg` |
| `audio/`, `out/`, `node_modules/` | Generated, not in git |

## Rebuild

```sh
# 1. voice (Edge TTS 403s from Jono's laptop: run on the EMMA VPS in a throwaway container; tts.py is resumable,
#    and a 403 there usually clears on a second run)
ssh -i ~/.ssh/emma_vps_ed25519 root@76.13.252.92 'mkdir -p /root/stepclips/whatsapp'
scp -i ~/.ssh/emma_vps_ed25519 script.md tts.py root@76.13.252.92:/root/stepclips/whatsapp/
ssh -i ~/.ssh/emma_vps_ed25519 root@76.13.252.92 'cd /root/stepclips/whatsapp && docker run --rm -v $PWD:/w -w /w \
  -e EDGE_TTS_CHROMIUM=143.0.3650.96 python:3.12-slim \
  sh -c "apt-get update -qq && apt-get install -y -qq ffmpeg && pip install -q edge-tts==7.2.8 && python tts.py"'
scp -i ~/.ssh/emma_vps_ed25519 -r root@76.13.252.92:/root/stepclips/whatsapp/{audio,timings.js,timings.json} .
# 2. render (needs Chrome + ffmpeg)
npm install && node render.mjs          # node render.mjs --stills 8 21  for spot checks; --poster for the card only
```

Every visual is a pure function of the clock (no CSS transitions). Elements name the word they react to
(`data-at="Save.+0.55"`, `data-until=`, `data-click=` for the tap, `data-type=` for typing, `data-scroll=` for the
phone's scroll); change a Say line, re-voice, re-render.

## Verified (13 Oct 2026, release/smc-nurture)

- Step label, the suggestion and both detail lines, the Confirm / Change button, done = number + confirmed date:
  `GettingStarted.tsx` 61-63, 92-97.
- Suggestion = the WhatsApp number on record, else his phone number on record: `GettingStarted.tsx` 63,
  `ProfileForms.tsx` 85-86.
- Panel: number + Confirm + Use another number; form "Business WhatsApp number", placeholder +27 82 123 4567,
  Save, Cancel; the field starts with the suggested number: `ProfileForms.tsx` 88, 111-129.
- South African numbers only ("Use a South African number, e.g. +27 82 123 4567."): `ProfileForms.tsx` 97;
  `brokerProfile.ts` 13-19; server rule in `20261012180000_broker_self_service.sql` 41-46.
- Saving stamps `whatsapp_confirmed_at` and the panel closes: migration 57-63, `GettingStarted.tsx` 54.
- Locked while receiving leads: `ProfileForms.tsx` 107 (copy), migration 49-55 (the server refuses a change).
- New bookings go to this number: `automation/lib/w05.mjs` 726 (`broker_new_booking`), `adviser_whatsapp` is
  generated from `whatsapp_number` (`20261011020000_smc_02_core.sql` 126).
- Phone layout: Getting started checklist first on phones, bottom bar Home / Leads / Appointments / Documents / More:
  `GettingStarted.tsx` 200-201, `BrokerPortalShell.tsx` 19-27, 127-145.

Not shown, because they did not need showing: the same form under More > Your details ("Where we reach you"), and
the "Saved." message, which the step's panel closes over.
