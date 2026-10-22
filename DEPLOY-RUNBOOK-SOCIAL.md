# Deploy runbook: Lindi on Facebook and Instagram (W40 Social replies)

Branch `feat/smc-social-lindi` (worktree `C:\tmp\lv-social`), on top of `fix/smc-smoke-2026-10-21` @ `fa856c4` (the smoke-fix
release being deployed on 21 Oct 2026). Plan: `Desktop\EMMA\checklist\SOCIAL-AUDIT-LINDI-SMC-2026-10-21.md` sections 3 to 5
(Jono's go, 21 Oct 2026: "Social apply 21 profile fixes, yes").

**Nothing here has been deployed, imported, subscribed, sent or changed in any env.** Every step below is a production change
and needs Jono's go. Shadow mode comes first; nothing is sent to anyone until the shadow week passes and Jono switches a
channel to live.

## What is in the branch

| Area | Files | Effect once deployed |
|---|---|---|
| Lindi's social brain | `automation/lib/social.mjs` (new, `require('lv-automation').social`) | Event formats, signature check, routing by case, the reply gate, hours, STOP, under 18, human takeover, circuit breaker, Graph calls |
| Workflow | `automation/build-w40.mjs` -> `automation/W40.json` (new, `smc-w40`) | `POST/GET /webhook/meta-social` (Instagram object) + Execute Workflow from W02 (Page object). Saves no execution data |
| W02 | `automation/patch-w02-social.mjs` -> `automation/W02.json` | Page feed comments, Messenger, standby and hand-overs go to W40, **only when `SOCIAL_MODE` is shadow or live**. Lead ads unchanged |
| W22 | `automation/lib/w22.mjs`, `W22.md` | `community_escalation` now from W40; new red `social_distress` and `social_breaker` |
| Fixed lines | `conversation/lines.mjs` (`SOCIAL_*`), `conversation/handoff.md` ("Social lines"), `conversation/prompts/lindi-social.md` | English only (v1). Drift check passes |
| Copy fixes | `knowledge/faq.md` (FAQ-02, FAQ-09, FAQ-23), `community/reply-corpus.md`, `community/classifier-prompt.md`, `sites/sortmycover/docs/WHATSAPP-OPENERS.md` | No "free", no licence words, no "AI"; "SortMyCover takes no fee from you for the call" (Jono). **FAQ-02/09/23 are live WhatsApp Lindi answers too** (W07 reads faq.md at runtime) |
| Tests + evals | `automation/tests/social.test.mjs` (22 tests), `evals/comment-cases.json` v2 (30), `evals/social-red-team.json` (38), `evals/run.mjs` section 4b | All FAIS-gated at 100% |
| Privacy draft | `deliverables/social-lindi/PRIVACY-NOTICE-ADDITIONS-SOCIAL.txt` | For the site team. The site was not edited |

## Corrections to the plan (found while building)

1. **Do not set `DRY_RUN_SENDS=true` for the shadow week.** It is one global switch: it would stop WhatsApp Lindi, W12 and
   every other live send. `SOCIAL_MODE=shadow` already sends nothing on Facebook or Instagram (W40 writes drafts only).
   `DRY_RUN_SENDS` stays honoured by W40 as the global kill switch.
2. **Distress gets no automated text on social either.** `conversation/handoff.md` trigger 6 (compliance-qa) says no automated
   content for self-harm or bereavement. W40 sends nothing, raises a red `social_distress` to Jono and KG, and pauses the
   thread. The SADAG line in the sign-off list is for the person's own reply (verify the number before go-live: `0800 567 567`,
   SADAG Suicide Crisis Helpline).
3. **The digest goes from `hello@sortmycover.co.za`, not howzit@.** `team-notify` (howzit@) needs the Supabase service-role
   key, which n8n does not hold. The digest uses the same `smc-email-send` relay as W22, to `OPS_ALERT_EMAIL` (and
   `OPS_ALERT_EMAIL_KG` if set). It holds passed drafts only, never incoming text or names.
4. **Every stored Meta id is a salted hash** (comment ids, message ids, our own reply ids, person ids). `SOCIAL_HASH_SALT`
   must never change once set: the STOP list and the takeover markers are keyed on it.

## Offline evidence (21 Oct 2026, this worktree)

- `LV_TEST_PG=off node --test automation/tests/*.test.mjs`: 1028 pass, 0 fail, 10 skipped (the local-Postgres tests) of
  1038; `social.test.mjs` 22/22. With Docker Postgres on (this laptop, rebased on `fa856c4`): 1036 pass, 1 fail of 1038;
  the one failure (`W13-claim-tx.local`, concurrency under the parallel Docker run) passes 2/2 when run alone and touches
  no file in this branch.
