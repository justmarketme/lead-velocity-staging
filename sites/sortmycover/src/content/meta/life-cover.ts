import type { ArticleMeta } from "../types";
import { sourcesFrom } from "../evidence";

/* Cover types (hub 6): objective, generic product descriptions from ASISA, the FSCA and the Policyholder Protection Rules.
   No product, insurer, price or amount is named, and nothing says what anyone needs (rules S9 to S14). No funeral cover. */
export const meta: ArticleMeta = {
  slug: "life-cover",
  title: "Life cover, in plain words",
  description:
    "What life cover is, who receives the money, what it is not, how insurers decide on cover, and questions to ask an adviser. Information, not advice.",
  hub: 6,
  answer:
    "Life cover pays a benefit, usually a lump sum, when the insured person dies. It goes to the beneficiaries named on the policy or into the estate, where debts are settled first. Insurers usually ask health questions before offering cover, and the policy wording sets the terms. This is information, not advice.",
  datePublished: "2026-10-11",
  lastReviewed: "2026-10-11",
  author: { kind: "organization", name: "SortMyCover editorial team" },
  fact_checked_by: "SortMyCover editorial team",
  fact_checked_on: "2026-10-11",
  evidence: ["sam-what-is-life-cover", "sam-underwriting", "fsca-life-insurance-booklet", "ppr-ltia-cooling-off"],
  sources: sourcesFrom([
    ["sam-what-is-life-cover", "What life cover is and who receives the benefit"],
    ["sam-underwriting", "Underwriting, exclusions and disclosure"],
    ["fsca-life-insurance-booklet", "Consumer rights before signing"],
    ["ppr-ltia-cooling-off", "The 31-day cooling-off period"],
  ]),
  related: ["disability-cover", "estate-costs-and-a-will"],
};
