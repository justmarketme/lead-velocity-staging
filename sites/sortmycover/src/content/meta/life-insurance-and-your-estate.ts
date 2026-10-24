import type { ArticleMeta } from "../types";
import { sourcesFrom } from "../evidence";

/* Social week 2, Saturday 1 Nov 2026 (research.md section 6). Search phrases (Google autocomplete ZA, 24 Oct 2026):
   "does a life policy form part of an estate in south africa", "does life insurance form part of the estate", "does a will override
   a life insurance beneficiary", "is a life insurance payout taxable in south africa" (answered for estate duty only; income tax is
   left to SARS and the adviser), "what happens to your debt when you die south africa", "executor fees south africa",
   "how long does it take to wind up a deceased estate in south africa". Wills and estate facts come from the Master of the High
   Court, SARS, the Wills Act and the National Financial Ombud only; no will provider is named. */
export const meta: ArticleMeta = {
  slug: "life-insurance-and-your-estate",
  title: "Does life insurance go through the estate? Beneficiary nominations, the will, estate duty and debt",
  titleTag: "Does life insurance form part of the estate?",
  description:
    "Who receives a life policy payout, why a valid beneficiary nomination keeps it out of estate administration, how estate duty applies, and what happens to debt.",
  hub: 4,
  answer:
    "A life policy with a valid beneficiary nomination is paid to that person and does not go through the estate's administration. Without a nomination it is paid into the estate, where debts, costs and the executor's fee come first. For estate duty, SARS treats a policy on the deceased's life as deemed property either way. This is information, not advice.",
  datePublished: "2026-10-24",
  lastReviewed: "2026-10-24",
  author: { kind: "organization", name: "SortMyCover editorial team" },
  fact_checked_by: "SortMyCover editorial team",
  fact_checked_on: "2026-10-24",
  evidence: [
    "sam-what-is-life-cover", "nfo-beneficiary-nomination", "master-faq", "master-wills", "master-guardians-fund", "sars-estate-duty",
    "sars-estate-duty-guide-buy-sell", "sars-deceased-faq", "nca-s106", "act-wills-act",
  ],
  sources: sourcesFrom([
    ["sam-what-is-life-cover", "A payout goes to the named beneficiaries or into the estate, where debts are settled first"],
    ["nfo-beneficiary-nomination", "A valid nomination keeps the policy out of the estate; a nomination has to reach the insurer"],
    ["master-faq", "The executor's fee, the liquidation and distribution account and its timing"],
    ["master-wills", "The 3.5% executor's fee, a copy is not a valid will, the three-month divorce rule"],
    ["master-guardians-fund", "Money for a minor without another arrangement goes to the Guardian's Fund"],
    ["sars-estate-duty", "Estate duty rates, the R3.5 million abatement, and who pays the duty on a policy paid directly to a beneficiary"],
    ["sars-estate-duty-guide-buy-sell", "A domestic policy on the life of the deceased is deemed property whoever owns it or is paid"],
    ["sars-deceased-faq", "The surviving-spouse deduction and the roll-over of the unused abatement"],
    ["nca-s106", "Credit life on a loan is capped at what is owed and pays towards the loan"],
    ["act-wills-act", "A witness or the writer of a will cannot benefit under it"],
  ]),
  related: ["estate-duty-south-africa", "estate-costs-and-a-will"],
  cta: "Book a 30-minute call with Mark Weston, an authorised adviser, on WhatsApp",
};
