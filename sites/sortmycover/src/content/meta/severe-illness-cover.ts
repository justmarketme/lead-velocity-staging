import type { ArticleMeta } from "../types";
import { sourcesFrom } from "../evidence";

export const meta: ArticleMeta = {
  slug: "severe-illness-cover",
  title: "Severe illness cover (critical illness or dread disease), in plain words",
  description:
    "What severe illness (critical illness or dread disease) cover is, how conditions and severity levels work, what it is not, and questions to ask an adviser.",
  hub: 6,
  answer:
    "Severe illness cover, also called critical illness or dread disease cover, pays a lump sum when the insured person is diagnosed with a serious illness listed in the policy, such as cancer or a heart attack. It can pay even if the person is expected to recover. This is information, not advice.",
  datePublished: "2026-10-11",
  lastReviewed: "2026-10-11",
  author: { kind: "organization", name: "SortMyCover editorial team" },
  fact_checked_by: "SortMyCover editorial team",
  fact_checked_on: "2026-10-11",
  evidence: ["sam-what-is-severe-illness", "sam-severe-illness-conditions", "asisa-critical-illness-standard-2025", "sam-underwriting", "fsca-life-insurance-booklet", "ppr-ltia-cooling-off"],
  sources: sourcesFrom([
    ["sam-what-is-severe-illness", "What severe illness cover is"],
    ["sam-severe-illness-conditions", "Condition lists, tiers and survival periods"],
    ["asisa-critical-illness-standard-2025", "Standard definitions and severity levels A to D"],
    ["sam-underwriting", "Underwriting and disclosure"],
    ["fsca-life-insurance-booklet", "Consumer rights before signing"],
    ["ppr-ltia-cooling-off", "The 31-day cooling-off period"],
  ]),
  related: ["disability-cover", "life-cover"],
};
