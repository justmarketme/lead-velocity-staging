# SortMyCover: Meta appeal playbook (2.1.3)

Owner: meta-operator. Date: 2026-10-02. Readers: Jonathan (primary, does every appeal click), KG (backup, 6.8a), optimisation-advisor and W22/W27 (detect and alert).
Purpose: when Meta rejects, restricts or downgrades something, everyone knows **what to submit, to whom, within how many hours**, and what not to do. The number this protects: zero account restrictions and zero rejected assets in the first 90 days, and when one happens anyway, the shortest possible outage without risking the portfolio.

The hour targets below are **our internal response targets**, measured from the W27/W22 alert. They are not Meta's review times; Meta's own timelines are read off the screen and recorded, never assumed.

---

## 1. Rules that apply to every incident

1. **Detect.** W27 (hourly + webhooks) and W22 raise the alert: Red, both phones, DND does not apply to WABA restriction (6.8b). The person who acknowledges it owns the incident until it is closed.
2. **Read Meta's exact reason first.** Screenshot it before touching anything. Most failed appeals answer a reason Meta did not give.
3. **One honest appeal per decision.** Fix what Meta named, then request review once, through the official channel listed below. No repeated resubmissions of the same thing, no arguing in review chat, no "magic words".
4. **Never circumvent.** Do not create new accounts, Pages, numbers or portfolios to get around an enforcement; do not re-run rejected content from the standby assets; do not buy aged accounts; no cloaking (the ad, the form and the landing page always say the same thing). Meta treats circumvention as a reason to restrict the whole business portfolio, which would take the standby assets down with the main ones.
5. **Money and publish actions stay human.** Pausing spend to protect the account is allowed for Jonathan/KG from the console (confirm-to-apply). Turning anything back on is a human gate.
6. **Stop and escalate (2.1.3)** if Meta asks for proof of a licence, an FSP number or authorisation for financial services, for the Page, ad account or an ad. Go to §8. Never send the broker's FSP licence as if it were Lead Velocity's.
7. **Log every incident** with the template in §10, in the console (`ops` incident log, linked to the `brands` row) with screenshots in `/deliverables/meta-operator/incidents/INC-{yyyymmdd}-{nn}/`.
8. Post-incident: compliance-qa and the owning agent (creative-strategist for copy, automation-engineer for templates) get the root cause within 2 business days; the fix goes into the rubric or the golden set so the same rejection does not happen twice.

---

## 2. Ad rejected (disapproved)

