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

Try it: `python3 -m http.server` from the repo root, open `/portal/intro-media/index.html?mock=1` on a phone (HTTPS or localhost is needed for camera access). `?mock=1` (tab-session only, not sticky) uses an offline fake server and a fictional adviser (Mark Williams, FSP 00000); `?mock=0` leaves it. Without `?mock`, calls go to `<data-api>/...` with `Authorization: Bearer <Supabase access token>` (I-32a; no cookie). Run `VITE_N8N_WEBHOOK_BASE=https://<base>/webhook VITE_SUPABASE_PROJECT_ID=<ref> node portal/intro-media/inject-api.mjs [outDir]` at build to bake `data-api="<base>/intro"` (and `data-sb-key`) into the five pages.

Eight questions, not ten: the ten prompts in 4.10 are folded into the eight the approved design promises ("where you're from" + languages share one; "years and why" + the personal detail share one).

## API contract to n8n (I-32a: the browser calls `{API_BASE}/intro/...` directly, `API_BASE` = `VITE_N8N_WEBHOOK_BASE`; all JSON; `Authorization: Bearer <Supabase access token>` read from the portal session in localStorage `sb-<ref>-auth-token` (same origin as the portal, nothing in the URL); n8n verifies HS256 with `SUPABASE_JWT_SECRET` and takes the broker from `brokers.user_id = sub`, never from the client. Token missing/expired -> the page says to open the portal and come back. Built in W23: `upload-confirm` and `approve`. All five now exist in W23 (I-37a), each behind its own "Verify broker JWT" node: `GET status`, `POST interview`, `POST script-select`, `POST upload` (signed URL), `POST upload-confirm`, `POST approve`. Still not built: voice-answer transcription (interview is typed only), the cost log (`ops.costs`) for the LLM calls; `script-generate` and `script-recheck` are in W23 below)

**`POST /intro/interview`**
- Answer: `{question_id, text}` -> `{ok:true}`
- Voice answer: `multipart/form-data` `question_id`, `audio` (m4a or webm) -> `{text}` (transcribed; the broker can edit it)
- Complete: `{complete:true, language, languages_spoken}` -> `{ok:true}`. Triggers script generation (Sonnet, then the FAIS gate, `deliverables/intro-media/script-prompt.md` + `rubric.md`); answers are saved to `brokers.positioning_answers`. Voice audio is deleted after transcription.

**`POST /intro/script-select`**
- `{script_id, text, edited, language, gate_only?}` -> `{pass:boolean, checks:[{id, ok, msg, fix}], message?}`
- `gate_only:true` is the live re-check while editing (no state change). Without it, a `pass:true` stores the chosen script (`broker_media.script_text`) and unlocks recording. The server gate is authoritative; the browser runs a lighter copy of the same rubric for instant feedback. Recording never unlocks on a browser pass alone.

**`POST /intro/upload`** (two calls, signed upload to object storage on the VPS)
1. `{filename, mime, size, kind:"video"|"audio", language, take_no, duration_s, client_checks, script_text}` -> `{take_id, object_key, upload_url, method:"PUT", headers, expires_at}`
2. The browser `PUT`s the blob to `upload_url`, then `POST /intro/upload-confirm` `{take_id, object_key, kind, language, mime, duration_s, script_text}` -> `200 {ok:true,state:"processing"}` (`401` bad/missing token, `403` no broker for this user). This is W23 webhook path `intro/upload-confirm`; no broker id is sent.
- Size cap 200 MB raw (W23 compresses the output to <= 16 MB). Take limit is 3 per language, enforced in the UI and again by the server.

**`GET /intro/status`** -> 
```
{ step, broker:{first_name,name,practice,fsp}, explainer_url, example_url,
  scripts:[{id,label,text}], generating:boolean,
  takes:[{take_id, state:"processing"|"ready"|"rejected", kind, reason?, preview_url?, thumbnail_url?, voice_url?, ai_check}],
  approved:{at,take_id}|null, show_rate:{with,without,n}|null,
  whatsapp_capture:{number, link, qr_url} }
```
State is `broker_media.state`, a generated column (never written): `approved`/`superseded` from `approved_at` + `is_current`, else `ai_check->>'state'` (W23 writes `processing`, then `ready` or `rejected` with the reason), else `processing` while `url` is null. `url` is null until the take is ready. `show_rate` is returned only once the broker has 20 bookings.

