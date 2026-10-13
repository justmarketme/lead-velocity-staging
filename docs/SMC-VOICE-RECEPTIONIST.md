# SortMyCover voice receptionist ("Lindi"): runbook

Built 13 Oct 2026. Code is on branch `feat/smc-voice-receptionist` (based on `feat/ayanda-receptionist-tools`), in the worktree `C:/Users/Jono/lv-smc-voice`.

## What it is

| | |
|---|---|
| Number | **+27 60 015 6480** (Twilio `PN9d25a4fa5ec642d300a1f96ef5886700`, the "Lead Velocity - SortMyCover" Twilio subaccount (SID in the secret `SMC_TWILIO_ACCOUNT_SID`)). Only the voice side changed. The WhatsApp sender and its webhook were not touched. |
| ElevenLabs agent | **`agent_7501m4v9sez3eb9b26ge4ykdvqwt`**, "SortMyCover receptionist", in the Lead Velocity workspace |
| Persona | Lindi, SortMyCover's virtual assistant |
| Voice | "Cheyenne - Calm and Professional" (`atf1ppeJGCYFBlCLZ26e`). It is a neutral South African English female voice from the ElevenLabs library. Ayanda uses Thandi, so the two sound different. |
| TTS | Eleven v4 Turbo, Expressive Mode on, `ulaw_8000` in and out, ElevenLabs text normalisation |
| LLM | `glm-52`, hosted by ElevenLabs (no Gemini or OpenAI), temperature 0.3 |
| Knowledge base | 20 live sortmycover.co.za pages, added by URL with RAG (documents named `SMC /…`) |
| Opening line | SortMyCover; the call is recorded and transcribed; no financial advice; books a free call with a licensed adviser |

## How a call flows

1. Twilio sends the call to `POST /functions/v1/smc-voice/twiml`. The request must carry a valid X-Twilio-Signature from the subaccount token. The function calls ElevenLabs `register-call`, which returns TwiML that connects the call to Lindi. It passes `caller_number`, `call_type` and `first_name`.
2. Lindi asks for: first name, age band (35–50 only), what they want help with, a rough monthly budget band (never presented as a quote), and their mobile. Then she reads the consent line word for word, naming Mark Weston, Oracle Brokers, FSP 28418, or Capital Legacy (FSP 43826) for wills. She asks for an email only at booking confirmation.
3. Tools are served by `POST /functions/v1/smc-voice/tools/<name>`. Every request is checked against the live ElevenLabs conversation, which must belong to this agent.
   - `save_caller_details` creates or matches the lead in `public.leads` (brand SMC). It stores the consent (`consent_source=voice_call`, `consent_mode=named`, `consent_text_version=smc-voice-v1`), `age_band`, `budget_band`, `reasons` and `product_interest`, and writes a `lead_activities` entry. If the caller is outside 35–50, it stores nothing.
   - `check_availability` checks Mark's calendar first. If his calendar is connected, it mints a `lt1` lead token (same as `automation/security/lead-token.js`) and calls n8n W04 `GET /webhook/slots`.
   - `book_appointment` calls n8n W05 `POST /webhook/book` with the lead token. The response is booked, held (the caller must verify their email), slot taken (next options offered), or fallback.
   - `send_whatsapp_followup` sends the approved template **smc_qualify_budget** (`HX5a0030506140a58a86e8611f15a5af64`) from `whatsapp:+27600156480`, at most once per call. Replies go to the n8n WhatsApp webhook, the existing W03/W07 flow.
4. If booking can't complete, Lindi confirms the caller's details, sends the WhatsApp, and tells them to reply there.
5. After the call, ElevenLabs sends the post-call webhook (HMAC) to `POST /functions/v1/smc-voice/post-call`. The function writes the CRM records described below.

## Records (no new tables)

- **`communications`**: one row per call. Columns: `channel='call'`, `workflow='smc-voice'`, `external_id=<Twilio CallSid>`, `lead_id` when linked, `content` = full transcript, `call_duration`, and `subject` "SortMyCover voice call: <outcome>". `metadata` holds `summary` (ElevenLabs AI summary), `call_notes`, `data_collection`, `evaluation`, `started_at`, `ended_at`, `conversation_id`, `call_type` (inbound/callback) and `tags {brand:'sortmycover', source:'voice', outcome}`. Outcome is one of `booked | whatsapp_handoff | out_of_criteria | no_answer | missed | info_only`. The CRM's call tab reads `channel='call'`.
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

## Testing without dialling anyone

- **Tools:** call `/smc-voice/tools/<name>` with the service-role JWT and the header `x-smc-test: 1`. That skips the conversation lookup, marks leads `is_synthetic`, leaves them unrouted, and sends nothing.
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
