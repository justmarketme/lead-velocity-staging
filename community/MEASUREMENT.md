# Community measurement (console tiles and the weekly review)

Owner: community-response-lead. Source tables: `comments`, `escalations`, `conversations`, `dm_queue`, `comment_ad_sentiment` (see `community/comments-schema-additions.sql`). Attribution key: `ref=cmt_{ad_id}` on the CTWA link, carried into W03 as the lead's source.

## Console metrics

| Metric | Definition | Target | Source |
|---|---|---|---|
| Public SLA % | Comments needing a public reply answered within the rule's SLA (900 s; 600 s complaints; 300 s in a new ad's first 2 h), counted only inside 07:00-22:00 SAST; overnight comments measured from 07:00 | >= 95% | `comments.sla_seconds`, `rules.json` |
| Hide SLA % | spam, competitor, abuse hidden within 600 s; own-data within 300 s (24/7) | >= 98% | `comments.sla_seconds` where hidden |
| Funnel | comments -> relevant (question, interest, objection, advice) -> private replies sent -> WhatsApp opens with `ref=cmt_*` -> consented -> qualified (3.3, verified) | tracked weekly | `comments.private_reply_sent_at`, W03 leads by ref, `comments.origin_lead_id` |
| Comment-origin qualified leads per week | qualified leads whose ref starts `cmt_` | the number this role moves | leads by ref |
| Cost per comment-origin qualified lead | ad spend attributable to threads that produced them / count (media-buyer allocates spend by ad) | below blended CPL | ads + leads |
| Human escalations per week | rows in `escalations` by kind (complaint, sensitive, needs_human, dm_handoff, classifier_invalid, hostile_thread); median time to first human touch (target <= 30 min) | trend down, touch <= 30 min | `escalations.raised_at`, `acked_at` |
| Guardrail trips | public or DM drafts that failed lint or the shared guardrail (W30/W31 log), plus injection attempts classed spam with fais_risk | 0 reaching a thread; trips themselves are tracked per 100 replies | W30/W31 logs |
| Failed actions | `comments.status = failed` or `dm_queue.status in (failed, expired)` | 0 | tables |
| Ad sentiment | daily per ad from `comment_ad_sentiment`; objection themes seen 3 or more times go to creative-strategist; negative-feedback-prone threads go to media-buyer | n/a | W30 daily job |
| Hide false-positive rate | hidden comments a reviewer judges legitimate, from a 10-comment weekly sample | < 5% | review sheet |

## Weekly 20-reply review (Jonathan or KG, 20 minutes)

Sample 20 live replies: 12 public, 4 private, 2 DM threads, 2 escalations, chosen by `order by random()` across the week. Add 10 hidden comments for false-hide checks. Record in the console sheet.

| # | Surface | Case | Reply ID | Right class? (Y/N) | Within SLA? | Third person, no advice, no price, no insurer? | Max 2 sentences, no "!", no link (public)? | Disclosure present (first private/DM)? | Tone: warm, plain, Grade 5-7? | Action needed (prompt, template, rule, hide list) | Reviewer |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 to 20 | fb/ig/dm | | | | | | | | | | |

Pass bar for the week: 100% on the advice/price/insurer column, >= 95% on tone and class. Any advice-type statement found is a stop: pause W30 public replies (set rules `public_reply: false`), raise to compliance-qa, add the case to `evals/comment-cases.json`, then re-enable only after the eval passes.

Outputs of the review: template edits (reply-corpus.md), hide-list changes (needs approval again), rule changes (rules.json). Every change re-runs `evals/comment-cases.json`.

## First 50 live replies (human gate)

Before W30 sends unattended, the first 50 public replies are reviewed using the same sheet. Gate owner: Jonathan. Default if unreviewed: W30 stays in draft mode (classify and log, no send).