**`POST /intro/approve`** (not in the original four; needed for step 7) `{take_id, language, script_text}` -> `{ok:true}`. W23 webhook path `intro/approve` (JWT-gated; broker and `approved_by` both come from the token's `sub`, so the body carries no ids but `take_id`; `401`/`403` as above, `403 nothing_to_approve` if no ready take of this broker matches), which makes the take current, updates `brokers.intro_video_url` / `intro_voice_url` (jsonb per language, previous versions stay in `broker_media`), marks the onboarding step done, and alerts compliance-qa for the first-per-broker spot check.

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
- Explainer (built, S7-06): `assets/explainer/explainer_1x1.mp4` (in-page, 1080x1080), `explainer_9x16.mp4` (1080x1920; full-screen on phones and the WhatsApp send), `explainer-poster.jpg`, `explainer.srt`, `explainer-vo-script.txt`, `manifest.json` (row to timestamp map). Silent, captions burned in; voice-over is a separate asset. Rebuild: `node portal/intro-media/assets/explainer/src/build.mjs`. `media/example-adviser.mp4` is still a slot; the page shows a labelled placeholder until it exists. Source: `deliverables/intro-media/explainer-storyboard.md`. Serve `brand/` next to `portal/` (or copy `tokens.css` + `fonts/`) so the `@import` resolves.
- Accessibility: all buttons are real buttons with labels, notes use `aria-live`, colour is never the only signal (text accompanies every tick or warning), tap targets >= 44 px, `prefers-reduced-motion` and dark mode follow the tokens.


## I-37a: how the W23 endpoints behave
- **`GET /intro/status`**: read-only; `step` is `interview` -> `scripts` (candidates exist) -> `record` (script chosen). Only gate-passed candidates are returned. `takes` come from `broker_media` (`preview_url` is the stored object path; a signed read URL is not minted here). `whatsapp_capture.number` comes from env `WA_CAPTURE_NUMBER` (digits).
- **`POST /intro/interview`**: typed answers only (`{question_id:[a-z_]{2,16}, text<=2000}`), merged into `brokers.positioning_answers.answers`; `{complete:true,language,languages_spoken}` stamps `interview_complete_at`. No LLM call. A voice (multipart) answer is not transcribed here.
- **`POST /intro/script-select`**: selects `script_id` among gate-passed candidates and stores it as `positioning_answers.chosen_script`. It never generates. `gate_only` never stores. Edited text (`edited:true`) returns `pass:false` with a "needs checking" note, because re-gating edits belongs to conversation-designer's gate; the recorder shows that message.
- **`POST /intro/upload`** (phase 1): validates kind/mime/size (<= 200 MB), builds `object_key = <broker uuid>/<language>/<take_id>.<ext>` itself, and asks Supabase Storage for a signed upload URL in the private `broker-media` bucket using n8n credential `Supabase Storage (service role)` (name only). Returns `{take_id, object_key, upload_url, method:"PUT", headers, expires_at}`.
- **`POST /intro/upload-confirm`**: `403` unless `object_key` starts with the caller's broker uuid + `/` (no `..`); W23 downloads from `broker-media` (env `INTRO_RAW_BUCKET` overrides). Env: `SUPABASE_URL`.

## I-40i: script-generate and script-recheck (W23)
Contract: `conversation/prompts/intro-script.md`, `deliverables/conversation-designer/intro-script-generator.md`. Logic: `automation/media/intro-script.mjs` (the Code nodes import it from `$env.REPO_DIR`, as W07 does). LLM calls send `x-api-key` from `$env.ANTHROPIC_API_KEY`, models from `ANTHROPIC_MODEL_STRONG` / `ANTHROPIC_MODEL_FAST` (defaults `claude-sonnet-5-5` / `claude-haiku-4-5-20251001`).
- **`POST /intro/script-generate`** `{lang}`: `409 interview_incomplete` unless `positioning_answers.interview_complete_at` is set; `429` within 1 h of the last generation. One Sonnet call per angle (`who_i_help`, `what_happens`, `personal`), then `scriptCheck` (free, deterministic), then the Haiku gate (user turn fenced by `classifierInput()`, fails closed; a pass below 0.8 confidence is re-checked on Sonnet). A failed variant is regenerated once. Always exactly three `{id,label,angle,text,gate_pass,rule,issues}` (`v1..v3`), plus an `example` item when none pass. Stored in `brokers.positioning_answers.script_candidates` (and clears any earlier `chosen_script`). Response `{variants}`; the recorder only shows `gate_pass` ones (status filters the same way). The scripts page triggers it once when status lists no scripts.
- **`POST /intro/script-recheck`** `{text<=1500, lang, choose?}` -> always `200 {pass, rule, issues, warnings, verdict}`. Fails closed: a gate error or timeout is `{pass:false, rule:"gate_unavailable"}`; a language other than en/af is `rule:"review"`. With `choose:true` and `pass`, stores `chosen_script` `{id:'custom', text, language, checked_at, gate_version}`. The recorder uses this for live re-checks and for picking an edited script (an unedited pick still goes through `script-select`).
- Both sit behind their own "Verify broker JWT" node; broker = `brokers.user_id = sub`. Unverified until a staging run: the Merge node (append) after the retry loop must emit when the retry input is empty.
