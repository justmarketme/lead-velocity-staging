import type { ArticleMeta } from "../types";
import { sourcesFrom } from "../evidence";

export const meta: ArticleMeta = {
  slug: "disability-cover",
  title: "What is disability cover? Lump sum and income benefits in plain words",
  description:
    "The two kinds of disability cover, lump sum and income, how a policy defines disability, what it is not, and questions to ask an adviser. Information, not advice.",
  hub: 6,
  answer:
    "Disability cover pays when illness or injury stops a person from working. It comes as a lump sum, which pays only for a permanent disability, or as a monthly income. A claim is paid only if the disability meets the policy's own definition, so the definition matters. This is information, not advice.",
  datePublished: "2026-10-11",
  lastReviewed: "2026-10-11",
  author: { kind: "organization", name: "SortMyCover editorial team" },
  fact_checked_by: "SortMyCover editorial team",
  fact_checked_on: "2026-10-11",
  evidence: ["sam-what-is-disability-cover", "sam-disability-pay-out", "fsca-disability-cover", "sam-what-is-severe-illness", "sam-underwriting", "sam-group-cover-questions", "fsca-life-insurance-booklet", "ppr-ltia-cooling-off"],
  sources: sourcesFrom([
    ["sam-what-is-disability-cover", "The two kinds of disability cover and common exclusions"],
    ["sam-disability-pay-out", "Disability definitions and permanence"],
    ["fsca-disability-cover", "Lump sum and income benefits, and when each stops"],
    ["sam-what-is-severe-illness", "How severe illness cover differs"],
    ["sam-underwriting", "Underwriting and disclosure"],
    ["sam-group-cover-questions", "Questions to ask about a disability benefit"],
    ["fsca-life-insurance-booklet", "Consumer rights before signing"],
    ["ppr-ltia-cooling-off", "The 31-day cooling-off period"],
  ]),
  related: ["income-protection", "income-protection-vs-disability-cover"],
};
