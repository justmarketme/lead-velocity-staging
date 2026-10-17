# Day 5 · FAQ carousel · "Four straight answers"

Status: NEW, needs compliance-qa before posting. Jonathan posts or schedules it in Business Suite himself (G8 #2).

| Field | Value |
|---|---|
| Day / time | Day 5 · 18:00 SAST |
| Format | IG carousel, 5 cards, 4:5 (1080×1350). On FB: multi-photo post, same 5 images in order |
| Images | `brand/exports/feed/week1/W1D5-faq-1-cover-1080x1350.png` · `…-2-free-…` · `…-3-advice-…` · `…-4-who-pays-…` · `…-5-advisers-…` |
| Build | `cd brand && node scripts/build-week1.mjs` (data only, existing `feed.html` r4x5) |
| Surfaces | FB + IG. Cards 2–5 go to Stories and into the **FAQ** Highlight. Card 5 also goes into **Advisers** |
| Links | None |
| Why | Carousels are IG's highest-engagement format (Socialinsider, 35M posts, B; research #7). The post answers the four objections a sceptic checks first (profile-kit §2 Highlights). It is IG pin #3 (profile-kit §2) |

## Cards (on-image text; bold = amber; footer line on each = the approved brand line + logo)

| # | Hook | Sub | Paper notes |
|---|---|---|---|
| 1 | Four straight **answers.** | About SortMyCover and the free 30-minute call with a licensed adviser. | none |
| 2 | Is the call **free?** | Yes. The 30-minute call is free. There is no obligation to buy anything. | The call: Free · Afterwards: No obligation |
| 3 | Does SortMyCover **give advice?** | No. A licensed adviser gives the advice. SortMyCover books the call, then steps back. | SortMyCover: Books the call · Licensed adviser: Gives advice |
| 4 | Who pays **SortMyCover?** | Advisers pay SortMyCover the same flat fee for each 30-day cycle, whether or not anyone buys. (5 Oct: was "Lead Velocity"; **current PNG still says Lead Velocity: re-run `build-week1.mjs`**) | Paid by: Advisers · Commission: Never |
| 5 | Who are **the advisers?** | Each one is an authorised financial services provider. The adviser shares a name and FSP number first. | Licence: Authorised FSP · Check it: FSCA register |

## Facebook text (about 760 chars)

```text
Four straight answers about SortMyCover.

1. Is the call free? Yes. The 30-minute call is free and booked for a time that suits. There is no obligation to buy anything.

2. Does SortMyCover give advice? No. A licensed adviser gives the advice. SortMyCover books the call, then steps back.

3. Who pays SortMyCover? Advisers pay SortMyCover the same flat fee for each 30-day cycle, whether or not anyone buys. SortMyCover never takes commission.

4. Who are the advisers? Each one is an authorised financial services provider (FSP). The adviser shares a name and FSP number first. Any FSP can be checked on the FSCA website.

Pick a time for a free 30-minute call with a licensed adviser: sortmycover.co.za

SortMyCover gives no financial advice, product comparisons or premium quotes.
```

## Instagram caption (about 820 chars, 4 hashtags)

```text
Four straight answers about SortMyCover. Swipe through.

1. Is the call free? Yes. The 30-minute call is free and booked for a time that suits. There is no obligation to buy anything.

2. Does SortMyCover give advice? No. A licensed adviser gives the advice. SortMyCover books the call, then steps back.

3. Who pays SortMyCover? Advisers pay SortMyCover the same flat fee for each 30-day cycle, whether or not anyone buys. SortMyCover never takes commission.

4. Who are the advisers? Each one is an authorised financial services provider (FSP). The adviser shares a name and FSP number first. Any FSP can be checked on the FSCA website.

Pick a time for a free 30-minute call with a licensed adviser: sortmycover.co.za

#SortMyCover #LifeCover #FinancialLiteracy #SouthAfrica

SortMyCover gives no financial advice, product comparisons or premium quotes.
```

**CTA when click-to-WhatsApp is live** (swap the CTA line only): `Pick a time for a free 30-minute call with a licensed adviser on WhatsApp: {{WA_LINK}}`

## Alt text (one per card)

1. Dark charcoal graphic. Headline: Four straight answers. Smaller text: About SortMyCover and the free 30-minute call with a licensed adviser. Footer: Sort your cover. 30 minutes. A real adviser. SortMyCover logo.
2. Dark charcoal graphic. Headline: Is the call free? Text: Yes. The 30-minute call is free. There is no obligation to buy anything. Two paper notes read The call: Free, and Afterwards: No obligation. SortMyCover logo.
3. Dark charcoal graphic. Headline: Does SortMyCover give advice? Text: No. A licensed adviser gives the advice. SortMyCover books the call, then steps back. Two paper notes read SortMyCover: Books the call, and Licensed adviser: Gives advice. SortMyCover logo.
4. Dark charcoal graphic. Headline: Who pays SortMyCover? Text: Advisers pay SortMyCover the same flat fee for each 30-day cycle, whether or not anyone buys. Two paper notes read Paid by: Advisers, and Commission: Never. SortMyCover logo.
5. Dark charcoal graphic. Headline: Who are the advisers? Text: Each one is an authorised financial services provider. The adviser shares a name and FSP number first. Two paper notes read Licence: Authorised FSP, and Check it: FSCA register. SortMyCover logo.

## Self-check against the hard rules

| Rule | Result |
|---|---|
| Educational, broker-neutral | PASS: no broker, practice, face or FSP number. "FSP number" is named as a thing that gets shared, never shown |
| Third person, no "you/your" claims | PASS (brand line on images: same open item as the warm-up README #3) |
| No advice (FAIS) | PASS |
| No product, insurer, premium, cover amount, rand figure, "2–4×" | PASS |
| Never "guaranteed" | PASS |
| No engagement bait | PASS: "Swipe through" tells people how to use the format; it doesn't ask for likes, comments or shares |
| Fee wording | CHANGED 5 Oct (Jonathan): P-4 now reads "Advisers pay SortMyCover the same flat fee for each 30-day cycle, whether or not anyone buys" (trading name, same fact) plus "never takes commission". compliance-qa to re-pass P-4. CTA + closing line replaced per Jonathan (no Lead Velocity on social) |
| Facts true today | PASS: the adviser shares name and licence details first (WU04, passed). Card 5 avoids saying "in the first WhatsApp" because WhatsApp is not live yet. The FSCA keeps a public FSP search |
| Short | NEAR: FB about 740 chars, over the ~600 guideline. The hook sits before "See more" and each answer is one block, so it was not cut |
| Ends with DISC-S97-v1 verbatim | PASS |

**NEW strings for compliance-qa:** card 1 sub; card 2 sub and notes; card 5 sub and notes ("Check it: FSCA register"); "Any FSP can be checked on the FSCA website."; "Swipe through."

**5 Oct compliance self-check (visual-producer):** all five rendered cards viewed; no clipping. No edits needed. Cards carry no on-image disclosure (4:5 feed template); DISC-S97-v1 is in the caption on both surfaces.
