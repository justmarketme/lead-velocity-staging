import type { ArticleMeta } from "../types";
import { sourcesFrom } from "../evidence";

export const meta: ArticleMeta = {
  slug: "income-protection",
  title: "Income protection, in plain words",
  description:
    "What income protection is, how the waiting period works, temporary and permanent benefits, what it is not, and questions to ask an adviser. Not advice.",
  hub: 6,
  answer:
    "Income protection pays a monthly income, based on current earnings, while illness or injury stops a person from working. Benefits can be temporary or run to a retirement age set in the policy. A waiting period applies at the start of each claim before payments begin. This is information, not advice.",
  datePublished: "2026-10-11",
  lastReviewed: "2026-10-11",
  author: { kind: "organization", name: "SortMyCover editorial team" },
  fact_checked_by: "SortMyCover editorial team",
  fact_checked_on: "2026-10-11",
  evidence: ["sam-what-is-income-protection", "sam-income-protection-waiting", "sam-what-is-disability-cover", "fsca-disability-cover", "sam-underwriting", "sam-group-cover-questions", "fsca-life-insurance-booklet", "ppr-ltia-cooling-off"],
  sources: sourcesFrom([
    ["sam-what-is-income-protection", "What income protection is and how long it pays"],
    ["sam-income-protection-waiting", "How the waiting period works"],
    ["sam-what-is-disability-cover", "Income benefits as a form of disability cover; exclusions"],
    ["fsca-disability-cover", "When an income benefit stops"],
    ["sam-underwriting", "Underwriting and disclosure"],
    ["sam-group-cover-questions", "Questions to ask about an income benefit"],
    ["fsca-life-insurance-booklet", "Consumer rights before signing"],
    ["ppr-ltia-cooling-off", "The 31-day cooling-off period"],
  ]),
  related: ["disability-cover", "life-cover"],
};
