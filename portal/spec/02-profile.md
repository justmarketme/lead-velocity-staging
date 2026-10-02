# 02 Profile (practice, FSP, adviser, headshot, bio)

**Route:** `/broker/profile` (two screens in the wizard: A "Tell us who you are", B "Your photo and two lines"). **Prototype:** `portal/prototype/profile.html`. **Inspired by:** FSCA public register (verify before routing; also the broker's own trust signal), Lemonade (one question at a time, says what happens next).

## Fields to `brokers` columns (existing columns mapped per crm-gap A1; never renamed)
| Field label | Column | Required | Validation |
|---|---|---|---|
| Practice name | `practice_name` (= `firm_name`) | Yes | 2-120 chars, trimmed. Should match the FSP licence name (the FSCA check compares) |
| FSP number | `fsp_number` | Yes | Strip spaces and a leading "FSP". Must match `^\d{3,6}$` (**ASSUMPTION, still unconfirmed in the build**: FSP numbers are 3-6 digits; confirm against Mark's real number before go-live; the W20 FSCA lookup, not this regex, is the authority). Immutable once `verified` except via Jonathan |
| Adviser name | `adviser_name` (= `contact_person`) | Yes | 2-80 chars. Used in the intro card and every lead message |
| WhatsApp number | `adviser_whatsapp` (= `whatsapp_number`) | Yes | E.164, SA mobile (`+27` + 9 digits starting 6/7/8). Twilio Lookup (line type mobile) on Save. Receives the daily list, briefs and outcome taps |
| Email | `email` | Yes (prefilled from the login email) | Valid email. Never asked twice |
| Headshot | `headshot_url` | No (see fallback) | JPG/PNG/HEIC, up to 8 MB, min 600 px. Private bucket, cropped square client-side with a face guide. Phone camera allowed (`capture=user`) |
| Two lines about you | `bio_short` | Yes | 40-220 chars. In his own words: who he helps, how he works. The same LLM no-advice gate used for scripts runs on Save (no product, insurer, premium, amount, return, "best/cheapest", "guarantee") and shows the exact word that tripped it |
| Languages | `languages text[]` | Yes, at least 1 | From a list (English, Afrikaans, isiZulu, isiXhosa, Sesotho, Setswana, Sepedi, Xitsonga, Tshivenda, siSwati, isiNdebele, Other). Drives language routing and the video variants |
| Years advising | `years_advising` | Yes | Integer 0-60 |

Not asked here (asked elsewhere, once): hours, methods, capacity (Calendar), signatory name and role (Agreement), Facebook Page (Agreement, Annex 1 only).

## FSP check (W20; the compliance gate and the broker's trust signal)
1. On Save of screen A the portal writes the columns, emits `fsp.submitted`, and shows "Checking the FSCA register..." (target under 10 s; the broker can carry on to screen B while it runs).
2. W20 calls `FSCA_REGISTER_URL` (env; an HTTP node, see `automation/W20.json`) with the FSP number. The endpoint or adapter must return the normalised shape `{found, status, register_name, categories[], checked_at}` (**needs_human**: how the register is queried).
3. Rules: **verified** = `found` and `status` is an active/authorised status and the register name matches `practice_name` (or `practice_legal_name`) at a token-similarity score of at least 0.6, and the authorised categories include long-term (life) insurance (**ASSUMPTION**: pattern is a constant in the W20 Code node). **blocked** = not found, not active (suspended, withdrawn, lapsed), name mismatch, or not authorised for life. **pending_manual** = the lookup failed three times (the HTTP node retries 3 times, 5 s apart; the broker is not made to wait).
4. Result is written to `fsp_check jsonb` `{status, checked_at, register_name, register_status, categories, name_score, attempts, source}` and `fsp_verified_at` on `verified`.
5. **Blocked:** routing stays off (the broker cannot reach `onboarded`), Jonathan and KG get an `ops_alert` (WhatsApp) with the FSP number, the register name and the reason; the broker gets the soft message below. Jonathan can override with one tap in the console ("I checked the register: verified"), which writes `fsp_check.status = verified` with `by = jonathan`.
6. The broker sees the result, with the register name, as a trust line: "Found on the FSCA register as {register_name}." The intro card carries "Authorised financial services provider . FSP {number}" only after `verified`.

### Copy (Grade 7)
- Screen A heading: "Tell us who you are". Sub: "Three questions. We check your FSP number on the public FSCA register. It also shows leads you are the real thing."
- Checking: "Checking the FSCA register. This takes a few seconds."
- Verified: "Found on the FSCA register: {register_name}. Authorised financial services provider. Checked just now."
- Blocked (soft, no accusation): "We could not match that number to your practice name. Check the number and try again. Nothing is wrong yet; this takes one more try. After three tries we check it by hand and tell you on WhatsApp."
- If the register name differs but the broker says it is right: "The register lists this FSP as {register_name}. Is that your practice? [Yes, that's us] [No, change my number]". "Yes" stores `practice_legal_name` and re-runs the check; if it still fails it goes to Jonathan.
- A representative (not the FSP owner) can enter the FSP of the practice they operate under; the legal name goes in `practice_legal_name`. Edge case, see needs_human.
- Screen B heading: "Your photo and two lines". Sub: "Leads see these before they meet you. We're testing whether a real face helps people turn up."
- Bio hint: "Who you help and how you work. No product names, no 'best', no promises."
- Gate trip: "Please take out '{word}'. We can't say that in a message to someone who hasn't met you yet."

## Fallbacks and defaults
- **No headshot:** not blocking. The intro card renders with a monogram (initials on charcoal) and the card step shows "Add a photo any time; leads trust a real face." Nudge copy mentions it at 72 h only. A broker who WhatsApps a photo to howzit@ can have it attached by Jonathan.
- **Invalid WhatsApp number (landline/VoIP):** "That looks like a landline. We need your mobile so leads and your daily list reach you."

## Step clip: "Your details and FSP check" (35 s)
| Time | On screen (real portal, Playwright) | Voice-over (captioned) |
|---|---|---|
| 0:00 | Profile screen A, fields highlighted one by one | "Start with three things: your practice name, your FSP number, and your WhatsApp number." |
| 0:12 | Tap Save; "Checking the FSCA register..." then the green line | "We check your FSP number on the public FSCA register. It takes seconds. It also shows your leads you are the real thing." |
| 0:24 | Screen B: photo, two lines | "Now a photo and two lines in your own words. Who you help, how you work." |
| 0:31 | Tick on step 2, step 3 highlighted | "That's it. Next up: your calendar." |

## W20 and measures
Events: `fsp.submitted`, `step.completed(profile)`. Measures: FSP first-try pass rate; manual-review rate; time from login to `profile` done; headshot present at go-live.
