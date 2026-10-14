# Quiz v2 (no budget on the page) and the WhatsApp qualifying step

Status: site change built and tested on branch `site-research` (not deployed). The W01 change and the WhatsApp step below are **specs only**. Nothing in live n8n was edited.
Date: 13 Oct 2026. Owner decision: Jono.

**Update 14 Oct 2026 (as built).** The n8n part is deployed (lead-velocity-staging `release/smc-nurture` d1acf1a; runbook `docs/W01-QUIZ-V2-DEPLOY.md` there). Built: section 2a (W01 routes or holds the lead, W05 band gate, W03 band ids) and the WhatsApp band question in its smallest form: the approved `smc_qualify_budget` template (five buttons) goes out from W01 as soon as the lead is saved, routed or held; the tap sets the band, qualifies the lead, routes a held lead and finalizes a held booking. NOT built: the reason list and notes (section 3, message 1) and the 4-option session list (the template's five bands replace it); the reason is the page's `help_with`, kept in `leads.conv_state`. Section 4 (band on the email-confirm page) is not needed: the SMC sender is online. Site build: `smc-dist-v2.zip` from lv-site `site-research` 01984e5. Open: the page line "On WhatsApp we ask what you would like to talk about" (and the terms sentence on the reason) describes the reason step that is not built.

## 0. The rule (Jono, 13 Oct 2026)

- The landing-page quiz never asks "how much are you paying" or "what are you comfortable paying". The R1,500 figure was internal research for finding the ideal client. It was never meant as a question for visitors.
- The budget or current-premium range is asked later, inside WhatsApp. Its wording depends on the reason: "what is your current range" when they want a review.
- In WhatsApp the person picks their main reason (or what they want reviewed) from a list of options plus "Other", and can add notes.
- The landing page asks only the few POPIA-minimal questions brokers need. Everything else happens in the WhatsApp workflow.
- The email is asked **only** when the booking is confirmed, either at the landing-page booking step or in WhatsApp. It is never asked earlier.

## 1. Landing quiz v2 (built)

| Step | Question | Values sent | Notes |
|---|---|---|---|
| 1 | **What would you like help with?** "Pick the main one. You can tell us more on WhatsApp." | `help_with`: `review` ("Review my existing cover"), `life` ("Life cover"), `disability_income` ("Disability or income protection"), `severe_illness` ("Severe illness cover"), `wills` ("My will and estate planning") | `/book/` shows all five. Cover campaign pages (theme A) and `?for=cover` show the four cover options. Wills pages (theme B) and `?for=wills` skip this step, and `help_with` is `wills`. The hint on "review" names the adviser as the one doing the review, never SortMyCover (wording rule S1; it passes the `BANNED` scan). |
| 2 | How old are you? | `age_band`: `lt35`, `35_44`, `45_50`, `51plus` | Same as before. `18 to 34` and `51 or older` go straight to the neutral exit, and nothing is sent or stored. |
| 3 | First name and mobile (WhatsApp) | `first_name`, `mobile` (E.164) | Unchanged. |
| 4 | Consent, plus the separate optional ad-measurement choice | unchanged consent fields | Unchanged text and versions (`CONSENT-GENERIC-v5web`, `CONSENT-ADS-v2web`). |
| then | Booking widget (slot, method, **email at confirm**) | `/book` body `email` | Unchanged. The email field appears only here, as before. |

The visitor sees "Step N of 4", or "of 3" on wills pages. The budget question, `BUDGET_OPTIONS`, `budgetInBand`/`qualifies` and every angle's `budget_topic` are removed. The "What happens next" box adds one line: "On WhatsApp we ask what you would like to talk about, so the adviser can prepare."

### `/lead` payload change

```diff
- age_band, budget_band, product_interest
+ age_band, budget_pending: true, help_with, product_interest
```

- `budget_band` is no longer sent, by the JS quiz or by the no-JS form.
- `budget_pending: true` is new. The no-JS form sends it as the string `"true"`.
- `help_with` is new. W01 ignores unknown fields today.
- `product_interest` keeps the two values W01 accepts (`life_cover` / `wills`). It is derived from `help_with` (`wills` gives `wills`, everything else `life_cover`), so W01 routing on product is unchanged.

Tested: a real click-through of `/book/` captured the body `{ age_band: "35_44", budget_pending: true, help_with: "review", product_interest: "life_cover", ... }`, with no `budget_band`.

### Copy updated with it

- Home and how-it-works steps now read: "What you would like help with, and your age band."
- Terms are now **TU-v1.2-web**. Section 2 says the reason and the rough monthly band are asked on WhatsApp, and the email only at booking.
- The privacy notice is now **PN-v1.3-web**. Its data list adds the reason and notes, and marks the budget band "asked on WhatsApp".
- Both are still drafts for the practitioner, like before.

### Side effect to know about

The first-party beacon step numbers shift because the budget step is gone. The steps are now: 1 start, 2 details, 3 consent, 4 booking, 5 done, 6 exit. Before, 2 was budget and 3 to 7 were the rest. Any funnel report in `SUB-visit-beacon` that compares before and after 13 Oct must map the old step 3 to the new step 2, and so on.

## 2. W01 change needed (do this before the site is deployed)

**Live W01 would disqualify every v2 web lead.** In `lv-release/automation/lib/w01.mjs`:

- `normaliseSubmission` (l.151) maps a missing `budget_band` to `null`.
- `decide` (l.421-427) then sets `budOut`, because the pending path is limited to `sub.channel === 'lead_ad'`.
- The lead is stored as `disqualified / budget_band`, deleted after 24 h, and the page shows the neutral exit.

**The site must not go live before this change.**

### 2a. Recommended: route the web lead, keep the on-page booking, gate the hand-over on the band

This keeps the lowest-friction path: the visitor books on the page, and the email is asked at confirm. The band is captured on WhatsApp before anything reaches the broker.

`normaliseSubmission`, inside the returned object:

```js
    product_interest: productChoice(body.product_interest) ?? (body.help_with === 'wills' ? 'wills' : null), // no-JS form: derive from help_with
    help_with: HELP_WITH.has(body.help_with) ? body.help_with : null,
    budget_pending: body.budget_pending === true || body.budget_pending === 'true',
```

At module level:

```js
const HELP_WITH = new Set(['review', 'life', 'disability_income', 'severe_illness', 'wills']);
```

`decide`:

```js
  const budgetPending = sub.channel === 'lead_ad' && row.budget_band == null && !ageOut;            // unchanged: hold, ask first
  const pageBudgetPending = sub.channel === 'page' && sub.budget_pending === true && row.budget_band == null && !ageOut;
  const budOut = !budgetPending && !pageBudgetPending && !KNOWN_BUDGET.has(row.budget_band);
  const tier = pageBudgetPending ? 'B' : tierOf(row.budget_band); // provisional: a broker who takes B also takes A
  ...
  // in the routed branch, after Object.assign(row, { broker_id, routed_at, routing_reason }):
  if (pageBudgetPending) {
    row.conv_state = { state: 'q_reason', budget_pending: true, help_with: sub.help_with };
    activities.push({ activity_type: 'budget_question_pending', actor_type: 'system', occurred_at: at,
      idempotency_key: `w01:budget_pending:${ctx.lead_id}`, payload: { channel: 'page', help_with: sub.help_with } });
  }
```

- Also store `help_with` on the lead. The cheapest place is `conv_state.help_with`, as above, so no DDL is needed.
- The response stays `accepted` with `lead_token` and `methods_supported`, so the booking widget opens as today.
- The browser `Lead` event stays as is. The server CAPI `Lead` stays at routing, as for any routed page lead.

Changes this needs outside W01:

1. **W05 (`/book`) hand-over gate.** The held-slot logic already exists: nothing reaches the adviser until the email is verified. Add a second condition: `budget_band IS NOT NULL`. A booking is handed over only when the email is verified **and** the band is known. Contract 5.7(a) gives the broker the "label, age band, budget band and reason(s)" when a B-tier lead is offered, and S2.2 makes the band Required.
2. **Re-route on the answer.** `1500_plus` (A) and `750_1499` (B) keep the provisional broker. `lt750` (tier C) keeps the broker only if `accepts_low_budget`. Otherwise release the held slot and fall into the existing `held_low_budget` path, with the `lead_low_budget_held` notice. Under R750 never exits the funnel; it stays tier C, as decided on 11 Oct.
3. **W06 first touch for a `q_reason` lead.** Send the reason step (section 3) instead of going straight to the slot or confirmation text.
4. **W07** must route taps in `q_reason` / `q_budget` to W03. `q_budget` is already a qualifying state (`w07.mjs:112`); add `q_reason` and `q_reason_note`.
5. **W03** must accept the four new band ids (section 3). `QUAL_BUDGET` must also include `750_1499`: it does not today (`ctwa/w03.js:74`), and the page has sent that value since the 11 Oct merge.

### 2b. Smaller alternative (not recommended while the WhatsApp number is Offline)

Treat a web `budget_pending` lead exactly like a lead-ad lead:

```js
const budgetPending = (sub.channel === 'lead_ad' || sub.budget_pending === true) && row.budget_band == null && !ageOut;
```

- Plus the `normaliseSubmission` lines from 2a.
- W01 then answers `{status:'accepted', lead_id}` with **no token**. The site already handles that: it shows "Check your WhatsApp" and no booking widget.
- Booking, and the email at confirm, move entirely to WhatsApp: `qualify_budget` → W03 → W06 `broker_intro_slots`.
- It is a one-line change on a tested path. But every web lead then depends on WhatsApp working, and the SMC number (+27 60 015 6480) was Offline on 13 Oct. Use it only once WhatsApp is live and stable.

## 3. WhatsApp step spec (not implemented)

This runs after the lead is accepted (2a: right after the page booking, in parallel with the email verify; 2b: as the first touch).

### Message 1: the reason

**When it is sent.** The first business-initiated message must be a template, because the visitor never messaged first. There are two options:

- **(a) Recommended.** Put the question inside the existing first-touch template that W06 already sends (the booking/adviser message). Append one quick-reply button, "Tell the adviser more". The tap opens the 24-hour window, and the list below follows as a session message.
- **(b)** Use a new UTILITY template `smc_qualify_reason` with up to 10 quick replies. This needs a new Meta approval, and Meta may move it to the marketing category (MASTER-PROMPT risk 1).

**The list.** It is a session list-picker using the generic `smc_session_list_N` (`templates/twilio/content/`, keyed in `wa-provider.mjs:122-126`).

- Body: "Thanks {{first_name}}. What's the main reason for your call? On our page you picked: {{help_with_label}}."
- Button: "Choose reason"

Rows depend on `help_with`. Ids reuse capture-v2's `REASONS` (`ctwa/capture-v2.js:21`) so brokers see the same codes (contract 5.9 / S2.2):

| `help_with` | Rows (id: title) | List |
|---|---|---|
| `review` | `paying_too_much`: "I think I'm paying too much" · `cover_still_right`: "Is my cover still enough?" · `life_change`: "Life change (baby, bond, new job)" · `old_policy`: "Policy from a previous job" · `not_sure_what_i_have`: "Not sure what I have" · `other`: "Something else" | `smc_session_list_6` |
| `life` / `disability_income` / `severe_illness` | `life_cover`: "Life cover" · `disability`: "Disability or income protection" · `severe_illness`: "Severe illness cover" · `retirement_planning`: "Retirement planning" · `investments`: "Investments" · `other`: "Something else" (the row matching `help_with` is listed first) | `smc_session_list_6` |
| `wills` | `will_new`: "A new will" · `will_update`: "Update my will" · `guardians`: "Guardians for my children" · `estate_costs`: "Estate costs" · `other`: "Something else" | `smc_session_list_5` |

- Funeral cover is left out on purpose: SortMyCover does not aim at funeral cover (11 Oct decision). The S2.2 code `funeral_cover` remains valid if a broker contract needs it.
- **Other, or any row, leads to notes.** After any tap, send: "Anything you'd like the adviser to know? Type it here, or tap Skip." This is a session quick reply with one button, `note_skip`. State `q_reason_note`. Free text up to 500 characters goes to `leads.conv_state.reason_note`. For **Other** the note is asked as "Tell us in a few words what you'd like to talk about." (no Skip).
- **Licence flag.** Map the reason to a licence category with capture-v2's `REASON_LICENCE` and `licenceFlags()`. A reason outside the routed broker's FSP licence is flagged (contract 5.9), never dropped.

### Message 2: the budget band

This is a session list `smc_session_list_4`, state `q_budget`. The ids are new but map onto existing DB codes.

| If the reason is a review (`help_with = review`, or reason `paying_too_much` / `cover_still_right` / `old_policy` / `not_sure_what_i_have`) | Otherwise |
|---|---|
| "Roughly what's your current monthly premium range? A rough idea is fine." | "Roughly what monthly amount are you thinking about? A rough idea is fine." |

The four rows, the same for both wordings:

| Row id | Title | DB `budget_band` | Tier |
|---|---|---|---|
| `budget_lt750` | Under R750 | `lt750` | C (kept; routed only to `accepts_low_budget` or held) |
| `budget_750_1499` | R750 to R1,499 | `750_1499` | B (broker accept/decline, 5.7) |
| `budget_1500_plus` | R1,500 or more | `1500_plus` | A |
| `unsure` | Not sure | - | uses W03's existing `q_budget_clarify` re-ask once; a second "not sure" is out of band, per the current W03 rule |

- For wills leads, ask the second wording, labelled "for cover and planning", or skip it. That depends on whether the will provider's contract needs a band. The current contract (S2.2) is written for cover brokers. **Open decision for Jono.**
- **W03 changes.** Add the three new ids to `BUDGET_ROWS` / `BUDGET_TO_DB`. Add `750_1499` to `QUAL_BUDGET`. Keep `qualify_budget` (5 quick replies) for lead-ad leads unchanged, or move it to the same 4 bands once the template is re-approved. The two sets must never be mixed in one thread.
- **Reminder.** Reuse `budgetReminder` (W01 l.497-505): one reminder after 3 h, never between 20:00 and 08:00.
- **No band within the window.** For 2a, the held slot is released when the email-verify window (`verify_by`) or 24 h passes, whichever is later, and the lead gets one honest "we couldn't confirm your call" message. For 2b, use the existing 24-h deletion.

### Why it must be captured before the broker sees the lead

- Contract 5.1(c): a Qualified Lead has "a monthly premium budget of R750 or more".
- S2.2 makes the budget band **Required**.
- 5.7(a) gives the broker the band when a B-tier lead is offered.
- S2.1 #4 accepts "Consumer's answer in the form or WhatsApp" as evidence.

So the band must be known, and self-declared, before the hand-over. The 2a W05 gate enforces this.

## 4. Fallback if WhatsApp is not live

Proposal: ask the band on the **email-confirm page**, not on the landing page.

- Every v2 booking already needs the email link (`https://sortmycover.co.za/v/<token>`, served by `SUB-email-verify`) or the 6-digit code before the adviser sees it.
- When the link is opened and the lead has no `budget_band`, the confirmation page shows one extra tap card under "Your booking is confirmed". It carries the same reason-dependent wording and the four bands from section 3, posted to the same sub-workflow (`op: 'budget'`).
- One tap completes the hand-over.

Why this is the least-friction compliant option:

- The visitor is already on that page, so it adds one tap and no extra message or channel.
- It comes after the booking, so Jono's rule ("not on the landing page", "later") holds.
- It is a form answer, which S2.1 #4 accepts.
- It works when WhatsApp is down.
- The reason list can sit on the same page as a `<select>` with Other plus a notes box, so the broker still gets S2.2's Required reason.

The landing-page booking step is the other candidate. It would put a money question back on the first page visit, against the rule, so it is not recommended.

Code path: if the lead confirms by code on WhatsApp instead of the link, WhatsApp is working, so section 3 applies.

## 5. Conflicts and open items

1. **Under R750.** Contract v0.3 (5.6, S2.2, S2.3(e)) and MASTER-PROMPT 0.1 still say "Under R750 filtered out". The code keeps those leads as tier C (Jono, 11 Oct). The contract text needs to catch up before signature.
2. **The word "review" on the page.** The spec C list of blocker words includes "review" (rules S1/S13/S16) because SortMyCover must not imply it reviews cover. The option reads "Review my existing cover" as the visitor's own wish, and its hint names the adviser as the reviewer. It passes the site's `BANNED` scan. Confirm with the compliance practitioner (Q1/Q5) before paid traffic.
3. **Practitioner sign-off.** Terms TU-v1.2-web and privacy notice PN-v1.3-web are version bumps that need sign-off, as for every draft legal page.
4. **Deploy order.** First the W01 change (2a, with the W05 gate) and the W03 band ids. Then deploy the site. If the site goes first, every web lead is disqualified and deleted after 24 h.
