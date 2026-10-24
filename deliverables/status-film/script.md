# Status film: "Where we are" (for Jono)

Voice: en-US-AndrewNeural, rate -3%. About 3.5 minutes. Same house design as the onboarding film (deliverables/broker-success/onboarding-film/scenes).
As at 13 October 2026. Every line traces to the read-only checks run on 13 Oct (live curl, Supabase SELECTs and logs, n8n on the VPS, git). Plain facts only.

## Scene 1: Where we are (about 20s)
**Say:** Here's where we are on the thirteenth of October. Mark Weston has signed, paid and logged in to his portal. The machine around him is built, but most of it is still switched off, and no SortMyCover lead has come in yet. Switching it on, safely, is what's next.
**Show:** Title "Where we are". Three status chips tick in: Signed · Paid · Logged in. Then a meter "n8n workflows on: 3 of 43" and "SortMyCover leads: 0".
**Sources:** admin_documents signed_agreement; lead_orders paid; auth.users last_sign_in_at 13 Oct 09:57 UTC; n8n workflow_entity (3 active of 43); leads where brand = SMC: 0.

## Scene 2: Done: Mark and the broker portal (about 30s)
**Say:** Mark's contract is signed and on file, and his payment of sixteen thousand five hundred rand, for twenty leads, is recorded. This morning he set his password, and at three minutes to twelve he was in. Within seven minutes he had saved his FSP number, a headshot and his bio, by himself. That's four of six getting-started steps. WhatsApp and Outlook are still open.
**Show:** Phone-sim of the /broker-elite Getting started card: Agreement ✓, Payment ✓ (R16,500 · 20 leads), FSP ✓, Intro card (headshot + bio) ✓, WhatsApp (open), Outlook (open); progress 4 / 6. Side timeline: 11:57 signed in · 12:04 profile saved.
**Sources:** admin_documents; lead_orders amount_zar 1650000; auth logs /verify + PUT /user 09:57:46 UTC; brokers.updated_at 10:04:38 UTC (fsp_number, headshot_url, bio_short 172 chars).

## Scene 3: Done: the welcome email (about 25s)
**Say:** The welcome email works. An admin presses one button, and the broker gets a branded email to create a password. Mark's went out at eight twenty-three, and he used it three and a half hours later. The sign-in and password pages are live, all six portal videos play, and the site runs the latest code. Discovery's two brokers are paid and delivered.
**Show:** Admin button "Send welcome email" → email card "Welcome to Lead Velocity: create your password" → timeline 08:23 sent · 11:57 password set. Chips: /broker · /broker/set-password · /broker/forgot-password · 6 videos live · Live = 38f4e77. Card: Discovery 2,000 + 2,200 leads delivered.
**Sources:** send-password-setup v5 ACTIVE; recovery_sent_at 06:23:05 UTC; redeemed 09:57:46 UTC; routes 200; six MP4s 206; Last-Modified vs HEAD 38f4e77; lead_order_items 2000 / 2200.

## Scene 4: Done: SortMyCover and n8n (about 30s)
**Say:** SortMyCover dot co dot za is live on Hostinger. All thirty-seven site pages load, including cover and wills, and so do ten campaign sites. Leads with a budget under seven hundred and fifty rand are kept, not thrown away. n8n runs on the VPS, healthy and backed up every night, and the lead form reaches it. Only three workflows are on, and every send is in dry-run. The new WhatsApp number sits on its own Twilio subaccount.
**Show:** Browser frame sortmycover.co.za with a page counter to 37, then 10 campaign-subdomain chips. n8n panel: healthy · nightly backup 01:30 · 3 of 43 on · DRY RUN. Number card +27 60 015 6480 on the SortMyCover subaccount.
**Sources:** curl 37 sitemap URLs 200; subdomain titles; /book/ budget_band lt750; n8n /healthz ok; backups 12 + 13 Oct; DRY_RUN_SENDS=true; Twilio IncomingPhoneNumbers.

