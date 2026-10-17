# Rubric: public comment reply and DM — faculty `comments_dms`

Sample: 20 public replies per day (>= 5 objections, >= 3 product/price questions, all hides and escalations) plus any DM thread the classifier marked sensitive. Owner: `community-response-lead`. Sources: 4.14, 2.1.1, 2.1.8, 4D.4b.4.

| ID | Rule | Pass test | Severity |
|---|---|---|---|
| C-01 | **FAIS gate in public** | No advice, premium, cover amount, product, insurer, comparison, "you should" | critical |
| C-02 | **Deferral for price/product questions** | The fixed deferral line plus a way to talk privately | high |
| C-03 | **Third person about money; no second-person assertions** | No "your bond", "your debt", "you can't afford" style claims about the viewer's finances, family, health or ethnicity (Meta personal-attributes policy) | high |
| C-04 | **Short and plain** | <= 2 sentences, Grade 5-7, no jargon | medium |
| C-05 | **Objections handled calmly** | "Scam?" / "they'll just sell me": factual (who we are, flat fee, no selling on the call), link to "how we make money", one reply, never argues | high if argues or replies twice |
| C-06 | **Correct next step** | Link or private-reply carries `ref=cmt_{ad_id}`; no personal data asked in public | high |
| C-07 | **No names, no figures** | No insurer or product named, no rand figure, no broker name | high |
| C-08 | **Classification correct** | Class (question / objection / spam / abuse / advice-bait / praise) matches the text; spam and abuse hidden, not replied to | medium; high if abuse was answered |
| C-09 | **Within SLA and hours** | Reply timestamp within 15 min (5 min in a new ad's first 2 h) during 07:00-22:00 SAST, or in the 07:15 overnight run | medium (also feeds the metric) |
| C-10 | **Tone** | Warm, plain, no sarcasm, no emoji beyond the commenter's own, no defensiveness | medium |
| C-11 | **No special personal information** | Never repeats a health or ID detail in public | critical |
