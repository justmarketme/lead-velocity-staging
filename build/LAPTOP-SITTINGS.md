# Laptop sittings: one paste per sitting

Same work as `build/LAPTOP-QUICKSTART.md`, but merged so you paste **one prompt per sitting**. Open the Claude Desktop app on the laptop with Claude in Chrome switched on, open this repo folder, and paste the block. Claude does the clicking and stops only where you have to act.

| Sitting | Covers quickstart steps | Your time | Then wait for |
|---|---|---|---|
| 1. Domains, DNS, Meta check | 1–6 | ~1.5 h | DNS to resolve (minutes to hours), Business Verification (days) |
| 2. WhatsApp, app, Pixel, templates | 7–10 | ~1.25 h | Template approval (1–48 h) |
| 3. Microsoft, env vars, schema check | 11–13 | ~35 min | Your `NH-15 yes` |
| 4. Live database apply | 14 | ~5 min | — |

Sitting 2 needs sitting 1's DNS to resolve first (Claude checks this before it starts).

---

## Sitting 1: domains, DNS, Meta check (quickstart 1–6)

```text
You are working in the lead-velocity-staging repo on my laptop. Use Claude in Chrome to do the clicking. Read build/LAPTOP-QUICKSTART.md, automation/dns/DNS.md, deliverables/meta-operator/setup-existing-lv-account.md and deliverables/meta-operator/setup-checklist.md first.

Do these in order and keep going between stops:

1. DOMAINS. Open GoDaddy and check whether sortmycover.co.za, sortmycover.com, coverklaar.co.za and coverklaar.com are available. Show me each price and the total, then STOP and wait for me to type "yes buy". I will log in and enter the card and 2FA myself. Never type a card number, password or code.
2. DNS. In GoDaddy DNS for sortmycover.co.za, follow DNS.md sections 2 to 4. Read the Hostinger values from hPanel. Before each save, show me the record and wait for me to say "ok". Skip the api, n8n and link records, which wait for the server. Do not touch the apex A record, MX or the existing SPF. For DKIM, open Microsoft Defender and stop so I can log in. When finished, check every record with dns.google (DNS.md section 5) and list PASS/PENDING.
3. META CHECK (look only). On business.facebook.com, in the EXISTING Lead Velocity portfolio, follow section 0 of setup-existing-lv-account.md. Create and change nothing. Report: Business Verification status (Verified / In review / Not started); WABA and numbers; any SortMyCover Page or Instagram; apps; ad accounts with currency and time zone. Write the answers under a new heading "## 14. Existing-account check" at the end of setup-checklist.md.
4. BUSINESS VERIFICATION. Only if step 3 says Not started: start it following setup-checklist.md G1. Stop before every upload and before Submit. I do those.
5. PAGE + INSTAGRAM. Skip if step 3 found them. Otherwise follow step 1 of setup-existing-lv-account.md: Page "SortMyCover" (category Website) and Instagram @sortmycover, with the checklist's disclosure text. Leave website and email empty. Stop at terms and at the Instagram login/code.
6. AD ACCOUNT. Follow step 2: reuse or create "SortMyCover - Main" in ZAR, Africa/Johannesburg, plus a standby if Meta allows. Stop at the payment method. I type the card.

Rules: never buy, publish, submit or message anyone without my typed yes. Never read or print a secret. IDs go into .env (git-ignored) by NAME; tell me the names you filled (META_BUSINESS_ID, PAGE_ID, IG_USER_ID, AD_ACCOUNT_ID, STANDBY_AD_ACCOUNT_ID). If a screen differs from the checklist, screenshot it, note it in setup-checklist.md section 13, and ask me. Do not guess.
At the end: give me a short list of what is done, what is pending (and why), then commit only the doc changes (no .env) with git pull --no-rebase first, and push.
```

---

## Sitting 2: WhatsApp, app, Pixel, templates (quickstart 7–10)

