# Environment checklist (names only, never values)

Where values live: the repo-root `.env` on the laptop (git-ignored), and for cloud sessions claude.ai/code, Settings, Environments. Never in chat, never in git. Full descriptions: `automation/.env.example` (and `.env.example` for the browser `VITE_` values). Required = the build needs it; Optional = leave empty and nothing breaks.

## 1. Now (no outside account needed, or you already have it)
| Name | Where Jonathan gets it | Req |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard, Project settings, API | Required |
| `SUPABASE_DB_URL` | Supabase dashboard, Connect, direct connection string (used by `scripts/nh15-apply.sh`) | Required |
| `SUPABASE_PROJECT_REF`, `SUPABASE_ACCESS_TOKEN` | Project settings (ref); Supabase account, Access tokens | Required for CLI deploys |
| `SUPABASE_JWT_SECRET` | Project settings, API, JWT secret | Required |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` | Same dashboard (public values only) | Required |
| `ANTHROPIC_API_KEY` | console.anthropic.com | Required |
| `ANTHROPIC_MODEL_FAST`, `ANTHROPIC_MODEL_STRONG`, `ANTHROPIC_MODEL_CHECK` | Model ids Claude gives you | Required |
| `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`, `TWILIO_LOOKUP_ENABLED` | Twilio console (Lookup, SMS fallback) | Required for the lead line-type check; optional otherwise |
| `TWILIO_AUTH_TOKEN`, `TWILIO_SMS_FROM`, `TWILIO_VOICE_FROM` | Twilio console | Optional (SMS fallback, red-alert call) |
| `TURNSTILE_SECRET_KEY`, `TURNSTILE_SITE_KEY` | Cloudflare dashboard, Turnstile | Required |
| `LEAD_TOKEN_SECRET`, `INTERNAL_HMAC_SECRET`, `META_CONFIRM_SECRET`, `TOKEN_ENC_KEY`, `RATE_LIMIT_IP_SALT`, `COMMENT_HASH_SALT`, `W34_MEDIA_ERASE_SECRET`, `N8N_ENCRYPTION_KEY` | Claude generates random values on the laptop; you keep the backup copy of `N8N_ENCRYPTION_KEY` off the machine | Required |
| `N8N_BASIC_AUTH_USER`, `N8N_BASIC_AUTH_PASSWORD`, `N8N_API_KEY` | You choose / n8n creates | Required |
| `TUNNEL_TOKEN`, `N8N_PUBLIC_URL`, `WEBHOOK_URL` | Cloudflare Tunnel (free) | Required until the server exists |
| `NODE_ENV`, `TZ`, `GENERIC_TIMEZONE`, `BRAND_ID`, `CONSUMER_DOMAIN`, `PORTAL_URL`, `CONSOLE_URL`, `PUBLIC_ALLOWED_ORIGINS`, `LOG_REDACTION`, `DRY_RUN_SENDS` | Fixed values in `automation/.env.example` comments; `BRAND_ID` is the SortMyCover row id from the console | Required |
| `OPS_WHATSAPP_JONATHAN`, `OPS_WHATSAPP_KG`, `OPS_EMAIL` | Your numbers (E.164) and howzit@ | Required |
| `WHATSAPP_TEST_PHONE_NUMBER_ID`, `WHATSAPP_TEST_RECIPIENTS` | Meta developer app, WhatsApp test number (staging) | Required until the real number exists |
| `VITE_SMC_ENABLED`, `VITE_N8N_WEBHOOK_BASE`, `VITE_SMC_*` | Public URLs, set by Claude from the tunnel / static host | Required for the portal build |
| `TRANSCRIBE_API_KEY`, `TRANSCRIBE_URL`, `WHISPER_MODEL` | Speech-to-text provider (voice notes, intro media) | Optional (media path stays off if empty) |
| `SUPABASE_S3_ENDPOINT`, `SUPABASE_S3_REGION`, `SUPABASE_S3_ACCESS_KEY`, `SUPABASE_S3_SECRET_KEY` | Supabase, Storage, S3 connection | Required for intro media |
| `GEMINI_API_KEY` | Edge-function secret only, never `VITE_` | Optional (legacy CRM) |
| `GOOGLE_*`, `ZOOM_*` | Google Cloud / Zoom Marketplace | Optional (only for brokers on those tools) |
| `EMAIL_PROBE_ENABLED`, `EMAIL_PROBE_API_KEY` | Email-check provider | Optional (off) |

## 2. After Meta (LAPTOP-QUICKSTART steps 3 to 9)
| Name | Where | Req |
|---|---|---|
| `META_BUSINESS_ID` | Business Settings, Business info | Required |
| `META_APP_ID`, `META_APP_SECRET` | developers.facebook.com, App settings, Basic | Required |
| `META_SYSTEM_USER_TOKEN` | Business Settings, System users, `smc-automation`, Generate token (expiry Never) | Required |
| `META_WEBHOOK_VERIFY_TOKEN` (alias `META_VERIFY_TOKEN`) | You invent a random string; the same one goes into the webhook setup | Required |
| `META_GRAPH_VERSION` (alias `META_API_VERSION`) | `v23.0` unless Claude advises otherwise | Required |
| `PAGE_ID`, `IG_USER_ID` | Page and Instagram settings (also stored in the brands row) | Required |
| `PAGE_ACCESS_TOKEN` | Generated for the Page via the system user | Required for comment/DM replies |
| `AD_ACCOUNT_ID` (`act_...`), `STANDBY_AD_ACCOUNT_ID` | Business Settings, Ad accounts | Required (standby optional) |
| `WABA_ID`, `PHONE_NUMBER_ID`, `WA_PHONE_NUMBER_ID` (same value), `STANDBY_PHONE_NUMBER_ID`, `WA_2FA_PIN` | WhatsApp Manager (Branch A). `WA_2FA_PIN` you choose | Required with Branch A; test number covers the gap |
| `WHATSAPP_PROVIDER` | `meta` (default) or `twilio` | Required |
| `TWILIO_WHATSAPP_FROM`, `TWILIO_CONTENT_SIDS` | Twilio console, only for Branch B | Optional (Branch B only) |
| `PIXEL_ID`, `DATASET_ID` | Events Manager | Required |
| `CAPI_TEST_EVENT_CODE` (alias `META_TEST_EVENT_CODE`) | Events Manager, Test events (staging only; empty in production) | Optional |
| `BOOKING_FLOW_ID`, `RESCHEDULE_FLOW_ID`, `FLOW_ENDPOINT_URL`, `FLOW_PRIVATE_KEY`, `FLOW_PUBLIC_KEY` | After the Flow is published (W28); 10-slot list is the launch path | Optional (not on the critical path) |
| `CTWA_BASE_URL`, `WA_DISPLAY_NUMBER_DIGITS` | Set by Claude from the live number and domain | Required once the number is live |

## 3. After Entra (step 11)
| Name | Where | Req |
|---|---|---|
| `MS_TENANT_ID` | portal.azure.com, Entra ID, Overview | Required |
| `MS_GRAPH_CLIENT_ID` | App registration, Overview | Required |
| `MS_CLIENT_SECRET` | App registration, Certificates and secrets (shown once; expiry is tracked) | Required |
| `MS_GRAPH_REDIRECT_URI` | `{N8N_PUBLIC_URL}/webhook/ms/callback`, same as on the app | Required |
| `MS_ADMIN_CONSENT_URL`, `VITE_MS_OAUTH_URL`, `VITE_MS_ADMIN_CONSENT_URL` | Built by Claude from the client id | Required |
| `HOWZIT_MAILBOX` | `howzit@leadvelocity.co.za` | Required |
| `SMC_SHARED_CALENDAR_ID` (`SHARED_FALLBACK_CALENDAR_ID`) | Graph id of the howzit@ shared calendar (fallback if a broker tenant blocks consent) | Optional until a broker needs it |
| `MS_GRAPH_SUBSCRIPTION_SECRET`, `MS_OAUTH_STATE_SECRET` | Claude generates | Required |

## 4. After payment (Mark has paid; server bought, W26)
| Name | Where | Req |
|---|---|---|
| `VPS_HOST`, `VPS_SSH_USER`, `VPS_SSH_KEY_PATH` | Hostinger hPanel after you buy KVM 2 (you pay); key stays on the laptop | Required |
| `TRAEFIK_ACME_EMAIL` | howzit@ | Required |
| `N8N_UI_HOST`, `N8N_UI_ALLOW_IPS`, `API_HOST`, `LINK_HOST` | `n8n.`, `api.`, `link.` hosts; your office/home IPs | Required |
| `BACKUP_S3_ENDPOINT`, `BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY`, `BACKUP_S3_SECRET_KEY`, `BACKUP_S3_REGION` | Backup bucket you create (NH-29b) | Required |
| `BACKUP_AGE_RECIPIENT` (public key only), `BACKUP_DB_URL` | Claude makes the age key pair; private key stays off the server. Read-only DB role URL from Supabase | Required |
| `OPS_PING_URL` | Uptime monitor heartbeat URL | Optional |
| `DB_POSTGRESDB_*` | Postgres container on the server | Required on the server |
| `TEST_HOOKS_ENABLED`, `TEST_HOOKS_TOKEN` | Staging only; never set on the server | Staging only |

## 5. Post-launch (NH-61: not needed for launch, leave empty)
Cycle 1 is manual EFT. The code is built; these stay off.
| Name | Where | Req |
|---|---|---|
| `PAYSTACK_ENABLED=false`, `VITE_PAYSTACK_ENABLED` empty | Flip only after KYC clears | Optional |
| `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY`, `PAYSTACK_WEBHOOK_SECRET` | dashboard.paystack.com after GATE-PAYSTACK-KYC | Optional (post-launch) |
| `OZOW_SITE_CODE`, `OZOW_PRIVATE_KEY`, `OZOW_API_KEY` | Ozow, only if used instead of Paystack | Optional |
| `INCONTACT_ENABLED=false`, `FNB_INCONTACT_SENDER`, `FNB_SENDER_ADDRESSES`, `FNB_SENDER_DOMAINS` | FNB inContact alerts to howzit@ (GATE-INCONTACT) | Optional (post-launch) |
| `STATEMENT_IMPORT_ENABLED=false`, `BILLING_STATEMENT_INBOX` | Statement import | Optional |
| `NCC_REGISTRY_MODE`, `NCC_REGISTRY_ENDPOINT` | Default `csv`; API only after GATE-NCC records the mechanism | Optional |
| `FSCA_REGISTER_URL` | Open question (NH-BS-09); onboarding checks FSP by hand until set | Optional |
