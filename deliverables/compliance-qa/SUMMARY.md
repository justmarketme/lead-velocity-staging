# compliance-qa: summary

Phase 0 review 1 (`phase0-review-1.md`) looked at four deliverables: the 36 WhatsApp templates, the SortMyCover holding site, the Pixel/CAPI layer and the contracts-drafter set. All four are **PASS WITH FIXES**. None fails, and none gives advice, quotes premiums or names a product or insurer.

The structure is sound:
- The fee is flat per cycle and never tied to policies.
- There is no grace or notice period.
- The word used is "committed", never "guaranteed".
- Replacement caps are per cycle, and a shortfall gets a 14-day extension and then a credit.
- STOP is honoured everywhere, and complaints have a 48-hour route through howzit@ and the COMPLAINT keyword.
- Named disclosure arrives in the first WhatsApp.
- Nothing is hashed in the browser.

The fixes that block a gate:
1. **AI disclosure is missing at first contact.** Add one sentence to the intro templates and to the CTWA consent message. This needs a human decision, because 4.6 calls the intro text "exact".
2. **Disposition labels.** Four of them break Meta's 25-character limit, and they differ between the buttons, 4.12a and Schedule C. Use one canonical set everywhere.
3. **Portal hostname.** The template URL buttons use portal./console.leadvelocity.co.za, but 6.7 says app.leadvelocity.co.za.
4. **Advertising sentence.** It sits outside the consent tick and is missing from the CTWA consent. 4.4a puts it inside the consent line.
5. **Automatic Advanced Matching** must be off before GATE-PIXEL.

The smaller fixes are listed with file, line and a one-line remedy. On the open contract points: I agree with NH-CD-10, 11, 14 and 15. NH-CD-12 (silent verified leads becoming replaceable) and NH-CD-13 (an attended but unverified lead not counting) stay as money decisions for Jonathan, with my recommendations. This review is a QA flag list, not legal advice.

**First-principles memo and W24 (2026-10-02).** `first-principles.md` is the 4B memo, written from the prompt only. Goal: zero advice-type statements and 100% of leads with consent plus disclosure evidence, both counted by query. It rests on four gates: a fail-closed classifier gate (deterministic banned terms plus the LLM check, a CI golden set at 100% FAIS, W33 sampling), the consent record (exact text, version, time, URL, source, mode), the disclosure log (wamid plus delivery before the meeting) and the obligations register. Disclaimer walls, a retained compliance officer and per-channel opt-out lists are dropped. The memo has 14 assumptions (practitioner Q1–Q11 and Q17 among them) and kill criteria for the design. W24 is specced in `automation/W24-compliance-cleanse.md`, with an inactive n8n skeleton in `automation/W24.json` (38 standard nodes, valid JSON, credentials by name, no secrets, Africa/Johannesburg). It runs monthly on the 1st at 06:00 and daily at 06:00 for retries and IO/NCC/PAIA reminders. W24 reads active leads, checks them against the registry (`api` placeholder that fails closed, or the working `csv` fallback), adds matches to the single `suppression` list, suppresses them by reusing W15, reconciles STOP and objections, writes a PII-free `compliance/evidence/YYYY-MM.md` and updates `obligations` C2/C3. It alerts compliance-qa on failure and Jonathan after 3 days. Eight needs_human items remain open, led by the unknown NCC registry mechanism, the evidence-path conflict with pack B4, the W15 interface and the schema gaps. This is a QA design, not legal advice.