```text
You are working in the lead-velocity-staging repo on my laptop. Use Claude in Chrome. Read build/LAPTOP-QUICKSTART.md steps 7 to 10 and deliverables/meta-operator/setup-existing-lv-account.md first. First check with dns.google that sortmycover.co.za resolves. If it does not, tell me and stop.

1. WHATSAPP (branch A, Meta direct). Follow step 3 branch A: create the WABA "SortMyCover" in the existing portfolio, add my spare SA number with display name exactly "SortMyCover", then the standby number. Stop at every SMS/voice code, at the WhatsApp terms, and at the 6-digit PIN (I choose it and put it in .env as WA_2FA_PIN myself). If I say "no spare number", stay on Meta's test number and fill WHATSAPP_TEST_PHONE_NUMBER_ID instead.
2. APP + SYSTEM USER. Follow step 6: reuse or create the Business app, add system user smc-automation, assign Page, Instagram, ad accounts and WABA, subscribe the webhooks. Stop where the token would be generated. I generate it (expiry Never) and paste it into .env myself.
3. PIXEL + DOMAIN. Follow step 5: create the SortMyCover dataset (automatic advanced matching OFF, allow-list sortmycover.co.za), then verify sortmycover.co.za by meta tag. Put the tag into landing/holding/ and show me the diff. Stop before generating the CAPI token. I do that.
4. TEMPLATES. Run automation/templates/submit.sh --core as a DRY RUN only and show me the six names. Remind me that the sample header must read "00000 (SAMPLE)", not FSP 12345, and that I must decide NH-19a (keep or delete the AI sentence). Do NOT run --submit. I run it myself.

Rules: never buy, publish, submit or message anyone without my typed yes. Never read or print a token, secret or PIN. Fill .env by NAME only (WABA_ID, PHONE_NUMBER_ID, WA_PHONE_NUMBER_ID, STANDBY_PHONE_NUMBER_ID, META_APP_ID, META_WEBHOOK_VERIFY_TOKEN, META_GRAPH_VERSION, PIXEL_ID, DATASET_ID, CAPI_TEST_EVENT_CODE) and list which ones are still empty. If a screen differs from the checklist, screenshot it, log it, and ask me.
At the end: list done / pending, then commit the doc and holding-page changes (no .env) with git pull --no-rebase first, and push.
```

---

## Sitting 3: Microsoft, env vars, schema check (quickstart 11–13)

```text
You are working in the lead-velocity-staging repo on my laptop. Use Claude in Chrome. Read build/LAPTOP-QUICKSTART.md steps 11 to 13, GATE-ENTRA in build/gates-batch.md and build/ENV-CHECKLIST.md first.

1. ENTRA. In portal.azure.com, for the Lead Velocity tenant, register the app per GATE-ENTRA: delegated Calendars.ReadWrite, OnlineMeetings.ReadWrite, User.Read, Mail.Read, Mail.Send; redirect URI = the MS_GRAPH_REDIRECT_URI value. Stop at login/2FA, at "Grant admin consent" and at the client secret. I do those and paste the secret into .env. You fill MS_TENANT_ID and MS_GRAPH_CLIENT_ID.
2. CLOUD ENV VARS. Open claude.ai/code > Settings > Environments. Compare it against the "now" group in build/ENV-CHECKLIST.md and tell me which variable NAMES are missing. Never open or read a value. I paste the values.
3. NH-11 SCHEMA CHECK. Check that SUPABASE_DB_URL is set in .env (do not print it) and that I am logged in to the Supabase CLI. Then run: scripts/nh15-apply.sh --check. This is read-only plus a rolled-back trial. Show me the summary and the name of the supabase/live_schema_<date>.sql file. Do NOT run the script without --check.

Rules: never apply anything to the live database in this sitting. Never read or print secrets. If a screen differs, screenshot it and ask me.
At the end: list done / pending, commit the non-secret files with git pull --no-rebase first, and push. Then remind me to reply "NH-11 done" and, if I am happy with the summary, "NH-15 yes" in the build thread.
```

---

## Sitting 4: live database apply (quickstart 14). Only after you have written "NH-15 yes"

```text
I have said NH-15 yes in the build thread. In the lead-velocity-staging repo on my laptop, run scripts/nh15-apply.sh and STOP at its "Type YES" prompt. I type YES myself. Afterwards show me the PASS/FAIL list. If everything passes, open /onboarding on the staging site in a private Chrome window and stop so I can submit a test form myself. Then commit the result log (no secrets) with git pull --no-rebase first, and push.
```

---

### What stays yours in every sitting
Logins, 2FA and SMS codes, card details, "buy", "submit", "publish", token and secret generation, and typing `YES` for the live database. Everything else Claude clicks through.
