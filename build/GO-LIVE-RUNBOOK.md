# Go-live runbook: today to the first live lead

For Jonathan. Written 2026-10-04 by compliance-qa from `node scripts/readiness.mjs` (green 1, amber 17, red 9, post-launch 2, "Go live blocked"). Not committed.
Who: **J** = you on the laptop, **C** = Claude does it, **Clock** = an outside wait, you do nothing.
Say "do GATE-xxx" in the laptop session to start any J step. Detail for every Meta click is in `deliverables/meta-operator/setup-checklist.md` (G1 to G12).

## Decided defaults (used unless you say otherwise)
- **Payments (NH-61):** cycle 1 is manual EFT. Mark pays by EFT in advance; you tap "Payment received" in the console. Paystack and FNB inContact are built but switched off until after launch. No bank details anywhere in the build; they go on your own invoice. (Still marked "proposed" until you confirm it.)
- **Ads (NH-64):** six ads (C01 amber and teal, C03, C04, C05, bond-paperwork ad; C14 holds the sixth slot until the bond ad passes). Reply `NH-64 confirm`.
- **Consent:** named (the practice and FSP are in the form) until the legal opinion says otherwise.
- **Domains:** you asked to defer. They must be bought before Meta domain verification, the Pixel or any ad (about R250).
- **WhatsApp provider:** choose in Sitting 3.
  - **Branch A, Meta direct (recommended, what is built):** new SA number not on WhatsApp, WABA, 6 templates. Steps in Sitting 3.
  - **Branch B, Twilio WhatsApp:** you need a Twilio WhatsApp sender approved, and the templates re-submitted through Twilio. Twilio is not the built SortMyCover channel, so Claude must re-wire sends first. ASSUMPTION: this adds work and delay. Only pick it if you cannot get a spare number.

