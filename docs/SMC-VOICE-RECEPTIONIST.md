# SortMyCover voice receptionist ("Lindi"): runbook

Built 13 Oct 2026. Merged into `release/smc-nurture` (with Ayanda's tools and Einstein) on 13 Oct 2026.

## What it is

| | |
|---|---|
| Number | **+27 60 015 6480** (Twilio `PN9d25a4fa5ec642d300a1f96ef5886700`, the "Lead Velocity - SortMyCover" Twilio subaccount (SID in the secret `SMC_TWILIO_ACCOUNT_SID`)). Only the voice side changed. The WhatsApp sender and its webhook were not touched. |
| ElevenLabs agent | **`agent_7501m4v9sez3eb9b26ge4ykdvqwt`**, "SortMyCover receptionist", in the Lead Velocity workspace |
| Persona | Lindi, SortMyCover's virtual assistant |
| Voice | **"Linet - African & Friendly" (`7Ojkrcr68EynjSd90VK0`)**, ElevenLabs library, accent "south african", locale en-ZA, conversational, mid-age female. Live from 14 Oct 2026. Picked on its labels and description (no British or American qualifier, conversational use case, verified en-ZA on every model listed), **not by ear: it has not been heard on a real call yet.** The voice id lives in ONE place, `SMC_VOICE_ID` in `sync-voice-agents/index.ts`; every `POST ?agent=smc` pushes it and then reads it back and fails if ElevenLabs holds anything else. To change voice: edit that constant, deploy, push. |
| Voices tried | Previous: Claire `gsm4lUH9bnZ3pjR1Pw7w` (13-14 Oct; one-line rollback), Cheyenne `atf1ppeJGCYFBlCLZ26e`. Heard and rejected: Mel `hPCkcWzRwKvb97383AaN`, Sim `Sy7d8PNbkbjIJxf1li2K`, Ramona `NPuwPNKx2XCQDddfkHN4`. Candidates from the 14 Oct search, all in the workspace voice library and rendered with the live model in `C:/tmp/lindi-voices-v2/`: Positiva `sVA93IA0GbmJsFel9ltt` ("softly British" per its description), Katlego `GWxVpgZHEljuUpLKSxHI`, Amara `fFAtoTPtP0TtMyhbR3L9` ("African-British"), and three Voice Design voices (Joburg professional `eaR3SwFMDXOxBS1aCJ8S`, Cape Town warm `TMGDvkby8aZjBVCmFLOK`, Durban friendly `atEQ0UqumDXWz7uRSDsP`). Ayanda uses Thandi `BcpjRWrYhDBHmOnetmBl`, so the two sound different. |
| Turn-taking | `conversation_config.turn` (`SMC_TURN` in sync-voice-agents): `turn_eagerness` patient, `spelling_patience` auto, `speculative_turn` off, `turn_model` turn_v3, `turn_timeout` 10 s. ElevenLabs has no "pause in seconds" field: the wait after the caller stops is decided by the turn model, steered by `turn_eagerness`. `turn_timeout` is how long she waits in silence before "Are you still there?", not the normal gap. The caller can still interrupt her (`interruption` client event stays on). The persona also has a "Turn-taking and patience" section. |
| Recording | Calls are recorded and kept at ElevenLabs (`record_voice` true, `retention_days` 365, then deleted there). The CRM keeps the transcript (and its own copy of the consent record). See "Call recordings" below. |
| TTS | Eleven v4 Turbo (`eleven_v4_turbo`), Expressive Mode on, stability 0.5 / similarity 0.75 / speed 1.0 (`SMC_TTS_SETTINGS`), `ulaw_8000` in and out, ElevenLabs text normalisation |
| LLM | `glm-52`, hosted by ElevenLabs (no Gemini or OpenAI), temperature 0.3 |
| Knowledge base | 20 live sortmycover.co.za pages, added by URL with RAG (documents named `SMC /…`) |
| Opening line | SortMyCover; the call is recorded and transcribed; no financial advice; books a free call with a licensed adviser |

## How a call flows

1. Twilio sends the call to `POST /functions/v1/smc-voice/twiml`. **Inbound calls ring about twice (5.5 s) before Lindi answers:** Twilio does not answer until our TwiML returns, so the function holds the response while `register-call` runs in parallel (11 s ceiling, inside Twilio's 15 s limit). Callback (outbound) legs answer immediately. The request must carry a valid X-Twilio-Signature from the subaccount token. The function calls ElevenLabs `register-call`, which returns TwiML that connects the call to Lindi. It passes `caller_number`, `call_type` and `first_name`.
2. Before the first question she says, in one sentence, why she's asking (to match them with the right adviser). Then: first name, age band (35–50 only), what they want help with, a rough monthly budget band (never presented as a quote), and their mobile. Then she reads the consent line word for word, naming Mark Weston, Oracle Brokers, FSP 28418, or Capital Legacy (FSP 43826) for wills.
3. **WhatsApp-first (no live booking on the call).** She asks permission to WhatsApp them on that number (POPIA), waits for a clear yes, confirms the number, and sends the WhatsApp where the appointment is locked in. If they decline, she offers a call-back from the adviser's office (with consent). She never mentions calendars, availability or anything failing.
4. Tools are served by `POST /functions/v1/smc-voice/tools/<name>`. Every request is checked against the live ElevenLabs conversation, which must belong to this agent.
   - `save_caller_details` creates or matches the lead in `public.leads` (brand SMC). It stores the consent (`consent_source=voice_call`, `consent_mode=named`, `consent_text_version=smc-voice-v1`), `age_band`, `budget_band`, `reasons` and `product_interest`, and writes a `lead_activities` entry. If the caller is outside 35–50, it stores nothing.
   - `check_availability` / `book_appointment`: code kept, but **not attached to the agent** (`SMC_BOOKING_TOOL_DEFS` in sync-voice-agents). To bring on-call booking back, move them into `SMC_TOOL_DEFS` and restore the booking steps in the persona. `check_availability` checks Mark's calendar first. If his calendar is connected, it mints a `lt1` lead token (same as `automation/security/lead-token.js`) and calls n8n W04 `GET /webhook/slots`.
   - `book_appointment` calls n8n W05 `POST /webhook/book` with the lead token. The response is booked, held (the caller must verify their email), slot taken (next options offered), or fallback.
   - `send_whatsapp_followup` requires `whatsapp_consent: "yes"` (otherwise nothing is sent) and stores the consent with its timestamp in the WhatsApp `communications` row (`metadata.whatsapp_consent`), on the lead (`conv_state.whatsapp_consent`) and in the `voice_whatsapp_handoff` activity. It sends the approved template **smc_qualify_budget** (`HX5a0030506140a58a86e8611f15a5af64`) from `whatsapp:+27600156480`, at most once per call. Replies go to the n8n WhatsApp webhook, the existing W03/W07 flow.
   - `request_callback` (caller declined WhatsApp) requires `callback_consent: "yes"`; it writes `conv_state.callback_request` (consent timestamp, preferred time) and a `voice_callback_requested` activity on the lead. Outcome `callback_requested`.
5. After the call, ElevenLabs sends the post-call webhook (HMAC) to `POST /functions/v1/smc-voice/post-call`. The function writes the CRM records described below.

## Records (no new tables)

- **`communications`**: one row per call. Columns: `channel='call'`, `workflow='smc-voice'`, `external_id=<Twilio CallSid>`, `lead_id` when linked, `content` = full transcript, `call_duration`, and `subject` "SortMyCover voice call: <outcome>". `metadata` holds `summary` (ElevenLabs AI summary), `call_notes`, `data_collection`, `evaluation`, `started_at`, `ended_at`, `conversation_id`, `call_type` (inbound/callback) and `tags {brand:'sortmycover', source:'voice', outcome}`. Outcome is one of `booked | whatsapp_handoff | callback_requested | out_of_criteria | no_answer | missed | info_only`. The CRM's call tab reads `channel='call'`.
- **`lead_activities`** (the lead timeline): `voice_details_captured`, `voice_booked`, `voice_whatsapp_handoff`, `voice_call` (with the summary) and `voice_callback_scheduled`. Each has an idempotency key `smcvoice:*:<conversation_id>`.
- **WhatsApp sends**: `communications` rows with `channel='whatsapp'`, `workflow='smc-voice'` and `template_name='qualify_budget'`.
- **Out of criteria**: the call row keeps the transcript and outcome. The data kept is only the outcome and age band. No lead is created.
- Voice leads have `origin='manual'` and `source='other'`. The `leads_smc_checks` constraint has no `voice` origin, and I didn't change the schema. The voice channel is recorded in `consent_source='voice_call'` and `conv_state.voice`. If you want `origin='voice'`, it is a one-line change to the check constraint.

## Missed calls and callbacks

- A missed call is any of these: the Twilio status callback (`/status`) reports a call that wasn't `completed` or lasted 20 seconds or less; the post-call webhook shows the caller never spoke; or the agent couldn't be reached (the caller hears a short apology). When that happens, ONE callback is scheduled. It is a `communications` row with `metadata.kind='smc_voice_callback'` and `status='pending'`.
- Callback rules: at most 1 automatic callback per number per 24 hours. Only South African numbers are called. Opted-out leads are skipped. The callback is cancelled if the caller got through in the meantime.
- Timing: the callback is due 5 minutes after the miss, and only inside the **CPA s12** window: Mon–Fri 08:00–20:00 and Sat 09:00–13:00 SAST, never on a Sunday or public holiday. No call starts within 15 minutes of the window closing. Holiday dates are copied from `data/za-public-holidays.json`, so add new years in both places.
- **pg_cron** job `smc-voice-callback-tick` runs every 5 minutes and calls `/smc-voice/tick`. The `x-cron-secret` comes from Vault (`smc_voice_cron_secret`). The migration is `supabase/migrations/20261013180000_smc_voice_callback_cron.sql`.
- A callback is placed with the Twilio Calls API: from +27 60 015 6480, `Url=/twiml?cb=<id>`, answering-machine detection on (voicemail gets a hang-up), and register-call `direction=outbound`. Lindi opens with: "it's Lindi, SortMyCover's virtual assistant, returning your call to 060 015 6480. This call is recorded and transcribed…"
- The outcome is written back to the callback row (`state`, `outcome answered|no_answer`, `call_sid`), plus a call row.
- **Dialling is OFF until you switch it on:** `SMC_CALLBACKS_ENABLED=false`. Until then, `tick` reports "skipped" and calls nobody. To switch on:
  `npx supabase secrets set SMC_CALLBACKS_ENABLED=true --project-ref cmsylaupctrbsvzrgzwy`

## Secrets (Supabase edge, project cmsylaupctrbsvzrgzwy)

`SMC_ELEVENLABS_AGENT_ID`, `SMC_TWILIO_ACCOUNT_SID`, `SMC_TWILIO_AUTH_TOKEN` (subaccount), `SMC_LEAD_TOKEN_SECRET` (= n8n `LEAD_TOKEN_SECRET`; rotate both together), `SMC_VOICE_WEBHOOK_SECRET` (ElevenLabs webhook `d02848f8c97b4c358ee202bdab748865`), `SMC_VOICE_CRON_SECRET` (= Vault `smc_voice_cron_secret`), `SMC_CALLBACKS_ENABLED`. The existing `ELEVENLABS_API_KEY` is reused.

## Change the persona, voice or tools

1. Edit `supabase/functions/_shared/smc_receptionist_persona.ts`. It holds the prompt, opening line, callback opener, consent lines and the adviser's name/FSP. The voice, LLM, KB pages, tools, data collection and evaluation live in the SMC section of `supabase/functions/sync-voice-agents/index.ts`.
2. Deploy and push:
   ```
   npx supabase functions deploy sync-voice-agents --project-ref cmsylaupctrbsvzrgzwy --use-api
   curl -X POST -H "Authorization: Bearer $SERVICE_ROLE_JWT" "https://cmsylaupctrbsvzrgzwy.supabase.co/functions/v1/sync-voice-agents?agent=smc"
   ```
   (`$SERVICE_ROLE_JWT` comes from `npx supabase projects api-keys --project-ref cmsylaupctrbsvzrgzwy`.) The push is idempotent. Adding new KB pages takes about 7 seconds each, so if the first run times out at 150 seconds, run it again. Plain `POST` (no `?agent=`) still syncs only Ayanda and Einstein.
3. Code changes to the call logic go in `supabase/functions/smc-voice/index.ts` and `supabase/functions/_shared/smc_voice_lib.ts`. Run the tests with `npx deno test supabase/functions/_shared/smc_voice_lib.test.ts`, then deploy with `npx supabase functions deploy smc-voice --project-ref cmsylaupctrbsvzrgzwy --use-api --no-verify-jwt`.
4. A new adviser means updating `SMC_ADVISER` (persona) and `SMC_BROKER_ID` (smc-voice).

## Call recordings

- **Where:** the audio lives only at ElevenLabs, attached to the conversation (`has_audio` true). Nothing is stored in Supabase and there is **no public audio URL**.
- **Retention:** `privacy.record_voice` true and `privacy.retention_days` `365` (`SMC_RETENTION_DAYS` in sync-voice-agents). After 365 days ElevenLabs deletes the audio and its copy of the transcript; the CRM transcript and consent record are kept under the privacy page's own periods. 365 days matches the privacy page's 12 months for lead details. Raise it (for example 1825 = 5 years, the period direct-marketing rules mention for call records) if counsel wants the audio as consent proof, then deploy and push. It does not apply to calls already recorded unless `apply_to_existing_conversations` is set.
- **Who can listen:** anyone with the ElevenLabs workspace login, and anyone holding the service-role key via `GET /functions/v1/smc-voice/recording?conversation_id=conv_…` (returns the mp3; 403 for anything else; each play is logged in the function logs). Example: `curl -H "Authorization: Bearer $SERVICE_ROLE_JWT" "…/smc-voice/recording?conversation_id=conv_…" -o call.mp3`.
- **In the CRM:** each call's `communications.metadata` carries `audio_available` (true/false/null if ElevenLabs could not confirm), `audio_conversation_id` and `audio_source: "elevenlabs"`. Calls before 14 Oct were backfilled.
- **Gap to close:** the live privacy page says nothing about call recordings, retention, or ElevenLabs as the processor, while Lindi says the call is recorded. Add a line (what is recorded, why, 12 months, ElevenLabs, how to ask for deletion) before the line is promoted.

## Testing without dialling anyone

- **Tools:** call `/smc-voice/tools/<name>` with the service-role JWT and the header `x-smc-test: 1`. That skips the conversation lookup, marks leads `is_synthetic`, leaves them unrouted, and sends nothing.
- **Admin auth:** the admin routes (`selftest`, `recording`, and `x-smc-test` mode) ask Supabase whether the bearer token really is the service-role key; a JWT whose payload merely says `service_role` is rejected (the function is deployed without gateway JWT verification, so the payload alone proves nothing).
- **Line check:** `POST /smc-voice/selftest` with the service-role JWT and `x-smc-test: 1` returns the number's live Voice URL, the result and timing of a Twilio-signed inbound `/twiml` request (expect ~5.5–6.5 s ring, `<Connect><Stream>`), and that an unsigned request gets 403. No call is placed.
- **Scheduler:** `POST /smc-voice/tick` with the same headers does a dry run. Add `?simulate_missed=08xxxxxxxx` to schedule a synthetic callback, report on it, and cancel it.
- **Simulated calls:** run `POST sync-voice-agents?el=/convai/agents/<id>/simulate-conversation` with tool mocks. `?el=` is an admin passthrough to the ElevenLabs API that needs the service-role JWT.

## Switch it off

- **Voice line:** in the Twilio subaccount, point the number's Voice URL elsewhere. The previous value was a record-only twimlet. Or clear it.
- **Callbacks only:** set `SMC_CALLBACKS_ENABLED=false`, and/or `select cron.unschedule('smc-voice-callback-tick');`.
- **Agent:** archive it in ElevenLabs. The function then answers with the apology and schedules a callback, so turn callbacks off as well.

## Known gaps (13 Oct 2026)

- **Online booking falls back to WhatsApp today.** Three reasons:
  - Mark's Outlook isn't connected (`brokers.calendar_status` is null).
  - n8n W04 `/slots` and W05 `/book` aren't active (404).
  - `smc_broker_ready(Mark)` is false, so a voice lead is held (`held_broker_not_ready`) and not routed to him.

  The booking path turns on by itself once all three are fixed. No code change is needed.
- W05's per-IP rate limit (10 per hour) applies to voice bookings, because they all come from Supabase edge IPs.
- `smc_qualify_budget` asks for the budget again on WhatsApp, even when the caller already gave it on the call. It is the only approved template that opens a conversation.
- The KB includes `/privacy` and `/terms`. Memory says the live legal pages still say "Jonathan West", so check and fix them on the site.
