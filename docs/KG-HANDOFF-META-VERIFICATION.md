# KG handoff: Meta business verification for Lead Velocity

**Start here, KG.** Open Claude Code in this repo and paste the prompt at the bottom. Your Claude drives the browser. You only do the three things Claude isn't allowed to do: accept the invite, tick the reCAPTCHA, and take and upload the photo of your ID.

## Why it's you
Meta's identity check must be done by a business admin with **their own** ID, and the name must match their Facebook profile. You're the only director on the CIPC record.

## What's already done (by Jono)
- Meta business portfolio **Lead Velocity**, ID `222276519074106`. You've been invited at **motso@vantagestack.co.za** with full access.
- WhatsApp Business account **SortMyCover**, ID `1370588024885127`, with number **+27 60 015 6480**. It's linked to the Twilio sub-account "Lead Velocity - SortMyCover" and is waiting only on this verification.
- The verification details are already entered:
  - Private Company: Lead Velocity (Pty) Ltd, trading as SortMyCover
  - 106 Madiba St, Vergesig Flats, Pretoria, Gauteng 0001 (the CIPC registered office)
  - +27 10 976 5618
  - leadvelocity.co.za
- The company documents are in your OneDrive under `Lead Velocity/Company Docs/`. `CoR15_1_A_9441526770.pdf` is the CIPC registration pack, with registration number 2025/637858/07.

## Rules for Claude (both sides)
- Never type, upload or read out ID numbers or ID images; KG does the ID photo himself.
- Never solve reCAPTCHA; KG ticks it.
- Don't change anything else in the Meta business (people, pages, ad accounts) without asking KG.

## When it's done
Claude writes `docs/META-VERIFICATION-STATUS.md`, recording:
- the verification status: Submitted, In review, Verified or Rejected, plus Meta's reason if rejected;
- the date;
- whether documents were asked for.

It then commits and pushes to `release/smc-nurture`. Jono's Claude picks that up and brings the SortMyCover WhatsApp sender online.

---

## Prompt to paste into Claude Code (KG)

> I'm KG (Kgomotso Pule), director of Lead Velocity (Pty) Ltd. Read `docs/KG-HANDOFF-META-VERIFICATION.md` in this repo and follow it.
> 1. Open my Gmail/Outlook (motso@vantagestack.co.za) in my Chrome and find the Meta Business invite to "Lead Velocity"; open the accept link and tell me when to click accept (log in as me).
> 2. Open https://business.facebook.com/latest/settings/security_center?business_id=222276519074106 → Business Verification → Start verification. Check the pre-filled details match the handoff doc; fix anything that doesn't. Stop at the reCAPTCHA and tell me to tick it.
> 3. If Meta asks for documents, download `CoR15_1_A_9441526770.pdf` from my OneDrive (`Lead Velocity/Company Docs/`) and upload it as the business registration document.
> 4. For the connection check prefer Email to an @leadvelocity.co.za mailbox I can open; read me what to do and let me enter the code.
> 5. At "Confirm your identity" stop and tell me to take a fresh phone photo of my ID (at least 1500×1000 px, flat, good light) and upload + Submit it myself. Do not handle my ID.
> 6. After I submit, read the verification status in Security Center, write `docs/META-VERIFICATION-STATUS.md` (status, date, any Meta message), then `git pull --rebase` and commit + push to `release/smc-nurture`. Tell me it's done and that Jono's side can continue.
