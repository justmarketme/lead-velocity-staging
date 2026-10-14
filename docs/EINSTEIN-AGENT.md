# Einstein: Lead Velocity website voice agent

Einstein is the voice and text chat bubble on the **public** leadvelocity.co.za pages. He answers questions from the website and steers every visitor toward one call to action:

1. **Primary:** book a 15-minute call (Cal.com event 7456888).
2. **Secondary:** a WhatsApp tap-to-chat link plus a call-back.

He never appears in the broker portal, admin, console or auth pages.

| | |
|---|---|
| ElevenLabs agent | `agent_2501m4s6nhfveywrvw9961va7sp3` ("Einstein-77 (Lead Velocity)"), visible in Jono's ElevenLabs dashboard |
| LLM | `glm-52`, hosted by ElevenLabs. Never Gemini or OpenAI. Temperature 0.3 |
| Voice | **Einstein - Younger D (50s)** `hqcrZxSL16M3vTD4fiT0`, made with ElevenLabs Voice Design on 14 Oct 2026 (prompt: German man, 55, deep warm voice, kind thoughtful engineer-turned-professor, strong German accent, steady pace, clear and vigorous, mature but not elderly, smooth with no tremor). Replaced Professor A (`CPXhqKTBUlO7LO3RX202`, "elderly professor") because Jono found it too old; Professor A had replaced Helmut on 13 Oct because Jono heard Helmut as Afrikaans |
| TTS | Eleven v4 Turbo (`eleven_v4_turbo`), Expressive Mode on, stability 0.8 (stops accent drift), similarity 0.85, speed 0.98, ElevenLabs text normalisation |
| Persona source | `supabase/functions/_shared/einstein_persona.ts` (branch `release/smc-nurture`) |
| Turn length | Target under 50 words, hard cap 65 words per turn (persona rule 1 + `short_turns` evaluation) |
| Typed chat | The bubble's text box runs the **same agent in text-only mode** (`@elevenlabs/client` `Conversation.startSession({ signedUrl, textOnly: true })` in `src/hooks/useChatbot.ts`). Same persona, KB and tools as voice. The agent allows exactly one override, `conversation.text_only`. During a voice session, typed text goes into the live voice conversation. `einstein-ai` (Gemini/OpenRouter) is no longer used by the bubble |
| Config-as-code | `supabase/functions/einstein-agent/index.ts`. `sync-voice-agents` no longer touches Einstein |
| Widget | `src/components/ChatBot.tsx` (branch `release/smc-nurture`), mounted in `App.tsx` |
| Prompt overrides | **Off.** The site sends no prompt or first message, so the dashboard shows what actually runs. Only `text_only` may be overridden |

## Voice: candidates (to swap by ear)

**14 Oct 2026 round: make him younger.** Jono said Professor A (an "elderly professor" design) was a bit too old. Five new Voice Designs were made for a German man in his 50s, then compared with Professor A, Professors B and C, and 14 native German library voices reading Einstein's English. Everything was rendered through `eleven_v4_turbo` at stability 0.8 (the live settings). Each listening file holds three lines in a row: the real greeting, a plain-English line full of accent-revealing sounds (w, th, v, "Thursday"), and a witty line with a `[chuckles]` tag. Samples are in `C:/tmp/einstein-voices-v3/` (`0-` to `13-` mp3s; per-line renders in `renders/` and `native/`).