## Scene 5: Done: Outlook calendar groundwork (about 22s)
**Say:** The Outlook calendar groundwork is done. The Microsoft sign-in function is deployed, and it fails safely until the Microsoft app exists. Its twenty-two tests pass, and the database side is in place. Booking invites are coded to come from the broker's own Outlook, with a Teams link.
**Show:** Flow: Broker → Microsoft sign-in → Token vault → Free/busy (W04) → Invite from his own Outlook (W05). Badge "Waiting for the Microsoft app (503 not_configured)". Test meter 22 / 22 pass.
**Sources:** ms-oauth v2 ACTIVE, live = repo; POST start → 503 not_configured; node --test 22 pass; smc_vault_* functions; w05.mjs invitedByOutlook(); /media/broker/connect-outlook-calendar-720p.mp4 200.

## Scene 6: Still to do: what blocks Mark's first lead (about 40s)
**Say:** What stands between Mark and his first lead. Jono: register the Lead Velocity Microsoft app and set its secrets. That blocks every calendar connection. KG: confirm Meta's business verification, which blocks the WhatsApp sender. Claude, with your go-ahead: bring that number back online and point n8n at the right Twilio account. Jono: decide how Mark's intro card gets approved. Without it, his routing stays off. Claude: fix Save outcome in the portal. For SortMyCover bookings it says saved, but nothing saves. Then gate-test the booking workflows. Jono: create the ad account and pixel. And Mark finishes WhatsApp and connects Outlook.
**Show:** Eight cards, each with an owner badge (Jono / KG / Claude / Mark) and "Blocks: ...": Microsoft app + secrets (every calendar) · Meta verification (WhatsApp sender) · WhatsApp sender + n8n Twilio account (all WhatsApp) · Intro card approved (routing_on) · Save outcome defect (Mark's first booking) · Gate-test booking workflows (slots + booking) · Ad account + pixel (ads) · Mark: WhatsApp + Outlook (go-live).
**Sources:** ms-oauth 503; META-VERIFICATION-STATUS.md "In review" vs memory "Verified" (unverified today); Twilio Senders API: no sender for +27600156480; TWILIO_ACCOUNT_SID = main account; smc_broker_ready needs intro_card_url; PremiumCalendar.tsx:267 + restrictive RLS; W04/W05/W06/W09 inactive; brands.pixel_id null; whatsapp_confirmed_at / calendar_status null.

## Scene 7: Still to do: smaller jobs (about 25s)
**Say:** Smaller jobs. Jono: OK the upload of the fixed SortMyCover site, because its privacy and terms pages show the wrong owner name. Delete the duplicate DMARC record in GoDaddy. Fix two Vercel settings that end in a stray line break. And join Microsoft's partner programme before broker number two. Claude: add terms and privacy pages to leadvelocity dot co dot za, fix the admin's add-broker form, and record when brokers use the portal.
**Show:** Two columns. Jono: Upload smc-dist.zip · One DMARC record · Vercel env without CRLF · Microsoft partner programme. Claude: /terms + /privacy · Add-broker form · Portal activity stamp.
**Sources:** curl /privacy/ + /terms/ (wrong name present, fix in 9022f40 / smc-dist.zip); nslookup _dmarc two records; live bundle Supabase URL ends in \r\n; App.tsx no /terms route; TeamManagement.tsx:106 signUp + lead_quota; smc_portal_touch missing.

## Scene 8: Where we go next (about 32s)
**Say:** Where we go next, in order. One: the Microsoft app, tested on your own work account, then Mark connects Outlook. Two: the WhatsApp number back online on the SortMyCover Twilio account. Three: the booking workflows gate-tested in dry-run, South African test numbers only, with the outcome fix shipped. Four: Mark's intro card approved, and his routing switched on. Five: the pixel, the ad account and a production site build, then the first campaign, proposed at three hundred and fifty rand a day. Then dry-run goes off, and leads start flowing.
**Show:** A road of five milestones that light up in turn, ending at "Leads flowing to Mark". Tags: SA numbers only · DRY_RUN on until the end · R350/day (proposed cycle-1 plan).
**Sources:** the "next" lists from all four checks.

## Scene 9: Close (about 10s)
**Say:** That's where we are. Mark is in, and the pieces are built. What's left is switching them on, one tested step at a time.
**Show:** Logo. "That's where we are." Line: "Mark is in · the pieces are built · switch on, one tested step at a time".
