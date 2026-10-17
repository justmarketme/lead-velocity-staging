# Hide-words: what each category does and why (for Jonathan's approval, GATE-HIDE-WORDS)

Decision needed: approve `community/hide-words.txt` (or mark changes), and fill section 4. Nothing is applied to the Page until you approve. KG is second approver.

Why this exists: Meta ranks an ad partly on negative feedback and on unmoderated hostile threads, which lowers quality ranking and raises CPM. Hiding (never deleting) spam and abuse quickly protects the ad. POPIA also says people should not publish their own phone or ID number under a public ad.

How it works in practice: Meta's keyword box hides matching comments automatically. W30 does the rest: it hides with `is_hidden=true` (Facebook) or `hide=true` (Instagram), logs the comment in the `comments` table, and the commenter can still see their own comment, so there is no public argument. Hiding is not deleting, so criticism is never removed: scam suspicion, price complaints and "this is a con" are objections and get one calm public answer, not a hide.

## 1. Slur categories (not spelled out)
- What: racial, ethnic, xenophobic, homophobic, gendered, disability and religious slurs, plus threats, in English, Afrikaans, isiZulu, isiXhosa, Sesotho and Setswana.
- Action: Meta hides automatically; W30 classifies the same material as `abuse` on meaning, so misspellings are also caught. No reply, repeat offenders blocked after two hidden comments.
- Your part: Jonathan or KG types the actual terms into Meta's box by hand. They are deliberately not in the repo or in any prompt. Set the Page profanity filter to Strong as well.
- Risk: very low. Over-hiding is limited because real abusers are rarely customers.

## 2. Scam and spam patterns ([KEYWORDS-SCAM])
- What: forex, crypto and trading signals; loans (including "no credit check"); "work from home" and get-rich lines; lottery and prize claims; spell casters and miracle cures; adult and escort lines; follower sellers; recruiting; link shorteners and chat-app links (Telegram, `wa.me`, `t.me`).
- Action: hide, no reply, no private message.
- Deliberately NOT on the list: "dm me", "whatsapp me", "inbox me", "message me" and "call me". Real people use those when they are interested, and hiding them would hide leads. They are handled as `interest` or, if a number is written, as `own_data_posted`.
- Risk: low. Terms like "payday" or "casino" could occasionally appear in a genuine comment; the commenter's own view still shows it and a human sample review (weekly) catches false hides. Tell me any term you want removed.

## 3. Phone, ID, email and bank number patterns ([REGEX] own_data.*)
- What: South African mobile and landline numbers (with or without +27, spaces or dashes), international numbers, 13-digit SA ID numbers, email addresses, bank account numbers, card-like digit runs, and numbers written out in words.
- Action: W30 hides immediately (within 5 minutes), redacts the digits before storing the comment, does not reply publicly, and sends one private message: "we have hidden your comment to protect your personal details" plus the way to continue. This is a POPIA protection, not moderation of opinion.
- Important: Meta's keyword box cannot do patterns, so these run inside W30, not in Meta. Between the comment arriving and W30 hiding it (target under 5 minutes, usually seconds) the number is briefly visible. That is accepted and logged.
- Risk: a business number quoted in a question ("is 0800 000 000 yours?") matches the landline pattern. The classifier decides: own data of the commenter is hidden, a question about our number is not. Edge cases are sampled weekly.

## 4. Competitor patterns ([KEYWORDS-COMPETITOR-PLACEHOLDERS] plus spam.url, spam.bare_domain, competitor.invite)
- What: named lead providers, comparison sites and lead marketplaces (to be filled by you), and any link or "join my page" invitation.
- Action: hide, no reply, repeat offenders blocked.
- Decision for you: the list is placeholders. Name the lead-generation competitors you want hidden. Do NOT add insurer names: people asking "is it Discovery?" are asking a product question that deserves the deferral line, and hiding would look evasive. A commenter's link to a competitor is hidden; a commenter merely naming an insurer is answered with the deferral line.
- Risk: a genuine commenter pasting a link to an article gets hidden. Acceptable.

## 5. Allow list ([ALLOW])
- Our own domains and a few phrases that look like keywords but are normal questions ("how do I book"). W30 checks it first.

## 6. Settings the Chrome agent applies with this list (all behind your approval)
Profanity filter on (Strong). Keyword list pasted from sections 1 to 4. Messenger and Instagram instant reply off (we own the first reply). Ice-breakers set to the three questions in `community/reply-corpus.md`.

## 7. After approval
- Weekly: the 20-reply review also samples 10 hidden comments for false hides (see `community/MEASUREMENT.md`).
- Anything changed in `hide-words.txt` bumps the version in its header and re-runs `evals/comment-cases.json`.