- `node evals/run.mjs --dry-run`: PASS (FAIS 100%; `fais.social_route` 68/68, `fais.social_lines` 29/29).
- media 35/35, scripts 25/25, templates 66 checked / 0 errors, tasks.json valid. Not run: landing Playwright / axe and the
  site build (no landing or site source changed).
- `node automation/build-w40.mjs` and `node automation/patch-w02-social.mjs` are idempotent (generator test byte for byte).

---

## Part A. Jono's clicks in Meta (audit section 4)

**Now (profile work)**
1. **Check the WhatsApp connection.** business.facebook.com/settings > Accounts > WhatsApp accounts > the SMC account >
   Connected assets: is the Sort My Cover Page listed? Do not re-link anything (re-linking can disconnect the number from live ads).
2. **Approve the rows in audit section 2.** Claude makes the changes in your Chrome or through the Graph API.
3. **Instagram message access.** Instagram app: Profile > menu > Settings and activity > Messages and story replies >
   Message controls > Connected tools > Allow access to messages = ON.
4. **Require 2FA.** business.facebook.com/settings > Security Center > Two-factor authentication > Required for everyone.
5. **Lead Ads terms.** facebook.com/ads/leadgen/tos with the Sort My Cover Page selected (before the Mark Instant Form).

**For Lindi, in this order**

