import type { ArticleMeta } from "../types";
import { sourcesFrom } from "../evidence";

/* Social week 2, Monday 27 Oct 2026 (Desktop\EMMA\checklist\creative\social-week-2026-10-27\research.md, section 6).
   Search phrases (Google autocomplete ZA, 24 Oct 2026): "how much life cover do i need", "how much life insurance do i need",
   "what does life cover cover". National figures are quoted only as printed in the ASISA media release of 28 Oct 2025
   (evidence asisa-gap-release-2025-10, status usable). GATE: the practitioner's Q-G1 clearance of the rand averages must be
   settled before this page is deployed; if it is not, remove the "What the national numbers say" section and its two ids. */
export const meta: ArticleMeta = {
  slug: "how-much-life-cover-is-enough",
  title: "How much life cover is enough? What the national numbers say, and what they cannot",
  titleTag: "How much life cover do I need? SA numbers",
  description:
    "What ASISA's 2025 figures say about how much life cover South African earners have and need, why an average is not your number, and what a needs analysis is.",
  hub: 4,
  answer:
    "No website can say how much life cover one household needs. ASISA's 2025 study found South Africa's formally employed earners held cover for 39% of what their families would need. The figure that fits a household comes from a needs analysis, which an authorised adviser must do before giving advice. This is information, not advice.",
  datePublished: "2026-10-24",
  lastReviewed: "2026-10-24",
  author: { kind: "organization", name: "SortMyCover editorial team" },
  fact_checked_by: "SortMyCover editorial team",
  fact_checked_on: "2026-10-24",
  evidence: [
    "asisa-gap-release-2025-10", "asisa-lt-stats-2025", "sam-what-is-life-cover", "sam-what-is-group-life", "sam-conversion-benefit",
    "fais-gcoc", "fsca-life-insurance-booklet", "sam-underwriting", "ppr-ltia-cooling-off",
  ],
  sources: sourcesFrom([
    ["asisa-gap-release-2025-10", "The 2025 national averages: 39% of need covered, R2.1 million needed against R0.8 million held, the 34% spending cut"],
    ["asisa-lt-stats-2025", "8.7 million risk policies lapsed in 2025; 2.7 million new life, disability, critical illness and income protection policies"],
    ["sam-what-is-life-cover", "What life cover pays and to whom"],
    ["sam-what-is-group-life", "What an employer's group scheme can include"],
    ["sam-conversion-benefit", "Group cover usually ends with the job; the conversion option"],
    ["fais-gcoc", "What an adviser must gather and analyse before giving advice (section 8), and the record of advice (section 9)"],
    ["fsca-life-insurance-booklet", "Consumer rights before signing"],
    ["sam-underwriting", "Health questions and the effect of non-disclosure"],
    ["ppr-ltia-cooling-off", "The 31-day cooling-off period"],
  ]),
  related: ["what-is-a-life-cover-gap", "life-cover"],
  cta: "Book a 30-minute call with Mark Weston, an authorised adviser, on WhatsApp",
};
