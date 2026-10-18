# Step clip: Confirm your FSP number

31 s, portrait 720x1280, H.264 + AAC, faststart, captions burned in. Voice: Microsoft neural en-US-AndrewNeural,
rate -3%. For brokers, in the portal (/broker-elite): it belongs in the Getting started step "Confirm your FSP number"
(`src/components/broker/GettingStarted.tsx`, step `fsp`), at the top of the panel that "Enter it" / "Edit" opens, above
`FspForm`. That is the same spot the calendar step uses for its film.

What it shows, on a phone running the portal: Getting started (1 of 6 done) → tap **Enter it** → the form opens under
the step with the FSP number filled in from the signed agreement, then Practice name → tap **Save** → the form closes,
the step gets its tick ("FSP 28418 · Your Practice", button **Edit**), 2 of 6 done → what the client's WhatsApp intro
says ("passed to Your Practice (FSP 28418), an authorised financial services provider") → tap **Edit** → later, once
leads are routed, the locked form. Example data only: "Your Practice", FSP 28418 (the form's own placeholder number).

| File | What |
|---|---|
| `script.md` | Narration ("Say") and on-screen content ("Show"), with sources. The source of truth |
| `index.html` | The clip as a page. `?render` = frame mode for the renderer; without it, a small preview player. `#poster` = the designed title card |
| `tts.py` | Voices each Say line: `audio/sNN.mp3` + `timings.js` / `timings.json` (word times, captions) |
| `render.mjs` | Headless Chrome, 30 fps, `window.seek(t)` per frame, ffmpeg -> `out/fsp-720p.mp4` + `out/poster.jpg` |
| `audio/`, `out/`, `node_modules/` | Generated, not in git |

## Rebuild

```sh
# 1. voice (Edge TTS 403s from Jono's laptop: run on the EMMA VPS in a throwaway container; tts.py is resumable)
ssh -i ~/.ssh/emma_vps_ed25519 root@76.13.252.92 'mkdir -p /root/stepclips/fsp'
scp -i ~/.ssh/emma_vps_ed25519 script.md tts.py root@76.13.252.92:/root/stepclips/fsp/
ssh -i ~/.ssh/emma_vps_ed25519 root@76.13.252.92 'cd /root/stepclips/fsp && docker run --rm -v $PWD:/w -w /w -e EDGE_TTS_CHROMIUM=143.0.3650.96 python:3.12-slim \
  sh -c "apt-get update -qq && apt-get install -y -qq ffmpeg && pip install -q edge-tts==7.2.8 && python tts.py"'
scp -i ~/.ssh/emma_vps_ed25519 -r root@76.13.252.92:/root/stepclips/fsp/{audio,timings.js,timings.json} .
# 2. render (needs Chrome + ffmpeg)
npm install && node render.mjs          # node render.mjs --stills 3 17.4 21   for spot checks; --poster for the card only
```

Every visual is a pure function of the clock (no CSS transitions), so frames are exact. Phone state (scroll, panel
open, focus, tick, locked) is computed from spoken-word anchors in `index.html` (`t.enter`, `t.save`, `t.edit`, ...);
tap targets are measured where they sit at the moment of the tap. Change a Say line, re-voice, re-render.

## Verified (13 Oct 2026, release/smc-nurture)

- Step label, detail lines and button: `GettingStarted.tsx:80-85` ("Confirm your FSP number"; "Your agreement lists FSP
  {n}. Check it and save it to your profile."; "FSP {n} · {practice}" once saved; "Enter it" / "Edit"; inline panel).
- Pre-fill: `ProfileForms.tsx:36` (`broker.fsp_number || suggestedFsp`), `suggestedFsp = planState.agreementFsp` =
  `content_data.fsp_number` of the signed agreement (`brokerPlan.ts:41,79`). Practice name from `firm_name` (`:37`).
- Form labels, helper text, Save / Cancel: `ProfileForms.tsx:60-75`. Rule: 3 to 6 digits (`:46`, `brokerProfile.ts:10`,
  server repeats it in `broker_update_profile`, migration `20261012180000`).
- Save closes the panel and the step ticks: `ProfileForms.tsx:49-53` → `GettingStarted.tsx:54` (`saved("fsp")` patches
  the broker and closes the panel) → `done: !!broker.fsp_number`; "N of 6 done" (`:142`).
- Locked while leads are routed: `ProfileForms.tsx:35,69,71` (no Save, "Locked while you receive leads. Ask Lead
  Velocity to change it."), enforced server-side in `broker_update_profile`.
- Clients see FSP with practice: WhatsApp intro templates `automation/lib/w06.mjs:44-46` ("passed to *{practice} (FSP
  {n})*, an authorised financial services provider").
- Phone frame: header (practice, "Bronze plan · awaiting payment"), bottom bar Home / Leads / Appointments / Documents /
  More: `BrokerPortalShell.tsx:19-28,53,96-118,127-145`.

Not said in the narration: the helper line "We check it on the FSCA register" is shown because it is the form's own
copy; the check itself is a Lead Velocity admin step (`brokers.fsp_verified_at`, migration `20261013090000`).