| # | Voice | ID | File |
|---|---|---|---|
| 1 (live) | **Einstein - Younger D (50s)** (Voice Design, strong accent, steady) | `hqcrZxSL16M3vTD4fiT0` | `1-Younger-D-LIVE.mp3` |
| 2 | Einstein - Younger A (50s) ("clear German accent", coordinator's wording, smoothest voice) | `Ga9NjiruIWOmcPz6aeit` | `2-Younger-A.mp3` |
| 3 | Einstein - Younger B (50s) (distinguished lecturer, "unmistakable" accent) | `TigEqOIz9jt72hnrVid2` | `3-Younger-B.mp3` |
| 4 | Einstein - Younger C (50s) (charismatic, lowest-pitched design) | `p38Su6GTGV2aH19lfO0S` | `4-Younger-C.mp3` |
| 5 | Einstein - Younger E (50s) (A's prompt, second take) | `RHOjtgmGvAfkwRwrhxlb` | `5-Younger-E.mp3` |
| native | Thomas - Warm German Explainer (library, `de`) | `vv3bG6FrcGtmeOdRSriS` | `6-Native-Thomas-WarmExplainer.mp3` |
| native | Moritz Wegner - Museums, City Tours & Guiding (library, `de`) | `PhufIH7nYh2Up1uej6aY` | `7-Native-Moritz-Wegner-Guide.mp3` |
| native | Piet Convo - Thoughtful & Unscripted (library, `de`) | `2QhwfRSog8ArO9AfgYMU` | `8-Native-Piet-Convo.mp3` |
| native | Hermann - Sympathetic and Trustworthy (library, `de`) | `b0JqlN5qkeuPi5BoQiHn` | `9-Native-Hermann-Sympathetic.mp3` |
| native | Thomas - Authentic & Natural (library, `de`) | `5faieqDE3osz75KiOI2M` | `10-Native-Thomas-Authentic.mp3` |
| previous | Einstein - Professor A (too old) | `CPXhqKTBUlO7LO3RX202` | `0-ProfessorA-previous.mp3` |
| previous | Einstein - Professor B / C (13 Oct runners-up) | `ADVoJoQKqU8WzHvaJaAo` / `BLv8FOTq5ngQLrtElQcK` | `11-` / `12-` |
| control | George (neutral English, for contrast) | `JBFqnCBsd6RMkjVDRZzb` | `13-Control-neutral-English-George.mp3` |

The 13 Oct runners-up (Potato `0pkdtmrxitYBWv6q9NJO`, Marshal `nzeAacJi50IvxcyDnMXa`, Helmut `bRIX82ywyYryS8320ZVY`) are unchanged; samples in `C:/tmp/einstein-voices-v2/`.

**What was measured (a computer cannot hear accent, so this is supporting evidence only):**

| Voice | Pitch (median, Hz) | Speaking rate (words/s) | Pitch stability across identical renders |
|---|---|---|---|
| Professor A (previous) | 102 to 255 | 3.96 | Wanders by over 100 Hz between takes of the same line, so the voicing is irregular or creaky |
| Professors B / C | 204 / 201 | 3.50 / 3.23 | not tested; both are the slowest voices |
| Younger D (live) | 182 | 4.25 | within 7 Hz over 4 takes |
| Younger A / B / C / E | 200 / 193 / 166 / 198 | 4.43 / 4.30 / 3.97 / 3.92 | within 9 / 8 / 13 / 12 Hz |
| Native German voices (14 tested) | 103 to 170 | 3.7 to 4.6 | Thomas and Moritz (3 takes each): within 9 and 21 Hz |

Younger D, A and B are faster, smoother (lower jitter, higher harmonics-to-noise) and far steadier than Professor A. Younger D was picked as the best blend of steady pitch, clear voicing and a prompt that asks for a *strong* accent (A's prompt only asked for a "clear" one).

**Native German voices speaking English (Jono's question, 14 Oct):**

- All 14 native voices read the English lines with no mispronunciation that a speech recogniser could detect (word error rate 0 on the plain-English line, same as the designed voices), so they are intelligible. Their pitch is a more typical adult-male 100 to 170 Hz.
- Whether the *German accent* holds on English text, and whether it sounds natural on a phone line, could not be measured: a phoneme recogniser returned the same standard English sounds for every voice including the neutral control, so it cannot separate accents. **This needs Jono's ears.** Listen to files 6 to 10 against 1 to 5.
- Settings that might change how a German-trained voice reads English were checked, not guessed. The agent language is `en` with no language presets, no multi-voice presets and no pronunciation dictionaries; `text_normalisation_type` is `elevenlabs` (emails and URLs only). The TTS `language_code` (en, de, or unset) made no measurable difference to duration, pitch or intelligibility for three voices (3 takes each; the `/tts` route now accepts `language_code`). Caveat: this was tested through the TTS API, because the live agent's own audio path cannot be exercised without a real call. Expressive tags work on v4 Turbo: `[chuckles]` produced an audible laugh and was never read aloud.
- Wit comes from the persona prompt, not the voice. A fresh simulation after the change: when teased about the hair, the agent said "[Chuckles] Ha, the hair is there — the physics, not so much!" then booked the call; all four evaluations passed.
- To try a native voice: a library voice renders through `/tts` as is, but the agent needs it in the workspace first. `POST /voice-add {public_owner_id, voice_id, name}` (owner ids from `GET /voices?language=de&gender=male&age=middle_aged`), then set `EINSTEIN_VOICE_ID` and `/sync`.
- Persona wording still says "older professor with a gentle German accent" (`_shared/einstein_persona.ts`). The voice is now younger; the persona text was left unchanged on purpose. Change it if Jono wants the self-description to match.

To swap the voice, change `EINSTEIN_VOICE_ID` in `einstein-agent/index.ts` (the only place it is set; `sync-voice-agents` never touches Einstein) and redeploy, or set the Supabase secret `EINSTEIN_VOICE_ID`. Then run `/sync` and check `GET /status` shows the new `tts.voice_id` with model `eleven_v4_turbo`, stability 0.8, similarity 0.85, speed 0.98.

## Tools (same bridge as Ayanda)

Einstein has his own webhook tool records, which point at the shared `ayanda-tools-bridge`:

| Tool | Bridge route | Does |
|---|---|---|
| `einstein_check_availability` | `/check_availability` | Open 15-minute slots (SAST) from Cal.com |
| `einstein_book_appointment` | `/book_appointment` | Books on Cal.com, emails the invite, upserts `contact_submissions` (source `einstein_web`) |
| `einstein_send_whatsapp_link` | `/send_whatsapp_link` | SMS with a wa.me link to 073 765 1664, logged in `communications` (agent `einstein`) |

They are separate records from Ayanda's because a website visitor has no `caller_number`. A tool that references an unset dynamic variable kills the session.

**Bridge auth.** Every call must carry the live `conversation_id`. The bridge looks it up and accepts only Ayanda's or Einstein's agent. Forged or ended conversations get a 401.

**Server-side normalisation** (`_shared/spoken.ts`, tests in `spoken.test.ts`):

- **Emails:** "john at gmail dot com" becomes `john@gmail.com`. The words at/dot/underscore/dash are converted, spaces stripped, the result lowercased and validated. An invalid address returns `invalid_email`, and the agent re-asks.
- **URLs:** "w w w dot acme dot co dot za" becomes `www.acme.co.za`.
- **SA mobiles to E.164:** "oh eight two double five five…" or "082 555 1234" becomes `+27825551234`.

The persona also forces literal written forms in tool arguments, plus read-back of the email and mobile before any tool runs.

## Knowledge base = the public website, auto-refreshed

**What it crawls.** `POST /einstein-agent/kb-refresh` starts from `sitemap.xml` and follows internal links. It skips `/broker*`, `/admin*`, `/dashboard`, `/console`, `/login`, `/invite`, `/reset-password`, `/setup`, `/notifications`, `/s/ /r/ /ask/`, and assets.

**How it renders.** The site is a client-rendered SPA, so pages are rendered through `r.jina.ai`. A plain fetch returns an empty shell.

**What it hashes.** Each page's *stable* text: no reader timestamp, no images or hashed asset URLs, no link targets. The hash only changes when the words change.

**How a doc is named.** `leadvelocity.co.za/<path> #<hash12>`. The state lives in ElevenLabs itself, with no database table.

**On each run:**

- Unchanged pages keep their doc.
- Changed or new pages get a new doc, which is attached to the agent.
- The old version is deleted.
- Pages that vanished from the site are dropped.
- A page that fails to fetch keeps its old doc, so a reader outage can never empty the KB.
- Redirect duplicates (e.g. `/promotions` → `/pricing`) collapse to the page the site links to.

**Pages as of 13 Oct 2026:** `/`, `/about`, `/contact`, `/onboarding`, `/pricing`, `/services`, `/specialized-services`.

**Schedule.** Supabase **pg_cron** job `einstein-kb-refresh` runs at `17 */3 * * *` (every 3 hours) and calls the function via pg_net. Migration: `supabase/migrations/20261013200000_einstein_kb_refresh_cron.sql`. Auth uses the vault secrets `einstein_kb_cron_secret` (matched against the function secret `EINSTEIN_KB_CRON_SECRET`) and `einstein_kb_anon_jwt`.

This was chosen over n8n because it lives in the same project as the function and secrets, with no VPS dependency, and follows the same pattern as `smc-voice-callback-tick`.

**Manual trigger (run after a frontend deploy):**

```bash
# with the cron secret (safe to put in a deploy script)
curl -X POST -H "Authorization: Bearer $SUPABASE_ANON_KEY" -H "x-cron-secret: $EINSTEIN_KB_CRON_SECRET" \
  https://cmsylaupctrbsvzrgzwy.supabase.co/functions/v1/einstein-agent/kb-refresh
# or as admin; options: {"dry_run":true} or {"force":["/pricing"]} (re-upload even if the hash matches)
curl -X POST -H "Authorization: Bearer $SERVICE_ROLE_JWT" -d '{"dry_run":true}' \
  https://cmsylaupctrbsvzrgzwy.supabase.co/functions/v1/einstein-agent/kb-refresh
```

Optional: set the `JINA_API_KEY` secret for higher reader rate limits. Keyless allows about 20 requests a minute, and one run is about 10 requests.

## Admin routes (service-role JWT)

`https://cmsylaupctrbsvzrgzwy.supabase.co/functions/v1/einstein-agent/…`

| Route | Purpose |
|---|---|
| `POST /sync` | Push persona, LLM, voice, tools, data collection and evaluation to the live agent. Run after any persona edit |
| `POST /kb-refresh` | See above |
| `GET /status` (`?full=1`) | Live config plus KB doc names |
| `GET /voices?accent=german&gender=male&age=old` | Voice-library search |
| `POST /tts {voice_id?, text?, stability?, language_code?}` | MP3 sample (defaults: live voice, v4 Turbo, live settings) |
| `POST /voice-design {voice_description, text?, guidance_scale?}` | Voice Design previews (base64 mp3 + `generated_voice_id`) |
| `POST /voice-create {voice_name, voice_description, generated_voice_id}` | Save a preview as a workspace voice |
| `POST /voice-add {public_owner_id, voice_id, name}` | Add a library voice to the workspace |
| `POST /simulate` | ElevenLabs simulate-conversation (tools are mocked by ElevenLabs) |

Get the service-role key with `npx supabase projects api-keys --project-ref cmsylaupctrbsvzrgzwy`.

Deploy with `npx supabase functions deploy einstein-agent --project-ref cmsylaupctrbsvzrgzwy --use-api`, and the same for `ayanda-tools-bridge` and `create-einstein-call`.

## Data per conversation (ElevenLabs → Conversations)

**Data collection:** `outcome` (booked / whatsapp_handoff / info_only / dropped), `name`, `business`, `need`, `mobile`, `email`, `callback_requested`.

**Evaluation criteria:** drove the CTA, short turns, confirmed email/mobile.

## Tests (13 Oct 2026)

- **Unit tests:**
  - `node supabase/functions/_shared/spoken.test.ts`: 37/37 pass.
  - `node supabase/functions/_shared/site_kb.test.ts`: 39/39 pass.
- **Simulations:** `/simulate` with tools mocked, final run; all 12 evaluations passed:
  - **Booking:** the visitor said "thandi dot mokoena at gmail dot com" and the tool received `thandi.mokoena@gmail.com` and `0825551234`. Email and mobile were read back first.
  - **WhatsApp fallback:** the number was read back, then `einstein_send_whatsapp_link` was called with topic "call-back requested".
  - **Rambling visitor:** one-line acknowledgements, steered to booking, booked.
  - **KB questions:** "qualified" definition, Silver R24,500 / 30 leads and the office address all came from the crawled site. The off-topic relativity question got one line, then back to the CTA.
- **Live, read-only:** a real Einstein session from `create-einstein-call` called `einstein_check_availability` through the bridge and got real Cal.com slots. Bridge probes on a live Einstein conversation:
  - spoken email and phone passed normalisation;
  - a garbage email returned `invalid_email`;
  - no phone returned `missing_phone`;
  - a forged conversation returned 401.

  Ayanda's bridge path was re-checked: 6 slots.
- **Voice change, 14 Oct 2026:** `/sync` then `GET /status` readback showed only `tts.voice_id` changed (model, stability 0.8, similarity 0.85, speed 0.98, expressive mode, LLM `glm-52`, temperature 0.3, language `en`, prompt, tools, KB all identical). A fresh `/simulate` run (teasing about the hair, then a full booking with tools mocked) passed all four evaluations, including a witty reply and `end_call`.
- **KB refresh:**
  - Two crawls gave identical hashes.
  - A forced hash mismatch on `/about` replaced only that doc and deleted the old one.
  - A pg_cron-path call returned 200; during a reader rate-limit, 5 pages failed and the KB was correctly left intact.
- **Widget:** present on `/`, `/pricing`, `/contact`; absent on `/broker`, `/broker/dashboard`, `/broker/forgot-password`, `/admin`, `/dashboard`, `/broker-elite` (live site after deploy).

## Switching Einstein off

| To stop… | Do this |
|---|---|
| The widget | Remove `<ChatBot />` from `src/App.tsx` (or empty `PUBLIC_ROUTES` in `ChatBot.tsx`), then deploy the frontend |
| Voice only | `create-einstein-call` returns 500 if you point `ELEVENLABS_EINSTEIN_AGENT_ID` at a non-existent agent. Or disable the agent in the ElevenLabs dashboard (Agent → Settings) |
| Bookings / WhatsApp from Einstein | Remove the three `einstein_*` tools from the agent in the dashboard. Ayanda is unaffected |
| KB auto-refresh | `select cron.unschedule('einstein-kb-refresh');` |
