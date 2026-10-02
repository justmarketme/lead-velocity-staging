# Security runbook — NH-15 fixes that are not SQL, and how to apply migration 01

**Owner:** platform-architect (schema), devops-security (operations) · **Date:** 2026-10-02 · **Gate:** NH-15 yes from Jonathan, NH-11 schema dump committed.
Never paste secret values into chat, commits, tickets or this file (pre-mortem #10). Values live only in `.env`, Supabase secrets or the password manager.

## A. Order of operations
1. **NH-11 first.** Jonathan runs `supabase db dump --schema-only` (read-only) and commits it as `supabase/live_schema_2026-10.sql`. platform-architect then diffs it against `20261002_smc_01…05`. Check in particular:
   - whether live tables `invoices`, `proposals`, `notifications`, `conversations`, `bookings` or `reports` exist;
   - the real CHECK constraint names on `brokers.status`, `communications.*`, `report_history.status` and `message_templates.channel`;
   - whether `appointments` has the `client_id` shape;
   - whether the bucket `admin-documents` is public.
2. **Pre-check for S1 (must hold or the public `/onboarding` form breaks):** in the dump, `submit_broker_onboarding` and `submit_broker_analysis` must be `SECURITY DEFINER`. If they are `SECURITY INVOKER`, add `ALTER FUNCTION … SECURITY DEFINER SET search_path = public` to migration 01 before applying it.
3. **Pre-check for S10:** confirm that the admin console works for admins with the permissive "Deny anonymous" policies removed. Admin policies use `has_role`, so it should. Then confirm that the legacy broker portal still shows each broker their own leads (the "Brokers can view their own leads" policy).
4. Apply **01 alone** to a staging branch or a local clone. Smoke-test the following, then apply to production:
   - admin login;
   - broker login (legacy portal: leads, documents download, appointments);
   - the public `/onboarding` submission;
   - the broker invite link.
5. Apply 02 → 05 to staging, run `supabase/seed/smc_synthetic.sql` (staging only, with `SET smc.allow_synthetic='on'`), and run the synthetic suite.
6. Production: 02 → 05 only after staging is green. **Never run the seed in production.**
7. Regenerate `src/integrations/supabase/types.ts` after each applied migration (crm-gap §D). This is the owner's task, not part of this drafting session.

## B. Non-SQL fixes (inventory §11)
| # | Finding | Action | Owner | Done when |
|---|---|---|---|---|
| S6 | Literal passwords in tracked `reset-admin.js` and `test-login.js` | (1) **Rotate** every admin password that appears in those scripts, in Supabase Auth: Jonathan, from the dashboard. (2) `git rm --cached reset-admin.js test-login.js` (they are already in `.gitignore`). (3) Treat the values as burned forever. (4) If the repo is or was ever public or shared, **also** purge history with `git filter-repo` and force-push, as a separate HUMAN GATE. (5) `npm install` keeps the `.githooks` secret guard on. | Jonathan + devops-security | Old passwords fail; files untracked; guard active |
| S4 | Service-role edge functions with `verify_jwt=false` and no auth check: `book-appointment`, `ayanda-tools-bridge`, `marketing-ai`, `send-scheduled-report`, `send-sla-alert`, `transcribe-call-recording`, `send-message-notification`, `handle-inbound-call` | User-facing functions: set `verify_jwt = true` in `supabase/config.toml` **and** call `auth.getUser()` plus a `has_role` check in code. Webhooks: keep `verify_jwt=false` but verify the provider signature — Twilio `X-Twilio-Signature` (HMAC-SHA1 of URL + params with the auth token) for `handle-inbound-call`/`handle-ai-call-*`, and a shared secret header for the ElevenLabs tool bridge. Reject on mismatch. | devops-security | Unsigned or unauthenticated calls return 401 in a curl test |
| S5 | Gemini key in the browser bundle (`src/utils/legalAI.ts`, `VITE_GEMINI_API_KEY`) | Route the call through the existing `legal-ai-assistant` edge function (INV-E19, JWT on). Remove `VITE_GEMINI_API_KEY` from Vercel env vars. **Rotate the Gemini key**, because the old one shipped publicly. | devops-security | `grep -r VITE_GEMINI dist/` is empty; old key revoked |
| S7 | Plain-text security answers (`broker_security_questions`, `profiles.security_answer_*`) | Short term: no new rows are written for SortMyCover brokers (magic links, 6.1 step 1). Retire the question-based reset when legacy brokers move to magic links. Then a later migration hashes the answers with `crypt()`/bcrypt or drops them. That is a backlog item with a date, not part of migration 01. | platform-architect | Magic link is the default login |
| S3 | Old public URLs to `admin-documents` may be cached or shared | After 01 makes the bucket private, the console and portal must use signed URLs (`createSignedUrl`, ≤ 1 h). Check `BrokerDocuments.tsx` and `AdminDocuments.tsx` for `getPublicUrl`. | devops-security | No `getPublicUrl` for that bucket |
| — | `/setup` page (INV-A07) signs up admins from the browser | Remove the route, or gate it behind `import.meta.env.DEV`. | devops-security | Route 404s in production |
| S9 | Ayanda cold-call prompt ("public listings") | Ensure no SortMyCover workflow imports `_shared/ayanda_persona.ts`. | conversation-designer | grep check in CI |

## C. Database roles (created NOLOGIN by migration 05)
- **n8n_app.** Run once, by hand, in the SQL editor, with the password generated by the password manager and stored only in `.env` as `SMC_DB_PASSWORD`:
  `ALTER ROLE n8n_app WITH LOGIN PASSWORD '<from password manager>';`
  - Connect through the Supabase pooler with TLS.
  - n8n **never** receives the service-role key.
  - Rotate quarterly and on any suspected leak (pre-mortem #10: halt + rotate).
- **facts_reader.** The same procedure applies, used only by the "Ask the data" backend. Statement timeout is 5 s; it can read `facts.*` only.
- **Audit context.** n8n sets `SET LOCAL smc.source='n8n'` (and `smc.reason` when a human approved). The console sets `smc.source='console'` via RPCs where possible.

## D. Standing checks (add to W22 / Section 7)
| Check | Pass criterion |
|---|---|
| anon can read any PII table | `SET ROLE anon; SELECT count(*) FROM leads;` → permission denied |
| broker isolation | broker B sees 0 rows of broker A in `leads`, `communications`, `cycles`, `outcomes`, `invoices_smc` (local validation: passed) |
| `audit_log` append-only | `UPDATE/DELETE` as authenticated, n8n_app or service_role → denied |
| bucket privacy | `storage.buckets.public = false` for `admin-documents` |
| `smc_erase_lead` | callable by n8n_app only |
| secrets in DB | `brands.*_ref` hold names only (CHECK blocks `EAA…` tokens and PEM keys) |
| leak response | Any secret or PII in chat, logs or commits → halt, rotate, record an `incidents` row; if personal information was exposed, follow the W34 breach runbook (POPIA s22) |

## E. Exposing the `ops` schema to the console (I-13)
The console Today screen reads `ops.pulses`, `ops.proposals`, `ops.signals`, `ops.notifications`, `ops.quality_grades`, `ops.judge_runs` and `ops.build_state_latest` through the Supabase client (`supabase.schema('ops')`). Every `ops` table is RLS admin-only (05 §1, 07 §1); `ops.alert_recipients` and `ops.w22_metrics` are granted to `n8n_app` only.
1. After 06/07 are applied: Dashboard → Project Settings → API → **Exposed schemas**: add `ops` (keep `public`, `graphql_public`). Locally: `supabase/config.toml` `[api] schemas = ["public", "graphql_public", "ops"]`. **Never add `facts` or `smc_private`**; the console reads facts only via `smc_watchlist()` / `smc_watchlist_tiles()` (admin check inside).
2. Check: as a broker JWT, `GET /rest/v1/proposals` with `Accept-Profile: ops` returns `[]`; as anon it returns 401/permission denied; as admin it returns rows.
3. Rollback: remove `ops` from the exposed list (no data change).