6. **App basics.** developers.facebook.com/apps/2615802055547479 > Settings > Basic: privacy policy URL
   (https://sortmycover.co.za/privacy/), data-deletion instructions URL, Live mode on.
7. **Messenger permission.** Same app: Use cases > Add "Engage with customers on Messenger from Meta" > Customize > add `pages_messaging`.
8. **System user access.** business.facebook.com/settings > Users > System users > SortMyCover n8n > Assigned assets:
   the Page has Messages / full control, and @sortmycover is assigned.
9. **New token.** Same screen: Generate new token > SortMyCover Leads > Never expires. Tick every scope the current token
   has (Claude reads the list read-only with `debug_token` first) plus `pages_messaging`. **You** put it in the VPS env as
   `META_SYSTEM_USER_TOKEN`; Claude never sees it. Do this outside CPA hours (the restart drops webhooks for about 30 s).
   Revoke the old token once Claude has confirmed the new one works.
10. **Approve the env vars** in Part B, step B3.
11. **Webhooks** (only after W40 is live in shadow, step B6, because Meta calls the endpoint when you subscribe).
    App Dashboard > Webhooks:
    - Page object: keep the meta-leadgen callback; add `feed`, `messages`, `messaging_postbacks`, `message_echoes`,
      `messaging_handovers`, `standby`, `messaging_referrals`.
    - Instagram object: callback `https://n8n.sortmycover.co.za/webhook/meta-social`, verify token = `META_WEBHOOK_VERIFY_TOKEN`,
      fields `comments`, `messages`, `messaging_postbacks`, `messaging_handover`, `standby`, `messaging_seen`.
    - Then give Claude the go-ahead to subscribe the Page **with `leadgen` kept in the list** (without it, lead ads stop).
12. **Non-role test.** Someone with no role on the app or the Page comments on one post on each platform and DMs both accounts.
13. **App Review.** App Dashboard > App Review > Permissions and features: Advanced Access for `pages_messaging`,
    `instagram_manage_messages`, `instagram_manage_comments`, `pages_manage_engagement` (Human Agent only if we keep
    Instagram private replies). Claude prepares the screencasts and notes. Private replies need it in every case.
14. **Per channel, at go-live only:** Page settings > Advanced messaging: bot type hybrid, SortMyCover Leads as the default
    app under Conversation routing. Leave "Take control of conversations with your Business AI" off. Turn off the Business
    Suite Instant reply and FAQs for that channel.
15. **Sign-offs (you and KG):** `conversation/prompts/lindi-social.md`, the `SOCIAL_*` lines in `conversation/handoff.md`,
    the SADAG line for the care note, and `community/hide-words.txt` (still DRAFT). Type any slurs yourself under Page
    settings > Moderation and IG > Settings > Hidden words.

---

## Part B. Deploy in shadow (each step needs Jono's go)

Helpers (`n8nq`, `n8nmark`, `sbq`) are the ones in `DEPLOY-RUNBOOK-SMOKE-FIXES.md`. `ssh emma-vps` is key-only: always
`-n` or `-o BatchMode=yes`.

### B0. Preconditions
- The smoke-fix release (`fix/smc-smoke-2026-10-21`) is deployed and checked. This branch contains it and adds only the
  files above.
- The privacy notice additions are **published** on sortmycover.co.za/privacy (site team, from the draft). The audit
  makes this a precondition of shadow mode, because shadow mode already processes comments and messages.
- ElevenLabs agent_8201 retention: Claude reads the current setting (read-only) and, with your OK, sets it to 30 days or less.
- No SMC client has a call in the next 30 minutes (the smoke runbook's pre-check query).

### B1. Snapshot
`ssh -n emma-vps '/opt/leadvelocity-n8n/backup.sh && ls -t /opt/leadvelocity-n8n/backups | head -1'` and record
`n8nq <<<"SELECT id, active, \"activeVersionId\" FROM workflow_entity WHERE id IN ('smc-w02','smc-w22','smc-w40');"`
(W40 has no row yet). Back up the env: `ssh -n emma-vps 'cp -p /opt/leadvelocity-n8n/repo/.env /root/env-backup-$(date +%Y%m%d%H%M%S)-social'`.

### B2. Env vars to approve (W40 does nothing without them)

| Var | Value | Who | Note |
|---|---|---|---|
| `SOCIAL_MODE` | `shadow` | Claude, on your go | `off` / unset = W40 does nothing and W02 forwards nothing (the kill switch) |
| `SOCIAL_CHANNELS` | `fb_comments,ig_comments,ig_dm,messenger` | Claude | Unset = no channel. Add `private_replies` only after App Review |
| `SOCIAL_HUMAN_PAUSE_HOURS` | `24` | Claude | Quiet time after the last human message |
| `SOCIAL_HASH_SALT` | 64 random hex characters | **You** (`openssl rand -hex 32` on the VPS, straight into `.env`) | Never rotate it, never print it. Without it W40 stays off |
| `META_WEBHOOK_VERIFY_TOKEN` | already set for W02 | - | W40's GET handshake uses the same variable |
| `OPS_ALERT_EMAIL_KG` | KG's address (optional) | Claude | Adds KG to the daily shadow digest |
| `META_SYSTEM_USER_TOKEN` | the new token (Part A step 9) | **You** | Needs `pages_messaging` for Messenger and private replies |

Already present and reused: `META_APP_SECRET` (signature), `LINDI_BRAIN_URL` + `LINDI_RELAY_TOKEN` (smc-lindi-chat, ElevenLabs),
`BRAND_ID`, `OPS_ALERT_EMAIL`, `META_GRAPH_VERSION`, `META_APP_ID` (optional; defaults to 2615802055547479).
**Do not touch `DRY_RUN_SENDS`** (correction 1).

Command for Claude's part (values are not secrets):
```bash
ssh -n emma-vps 'cd /opt/leadvelocity-n8n/repo && for kv in SOCIAL_MODE=shadow SOCIAL_CHANNELS=fb_comments,ig_comments,ig_dm,messenger SOCIAL_HUMAN_PAUSE_HOURS=24; do k=${kv%%=*}; grep -q "^$k=" .env || printf "%s\n" "$kv" >> .env; done; grep -cE "^SOCIAL_(MODE|CHANNELS|HUMAN_PAUSE_HOURS|HASH_SALT)=." .env'
```
Your part: `ssh emma-vps` then `cd /opt/leadvelocity-n8n/repo && grep -q '^SOCIAL_HASH_SALT=' .env || echo "SOCIAL_HASH_SALT=$(openssl rand -hex 32)" >> .env`.
Post-check: the grep returns 4. Rollback: delete the lines and recreate n8n (below).

### B3. Runtime libs
`automation/emma-vps/deploy.sh feat/smc-social-lindi` from `C:\tmp\lv-social` (clean tree; deploy.sh ships committed files and
recreates n8n, which also loads the env from B2).
- Post-check: `ssh -n emma-vps 'grep -c "social-v1.0.0" /opt/leadvelocity-n8n/repo/automation/lib/social.mjs; docker exec lv-n8n-n8n-1 printenv SOCIAL_MODE'` shows `1` and `shadow`; `curl -s -o /dev/null -w "%{http_code}\n" https://n8n.sortmycover.co.za/healthz` returns 200.
- Live WhatsApp effect: FAQ-02, FAQ-09 and FAQ-23 answers change wording (no "free", no "30-day cycle", no "AI model").
- Rollback: `automation/emma-vps/deploy.sh fix/smc-smoke-2026-10-21`.

### B4. Import W40 and W02 (quiet time, one window)
`ssh -n emma-vps 'bash /opt/leadvelocity-n8n/repo/automation/emma-vps/import_wf.sh W40 W02'` (W40 first, so W02's sub-call
target exists; W22 needs no import: its JSON did not change, only the lib).
- Pre-check: `n8nmark smc-w02 meta-social` shows `new_code = f`.
- Post-check: `n8nmark smc-w40 planEvents` and `n8nmark smc-w02 smc-w40` show `t | ... | t`.
- Rollback: `SOCIAL_MODE=off` stops both at once (W40 does nothing, W02 forwards nothing). For a full rollback, re-publish
  W02's version from B1 (`docker exec lv-n8n-n8n-1 n8n publish:workflow --id=smc-w02 --versionId=<old>`) and restart n8n;
  W40 can stay imported, it is inert with `SOCIAL_MODE=off`.

### B5. Signed synthetic events (before any Meta subscription)
Run on the VPS so the secret never leaves it; synthetic ids only:
```bash
ssh -n emma-vps 'cd /opt/leadvelocity-n8n/repo && S=$(grep -E "^META_APP_SECRET=" .env | cut -d= -f2-) node -e "
const c=require(\"crypto\");const s=process.env.S;
const post=async(b,sig)=>{const r=await fetch(\"https://n8n.sortmycover.co.za/webhook/meta-social\",{method:\"POST\",headers:{\"content-type\":\"application/json\",\"x-hub-signature-256\":sig},body:b});console.log(r.status)};
const b=JSON.stringify({object:\"instagram\",entry:[{id:\"17841480839297574\",time:Math.floor(Date.now()/1000),changes:[{field:\"comments\",value:{id:\"17950000000009001\",text:\"How much does this cost?\",from:{id:\"1784000000009999\",username:\"synthetic.test\"},media:{id:\"17900000000009001\"}}}]}]});
post(b,\"sha256=\"+c.createHmac(\"sha256\",s).update(b).digest(\"hex\")).then(()=>post(b,\"sha256=\"+\"0\".repeat(64)));"'
```
Expect `200` then `401`. Then:
- `sbq "select intent, metadata->>'op' op, metadata->>'mode' mode, content from communications where workflow='W40' order by created_at desc limit 3;"`
  shows one inbound row (no content) and one bot draft (`price`, `public_reply`, `shadow`, the SOCIAL_PUBLIC_COST line).
- Jono gets one red "webhook_signature_invalid" alert email (the 401).
- **The lead-ad path still works:** run the smoke runbook's lead-ad check (or `/test/leadgen` on staging). W02's 200 and the
  W01 hand-off are unchanged.
- Cleanup (synthetic rows): `sbq "update communications set content=null, external_id=null, redacted=true where workflow='W40' and metadata->>'mode'='shadow' and created_at > now() - interval '1 hour';"`

### B6. Meta subscriptions (Part A step 11, then Claude subscribes the Page with `leadgen` kept)
Post-check: `GET /<page-id>/subscribed_apps` lists `leadgen` and the new fields; one real lead ad test still lands in W01.
Rollback: re-subscribe the Page to `leadgen` only.

### B7. Shadow week (7 days)
Lindi drafts, sends nothing. A daily 07:30 digest (passed drafts only) goes to `OPS_ALERT_EMAIL` (+ `OPS_ALERT_EMAIL_KG`).
Real events are reviewed as they arrive. **Exit** when: 7 days are up; 100% of FAIS and needs-a-person cases were handled
correctly; intent at least 95% correct; no draft failed the banned-word check; the signed test events and the red-team
cases pass (`node evals/run.mjs --dry-run`); you and KG approve the templates.

### B8. Go live, one channel at a time
`SOCIAL_MODE=live` with `SOCIAL_CHANNELS` widened step by step: `fb_comments,ig_comments` (public replies and hides) ->
`+ig_dm` -> `+messenger` -> `+private_replies` (after App Review). Routing (Part A step 14) and the native auto-replies
change at each step. Each change: edit `.env`, `./dc up -d --force-recreate n8n`.
- **Kill switch:** `SOCIAL_MODE=off` (W40 does nothing, W02 forwards nothing; re-read before every send).
- **Circuit breaker:** 60 events in 10 minutes drops a live decision to shadow and raises a red `social_breaker`.
- **Rollback:** re-subscribe the Page to `leadgen` only.

## Optional (DDL, your go): a thread index
W40 reads `communications` by `metadata->>'thread'`. At current volume a scan is fine. If the table grows:
`create index concurrently if not exists communications_w40_thread_idx on public.communications ((metadata->>'thread')) where workflow = 'W40';`

## Records
After go-live: update the launch checklist (ArtifactData) and `MEMORY.md` with the live state, and prepare the App Review pack.
