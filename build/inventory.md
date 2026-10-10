# /build/inventory.md — 0.2 reuse-first inventory of the Lead Velocity CRM

**Owner:** `platform-architect` (Head of Platform) · **Task:** `P0-INVENTORY` · **Date:** 2026-10-02 · **Repo state read:** commit `f1c80f7` on the session branch (pre-existing CRM = everything up to `f940a94`).
**Method:** read-only pass over the repo: every SQL file, every edge function, the routes, the generators, the configs. No web research (0.1 Research status). The live Supabase project was **not** queried; where the repo and the live database may differ, the line says so.
**How to use this file:** every later platform task cites the `INV-*` line it extends (0.2 rule: "an agent may only write new code for a capability absent from the inventory, and must cite the inventory line it extends"). The outcome per table, screen and workflow (reuse as-is / extend / new) is in `/build/crm-gap.md`.

---

## 0. Headline facts (read these first)

1. **This is a working Supabase CRM, not a blank repo.** React 18 + Vite + TypeScript + Tailwind/shadcn SPA, Supabase (Postgres, Auth, Storage, Edge Functions, pg_cron, Realtime), deployed to **Vercel**. Supabase project ref `cmsylaupctrbsvzrgzwy` (`supabase/config.toml`, `KNOWLEDGE_TRANSFER.md`).
2. **It serves a different product today.** The existing business is B2B: business/SME insurance leads on a "Lead Token" model (Bronze R8,500 / Silver R10,500 / Gold R16,500+, Pilot R6,000 "10 guaranteed leads"), wills referrals, and AI cold-call appointment setting (Ayanda). SortMyCover (consumer life cover, consent-only, per-cycle pricing) has to sit **beside** this data, not replace it.
3. **Roles already match the target.** `app_role` enum = `admin | broker`, `user_roles` table, `has_role()` SECURITY DEFINER function, broker-scoped RLS on `leads` (`supabase/migrations/20251102123825_…sql`, hardened in `20260101172513_…sql`). This is the Salesforce-style split the prompt asks for.
4. **26 tables are defined in repo SQL**; **12 more are referenced but not defined in any migration** (live-DB drift). `src/integrations/supabase/types.ts` is stale against the migrations; `supabase/types.ts` is empty (0 bytes).
5. **Nothing for SortMyCover's money, cycles, Meta, WhatsApp Cloud API, Microsoft Graph or Paystack exists yet.** No `pricing`, `cycles`, `invoices` (as a table), `outcomes`, `replacements`, `brands`, `ad_metrics`, audit log, consent fields or suppression list.
6. **Messaging today goes through Twilio (SMS + Twilio WhatsApp) and Resend (email)** — not WhatsApp Cloud API direct and not Microsoft Graph.
7. **No test setup.** No test runner, no test script in `package.json`, no CI.
8. **Several pre-existing security/POPIA defects** (public-readable onboarding PII, `USING (true)` "admin" policies, unauthenticated service-role edge functions, a browser-exposed Gemini key, passwords in tracked scripts) — §11. These must be fixed before any SortMyCover consumer data lands in the same database.

---

## 1. Stack, hosting and deploy path

| ID | Item | Evidence | What it is |
|---|---|---|---|
| INV-01 | Frontend | `package.json`, `vite.config.ts`, `src/main.tsx` | React 18.3, Vite 5, TypeScript 5.8, react-router 6, TanStack Query 5, Tailwind 3 + shadcn/Radix (`src/components/ui/*`, `components.json`), lucide icons, recharts, `@hello-pangea/dnd` (kanban), react-hook-form + zod, date-fns, react-markdown |
| INV-02 | Build output | `vite build` → `dist/` (static SPA) | A static bundle — can be served by Vercel **or** any static host (Hostinger). No server-side rendering. |
| INV-03 | Hosting | `vercel.json` (SPA rewrite to `/index.html`, security headers incl. `X-Frame-Options: DENY`), `README.md`, `KNOWLEDGE_TRANSFER.md` §Deployment | **Vercel**; push to `main` triggers a build. Edge functions are deployed **manually** (Supabase CLI/MCP). |
| INV-04 | Backend | `supabase/config.toml` (`project_id = "cmsylaupctrbsvzrgzwy"`), `supabase/functions/*` (35 functions + `_shared`) | Supabase-hosted Postgres + Auth + Storage + Deno edge functions. 13 functions set `verify_jwt = false` in `config.toml`. |
| INV-05 | Local dev bridge | `vite-plugin-edge-functions.ts`, `src/integrations/supabase/client.ts` | In dev, `marketing-ai`, `einstein-ai`, `create-einstein-call` are emulated inside Vite (calls Gemini/OpenRouter/Tavily/Ultravox from the dev server). |
| INV-06 | Scheduling | `supabase/migrations/20260114094619_…sql` | **pg_cron** enabled; one job: `send-daily-appointment-reminders` at 07:00 UTC → `send-appointment-reminders`. |
| INV-07 | Realtime | migrations | `leads`, `lead_activities`, `lead_conversations`, `communications`, `ai_call_requests`, `appointments` are in the `supabase_realtime` publication. |
| INV-08 | Storage | `20260114083726_…sql`, `20260226230000_elite_onboarding_repair.sql`, `FIX_PROPOSAL_RLS.md` | Bucket `admin-documents` (proposals, invoices, contracts PDFs). Created private, later re-inserted as **public** with a "Public Access" SELECT policy — final state on the live project is unknown (see §11). |
| INV-09 | Scripts | `scripts/apply-migration.js`, `scripts/seed_data.ts`, `scripts/convert-to-webp.mjs`, root `*.js/*.cjs` helpers | Ad-hoc ops scripts; migrations have been applied by hand in the SQL editor (`FIX_*.md`, `MIGRATION_*.sql`, `supabase/run_broker_invites_fix.sql`). |
| INV-10 | Package manager | `package-lock.json` + `bun.lockb` | Both lockfiles present. `prepare` script sets `core.hooksPath .githooks`; `tasks:validate` runs `build/validate-tasks.mjs`. |
| INV-11 | Domains referenced | edge-function CORS/links | `leadvelocity.co.za`, `www.leadvelocity.co.za`, `velocity.leadvelocity.co.za` (in `send-ai-call-notification`). `add_demo_lead.cjs` hard-codes the project URL. |