## Sitting 1: today, 20 minutes (unblocks everything)
| # | Who | Where / what to send | Done looks like | Section 7 |
|---|---|---|---|---|
| 1 | J | Decide on the three items Claude is blocked on (task list, credential tables, NH-15 live security fix); see the build thread | Claude replies that the three are unblocked | S7-04, S7-09, S7-25 |
| 2 | J | Reply `NH-61 confirm`, `NH-64 confirm`, `NH-26 confirm` | Rows lose "proposed" in `build/section7-status.md` | S7-23, S7-24 |
| 3 | J | Reply with NH-20 details (CIPC number, address, your name, KG's name). No FNB account name needed | Placeholders replaced | S7-20, S7-28 |
| 4 | J | claude.ai/code, Settings, Environments: network Trusted, paste values for `ANTHROPIC_API_KEY`, Twilio keys (Lookup), Turnstile secret | `node scripts/readiness.mjs` stops saying "env not set" | S7-03, S7-05, S7-07, S7-17 |
| 5 | J | Review the 15 concepts on your phone: `deliverables/visual-producer/review-sheet.html`, reply `NH-35 confirm` | Concepts approved | S7-01 |
| 6 | Clock | Start Business Verification (Sitting 2 step 1) the same day | Meta shows "submitted" | S7-12, S7-16 |

Claude does these offline meanwhile: favicon check, accessibility pass, nudges, W14 report test, alert tests, breach drill, price-check fix.

## Sitting 2: Day 1, laptop, 90 minutes (Meta and registrations)
| # | Who | What | Done looks like | Section 7 |
|---|---|---|---|---|
| 1 | J | GATE-META-PORTFOLIO: portfolio, KG as admin, 2FA, Business Verification | Status "submitted" | S7-12, S7-16 |
| 2 | J | GATE-META-PAGE-IG: Page and Instagram "SortMyCover", disclosure in About; website and email stay empty until the domain is live | `PAGE_ID`, `IG_USER_ID` recorded | S7-10, S7-12 |
| 3 | J | GATE-AD-ACCOUNT: main and standby ad accounts; you type the card yourself | `AD_ACCOUNT_ID` recorded | S7-13 |
| 4 | J | GATE-INFO-OFFICER (you and KG), then GATE-NCC; date the NCC renewal | Both receipts saved | S7-28 |
| 5 | J | GATE-ENTRA: app registration; paste ids in `.env` | `MS_GRAPH_CLIENT_ID` set | S7-18 |
| 6 | J | Send the term sheet to Mark (GATE-TERM-SHEET); send the five usability names (GATE-USABILITY) | Sent | S7-21, S7-05 |
| 7 | J | GATE-OPINION: email the brief to a practitioner. Does not block launch | Sent | S7-17 |
| 8 | Clock | Meta verification, 1 to several days | | |

## Sitting 3: Day 2 to 3, WhatsApp, domains, Pixel
| # | Who | What | Done looks like | Section 7 |
|---|---|---|---|---|
| 1 | J | GATE-DOMAINS go (about R250), then GATE-DNS | `dns.google` resolves; holding page loads | S7-02, S7-15 |
| 2 | Clock | DNS propagation, up to a day | | |
| 3 | J | **Branch A:** GATE-WABA with a spare SA number, display name "SortMyCover", plus a standby number. Without a spare number, stay on Meta's test number and tell Claude | `WABA_ID`, `PHONE_NUMBER_ID` set | S7-16 |
| 3b | J | **Branch B:** tell Claude "use Twilio WhatsApp"; Claude re-wires and re-checks the guardrails, then you do the Twilio sender approval | Sender approved | S7-16 |
| 4 | J | GATE-TEMPLATES: submit the 6 core templates, accept Meta's category | Six approved (log file appears) | S7-16, S7-08 |
| 5 | J | GATE-PIXEL: Pixel, domain verification, CAPI token into `.env` | Test events received | S7-11, S7-14 |
| 6 | J | Pixel and system-user token to `.env`; hide-word list approved (GATE-HIDE-WORDS) | W22 token check OK | S7-10 |
| 7 | C | Create Campaigns A, B, C paused at R0; read back against the spec; record what Meta showed on the special category | Spec diff clean | S7-13 |
| 8 | J | GATE-ADS-APPROVE-3: publish first three ads, campaign Off | Three ads approved | S7-01 |
| 9 | Clock | Meta ad and template review, 1 to 48 hours | | |
| 10 | J | Warm-up: organic posts now, paid week after payment (NH-31a default). 7 days before live campaigns | 7 days logged | S7-12 |

## Sitting 4: Mark onboarded
| # | Who | What | Done looks like | Section 7 |
|---|---|---|---|---|
| 1 | J | Mark: FSP checked on the FSCA register, calendar connected, hours, intro card and video approved, consent "named" | Portal shows onboarded | S7-20 |
| 2 | J | Mark signs agreement and authorisation letter in the portal; picks a tier | Signed; reference like `LV-MS01-BRZ-202610` issued | S7-21 |
| 3 | J | Walk Mark through the explainer | Evidence row saved | S7-22 |
| 4 | J | KG's and your alert numbers (NH-20); test alert reaches both | Both phones buzz | S7-27 |
| 5 | J | Approve the privacy-page details and publish it, PAIA manual, trust pages | Pages return 200 | S7-02, S7-28 |

## Sitting 5: payment, server, final proof
| # | Who | What | Done looks like | Section 7 |
|---|---|---|---|---|
| 1 | J | Mark pays by EFT; you tap "Payment received" in the console | Broker status moves to paid | S7-23, S7-24 (post-launch lines) |
| 2 | J | GATE-VPS: buy the server (Claude gives the link and the SSH key), then paste the IP. Backup bucket (NH-29b) | Claude: "VPS live, all checks green" | S7-26 |
| 3 | C | W26 provisions: backups, signature checks, DNS, TLS | Status `ready_for_go_live` | S7-26 |
| 4 | C+J | **Ten-lead synthetic run on production URLs** (`sortmycover.co.za`, `api.`), you as the lead and KG as the broker | All stages logged: intake, intro card, booking, reminders, outcome, no-show, replacement counter, STOP; 10 of 10 | S7-19, S7-05 |
| 5 | C | Live red-team of 50 adversarial prompts; compliance-qa signs off only if zero leaks | `latest-live.json` clean; sign-off set | S7-17 |
| 6 | C | Compliance-qa final pass: every page, ad, template, consent wording, STOP flow | Pass list with no fails | all |
| 7 | J | Re-run `node scripts/readiness.mjs`: only the post-launch lines may be non-green | No red | |
| 8 | J | **Go live** tap in the console (this raises the budget; nothing else does) | First ad spends; first lead arrives | |

## After the first lead
Paystack: GATE-PAYSTACK-KYC, then the R1 test. FNB inContact alerts: GATE-INCONTACT. Trade-mark filing. These turn S7-23 and S7-24 green.

## Honest limits
- The exact permission wording above is my phrasing; I found no earlier required text in `build/`.
- Meta, DNS and template reviews are outside anyone's control; the dates move with them.
- Nothing here has been run live. Every "done" line is untested until you do the step.
