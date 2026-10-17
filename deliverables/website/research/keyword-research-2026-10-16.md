# SortMyCover keyword and trend research — 16 Oct 2026

Method: Google Trends (South Africa, web search, past 12 months; raw data `google-trends-za-2026-10-16.json`, re-run with `node sites/sortmycover/scripts/trends-za.mjs out.json "a,b,c"`) and Google's South African autocomplete (`gl=za`, 30 seed phrases). Trends values are **relative** (0–100 within each comparison group), not search volumes. Keyword Planner volumes and CPC are still not accessed.

## Relative interest (each row is its own comparison)
| Group | Result |
|---|---|
| Life vs other topics | funeral cover 76 · life insurance 54 · life cover 51 · how to write a will 7 · estate duty 6 |
| Cover types | life cover 66 · income protection 4 · disability cover 1 · critical illness 1 · dread disease cover 0 |
| Wills and estate | how to write a will 45 · executor of estate 23 · inheritance tax 11 · testamentary trust 2 · letters of executorship 0 |
| Bond and business | life cover 66 · credit life insurance 2 · bond protection, key person, buy and sell 0 |
| Planning | life cover 66 · retirement annuity 39 · financial planning 16 · estate planning 3 · financial adviser 3 |

## Rising and definitional queries (what people are asking)
- **Life:** "what is life insurance" (+60%), "what is life cover", "what is a life cover", "life cover for parents", "life insurance south africa".
- **Credit life:** "what is credit life insurance" (+50%), "credit life insurance south africa", "standard bank credit life insurance" (+50%), "wesbank credit life insurance" (+150%); autocomplete: "credit life insurance vs life insurance", "is life insurance compulsory for home loan".
- **Income:** "what is income protection insurance" (+140%), "disability income protection insurance" (breakout), "salary protection insurance" (+80%); autocomplete: "income protection retrenchment", "income protection insurance for job loss".
- **Illness:** "critical illness insurance" (+60%); South Africans also say "dread disease cover".
- **Estate:** "what is estate duty", "estate duty south africa", "what is an executor of an estate", "executor of estate fees south africa", "inheritance tax south africa", "what happens if you die without a will", "how to write a will in south africa", "is life insurance part of an estate", "is life insurance taxable in south africa".

## What was built (sites/sortmycover, branch redesign/motion-diverse-2026-10-16)
1. New `/learn/what-is-credit-life-insurance/` (sources: SAnews on the 2017 Credit Life Regulations; NCR guideline and National Credit Act s106(4)).
2. New `/learn/estate-duty-south-africa/` (source: SARS Estate Duty page, 19 Aug 2026), answering "inheritance tax south africa".
3. Retitled to search wording: "What is life cover? Life insurance in plain words"; "What is income protection insurance? Salary protection in plain words"; "Severe illness cover (critical illness or dread disease)"; "What is disability cover?"; "What a will does, and what happens without one"; "What an executor does".
4. Home "Read first" links to both new guides (internal linking).
5. Wills guides may now cite verified regulator, government and industry sources as well as Capital Legacy (Jono, 16 Oct 2026; `tests/sections.test.ts`).

## Next content, in priority order (not yet built)
1. "What does an executor do, and what do executors charge?" (Capital Legacy publishes the 3.5% + VAT ceiling; confirm against the Administration of Estates Act regulation before quoting).
2. "What happens if someone dies without a will in South Africa?" (Justice: Master's Deceased Estates page; Intestate Succession Act 81 of 1987).
3. "Does income protection cover retrenchment?" section inside the income protection guide (wording-only; needs an ASISA or FSCA source).
4. "How to write a will in South Africa" (Wills Act requirements; Capital Legacy summary already in evidence as cl-wills-act).

## Out of scope by rule (decisions for Jono, not built)
- **Funeral cover** has the highest search interest (76) but SortMyCover rules exclude it.
- **Life cover for parents** is a large query; buyers are usually adult children, but the insured parents are over the quiz's age band.
- **Retirement annuities** (39) are investment products, outside the current call.
- Brand queries (insurers, banks) are never targeted; the site names no insurer.

Sources: [Google Trends](https://trends.google.com/trends/explore?geo=ZA) · [SARS Estate Duty](https://www.sars.gov.za/types-of-tax/estate-duty/) · [SAnews credit life regulations](https://www.sanews.gov.za/node/33855) · [NCR credit life guideline](https://www.ncr.org.za/documents/GUIDELINE%20ON%20THE%20APPLICATION%20OF%20THE%20CREDIT%20LIFE%20INSURANCE%20REGULATIONS.pdf) · [Acts Online, NCA s106](https://www.acts.co.za/national-credit-act-2005/106__credit_insurance) · [Master: Deceased Estates](https://www.justice.gov.za/master/deceased.html)