---

## 2. Database schema (Supabase Postgres, schema `public`)

### 2.1 Tables defined in repo SQL (26)
Source of truth used: `supabase/migrations/*.sql` in order, cross-checked against `src/integrations/supabase/types.ts` (generated) and `supabase/full_schema.sql` / `supabase/clean_setup.sql` (concatenated dumps of the same migrations).

| ID | Table | Purpose today | Key columns (final shape) | RLS today | Defined in |
|---|---|---|---|---|---|
| INV-T01 | `profiles` | One row per auth user (display name, admin bot pairing) | `user_id` (unique), `full_name`, `telegram_chat_id/enabled/pairing_code`, `discord_user_id/enabled/pairing_code`; types.ts also has `security_question_1/2`, `security_answer_1/2` (no migration for these) | own row; admins read/delete all | `20251023141318`, `20251104214438` (dropped `app_role`), `20260306161727`, `20260306165526` |
| INV-T02 | `user_roles` | Role grants (Salesforce-style) | `user_id`, `role app_role` (`admin`/`broker`), unique(user_id, role) | read own; admins read all; **no INSERT policy** (grants only via SECURITY DEFINER functions / service role) | `20251102123825` |
| INV-T03 | `brokers` | **Client broker firms** (the CRM's "clients") | `id`, `user_id` (unique, FK auth.users), `firm_name`, `contact_person`, `phone_number`, `email`, `status` (`Active`/`Inactive`), `tier` (`Pilot/Bronze/Silver/Gold` text), `is_lead_loading`, `portal_style` (`Standard/Elite`), `calendar_email`, `google_calendar_token jsonb`, `whatsapp_number`, `firm_address`, `preferred_language`; types.ts also has `portal_type` (`referral/marketing/premium`, no migration); root `MIGRATION_PREMIUM_PORTAL.sql` adds `lead_quota`, `leads_used` (not in types.ts → probably never applied) | broker: read/update own row; admin: all | `20251102123825`, `20260114082539`, `20260225220000`, `20260226230000`, `20260402120000` |
| INV-T04 | `leads` | Leads/clients per broker (CRM "contacts"; there is **no separate contacts or deals table**) | `id`, `broker_id` (FK brokers, nullable), `first_name`, `last_name`, `email` (**NOT NULL**), `phone` (NOT NULL), `source` (CHECK fully relaxed), `current_status` (CHECK `New/Contacted/Will Done/Appointment Booked/Rejected` — app also writes `Booked`, `Follow-up`), `notes`, `date_uploaded`, `company`, `role`, `address`, `vibe int`, timestamps | broker: select/insert/update own (`broker_id` → `brokers.user_id = auth.uid()`); admin: all incl. insert without broker; extra "Deny anonymous" SELECT policy | `20251023141318`, `20251102123825`, `20260101172513`, `20260401120000`, `20260404120000`, `20260406_add_marketing_lead_columns.sql` |
| INV-T05 | `lead_activities` | Per-lead activity log (HubSpot-style timeline seed) | `lead_id`, `agent_id`, `activity_type` (free text), `notes`, `created_at` | agent: own rows; admin: all | `20251023141318`, `20260101172513` |
| INV-T06 | `referrals` | Wills-product referrals captured from a lead | `parent_lead_id`, `first_name`, `phone_number`, `will_status` (`Pending/Done`), `appointment_date`, `broker_appointment_scheduled`; root SQL adds `appointment_status`, `appointment_notes` (not in types.ts) | broker: read/insert/update via parent lead; admin: all | `20251102123825`, `20260114090543`, `20260114091112` |
| INV-T07 | `admin_invites` | Token invites that create admin users | `token` (unique), `email`, `created_by`, `expires_at`, `used_at` | admin only; validated via `validate_admin_invite()` / `use_admin_invite()` RPCs | `20251228135351`, `20260101172513` |
| INV-T08 | `broker_invites` | Token invites that create broker users | `email`, `token`, `broker_name`, `firm_name`, `expires_at`, `used_at`, `created_by`; types.ts has `portal_type` | admin only; anon validates via `get_broker_invite_by_token()` RPC | `20240328_broker_auth_security.sql`, `20260305*` |
| INV-T09 | `broker_security_questions` | Broker self-service password reset Q&A | `user_id`, `question_1..3`, `answer_1..3` (**plain text**) | own row only | `20240328_broker_auth_security.sql` |
| INV-T10 | `broker_reset_requests` | Manual password-reset requests | `email`, `status`, `resolved_by` | anyone can insert; admin manages | `20240328_broker_auth_security.sql` |
| INV-T11 | `lead_conversations` | **Internal** broker ↔ admin chat per lead (not consumer messages) | `lead_id`, `user_id`, `message`, `sender_role` (`broker/admin`), `read_at`, `read_by` | admin all; broker read/insert on own leads; mark-read | `20260114055733`, `20260114061339` |
| INV-T12 | `admin_documents` | Document library: **proposals, invoices, contracts** (metadata + editable JSON), files in bucket `admin-documents` | `name`, `description`, `file_path`, `file_type`, `file_size`, `category` (`proposals/invoices/contracts/templates/general`), `content_data jsonb`, `uploaded_by` | admin all; brokers read docs shared with them (`FIX_PROPOSAL_RLS.md` proposes a dev "all access" policy — live state unknown) | `20260114083726`, `20260207221500` |
| INV-T13 | `document_shares` | Which broker can see which document | `document_id`, `broker_id`, `shared_by`, `shared_at` | admin all; broker own | `20260114084005` |
| INV-T14 | `communications` | **Unified message log** — email/SMS/WhatsApp/call, inbound + outbound, per lead/referral/broker | `channel` (`email/sms/whatsapp/call`), `direction`, `sender_type/id`, `recipient_type/id/contact`, `subject`, `content`, `status` (`pending/sent/delivered/failed/received`), `external_id`, `call_duration`, `call_recording_url`, `lead_id`, `referral_id`, `broker_id`, `metadata jsonb`, `response_time_seconds`, `responded_to_id` | admin all (insert/update/select); broker reads own; "deny anonymous" | `20260114101603`, `20260115110601`, `20260122114221` |
| INV-T15 | `message_templates` | Reusable SMS/email/WhatsApp text templates (`{{name}}` merge) | `name`, `channel`, `subject`, `content`, `category` | admin manage; any authenticated user reads | `20260114103312` |
| INV-T16 | `ai_call_requests` | AI voice calls (Ayanda/Einstein) and their outcome | `recipient_type/id/name/phone`, `call_purpose`, `call_status`, `call_sid`, `call_duration`, `call_recording_url`, `call_summary`, `proposed_changes jsonb`, `changes_approved*`, `requested_by`, `is_roleplay`, `coaching_feedback`, `whatsapp_sent_at`, `email_sent_at`, `call_goal`, `join_url` | admin only | `20260114104100`, `20260402120000`, `20260402_add_join_url.sql` |
| INV-T17 | `notification_preferences` | Per-user in-app/email/sound prefs for AI-call notifications | `user_id`, `ai_call_email`, `ai_call_in_app`, `ai_call_sound` | own row; admin read | `20260114105631` |
| INV-T18 | `sla_thresholds` | Response-time SLA per channel | `channel` (unique), `warning_seconds`, `critical_seconds`, `enabled` (seeded call/email/sms/whatsapp) | admin | `20260115110835` |
| INV-T19 | `sla_alerts` | SLA breach history | `communication_id`, `channel`, `severity`, `response_time_seconds`, `threshold_seconds`, `acknowledged*` | admin | `20260115110835` |
| INV-T20 | `scheduled_reports` | Report schedules (admin summary / broker client report) | `report_type`, `frequency`, `day_of_week/month`, `time_of_day`, `recipient_type/ids`, `broker_id`, `include_sections[]`, `next_scheduled_at` (trigger-computed) | admin all; broker reads own | `20260115111525` |
| INV-T21 | `report_history` | Log of sent reports | `scheduled_report_id`, `sent_at`, `recipients[]`, `status`, `error_message`, `report_data jsonb` | admin | `20260115111525` |
| INV-T22 | `broker_onboarding_responses` | **Prospect-broker** "readiness assessment" form (public `/onboarding`) | contact fields (`full_name`, `email`, `phone`, `firm_name`/`company_name`, `whatsapp_number`, `whatsapp_consent`), ops/budget/capacity answers (`desired_leads_weekly`, `max_capacity_weekly`, `monthly_lead_spend`, `current_cpl`, `product_focus[]`, `monthly_sales_target`, …) | **public insert AND `FOR ALL USING (true)` → anyone with the anon key can read/alter** | `20260223120000` (+ column adds `20260228*`) |
| INV-T23 | `broker_analysis` | Deterministic + AI score of a readiness response | `response_id`, scores (`operational/budget/growth/intent`), `success_probability`, `risk_flags[]`, `primary_sales_angle`, `success_band`, `ai_explanation`, `status`, `admin_notes` | **`FOR ALL USING (true)`** (plus an admin policy) | `20260223120000`, `20260226230000` |
| INV-T24 | `appointments` | Broker appointments with a lead | **Two conflicting CREATE IF NOT EXISTS definitions.** Live shape per types.ts: `broker_id`, `client_id` (FK leads), `appointment_date`, `status` (`Scheduled`), `reason`, `reason_notes`. The later definition (`lead_id`, `appointment_time`, `meeting_type`, `meeting_link`) never applied. | broker read/update own; **"Admins can manage all appointments" is `FOR ALL USING (true)`**; a second policy compares `auth.uid() = broker_id` (wrong key) | `20260225220000_premium_broker_portal.sql`, `20260402120000` |
| INV-T25 | `broker_notes` | Threaded broker ↔ admin notes per lead (premium portal) | `lead_id`, `author_id`, `author_role`, `content`, `is_read` | broker own leads; **"Admins can manage all notes" `FOR ALL USING (true)`** | `20260225220000` |
| INV-T26 | `client_engagement_notes` | Third variant of broker ↔ admin notes | `client_id`, `author_id`, `author_role`, `content`, `is_internal` | broker own / admin all | root `MIGRATION_PREMIUM_PORTAL.sql` only — **not in migrations or types.ts; probably not applied** |

### 2.2 Tables referenced but not defined anywhere in the repo (12) — schema drift
| ID | Name | Where referenced | Implication |
|---|---|---|---|
| INV-T27 | `call_coaching` | `supabase/functions/analyze-call-coach`, `src/components/broker/SalesCoachInsight.tsx` | Exists live (or the feature is broken). |
| INV-T28 | `system_logs` | `supabase/functions/analyze-call-coach` | Same. |
| INV-T29…T38 | `emails`, `invoices`, `legal_documents`, `notifications`, `proposals`, `secrets`, `system_settings`, `whatsapp_history`, `workflow_stages`, `workflows` | `DROP TABLE IF EXISTS` lines at the top of `supabase/clean_setup.sql` | These existed in some Supabase project at some point. Whether they exist in `cmsylaupctrbsvzrgzwy` today is unknown. **`invoices`, `proposals` and `notifications` collide with target names in the master prompt.** |

Also undefined: edge function **`send-appointment-update`** (invoked by `src/utils/notifications.ts`, no folder in `supabase/functions/`).

### 2.3 Functions, enum, triggers
| ID | Object | Evidence | Purpose |
|---|---|---|---|
| INV-F01 | `app_role` enum (`admin`, `broker`) | `20251102123825` | Role model — matches 6.4 "roles: admin/broker". |
| INV-F02 | `has_role(_user_id, _role)` SECURITY DEFINER | `20251102123825` | RLS helper used by every admin policy. |
| INV-F03 | `handle_new_user()` trigger on `auth.users` | `20251228172522` (final) | Creates `profiles` row; never grants admin from metadata. |
| INV-F04 | `handle_new_broker()` trigger on `auth.users` | `20260114082659` (final) | If signup metadata `user_type=broker` → creates `brokers` row + `broker` role. |
| INV-F05 | `validate_admin_invite()`, `use_admin_invite()` | `20251228135351` | Admin invite flow. |
| INV-F06 | `get_broker_invite_by_token()` (granted to anon) | `20260305100000` | Broker invite validation. |
| INV-F07 | `calculate_next_schedule()`, `update_next_schedule()` trigger | `20260115111525` | Report scheduling. |
| INV-F08 | `update_updated_at_column()` | `20251023141410` | `updated_at` triggers on most tables. |
| INV-F09 | `submit_broker_analysis`, `submit_broker_onboarding` | listed in `types.ts` Functions | **No migration defines them** — live-only. |

---

## 3. Auth model
| ID | Item | Evidence | Today |
|---|---|---|---|
| INV-A01 | Login method | `src/pages/Login.tsx`, `BrokerPortal.tsx`, `AdminLogin.tsx` | Supabase **email + password** (`signInWithPassword`). **No magic links** (`signInWithOtp` not used anywhere). |
| INV-A02 | Admin onboarding | `src/pages/InviteSignup.tsx` (`/invite/:token`), `admin_invites`, `send-admin-invite` | Token invite → signUp → `use_admin_invite()` grants `admin`. `20260228000000/…01` force-grant admin to `howzit@leadvelocity.co.za`. |
| INV-A03 | Broker onboarding | `src/pages/BrokerSetup.tsx` (`/broker-setup/:token`), `broker_invites`, `send-broker-invite`, `get-broker-invite-by-token` | Admin sends invite (Resend email) → broker signs up with password + security questions → `handle_new_broker()` creates the row. |
| INV-A04 | Password reset | `ResetPassword.tsx`, `auth/BrokerForgotPassword.tsx`, `broker_security_questions`, `broker_reset_requests`, `trigger-discord-alert` | Supabase reset email, plus security-question path and a manual request that pings Discord. |
| INV-A05 | Role routing | `src/pages/Dashboard.tsx`, `BrokerPortal.tsx` | After login: `has_role(admin)` → `/dashboard`; else broker row → `/broker/dashboard` or `/broker-elite` (by `portal_type`). Routes have **no route guard**; protection is RLS only. |
| INV-A06 | Data isolation | RLS on `leads`, `brokers`, `communications`, `lead_conversations`, `referrals`, `document_shares`, `scheduled_reports` | Correct broker-scoped pattern exists (`EXISTS (SELECT 1 FROM brokers WHERE brokers.id = X.broker_id AND brokers.user_id = auth.uid())`). Broken on `appointments`, `broker_notes`, `broker_onboarding_responses`, `broker_analysis` (§11). |
| INV-A07 | `/setup` page | `src/pages/Setup.tsx` | Public page that signs up an admin and upserts `user_roles` from the browser. Blocked by RLS (no INSERT policy on `user_roles`), but should not ship. |
| INV-A08 | Audit trail | — | **None.** No audit table, no `created_by/updated_by` on most writes, no trigger-based change log. |

---

## 4. UI — route map and screens (`src/App.tsx`)

### 4.1 Public marketing site (Lead Velocity B2B)
`/` Home · `/about` · `/services` · `/pricing` (**hard-coded** R8,500 / R10,500 / R16,500+, `src/pages/Pricing.tsx`) · `/promotions` (R6,000 pilot, "10 guaranteed … leads" — banned wording under 3.5a) · `/specialized-services` (R3,500 once-off) · `/contact` · `/onboarding` (public broker readiness assessment, 6 steps, `BrokerOnboarding.tsx` → `broker_onboarding_responses` + `analyze-broker-score`) · global `ChatBot` (Einstein, `src/hooks/useChatbot.ts` → `einstein-ai`; prompt hard-codes the old tiers).

### 4.2 Admin console (`/dashboard?tab=…`, `src/pages/Dashboard.tsx`, `src/components/dashboard/*`)
| ID | Tab | Component | Notes |
|---|---|---|---|
| INV-S01 | Overview | `DashboardOverview.tsx` | Lead counts by status. |
| INV-S02 | Manage Workflow | `WorkflowManagement.tsx` (1,832 lines) | **Kanban pipeline** (drag-and-drop) with stages `New / Contacted / Appointment Booked / Will Done / Follow-up / Rejected`; opens `CallCommandCenter` for live AI calls. Pipedrive-style stage UX already exists. |
| INV-S03 | Marketing Hub | `MarketingHub.tsx` (1,977 lines) | B2B prospecting (Exa/Tavily research + Gemini) → inserts `leads` → Ayanda calls. Cold outreach — **not reusable for consent-only consumer leads**. |
| INV-S04 | Lead Database | `LeadsTable.tsx` | Table, filters, referrals, delete. |
| INV-S05 | Referrals | `AdminReferrals.tsx`, `ReferralPipeline.tsx` | Wills referrals. |
| INV-S06 | Onboarding | `BrokerAnalysisDashboard.tsx` | Readiness-assessment scores. |
| INV-S07 | Calendar | `AdminCalendar.tsx` | Appointments/referral dates view. |
| INV-S08 | Upload Leads | `LeadUploadForm.tsx` | CSV upload (`public/templates/lead-upload-template.csv`). |
| INV-S09 | Documents | `AdminDocuments.tsx` + `ProposalGenerator.tsx`, `InvoiceGenerator.tsx`, `ContractGenerator.tsx` | Generators, save to `admin_documents`, share to broker (`send-document-notification`). |
| INV-S10 | Message Templates | `MessageTemplates.tsx` | CRUD on `message_templates`. |
| INV-S11 | AI Calls | `AICallRequests.tsx`, `AyandaCallModal.tsx` (imports `ultravox-client`, **not in `package.json`**), `CallCommandCenter.tsx` | Voice-call queue, approve proposed changes. |
| INV-S12 | Team Management | `TeamManagement.tsx` | Brokers list/edit (writes `portal_type`). |
| INV-S13 | Analytics | `Analytics.tsx`, `CommunicationAnalytics.tsx`, `SLAManagement.tsx`, `ScheduledReports.tsx` | Response-time analytics, SLA thresholds, report schedules. |
| INV-S14 | Admin Invites / Broker Invites | `AdminInvite.tsx`, `BrokerInvite.tsx` | Token invites. |
| INV-S15 | Header broker switcher | `DashboardLayout.tsx` + `BrokerSelector.tsx` | "Global Admin View" vs one broker — the per-broker lens already exists. |
| INV-S16 | Notifications | `/notifications` (`NotificationHistory.tsx`), `NotificationBell.tsx`, `use-ai-call-notifications.tsx` | AI-call notifications only (reads `ai_call_requests`). |
| INV-S17 | Communications | `UnifiedCommunicationHub.tsx`, `CommunicationPanel.tsx`, `InAppCallPanel.tsx`, `CallRecordingPlayer.tsx`, `BulkCommunicationDialog.tsx`, `LeadConversation.tsx`, `ScheduleAppointmentDialog.tsx`, `AddReferralDialog.tsx` | Per-lead message timeline + send (email/SMS/WhatsApp via `send-communication`), browser calling (Twilio), internal broker↔admin chat. |

### 4.3 Broker portal (role-scoped views inside the same app)
| ID | Route | Component | Data |
|---|---|---|---|
| INV-P01 | `/broker` | `BrokerPortal.tsx` | Login (password). |
| INV-P02 | `/broker/dashboard` | `broker/BrokerDashboard.tsx` | own `brokers`, `leads`, `referrals` counts. |
| INV-P03 | `/broker/leads` | `broker/BrokerLeads.tsx` (874 lines) | own leads, communications, referrals, notes. |
| INV-P04 | `/broker/upload` | `broker/BrokerUpload.tsx` | broker uploads own book. |
| INV-P05 | `/broker/referrals` | `broker/BrokerReferrals.tsx` | referrals. |
| INV-P06 | `/broker/calendar` | `broker/BrokerCalendar.tsx` | referral appointment dates (not a real calendar integration). |
| INV-P07 | `/broker/documents` | `broker/BrokerDocuments.tsx` | shared `admin_documents` (proposal/invoice/contract PDFs). |
| INV-P08 | `/broker/reports` | `broker/BrokerReports.tsx` | lead stats charts. |
| INV-P09 | `/broker/profile` | `broker/BrokerProfile.tsx` | `profiles` fields. |
| INV-P10 | `/broker-elite` | `PremiumBrokerPortalPage.tsx` + `components/broker/Premium*.tsx`, `SalesCoachInsight.tsx` | "Elite" single-page portal: dashboard, calendar (`appointments`), notes (`broker_notes`), documents, call coaching. |
| INV-P11 | Layout | `components/broker/BrokerLayout.tsx` | Sidebar nav: Dashboard · My Leads · Referrals · Calendar · Documents · Reports · Settings. Mobile-responsive shell exists. |

---

## 5. Edge functions (`supabase/functions/`, Deno) — one line each
`JWT` column = `verify_jwt` in `config.toml` (default true); "auth in code" = the function calls `auth.getUser()`.

| ID | Function | Trigger | What it does | External service | JWT / auth in code |
|---|---|---|---|---|---|
| INV-E01 | `book-appointment` | HTTP (Ayanda tool / client) | Sets lead `current_status='Booked'`, emails broker + lead a booking confirmation. **Does not create an appointment row or a calendar event.** | Resend | false / **none** |
| INV-E02 | `send-appointment-reminders` | pg_cron 07:00 UTC daily | Emails brokers about **referral** appointments in the next 24 h. | Resend | true / service role |
| INV-E03 | `send-communication` | Console "send" | Sends one email/SMS/WhatsApp, logs to `communications`, checks SLA → `send-sla-alert`. | Resend, Twilio SMS, **Twilio WhatsApp** | false / yes |
| INV-E04 | `send-bulk-communication` | Console bulk send | Same, many recipients. | Resend, Twilio | false / yes |
| INV-E05 | `initiate-ai-call` | Console | Creates `ai_call_requests`, dials via Twilio, connects ElevenLabs agent; Exa research for context. | Twilio Voice, ElevenLabs, Exa | false / optional |
| INV-E06 | `create-ayanda-call` | Console / Marketing Hub | Builds Ayanda prompt (broker + Exa research), creates ElevenLabs/Twilio call, logs request. | ElevenLabs, Twilio, Exa | true / none |
| INV-E07 | `create-einstein-call` | Website voice widget | ElevenLabs signed session for Einstein with role-aware context. | ElevenLabs | true / yes |
| INV-E08 | `ayanda-tools-bridge` | ElevenLabs tool webhook | `book_appointment` → creates lead if new, inserts `appointments`, updates lead, posts to **`N8N_CALENDAR_WEBHOOK_URL`** (n8n already in the design); `send_sms_confirmation` → Twilio. | Twilio, n8n | false / **none** |
| INV-E09 | `handle-inbound-call` | Twilio inbound voice webhook | TwiML that streams caller into the ElevenLabs agent with a persona. | Twilio, ElevenLabs | false / none |
| INV-E10 | `handle-ai-call-status` | Twilio status callback | Maps call status into `ai_call_requests` + `communications`. | Twilio | true / none |
| INV-E11 | `handle-ai-call-recording` | Twilio recording callback | Stores recording, completes call, triggers `analyze-call-coach`. | Twilio | true / none |
| INV-E12 | `handle-ai-call-transcription` | Twilio transcription callback | Heuristic summary + proposed changes → `send-ai-call-notification`. | Twilio | true / none |
| INV-E13 | `transcribe-call-recording` | Console button | Gemini transcribes a recording into `communications.metadata`. | Gemini 2.5 Flash | false / none |
| INV-E14 | `analyze-call-coach` | Called by INV-E11 | Gemini sales-coach + FSCA-compliance flag → `call_coaching`, `system_logs`. | Gemini | true / none |
| INV-E15 | `initiate-browser-call` / `end-browser-call` | Console softphone | Twilio call bridging broker browser ↔ client. | Twilio | true / yes, none |
| INV-E16 | `send-ai-call-notification` | Called by INV-E12 | Emails admins per `notification_preferences`. | Resend | true / none |
| INV-E17 | `einstein-ai` | Website chatbot, console advisor | Einstein persona chat (Gemini, OpenRouter fallback) with DB context. | Gemini, OpenRouter | true / yes |
| INV-E18 | `marketing-ai` | Marketing Hub | Prospect research/copy (Exa, Tavily, Gemini, OpenRouter). | Exa, Tavily, Gemini, OpenRouter | false / none |
| INV-E19 | `legal-ai-assistant` | (unused by UI — `src/utils/legalAI.ts` calls Gemini directly from the browser instead) | Gemini edit of contract/proposal/invoice JSON. | Gemini | true / none |
| INV-E20 | `analyze-broker-score` | `/onboarding` submit | Gemini explanation for `broker_analysis`. | Gemini | true / none |
| INV-E21 | `normalize-leads` | Console upload | Gemini cleans uploaded rows → inserts `leads`. | Gemini 1.5 Flash | true / none |
| INV-E22 | `send-admin-invite` / `send-broker-invite` | Console | Email invite links. | Resend | false·true / yes |
| INV-E23 | `get-broker-invite-by-token` | `/broker-setup/:token` | Validates invite (fallback to RPC). | — | true / n/a |
| INV-E24 | `send-document-notification`, `send-message-notification` | Console | Email broker about a shared doc / new chat message. | Resend | true·false / none |
| INV-E25 | `send-referral-notification`, `send-referral-success`, `send-referral-welcome` | Console (referrals) | Referral emails. | Resend | true / none |
| INV-E26 | `send-scheduled-report` | Console "send now" (no cron in repo) | Builds admin/broker comms report → email, logs `report_history`. | Resend | false / none |
| INV-E27 | `send-sla-alert` | Called by INV-E03 | Emails admins on SLA breach. | Resend | false / none |
| INV-E28 | `discord-webhook` | Discord interactions endpoint | Admin bot commands (approve calls, resets, lead lookups); verifies Discord signature. | Discord | true / signature |
| INV-E29 | `trigger-discord-alert` | Frontend | Posts an alert to Discord. | Discord | true / none |
| INV-E30 | `telegram-webhook` | Telegram bot webhook | Admin bot (pairing code, commands, Gemini answers); checks webhook secret. | Telegram, Gemini | true / secret |
| INV-E31 | `_shared/*` | imports | `ayanda_persona.ts` (fleet-insurance cold-call persona), `knowledge.ts` (old tier prices), `discord.ts`, `utils.ts` (`normalizePhoneNumber` SA → E.164). | — | — |

Total: **35 functions + `_shared`**. None touches Meta (Graph/WhatsApp Cloud/Marketing API), Microsoft Graph, Paystack or Google Calendar.

---

## 6. Existing automations and generators
| ID | Asset | Evidence | Reuse value for SortMyCover |
|---|---|---|---|
| INV-G01 | **Proposal generator** | `src/components/dashboard/ProposalGenerator.tsx` (1,016 lines) | Editable proposal → PDF; tier data **hard-coded** (R8,500/R10,500/R16,500+/R6,000, "guaranteedLeads"). 3.6 consumer #3 — rewire to `pricing`. |
| INV-G02 | **Invoice generator** | `InvoiceGenerator.tsx` (1,005 lines) | Invoice → PDF, saved as `admin_documents` category `invoices` (`tierPrice = 16500` hard-coded; "Lead Token" terms). 3.6 consumer #5. |
| INV-G03 | **Contract generator** | `ContractGenerator.tsx` (1,149 lines), `src/utils/contractToDocx.ts` (DOCX export) | Contract → PDF/DOCX; fees hard-coded. 3.6 consumer #4 (Broker Services Agreement + Schedule A). |
| INV-G04 | Smart PDF engine | `src/utils/pdfUtils.ts` (`generateSmartPDF`, html2canvas + jsPDF with page-break spacers) | Reuse for invoice/agreement/weekly-report PDFs. |
| INV-G05 | AI edit of documents | `src/utils/legalAI.ts` (`callLegalAI`) | Gemini edits generator JSON. Key exposed in the browser (§11). |
| INV-G06 | Email signature | `src/utils/emailSignature.ts`, `public/einstein-signature.png` | howzit@ signature asset. |
| INV-G07 | Scheduled reports | `scheduled_reports` + `report_history` + `send-scheduled-report` + `ScheduledReports.tsx` | Report schedule/log pattern for W14. |
| INV-G08 | SLA engine | `sla_thresholds`, `sla_alerts`, `send-sla-alert`, `SLAManagement.tsx` | Response-time SLA pattern for the < 60 s first-message SLA (6.3). |
| INV-G09 | Appointment reminders | pg_cron + `send-appointment-reminders` | Email-only, referral-based; superseded by W09/W11 (WhatsApp). |
| INV-G10 | AI voice stack | INV-E05…E16, `ai_call_requests` | The "voice fallback already half-built" (0.2). Optional W08 step / 6.8b Red-alert phone call. |
| INV-G11 | Lead normalisation | `normalize-leads`, `src/lib/format-phone.ts`, `_shared/utils.ts` | SA phone → E.164 helpers. |
| INV-G12 | Readiness scoring | `src/lib/scoring.ts`, `analyze-broker-score`, `/onboarding` | Broker-acquisition funnel asset (backlog Q10), not on the SortMyCover path. |
| INV-G13 | Explainer video | `public/lead-velocity-explainer.webm` | Existing B2B explainer; format reference only (4.10 video is new). |

---

## 7. Integrations already wired (secrets are Supabase function secrets; `.env.example` only lists the Vite/Gemini keys)
| ID | Service | Status | Where | Env names seen | SortMyCover use |
|---|---|---|---|---|---|
| INV-I01 | **Supabase** (DB/Auth/Storage/Functions/cron/Realtime) | Live | everywhere | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` | System of record (NH-09 recommendation in `crm-gap.md`). |
| INV-I02 | **Twilio** Voice, SMS, WhatsApp (Twilio sender) | Live | INV-E03/04/05/06/08/09/15 | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `TWILIO_WHATSAPP_FROM` | SMS fallback (W06), Lookup line type (W01 — **not yet used**), 6.8b escalation call. ~~Twilio WhatsApp is not the SortMyCover channel (Cloud API direct).~~ **Superseded 2026-10-06 (Jonathan, NH-MO-17): SortMyCover WhatsApp runs through Twilio.** |
| INV-I03 | **ElevenLabs** Conversational AI | Live | INV-E05/06/07/09 | `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, `ELEVENLABS_EINSTEIN_AGENT_ID` | Explainer voice-over (4.10); optional voice fallback. |
| INV-I04 | **Ultravox** | Partial | `AyandaCallModal.tsx` (`ultravox-client` import, package missing), `vite-plugin-edge-functions.ts` (dev only) | (dev env) | Voice fallback alternative; not on critical path. |
| INV-I05 | **Gemini** (Google GenAI) | Live | 8 functions + browser `legalAI.ts` | `GEMINI_API_KEY`, `VITE_GEMINI_API_KEY` | Not in 4A model routing (Claude models) — leave for legacy features. |
| INV-I06 | **OpenRouter** | Live (fallback) | `einstein-ai`, `marketing-ai` | `OPENROUTER_API_KEY` | — |
| INV-I07 | **Exa**, **Tavily** | Live | `marketing-ai`, `create-ayanda-call`, `initiate-ai-call` | `EXA_API_KEY`, `TAVILY_API_KEY` | Brief lists Tavily/Exa as available; not needed at runtime for SortMyCover. |
| INV-I08 | **Resend** (email) | Live | 11 functions; senders `appointments@`, invites | `RESEND_API_KEY` | `KNOWLEDGE_TRANSFER.md` says SendGrid — **the code uses Resend; SendGrid is not wired.** Prompt 6.7 wants Graph `Mail.Send` from howzit@ (NH-13). |
| INV-I09 | **Discord** bot | Live | `discord-webhook`, `trigger-discord-alert`, `_shared/discord.ts` | `DISCORD_BOT_TOKEN`, `DISCORD_PUBLIC_KEY` | Admin alerts today; 6.8b specifies WhatsApp to Jonathan/KG. |
| INV-I10 | **Telegram** bot | Live (superseded by Discord per migration comment) | `telegram-webhook` | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` | — |
| INV-I11 | **n8n** | Referenced only | `ayanda-tools-bridge` → `N8N_CALENDAR_WEBHOOK_URL` | `N8N_CALENDAR_WEBHOOK_URL` | Confirms n8n is already part of LV's design; no workflows in repo. |
| INV-I12 | **Google Calendar** | Column only | `brokers.google_calendar_token jsonb`, `calendar_email` | — | No OAuth flow or API calls exist. |
| INV-I13 | **Vercel** | Live | `vercel.json` | — | Current host for the CRM (NH-12). |
| INV-I14 | **Paystack / Ozow / PayFast** | **Not wired** | — | — | New (billing-automation). |
| INV-I15 | **Microsoft 365 / Graph / Entra** | **Not wired** | — | — | New (W04/W05/W16/W17; GATE-ENTRA). |
| INV-I16 | **Meta** (Marketing API, Lead Ads, WhatsApp Cloud API, CAPI, Pages/IG) | **Not wired in the CRM** | — | — | New. (This session's `automation/capi/` is a prepared, undeployed CAPI module — §12.) |
| INV-I17 | **FSCA register lookup** | **Not wired** | — | — | New (W20). |
| INV-I18 | Apollo, Serper | Not wired | — | — | Not needed. |

---

## 8. AI personas and prompts in the repo
| ID | Asset | Evidence | Reuse |
|---|---|---|---|
| INV-K01 | **Einstein-77** — website chatbot + console advisor (witty cyberpunk Einstein, ElevenLabs voice) | `KNOWLEDGE_TRANSFER.md`, `src/hooks/useChatbot.ts`, `einstein-ai`, `create-einstein-call` | LV-brand only. Never shown to SortMyCover consumers (brand separation, 2.1.3). |
| INV-K02 | **Ayanda** — outbound voice appointment setter (Johannesburg English, "never says Lead Velocity") | `knowledge/AYANDA ai agent.md` (251 lines: FSCA/no-advice rules, language switching, DNC handling), `supabase/functions/_shared/ayanda_persona.ts` (fleet/logistics cold-call script, NEPQ) | **Partial reuse for 4.11** (conversation-designer): the no-advice rules, deferral phrasing, language switching and DNC handling. **Do not reuse** the cold-outreach elements ("details came from public listings", gatekeeper scripts, pattern-interrupt hooks) — SortMyCover is consent-only (2.1.2). |
| INV-K03 | **Master Architect** persona | `knowledge/ARCHITECT.md`, `.cursorrules` | Cursor-era meta prompt (stack listed as "Antigravity + Supabase + Vercel + GoDaddy"). Superseded by `CLAUDE.md` + `.claude/agents/*` for this build. |
| INV-K04 | LV tier knowledge | `supabase/functions/_shared/knowledge.ts`, `useChatbot.ts` | Old tier prices — must be re-pointed to `pricing` (W25 diff check will flag them). |

---

## 9. Test setup
**None.** No test runner (`vitest`/`jest`/`playwright` absent from `package.json`), no `test` script, no CI workflow (`.github/` absent), no fixtures. Ad-hoc scripts (`test-db.js`, `test-login.js`, `check_schema.js`, `analyze_onboarding.js`) hit the live project. `build_output.txt` is a saved build log; `ts_errors.txt` is empty. ESLint is configured (`eslint.config.js`, `npm run lint`). The only automated tests in the repo today are this session's `automation/capi/capi.test.js` (Node `--test`, §12). Pre-mortem #15 applies: the synthetic 10-lead suite + rehearsal are the "done" test, and they need a test harness that does not exist yet.

---

## 10. Secrets handling
| ID | Item | Evidence |
|---|---|---|
| INV-X01 | `.env.example` | Lists only `VITE_SUPABASE_*` and `GEMINI_API_KEY` names. Edge-function secrets live in Supabase (not listed anywhere in the repo). |
| INV-X02 | `.gitignore` | Ignores `.env`, `.env.*` (except example), `*.pem`, `*.key`, `credentials*`, local admin scripts, and **all `*.json` / `*.txt`** with explicit exceptions (NH-10). |
| INV-X03 | Pre-commit guard | `.githooks/pre-commit` blocks secret files and common key patterns (Anthropic, Stripe-style, AWS, GitHub, Slack, Meta `EAA…`, Twilio `AC…`, Supabase `sb_secret_`, service-role JWT assignments). Enabled by `npm install` (`prepare`). |
| INV-X04 | Committed values (pre-existing) | `add_demo_lead.cjs` (tracked) contains the project URL and the **anon** key (public by design, low risk). `reset-admin.js` and `test-login.js` are **tracked despite being in `.gitignore`** and contain literal passwords (values not reproduced here). See §11 / NH-15. |

---

## 11. Pre-existing security and POPIA findings (must be closed before SortMyCover consumer data shares this database)
| # | Finding | Evidence | Risk |
|---|---|---|---|
| S1 | `broker_onboarding_responses` and `broker_analysis` have `FOR ALL USING (true) WITH CHECK (true)` | `20260223120000_fix_onboarding_schema.sql` | Anyone with the public anon key can read/alter prospect brokers' names, emails, phones, WhatsApp numbers. POPIA s19 security safeguard. |
| S2 | `appointments` "Admins can manage all appointments" and `broker_notes` "Admins can manage all notes" are `FOR ALL USING (true)` (no role check, no `TO authenticated`) | `20260225220000_premium_broker_portal.sql` | Any caller can read/write every appointment and note. Second `appointments` policy compares `auth.uid()` to `broker_id` (wrong key). |
| S3 | Storage bucket `admin-documents` re-declared `public: true` with a "Public Access" SELECT policy | `20260226230000`, `FIX_PROPOSAL_RLS.md` | Invoices/contracts readable by URL. |
| S4 | Service-role edge functions with `verify_jwt=false` and no auth check | `book-appointment`, `ayanda-tools-bridge`, `marketing-ai`, `send-scheduled-report`, `send-sla-alert`, `transcribe-call-recording`, `send-message-notification`, `handle-inbound-call` (config.toml + code) | Unauthenticated writes to `leads`/`appointments`, email/SMS sending, paid API use. Twilio webhooks are not signature-checked. |
| S5 | Gemini key used from the browser | `src/utils/legalAI.ts` (`VITE_GEMINI_API_KEY`) | Key is in the public JS bundle. |
| S6 | Passwords in tracked scripts | `reset-admin.js`, `test-login.js` | Rotate; untrack. |
| S7 | Security answers stored in plain text | `broker_security_questions`, `profiles.security_answer_*` | Hash or drop when magic links replace passwords. |
| S8 | No audit log | — | Salesforce-style "audit log on every write" absent. |
| S9 | Ayanda cold-call prompt says numbers "came from public listings" | `knowledge/AYANDA ai agent.md` | Fine for the B2B product's own compliance review; must never reach SortMyCover leads. |

---

## 12. Already in the repo from this build session (untracked, not part of the pre-existing CRM)
| Path | Owner | State |
|---|---|---|
| `landing/holding/*` (index, about, how-we-make-money, privacy, complaints, 404, `.htaccess`, sitemap, staging password README) | landing-page-builder / search-findability-lead | Holding site for sortmycover.co.za, not deployed. |
| `landing/shared/pixel.js` + README | attribution-analyst | Pixel + `event_id` + utm/fbclid capture, not deployed. |
| `automation/capi/*` (`capi.js`, `capi.test.js`, `event-spec.md`, `.env.names`) | attribution-analyst | CAPI sender + 11 offline tests; `event-spec.md` lists the join-key columns platform-architect must add (folded into `crm-gap.md` §A). |
| `deliverables/attribution-analyst/`, `deliverables/search-findability-lead/` | those agents | Summaries. |
| `build/tasks.json`, `validate-tasks.mjs`, `decisions.md`, `gates-batch.md`, `gates.jsonl`, `backlog.md`, `costs.jsonl` | orchestrator | Build state. |
| `.claude/agents/*.md` (23) | orchestrator | Agent files. |

---

## 13. 0.2 assets NOT in this repo — Jonathan to supply (open question 4b / gate Q4b)
| 0.2 asset | Looked for | Status | Fallback if not supplied |
|---|---|---|---|
| Vantage Stack orchestration prompts | repo-wide search | **not in repo — Jonathan to supply (open question 4b)** | Orchestrator runs from `docs/MASTER-PROMPT.md` + `CLAUDE.md` (already the case). |
| EMMA research assistant | repo-wide search | **not in repo — Jonathan to supply (open question 4b)** | Not needed: 0.1 says research is done. |
| Ultravox/ElevenLabs voice-agent system prompts (insurance broker use case) | `knowledge/`, `_shared/` | **Partly in repo** (Ayanda, INV-K02 — fleet/SME cold-call variant). The life-cover broker variant with FAIS deferral language: **not in repo — Jonathan to supply (open question 4b)** | conversation-designer writes deferral language from 4.11 using INV-K02's no-advice rules. |
| Proposal / invoice / contract generators | `src/components/dashboard/*Generator.tsx` | **In repo** (INV-G01…G03) | — |
| leadvelocity.co.za site (Hostinger) | `src/pages/*` | The marketing site **in this repo** (Home/Pricing/…) is deployed on **Vercel** (INV-03). A separate Hostinger-hosted copy is **not in repo — Jonathan to supply (open question 4b)**, or confirm the Vercel app *is* the live site (NH-12). | — |
| Content-engine brand system (colours, type, voice) | `tailwind.config.ts`, `src/index.css` | CRM has its own dark "neon/glassmorphism" LV theme only. Content-engine files: **not in repo — Jonathan to supply (open question 4b)** | brand-naming-lead's `/brand/tokens.json` (6B.8) becomes the SortMyCover source. |
| Microsoft 365 (howzit@), FNB, GoDaddy DNS, Hostinger | configs | Not code assets; howzit@ is the seeded admin account (`20260228000000_ensure_admin_role.sql`). Wired later via GATE-ENTRA / GATE-INCONTACT / GATE-DNS. | — |
| Claude Code CLAUDE.md memory workflow | `CLAUDE.md` | **In repo** (seeded this session). | — |
