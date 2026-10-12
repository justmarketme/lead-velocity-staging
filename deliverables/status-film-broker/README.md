# Broker film: "Where we are" (shareable with any broker)

A generic, shareable version of the internal status film, to be sent on WhatsApp to any broker, "as and when". Narration in Microsoft neural en-US-AndrewNeural (rate -3%), same voice and house design as `../status-film/` and `../broker-success/onboarding-film/`. The internal film in `../status-film/` is untouched.

Status of this folder: **script and sources are done; scenes and render are not built yet.**

| File | What |
|---|---|
| `script.md` | Narration ("Say") and on-screen text ("Show"). 8 scenes, 539 spoken words, about 3 min 30 s (estimate, see below; keep the script at or under about 540 words). Source of truth. |
| `sources.md` | For every factual sentence, the file that supports it, plus the facts that could not be fully supported. Read its last section before sending the film. |
| `build/tts.py` | Voice, word timings and subtitle cues. Adapted for this film (see below). |
| `build/render.mjs` | Frames from `scenes/sNN.html`, then ffmpeg. Output name `lead-velocity-where-we-are-1080p.mp4` / `-720p.mp4` plus `poster.jpg`. |
| `scenes/film.js`, `film.css`, `assets/` | Shared runtime and styles. The header reads "For brokers / Where we are" and carries no date. |
| `scenes/_internal-reference/` | The eight scene pages of the **internal** film, copied only as a layout starting point. They contain internal content (names, an invoice number, internal to-dos). Do not render them, do not ship them, and rewrite every word before reuse. Delete the folder once the eight new scene pages exist, and before any `git add` or zip (this whole folder is untracked). |

## Wording rules this film follows

"We" and "you", no names of people, clients or competitors, no fee amounts (the pricing page is the source), no FSP numbers, no secrets, no internal numbers or to-dos, no withdrawn plan, no negotiated terms, honest status (built, in final set-up, still being finished, not switched on yet; lead delivery has not started), no guarantees. Honest status means scene 6 separates the two pieces in final set-up from the three still being finished, and says the system is not switched on yet. Scenes 5 and 6, the "runs the ads" phrase in scene 1 and the "once it's switched on" phrase in scene 7 date: re-cut them when the system is live. Scenes 3 and 4 state the terms of the lead generation agreement v0.2 (still a draft for practitioner review): re-check them when v0.2 is approved, and have the founder confirm that approval before the first send.

## Changes to the pipeline copied from `../status-film/build/`

- `tts.py` SPELL: FSP is said "F S P" and FSCA "F S C A" (the internal film's n8n and CRM spellings were dropped; they are not used here).
- `tts.py` CAPTION: spoken amounts show as R1,500, R750 and R1,499; "twenty-five second" shows as 25-second; "October twenty twenty-six" shows as October 2026; domains show as `leadvelocity.co.za`.
- `tts.py` cue splitting now measures the caption as it will be shown (so "R750 to R1,499" is not split across two cues) and treats hyphenated numbers such as "ninety-nine" as number words.
- `render.mjs`: output name only.
- `film.js`: header text only.

## Rebuild (once the scenes exist)

Needs Python with `edge-tts` (7.x, needs internet), Node 20+, ffmpeg and Chrome.

```sh
cd build
npm install                 # puppeteer-core only
python tts.py               # build/audio/sNN.mp3 + timings.json + ../scenes/timings.js
node render.mjs             # renders every scene, joins them, writes both MP4s + poster.jpg
```

Scene pages `scenes/s01.html` to `s08.html` still have to be written from the "Show" lines in `script.md` (copy the structure of `../status-film/scenes/s01.html`, keep the `data-scene` attribute, use `cue('word')` to time visuals to spoken words).

## Known blocker on 10 Oct 2026

`python tts.py` could not run on this machine today: Microsoft's free Edge speech endpoint answered `403 Invalid response status` to every request (edge-tts 7.2.8, the latest release; a newer Chromium version string did not help, the clock is correct). The film's runtime is therefore an estimate from the internal film's measured rate (430 words took 158.2 s of speech at this voice and rate, 2.72 words a second, plus 1.3 s per scene and 1 s once for the scene lead-in and crossfades). Retry later or from another network; if it keeps failing, the same voice is available through Azure Speech (en-US-AndrewNeural), which needs a key and is not wired into this pipeline.
