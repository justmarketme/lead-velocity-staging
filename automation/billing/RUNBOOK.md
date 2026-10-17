# Billing runbook (SortMyCover): Paystack, EFT reconciliation, renewals

> **NH-61 (confirmed 2026-10-03) is the launch path.** Cycle 1 is **payment by EFT, in advance, per 30-day cycle**. Jonathan sees the money in his own bank and taps **Payment received** on the open invoice in the console (`/console/payments`). The tap POSTs `{ invoice_reference }` with his Supabase JWT to W16 `/billing/payment-received`; W16 writes one `bank_credits` row (`source='manual'`, amount = the invoice total, `external_id = manual:<invoice id>`) and runs the same Match -> Normalise -> **Mark invoice paid + create cycle** chain as every other rail (same `payment.received` event, `method='manual_eft'`). A double tap is one credit and one cycle. No new table, column or function was needed. **No bank account details live anywhere in this build**: Jonathan adds them on his own invoice; the invoice keeps the short reference `LV-{ref_code}-{YYYYMM}` (NH-26) so he can recognise the payment.
> **Switched off by default (all built and tested on fixtures; every send stays behind `DRY_RUN`):** `PAYSTACK_ENABLED` (checkout shows manual EFT only; the Paystack webhook, plans and pages are ignored/skipped), `INCONTACT_ENABLED` (W17 schedule), `STATEMENT_IMPORT_ENABLED` (W18 schedule). Set to exactly `true` to turn on after launch; the sections below then apply. `VITE_PAYSTACK_ENABLED=true` shows the Instant EFT/card buttons in the portal. The gates GATE-PAYSTACK-KYC, GATE-PAY-WITH-BANK, GATE-R1-LIVE (Paystack half) and GATE-INCONTACT are post-launch. Test: `node --test automation/billing/manual-eft.test.js`.

