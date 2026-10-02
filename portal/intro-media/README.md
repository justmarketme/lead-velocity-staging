# Step 5: Record your intro (portal prototype)

Static, phone-first, no framework, no build. Templatised from the approved design `docs/design/record-your-intro.html` (copy, order, component shapes unchanged). Owner: `intro-media-producer` (4.10b/4.10c).

| File | Screen (design letter) |
|---|---|
| `index.html` | A: why in 40 s, explainer slot, fictional example slot (labelled Example), Start / audio only / Skip for now |
| `interview.html` | B: 8 questions, one per screen, typed or spoken (MediaRecorder audio, transcribed server side), example under each |
| `scripts.html` | C: three script cards, free editing, live FAIS gate status, pick one |
| `record.html` | D: camera preview, checklist overlay with the reason per line, teleprompter, 3-2-1, MediaRecorder video or audio, playback, 3 takes side by side, instant checks, audio-only toggle, upload fallback, "WhatsApp it to us" QR/link slot |
| `approve.html` | E: pick a take, WhatsApp message mock (the real `intro_media` / `intro_media_voice` template wording), Approve, record another language |
| `app.js`, `step.css` | all logic / styles. `step.css` imports `../../brand/tokens.css` |

Try it: `python3 -m http.server` from the repo root, open `/portal/intro-media/index.html?mock=1` on a phone (HTTPS or localhost is needed for camera access). `?mock=1` uses an offline fake server and a fictional adviser (Mark Williams, FSP 00000); `?mock=0` leaves it. Without `?mock`, calls go to `/intro/*` (same origin, magic-link session cookie).

Eight questions, not ten: the ten prompts in 4.10 are folded into the eight the approved design promises ("where you're from" + languages share one; "years and why" + the personal detail share one).

## API contract to n8n (portal back end proxies these to the W23 webhooks; all JSON, session cookie auth, broker id comes from the session, never from the client)

**`POST /intro/interview`**
- Answer: `{question_id, text}` -> `{ok:true}`
- Voice answer: `multipart/form-data` `question_id`, `audio` (m4a or webm) -> `{text}` (transcribed; the broker can edit it)
- Complete: `{complete:true, language, languages_spoken}` -> `{ok:true}`. Triggers script generation (Sonnet, then the FAIS gate, `deliverables/intro-media/script-prompt.md` + `rubric.md`); answers are saved to `brokers.positioning_answers`. Voice audio is deleted after transcription.

**`POST /intro/script-select`**
- `{script_id, text, edited, language, gate_only?}` -> `{pass:boolean, checks:[{id, ok, msg, fix}], message?}`
- `gate_only:true` is the live re-check while editing (no state change). Without it, a `pass:true` stores the chosen script (`broker_media.script_text`) and unlocks recording. The server gate is authoritative; the browser runs a lighter copy of the same rubric for instant feedback. Recording never unlocks on a browser pass alone.

**`POST /intro/upload`** (two calls, signed upload to object storage on the VPS)
1. `{filename, mime, size, kind:"video"|"audio", language, take_no, duration_s, client_checks, script_text}` -> `{take_id, object_key, upload_url, method:"PUT", headers, expires_at}`
2. The browser `PUT`s the blob to `upload_url`, then `{confirm:true, take_id, object_key}` -> `{ok:true}`. The portal back end then calls W23 `POST /webhook/w23-portal-upload` (header auth) with `{broker_id, take_id, object_key, kind, language, mime, duration_s, script_text}`.
- Size cap 200 MB raw (W23 compresses the output to <= 16 MB). Take limit is 3 per language, enforced in the UI and again by the server.

**`GET /intro/status`** -> 
```
{ step, broker:{first_name,name,practice,fsp}, explainer_url, example_url,
  scripts:[{id,label,text}], generating:boolean,
  takes:[{take_id, state:"processing"|"ready"|"rejected", kind, reason?, preview_url?, thumbnail_url?, voice_url?, ai_check}],
  approved:{at,take_id}|null, show_rate:{with,without,n}|null,
  whatsapp_capture:{number, link, qr_url} }
```
State comes from `broker_media.ai_check->>'state'` (W23 writes `processing`, then `ready` or `rejected` with the reason). `show_rate` is returned only once the broker has 20 bookings.

**`POST /intro/approve`** (not in the original four; needed for step 7) `{take_id, language, script_text}` -> `{ok:true}`. The back end calls W23 `POST /webhook/w23-approve`, which makes the take current, updates `brokers.intro_video_url` / `intro_voice_url` (jsonb per language, previous versions stay in `broker_media`), marks the onboarding step done, and alerts compliance-qa for the first-per-broker spot check.

## Checks in the browser (heuristics, coaching only; the server check is authoritative)
Face found and centred (`FaceDetector` where the browser has it, else a skin-tone mass estimate, which is cruder and says "can't see your face" rather than guessing); brightness on the face and a backlight test (background much brighter than face); voice level, noise floor (10th percentile of the level while recording) and clipping from the Web Audio analyser; duration 15 to 40 s. Each failed check shows one plain-English fix. Thresholds live at the top of the `judge*` functions in `app.js` and mirror `automation/media/check.js` (`LIMITS`).

## Browser notes
- **iOS Safari (14.3+)**: `MediaRecorder` records `video/mp4` (H.264 + AAC) and `audio/mp4`; the page picks the first supported type. Camera needs HTTPS and a tap (the Start camera button is the tap). `FaceDetector` is not available, so the skin-tone fallback runs. Hold-to-talk is unreliable on iOS, so voice answers are tap to start, tap to stop. Safari may re-ask for camera permission on each page load; recording stays on one page (`record.html`) for that reason. Keep the screen awake while recording.
- **Android Chrome**: records `video/webm` (VP9 or VP8 + Opus); `FaceDetector` available on current builds. W23 transcodes everything to H.264 MP4.
- **Fallback**: if `MediaRecorder` or the camera is missing or blocked, an upload button appears (`<input type=file accept="video/*,audio/*" capture="user">`, which opens the phone camera app). The upload goes through the same duration check, signed upload and W23 checks. The "WhatsApp it to us" path is the other fallback: W23 reads the video from a known broker number.
- Teleprompter pace is 2.6 words/s (about 155 wpm); the script's reading time is shown against the 20 to 30 s target. The prompter is a page overlay, so it is never in the recording.
- Blobs for the three takes live in IndexedDB so a page change (record -> approve) does not lose them. Nothing is stored in cookies. Camera tracks are stopped on `pagehide`.

## Open items for other agents
- `brand/tokens.css` has no status or WhatsApp-mock colours; `step.css` defines `--ok`, `--warn`, `--bad`, `--info-bg` and `--wa-*` locally (visual-producer to promote or reject).
- Media files `media/explainer.mp4`, `media/explainer-poster.jpg`, `media/example-adviser.mp4` are slots; the page shows a labelled placeholder until they exist. Source: `deliverables/intro-media/explainer-storyboard.md`. Serve `brand/` next to `portal/` (or copy `tokens.css` + `fonts/`) so the `@import` resolves.
- Accessibility: all buttons are real buttons with labels, notes use `aria-live`, colour is never the only signal (text accompanies every tick or warning), tap targets >= 44 px, `prefers-reduced-motion` and dark mode follow the tokens.