| Item | Detail |
|---|---|
| Typical reasons for us | Personal attributes (second-person statements about the viewer's finances, family, health), financial-product claims, landing page / form mismatch, text implying an offer or quote, AI imagery without the label (2.1.5, 2.1.8) |
| Within 1 h | Pause nothing else. The ad is already not delivering. Screenshot the reason (Ads Manager, the ad, "Ad rejected" detail, and Account Quality) |
| Within 4 business hours | creative-strategist rewrites to third person / removes the claim; compliance-qa passes it (no product, insurer, premium, cover amount, broker). Decide: **fix and resubmit as an edit** (if Meta's reason is clear and correct) **or request review** (if we believe the ad complies as is). Not both |
| To whom | Ads Manager, the ad, **Request review** (or Account Quality, the rejected ad, Request review). Jonathan clicks |
| What to submit | No documents. One line if a text box is offered: "This ad is educational, written in the third person, names no product, provider or price, and leads to a form run by SortMyCover, a service of Lead Velocity (Pty) Ltd. Please review again." |
| Second rejection, same ad, same reason | **Stop** (CS 10.7): do not resubmit; mark `needs_human` for creative-strategist and compliance-qa; the concept is retired or rebuilt |
| Pre-approval trio (GATE-ADS-APPROVE-3) | If 2 of the 3 are rejected citing licensing or authorisation for financial products: go to §8 (CS 10b), do not add more ads |
| Special Ad Category flag | Do not appeal; re-create the campaign under the category (CS 10.4); human gate |

## 3. Ad account restricted / disabled

| Item | Detail |
|---|---|
| Within 1 h | Both phones alerted. Jonathan or KG confirms in Account Quality (business.facebook.com/accountquality) which asset is restricted and the reason. Screenshot. Check whether the Page and the portfolio are also affected |
| Within 4 h | Classify the reason: (a) **payment / billing** (failed charge, card issue); (b) **security** (suspicious login, compromised admin); (c) **policy / integrity** ("doesn't comply with Advertising Standards", "unusual activity"); (d) **financial services / licensing** |
| (a) Payment | Jonathan fixes the payment method himself (★) and pays the outstanding balance; restriction normally lifts after payment. No appeal needed unless it stays |
| (b) Security | Remove unknown people and apps (Business Settings, People / Partners / Apps); reset passwords; confirm 2FA on both admins; then Request review in Account Quality. Rotate `META_SYSTEM_USER_TOKEN` and `META_APP_SECRET` (SECURITY.md leak procedure) |
| (c) Policy | Within 24 h: one Request review in Account Quality. Meta usually asks for a selfie/ID check from the admin or confirmation of business details: Jonathan does it himself. Submit nothing else unless asked. Business Verification approved status helps; if it is still pending, say so only if asked |
| (d) Licensing | §8. Stop all spend first |
| Standby switch | Only per §9 rules (allowed for (a) if the fix takes more than 24 h, and (b) after the compromise is cleared; **never** for (c) or (d) while the decision stands) |
| Close | When Account Quality shows the account in good standing; record time to resolution |

## 4. Page restricted (or Page's ability to advertise restricted)

| Item | Detail |
|---|---|
| Within 1 h | Screenshot Page status (Professional dashboard, Page status / Account status) and Account Quality. Note which features are limited (ads, messaging, visibility) |
| Within 4 h | Check what triggered it: a post, a comment we left visible (W30 hide list), the Page category, a name/username change, an impersonation report |
| Fix | Remove or edit the content Meta named (Jonathan); confirm the category is still Website/Education; confirm the About disclosure is unchanged (DW `DISC-FULL-v1`) |
| Within 24 h | One **Request review** from Page status / Account Quality, Jonathan clicks. Text if a box is offered: "SortMyCover is an educational website service of Lead Velocity (Pty) Ltd. It does not sell or advise on financial products; it connects people with authorised financial services providers, as stated on the Page. Please review again." |
| If the reason is licensing / financial authorisation | §8 |
| Standby Page | Per §9 only: may carry ads if the restriction is not policy-based on content we would repeat (for example, a mistaken impersonation report under review). Never re-post the content that caused it |
| Comments/DMs | W30/W31 keep running on whichever Page is live; pause public replies on the restricted Page if commenting is limited |

## 5. WhatsApp: quality rating drop, messaging limit, number restricted, display name rejected

| Signal (W22/W27 via `phone_number_quality_update`, `account_update`) | Within 1 h | Within 24 h |
|---|---|---|
| Quality **Yellow (Medium)** | Find the cause: block/report rate per template in WhatsApp Manager (Insights). Pause the **nurture** templates (`unbooked_nudge_*`, `missed_you` second sends) via the console; keep disclosure (`broker_intro_*`), confirmations and reminders for booked leads | automation-engineer + conversation-designer review the paused template's wording and timing; restart one at a time after 7 days Green |
| Quality **Red (Low)** | Same as Yellow plus: stop all non-essential business-initiated sends; send only messages to leads who have an active booking or replied in the last 24 h. Template(s) Meta paused are listed in WhatsApp Manager: do not resubmit them as new names | Root cause, fix, then wait for Meta to restore the template; no new templates in that period |
| **Messaging limit reached** (tier cap on business-initiated conversations) | Queue, never drop: W06 first messages and booked-lead reminders take priority; nudges wait. Alert both phones | If Business Verification is not yet approved, chasing it is the lever (verification unlocks higher limits); otherwise the limit rises with sustained quality |
| **Number restricted / flagged** | Stop sends from that number. Read the reason in WhatsApp Manager. Request review there if the option is shown (Jonathan) | Standby switch per §9: allowed if the restriction is a quality/volume issue we have already fixed, not to keep sending the messages that caused it |
| **Display name rejected** | Read the reason. Usual fixes: the name must match the brand shown on the website and Page; no extra descriptors; website must show "SortMyCover" and "a service of Lead Velocity (Pty) Ltd". Edit the display name back to exactly `SortMyCover` and resubmit once | If rejected again: request review with the website URL and the Page URL as evidence; staging continues on the test number (pre-mortem #2) |
| **WABA disabled for policy** | Stop. Read the reason. One Request review / appeal in WhatsApp Manager (Jonathan). The standby number is on the same WABA, so it is down too: fall back to SMS (Twilio, W06 failure path) for booked leads only | Escalate to Jonathan; do not create a new WABA (circumvention) |

## 6. Template rejected (or re-categorised, or paused)

| Case | What to do | Within |
|---|---|---|
| **Rejected** | Read the rejection reason in WhatsApp Manager (Manage templates) and the `message_template_status_update` payload. Typical: variable at the start/end of the body, too many variables for the text length, missing or poor sample values, promotional wording in a utility template, URL domain not matching the business. Fix the JSON in `automation/templates/`, run `submit.sh --only NAME` dry-run, then Jonathan resubmits (edit the rejected template if Meta allows, else a new name `{name}_v2`) | Fix and resubmit within 1 business day; never blocks the build (pre-mortem #1) |
| **Disagree with the rejection** | WhatsApp Manager, the template, **Request review** (Jonathan) once, with one line: "Utility message sent only to people who asked us to book a call; it confirms or changes their booking; no offer or promotion." | Within 1 business day |
| **Re-categorised utility to marketing** | Accept and log the category and cost (0.3 #1). Same day, submit a reworded utility variant `{name}_u2` (shorter, tied to the person's own request/booking, no urgency). Do not send a marketing-category lead-facing template in production until Jonathan answers NH-MO-12 (4.6 says "never use marketing-category templates") | Same day |
| **Paused by Meta for low quality** | Stop using it (W22 flips the workflow to the text fallback where one exists); see §5 | Immediately |
| **Disabled** | Do not resubmit the same text; root cause first | — |

## 7. Business Verification rejected

| Item | Detail |
|---|---|
| Within 4 business hours | Read the reason in Security Center. Screenshot |
| Common causes and fixes | Legal name mismatch: make the portfolio legal name exactly `Lead Velocity (Pty) Ltd` as on the CIPC certificate. Address mismatch: use the address on the CIPC record and get a bank letter showing the same. Unreadable/expired document: rescan full-page colour PDF. Website does not show the legal name: add `Lead Velocity (Pty) Ltd`, registration number and address to the leadvelocity.co.za footer before resubmitting. Phone/email not verifiable: use domain verification of `leadvelocity.co.za` instead |
| To whom | Security Center, Business verification, start again / resubmit with the corrected details (Jonathan). If Meta offers "Request review" with a contact form, use it once with the corrected documents |
| Within | Resubmit within 2 business days of the rejection |
| Meanwhile | The build continues (pre-mortem #2); staging on the WhatsApp test number; Section 7 shows the line amber "submitted" |

## 8. Licensing-proof request: the 2.1.3 fallback

**Triggers (CS 10b):** Meta requests proof of licensing / authorisation / an FSP number for the Page, ad account or an ad; or 2 of the first 3 ads are rejected citing financial-services authorisation; or a restriction citing financial services/insurance authorisation survives one appeal; or a Special Ad Category requirement would need a licence attestation we cannot truthfully make.

| Step | Who | Within |
|---|---|---|
| 1. Pause all SortMyCover campaigns (console, confirm-to-apply) | Jonathan / KG | 1 h |
| 2. Do **not** reply to Meta with a licence. Lead Velocity is not an FSP and must not imply it is. Save the request text and screenshot | meta-operator | 1 h |
| 3. Respond with what is true, if a response box exists: Business Verification of Lead Velocity (Pty) Ltd (approved or submitted), plus: "Lead Velocity (Pty) Ltd is a marketing service. SortMyCover gives no financial advice and sells no financial products; people are connected to an authorised financial services provider who discloses its FSP number before any meeting." Business Verification is our only proof of identity here (Meta Business Verification docs) | Jonathan | 24 h |
| 4. If Meta still requires a licensed advertiser: **fallback** = the same approved creative runs from the **broker's own Facebook Page** as the ad identity, paid by Lead Velocity's ad account, under the signed **broker authorisation letter** (GATE-AGREEMENT / contracts-drafter) | Jonathan decides (changes advertiser of record and disclosure, 1.2) | Decision within 2 business days |
| 5. Mechanics if approved: the broker adds Lead Velocity's portfolio as a **partner** on his Page with advertising access (he clicks in his own Business Settings); his Page is connected to our ad account; a new instant form is created on his Page (named consent already names his practice); compliance-qa re-reviews the ads and the form for the new identity; campaigns re-created (not edited) and published ★ | broker + Jonathan; meta-operator prepares | 2 to 3 business days |
| 6. Record the decision in the console and `build/decisions.md` (orchestrator) | — | same day |

Nothing public is prepared on the broker's Page before Jonathan approves step 4.

## 9. Standby switch procedure (ad account, Page, phone number)

**Allowed when** the main asset is unavailable for a reason that is **not** a standing policy decision about our content or our business: payment/billing failure not fixable within 24 h; security compromise after it is cleaned up; a technical fault or stuck review where Meta confirms (or the screen shows) no policy violation; a quality/limit problem on a number whose cause is already fixed. Also used in the quarterly drill (6B.10).
**Not allowed** while: an ad, Page, account or number is restricted for policy and the decision stands; Meta has asked for licensing proof (§8); the same content would be re-run.

| Step | Ad account | Page | WhatsApp number |
|---|---|---|---|
| 1 | Jonathan approves the switch (console `ops_gate`) | same | same |
| 2 | Confirm the standby account is in good standing (Account Quality) and has a payment method (★ Jonathan adds it if not) | Confirm standby Page status is good | Confirm standby number status Connected, quality not Red |
| 3 | Console Settings, Brands: swap `ad_account_id` and `standby_ad_account_id` (audit-logged) | Swap Page in `brands` (main `page_id` and `handles.fb_standby_page_id`, NH-MO-05) | Swap `phone_number_id` and `standby_phone_number_id`; update `.env` `PHONE_NUMBER_ID` / `WA_PHONE_NUMBER_ID` |
| 4 | Re-create (not copy across accounts by script) Campaign A from `campaign-spec.md` in the standby account, all paused; same SAC decision; exclusions re-created (customer lists re-uploaded by the nightly job) | New instant form on the standby Page; Lead Ads webhook subscription for that Page (`ads-subscribe-leadgen`); Leads Access for the system user | Register Flow public key on the standby number if `booking_ui = flow` (`/whatsapp_business_encryption`); templates are WABA-level and already approved |
| 5 | Publish ★ and budget ★ by Jonathan | Publish ★ | W22 health check green on the new number |
| 6 | Log the switch (§10); keep working the appeal on the main asset; switch back only after it is in good standing and Jonathan approves | same | same |

## 10. Incident log template (one per incident; console `ops` incident log + folder)

```
Incident ID:        INC-{yyyymmdd}-{nn}
Type:               ad_rejected | ad_account_restricted | page_restricted | waba_quality | waba_limit | number_restricted | display_name_rejected | template_rejected | template_recategorised | bv_rejected | licensing_request
Asset:              {brands.code} / {object type} / {object id from brands or Ads Manager}
Detected:           {timestamp SAST} by {W27 | W22 | person}
Acknowledged by:    {Jonathan | KG} at {timestamp}
Meta's reason (verbatim):  "..."
Screenshot(s):      incidents/INC-.../01-reason.png ...
Impact:             spend paused R{x}/day; leads affected {n}; messages queued {n}
Classification:     payment | security | policy | quality | licensing | technical
Actions (time-stamped):
  - {hh:mm} {who} {what}
Appeal / review:    channel {Request review in Ads Manager | Account Quality | WhatsApp Manager | Security Center}, submitted {timestamp} by {who}, Meta case/ref {id if shown}, text submitted: "..."
Standby used?       no | yes (ad account | Page | number), approved by {who} at {timestamp}, §9 condition: {...}
Outcome:            approved | upheld | pending; {timestamp}
Time to resolution: {h}
Root cause:         ...
Prevention:         {rubric line / golden-set case / template rewrite / process change}, owner {agent}, due {date}
needs_human:        none | {line}
```

## 11. Who to call when (6.8a)

Primary Jonathan; backup KG (2FA admin on everything). Unacknowledged Red at 2 h re-sends to the other partner; at 4 h a phone call (6.8b). Every action in this playbook that clicks in Meta is done by one of them; the Chrome agent prepares screens and reads them back, nothing more.