Owner: `billing-automation`. Sources: MASTER-PROMPT 0.1, 3.6, 6.1 (steps 0 and 7), 6.5. No price is typed in this file; every amount comes from the `pricing` table.
**Rules that never bend:** no grace period (a cycle simply isn't renewed). Card auto-renew is opt-in only. We never store card data: we keep only Paystack's `authorization_code` token, in Vault, and only after the broker opts in. Secrets live in `.env` / n8n credentials, never in chat or git.

## 0. What runs where
| Piece | File | Trigger |
|---|---|---|
| Payment received (both rails meet here) | `automation/W16.json` | Paystack webhook `POST /paystack/webhook`; bank credit from W17/W18; console one-tap assign; checkout `POST /billing/checkout` |
| inContact parser | `automation/W17.json` | Graph poll of howzit@ every 2 min |
| Statement import + daily report | `automation/W18.json` | nightly 02:30 SAST |
| Renewal offer, reminders, cycle end, card retries | `automation/W19.json` | daily 07:00 SAST |
| Pricing & website sync + diff check | `automation/W25.json` | `pricing` change (NOTIFY `pricing_changed`), console publish, manual |
| Logic (tested offline) | `automation/billing/*.js` | `node --test automation/billing/billing.test.js` |
| FAIS boundary (CI) | `automation/billing/fais-boundary.test.js` | `npm test` in `automation/billing/` (runs with `billing.test.js`): fails if any billing file or W16-W19/W25 references the broker ROI / sale-outcome fields; money code never reads sale outcomes |
| Rebuild workflows after a module change | `node automation/billing/build-workflows.mjs` | the generator inlines the modules into the Code nodes |

n8n settings needed: `NODE_FUNCTION_ALLOW_BUILTIN=crypto`; env `PAYSTACK_SECRET_KEY`, `PAYSTACK_ENABLED` (false until KYC), `PAYSTACK_EFT_CHANNELS` (optional), `FNB_SENDER_DOMAINS` / `FNB_SENDER_ADDRESSES`, `SUPABASE_URL`, `BILLING_API_BASE`, `(no BANK_* settings: NH-61) (checkout display), `W25_TARGET` (`staging` | `production`), `W25_REMOTE_ROOT`, `W25_REMOTE_STAGING_ROOT`, `REPO_DIR`. Credentials, by name: "Paystack secret key (Authorization: Bearer)", "LV Supabase - n8n_app (least privilege)" (the one n8n_app login, LOCAL-STAGING.md §1b), "Microsoft 365 howzit@ (Graph, Mail.Read + Mail.Send)", "Supabase service role (W16 magic link)", "Hostinger SFTP (static sites)", "Console -> n8n shared secret".

## 1. Human gates: who does what
| Gate | Jonathan does (documents, bank details, money) | The agent does (Chrome agent / API) | Done when |
|---|---|---|---|
| **GATE-PAYSTACK-KYC** (6.5 step 1) | Signs up as Lead Velocity (Pty) Ltd. Uploads CIPC registration documents, director ID, proof of address and the FNB business account confirmation letter himself. Enters the settlement bank account (FNB business). | Fills the business profile: website leadvelocity.co.za, description "marketing and lead-generation services, paid per monthly cycle", support email howzit@. Tracks review status daily in the pulse. | Paystack shows the business as approved. Recorded in `build/gates.jsonl`. |
| **GATE-PAY-WITH-BANK** (6.5 step 2) | Approves the extra KYC request; answers any Paystack questions. | Settings > Preferences > Payments: requests Pay-with-Bank (Instant EFT, Capitec Pay). Records the exact channel names Paystack shows; if they are not `eft` / `capitec_pay`, sets `PAYSTACK_EFT_CHANNELS`. | Pay-with-Bank shows as active. |
| Live keys (6.5 step 3) | Copies the live secret key into `.env` on the n8n host himself (never into chat). | Sets webhook URL `https://api.leadvelocity.co.za/webhook/paystack/webhook` (tunnel URL in staging) and subscribes `charge.success`, `subscription.create`, `invoice.payment_failed`, `subscription.disable`. Paystack signs with the secret key (HMAC-SHA512, header `x-paystack-signature`); there is no separate webhook secret. | Test-mode webhook verified by W16 (signature ok, `webhook_events` row). |
| Pages and plans (6.5 step 4) | Approves the ladder (Section 8 Q5) by setting `pricing.active_from`. | Sets `PAYSTACK_ENABLED=true`, runs W25 (staging first): one single-cycle payment page per tier plus one optional auto-renew Plan per tier; codes are written back to `pricing.paystack_page_code` / `paystack_plan_code`. | Codes present on every active row. |
| **GATE-R1-LIVE** (6.5 steps 6 and 7) | (a) Pays R1 live through the checkout with his own card or bank. (b) Sends a R1 EFT from another account to the FNB business account with reference `LV-0099-B-<YYYYMM>`. | (a) Confirms W16 logged it, then refunds it in full: `refund({ transaction })` via the client with `allowLive: true` (the only live call before go-live). (b) Confirms W17 parsed the inContact alert into `bank_credits` and W16 queued it (there is no invoice `LV-0099`), then marks it `test` in the console. | Both appear in the daily report; the refund shows in Paystack. Section 7 "Platform & money" lines 1 and 2 turn green. |
| GATE-INCONTACT | Turns on FNB inContact email alerts for credits on the business account, sent to howzit@leadvelocity.co.za. Forwards nothing. | After 20 real alerts arrive, runs the parser over them (read-only), pins their fingerprints in W17 static data, and replaces the synthetic shapes in `fixtures/incontact-samples.json` with redacted copies (amounts and references changed). | 20/20 parse; detector level `ok`. |

**Until KYC clears (0.3 #5):** manual EFT with the unique reference plus W17/W16 is a complete payment path on its own. The checkout says "Online payment is not switched on for this link yet" and shows the EFT reference (account details are on the invoice, NH-61). Nothing waits on Paystack.

## 2. The reference
`LV-{broker_ref}-{tier}-{YYYYMM}`, for example `LV-0007-B-202610` (16 characters). `broker_ref` is the short numeric `brokers.billing_ref`, not the UUID. The tier token is `pricing.ref_code`. The parser also accepts the 6.5 form `LV-{broker_ref}-{YYYYMM}`, lower case, spaces or no hyphens, and the Paystack attempt suffix `-P1`. The invoice, checkout and every reminder show it in bold, and the checkout has a copy button. If two 30-day cycles start in the same calendar month, the second invoice takes the next month's period, so references never clash.

## 3. Matching rules (W16, `reconcile.js`)
- Reference names the broker and period, **and** the amount is within ±R1 of the invoice: mark paid, then fire `payment.received` (the same event as a Paystack payment). This creates the `cycles` row, then runs onboarding (first payment), resume (lapsed) or "next cycle scheduled" (renewal).
- Goes to the console queue for a one-tap assign (never auto): partial, overpaid, no reference (we also WhatsApp the broker for proof of payment, and the assistant reads it), unknown broker, wrong period, wrong tier, or invoice already paid (a second payment or a reused reference).
- Duplicate: the same alert re-sent (same source, amount, reference and transaction minute), or the same credit seen in another feed on the same day. It is stored as `duplicate` and never counted twice.
- Paystack payouts in FNB (`PAYSTACK` in the reference) are `settlement`: they are never matched to an invoice (section 6).
- Paystack payments are re-verified with `GET /transaction/verify` and must match the invoice (ZAR, ±R1, reference) before anything is marked paid.

## 4. Failed card charge (card auto-renew, opt-in only)
1. At cycle end, if the next cycle is unpaid, routing goes off and the media budget comes down. **There is no grace period.** Then, if auto-renew is on, W19 charges the saved authorisation (attempt `-P1`).
2. If the charge fails, it is recorded on the invoice, and W19 retries on **day 1** and **day 3** (Stripe pattern).
3. If the day-3 retry also fails, the broker gets the pay link (Instant EFT, manual EFT reference, or a new card) plus the card-update link. Nothing is owed. A cycle that isn't paid simply isn't renewed.
4. If any retry succeeds, Paystack sends `charge.success` and W16 resumes the broker (new cycle from now, routing on, budget up).
5. `invoice.payment_failed` (only in Plan mode) is recorded the same way.

**Mode decision (NH-BA-04).** Paystack Plans bill on a monthly interval, not a 30-day cycle. So the default is **authorization mode**: the card is tokenised on the first card payment where the broker ticked "renew automatically", and W19 charges it on our own cycle end. Plans are still created per tier (6.5 step 4) in case Jonathan prefers Paystack-run subscriptions.

## 5. Card-update link
- **Authorization mode:** send the checkout link for the open invoice with "Card" selected and auto-renew ticked. Paying once replaces the token: W16 stores the new one, and the old Vault secret is then deleted by hand in the console.
- **Plan mode:** `GET /subscription/{code}/manage/link` returns a hosted Paystack page where the broker updates the card. Send it by WhatsApp or email.
- **Switching off:** the portal toggle sets `brokers.card_autorenew=false` (and in Plan mode calls `POST /subscription/disable`). The next cycle is not charged.

## 6. Refunds
Refunds are for the R1 test, a shortfall refund when the broker does not renew (agreement 5.2: within 10 business days), and duplicate or overpayments.
- **Paystack payments:** `POST /refund { transaction, amount? }`. A full refund is the default; use a partial `amount` in cents for a shortfall. Jonathan approves every live refund. Record it on the invoice row (console, or SQL with `SET LOCAL smc.reason = 'refund <paystack ref>: <why>'` in the same transaction); the `smc_audit` trigger writes `audit_log`. Nothing inserts into `audit_log` directly (no role has the grant).
- **EFT payments:** Jonathan pays it back from FNB Online Banking with reference `LV-REFUND-{broker_ref}-{YYYYMM}`. W18 sees the debit, and the console marks the invoice `credited`.
- **Shortfall amount:** `invoice.shortfallCreditCents()` = price ÷ committed × missing leads. If the broker renews, it comes off the next invoice instead (W19 applies `cycles.shortfall_credit_zar`).

## 7. Settlement vs inContact: no double count
- A Paystack payment is counted **once**, when W16 receives `charge.success` (source `paystack`).
- About 2 working days later, Paystack pays out to FNB in a batch, net of fees. W17 sees an inContact credit with `PAYSTACK` in the reference, and `reconcile.matchCredit` returns `settlement`. W16 stores it as `paystack_settlement`. It is **never** matched to an invoice and never counted as revenue again.
- Weekly check (manual until volume justifies automating it): the sum of Paystack payouts in `bank_credits` equals Paystack's settlement report (gross − fees) for the same dates. A difference goes in the console queue.
- Statement import (W18) confirms each inContact credit (`statement_confirmed_at`). An inContact credit with no statement line after 2 days is a **gap** alert. It could be a spoofed alert or a reversed payment, so check it before trusting that payment. W17 also rejects mails that fail DMARC, DKIM or SPF.

## 8. Daily report (W18 -> pulse)
Covers expected vs received, invoices paid today, unmatched credits (one-tap assign), overdue invoices (= cycles not renewed: no grace), gaps, and a missing statement. Each line is plain words for Jonathan's phone. Status is green, amber (something to assign) or red (gap, missing statement, parse error).

## 9. Fees, and the DebiCheck trigger
Fees per 6.5: Instant EFT about R250 per cycle, card about R480 per cycle, manual EFT R0. Invoices and reminders show the zero-fee EFT option first after Instant EFT. **At 5 or more paying brokers,** `optimisation-advisor` raises a proposal to evaluate a DebiCheck collector (Netcash / Sage Pay type). The test is cost per collection plus monthly fee vs card fees saved, and mandate friction. That is a proposal only, not a switch. Before then, nothing changes.

## 10. Pricing changes (W25)
1. Change the row in the console Pricing editor. This writes `pricing`, which fires NOTIFY.
2. W25 runs: render, then the **price-diff gate**, then deploy (staging unless `W25_TARGET=production`), then Paystack pages and plans updated, then codes written back.
3. If price-diff fails, nothing is deployed and nothing is sent to Paystack, and Jonathan gets an alert listing the files.
4. A tier change for a broker applies at the next cycle boundary. If an unpaid invoice exists, the checkout voids it and re-issues one for the new tier.
