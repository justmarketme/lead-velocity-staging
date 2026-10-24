# Microsoft calendar setup film (for Jono)

An in-browser film: what Jono does once in Microsoft Entra so brokers (first: Mark, Oracle Brokers) can tap
**Connect my Outlook calendar**. Ten scenes, tappable mock screens, captions, chapters, synced narration
(Microsoft neural en-US-AndrewNeural, rate -3%).

| File | What |
|---|---|
| `index.html` | The whole film: page, styles, player. Open it next to `timings.js`, `logo.png` and `audio/` |
| `script.md` | Narration ("Say") and on-screen content ("Show"), with sources. The source of truth |
| `tts.py` | Voices every Say line: `audio/sNN.mp3` + `timings.js` / `timings.json` (word times, captions) |
| `timings.js` | Generated. Committed so the page works without re-voicing |
| `audio/` | Generated MP3s. Not in git (`.gitignore`); rebuild with `tts.py` |

## Rebuild the voice

Edge TTS returns 403 from Jono's laptop, so voice it on the EMMA VPS in a throwaway container:

```sh
scp script.md tts.py root@76.13.252.92:/root/msfilm/
ssh root@76.13.252.92 'cd /root/msfilm && docker run --rm -v $PWD:/w -w /w -e EDGE_TTS_CHROMIUM=143.0.3650.96 python:3.12-slim \
  sh -c "apt-get update -qq && apt-get install -y -qq ffmpeg && pip install -q edge-tts==7.2.8 && python tts.py"'
scp -r root@76.13.252.92:/root/msfilm/{audio,timings.js,timings.json} .
```

The free endpoint 403s after a few requests. `tts.py` is resumable: re-run it and it keeps every scene whose
spoken text is unchanged and whose MP3 exists (`--force` re-voices all). Edit a Say line, re-run, and only that
scene is re-voiced.

## How the sync works

Each on-screen element names the spoken word it appears on: `data-at="Register"` (first time the word is said),
`data-at="Add#2+0.5"` (second "Add", plus half a second), `data-until=` hides it again, `data-type=` types text,
`data-click=` moves the pointer there and taps. Tapping any of those elements in the film jumps to that moment.
Change the words in `script.md` and the scenes follow the new timings with no other edits, as long as the anchor
words are still said.

## What was verified, and what wasn't

Checked 13 Oct 2026 against Microsoft Learn (register app, redirect URI, credentials, delegated permissions,
branding, publisher verification, admin consent) and the code (`supabase/functions/ms-oauth`, `OutlookConnectCard`,
`automation/lib/w01.mjs`, `w04.mjs`, `w05.mjs`, `W10.json`). Not confirmed in Microsoft's docs, shown as they
usually appear: the client-secret expiry options, the consent screen's per-permission lines for normal users,
the "Pick an account" title, and the Branding field labels. The booking workflows W01 to W10 are built but
inactive (pending gate test); the film says so.
