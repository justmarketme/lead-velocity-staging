# Review: DRAFT concepts C16 and C17
Date 2026-10-03 · compliance-qa · QA flag list, not legal advice. Checked against 2.1.1, 2.1.5, 2.1.8, 4D.2 rule 8, `landing/config/consent.json`. No web research (4.0a).

## Verdicts
| Concept | As submitted | After fixes (applied to DRAFT files) |
|---|---|---|
| **C16 bond paperwork** | **FAIL** | **PASS-WITH-FIXES** (reworded, claim removed) |
| **C17 policy review** | **PASS-WITH-FIXES** | PASS once fixes below are in (applied) |

## C16
- **Blocker (2.1.5).** "Bond paperwork often includes a cover form" has no source: `deliverables/verified-facts.md` has no bond entry. It is also ambiguous. In SA, bond paperwork commonly carries homeowner's (building) insurance, which is not life cover, so "cover form" could be read as a requirement or as the wrong product. The concept's own fallback applies. Decision: remove the claim and keep the trigger as a scene. The original wording returns only if Jonathan files a source and the practitioner agrees it is not misleading.
- "It is easy to sign and move on" is an unsourced behaviour claim. Replaced by "easy to leave for later" (a possibility, not a frequency).
- "Go through it" suggested the adviser reviews a bank or insurer document, which edges toward product comparison. Replaced by "look at the actual numbers" (C07 precedent).
- H2 "Sign the bond. Then check the cover form." is an imperative that tells the viewer what to do about a financial document. Dropped.
- Personal attributes: the new hook is a scene and says nothing about the viewer's debt. No bank, insurer, premium, figure or comparison. Disclosure (end card, short form) is acceptable; the full rule-8 footer comes from `consent.json` on the page.
- Exact replacement copy (applied):
  - H1 "Bond signing day is busy." · H2 "Signing day is busy. Cover is a separate job."
  - Primary text: "Bond signing day is busy. There are pages to read and papers to sign. Checking life cover is a separate job, and it is easy to leave for later. A licensed adviser can look at the actual numbers in 30 minutes. On video, WhatsApp or phone. Free to check, and you decide after. Tap to check your cover."
  - Headline "Bond signing day is busy". Tabs "Offer", "Bond", "Cover check". Video captions at 5.0 and 8.0 updated to match. Landing H1, sub, gap line, title and og in `bond-paperwork.json` updated.
- H3 was dropped from the set with "The cover form in the bond pack" (it asserted the claim).

## C17
- "Cover is often left exactly as it was set up": soft frequency claim, no source. C04 precedent is not a source. Fixed to "Cover can be left as it was set up." (applied in text, video caption 6.0, landing gap line).
- H3 "Nobody sends a reminder to review cover": absolute and unsourced. Replaced with "Life changes. Cover can stay put."
- Headline "Check the fit" suggests a suitability judgement. Replaced with "Old cover. New life. A free review."
- H1/H2 "Cover from 10 years ago" and "Old cover" are noun phrases, not "you" assertions. Acceptable under 2.1.8 but it is the closest to implying the viewer holds cover. Keep without "your", no "Still a fit?". Monitor Meta disapprovals (M).
- "Look at what is in place and what has changed" is the adviser's own service. It is not advice by Lead Velocity, and the ad says nothing about keeping, cancelling or replacing. Keep it so: no replacement, "cheaper", "save" or "switch" wording in ad, page, quiz or WhatsApp.
- **(practitioner)** Add to GATE-OPINION: targeting existing policyholders raises the replacement rules (PPR/s14 disclosure and replacement duties) for the broker. Does the page need a one-line "no obligation to change anything" or is the current copy enough? Do not publish C17 before that answer is logged (or mark it pending and run C16 or C03 first).
- Unchanged and fine: "A licensed adviser", "Free to check, and you decide after", CTA LEARN_MORE, 20 s grade FK ≤ 3 (re-run `fk_check.py` after the edit; copy is shorter or equal).

## Cross-checks
POPIA: the quiz and consent are unchanged (named consent line from `consent.json`). No new data field. Meta: no special-ad-category breach found (no targeting by debt or age implied in copy; targeting must remain within the Special Ad Category limits, which is for meta-operator). C05 (not reviewed here) still contains the same "Nobody sends a reminder" line: apply the C17 replacement there too.

Next: re-run `fk_check.py` and the concepts.csv parse; then I will re-check the rendered frames before any move out of `_draft/`.

## Addendum 2026-10-03: C05 "Nobody sends a reminder to check it"
- **Verdict: not acceptable in C05.** Same fault as C17 H3: an absolute, unsourced claim about what happens to the viewer's cover. The turned-40 context does not change that. No source in `verified-facts.md`.
- **Replacement (C17 rule):** "Cover can be left as it was set up." (video caption at 7.0 and primary text; 62-word text shrinks, FK stays <= 3).
- **Applied:** `creative-strategist/concepts.md` (primary text, 20 s video line) and `concepts.csv` (4:5 and 1:1 rows). `landing/angles/turned-40.json` does not contain the line; its hedged "may not fit" sub is fine, no change.
- **Re-render needed (visual-producer):** `C05_trigger-turned-40_9x16_20261002.mp4`, `C05_trigger-turned-40_4x5_20261002.mp4` and `C05_trigger-turned-40_9x16_20261002.srt` (row 4 in `engine/art.mjs`; stills and 1x1 PNG show the hook only, no re-render). Update `manifest.json` hashes.
- **Other owners:** `performance-creative-director/creative-briefs/C05.md` (line 19), `media-buyer/first-batch.csv` row 7 and `campaign-spec.md` line 209 (open flag now resolved). C05 must not upload until the re-render is checked by me.

## C16 rendered-frame check (2026-10-04)
Checked: `visual-producer/review/C16-frames.png` (9:16 and 4:5 rows), manifest.json/csv C16 entries, `landing/angles/_draft/bond-paperwork.json`, against 2.1.8 and this review.
- **Frames PASS.** Scene copy matches the reworded set. No bank, insurer, product, premium or figure. No second-person claim about the viewer's debt or cover. No bond-pack claim. End card carries "A service of Lead Velocity (Pty) Ltd. No financial advice, product comparisons or premium quotes." Disclosure text is small but present on both ratios; the end card holds for the last 3 s (manifest QA).
- **Manifest PASS.** Video rows carry the DISC-S97-v1 line, status DRAFT pending NH-64, `first_submit` false. Stills show the hook only.
- **Landing JSON PASS (content).** Matches the reworded copy; no figures, names or comparisons; chips are process claims.
- **FAIL on one item: no C16 `.srt` sidecar exists** (`assets/` has none; the manifest has no srt rows for C16, unlike C01 to C15). I cannot check captions I cannot see.
- **Fix (visual-producer):** emit `C16_trigger-bond-paperwork_9x16_20261003.srt` and its manifest row, with cue text identical to the burned-in rows (frames above). Then I re-check the SRT text only (about 2 min).
- **Not moved:** `_draft/bond-paperwork.json` stays in `_draft/` until the SRT is in. Its `_status` string also needs updating on the move.
