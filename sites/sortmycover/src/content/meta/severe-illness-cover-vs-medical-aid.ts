import type { ArticleMeta } from "../types";
import { sourcesFrom } from "../evidence";

/* Social week 2, Thursday 30 Oct 2026 (research.md section 6). Search phrases (Google autocomplete ZA, 24 Oct 2026):
   "does medical aid cover cancer treatment", "critical illness cover south africa", "dread disease cover south africa",
   "critical illness cover what does it cover", "is there insurance for cancer patients", "is critical illness cover worth it".
   Medical schemes and gap cover are described from the Council for Medical Schemes' own page, never recommended; no scheme or
   insurer is named. The "about 14%" is computed: CMS beneficiaries 9.04 million (2024) over Stats SA's 2025 mid-year estimate
   of 63.1 million. The "85% have no critical-illness cover" line is NOT used (not in the ASISA release text). */
export const meta: ArticleMeta = {
  slug: "severe-illness-cover-vs-medical-aid",
  title: "Medical aid pays the hospital. What pays you? Severe illness cover and medical aid, side by side",
  titleTag: "Severe illness cover vs medical aid",
  description:
    "Medical aid pays for treatment under scheme rules; severe illness cover pays a lump sum on diagnosis. The cancer and illness numbers for South Africa, with sources.",
  hub: 4,
  answer:
    "A medical scheme pays for treatment under its rules, including the Prescribed Minimum Benefits. Severe illness cover pays a lump sum to the person on diagnosis of a condition the policy lists, such as cancer, a heart attack or a stroke, even if recovery is expected. One pays the providers; the other pays you. This is information, not advice.",
  datePublished: "2026-10-24",
  lastReviewed: "2026-10-24",
  author: { kind: "organization", name: "SortMyCover editorial team" },
  fact_checked_by: "SortMyCover editorial team",
  fact_checked_on: "2026-10-24",
  evidence: [
    "cansa-ncr-2024", "statssa-p03093-2024", "cms-pmb", "cms-industry-2024", "statssa-mype-2025", "sam-what-is-severe-illness",
    "sam-severe-illness-conditions", "asisa-critical-illness-standard-2025", "sam-underwriting",
  ],
  sources: sourcesFrom([
    ["cansa-ncr-2024", "Lifetime risk of a cancer diagnosis: 1 in 7 men, 1 in 8 women; prostate, breast and cervical cancer"],
    ["statssa-p03093-2024", "Deaths in 2024, the leading natural causes, neoplasms as a share of deaths, the leading cause at ages 45 to 64"],
    ["cms-pmb", "What the Prescribed Minimum Benefits are, designated service providers and co-payments"],
    ["cms-industry-2024", "9.04 million medical scheme beneficiaries and 70 schemes in 2024"],
    ["statssa-mype-2025", "South Africa's 2025 mid-year population estimate"],
    ["sam-what-is-severe-illness", "What severe illness cover pays and when"],
    ["sam-severe-illness-conditions", "The core conditions, the length of condition lists, tiers and survival periods"],
    ["asisa-critical-illness-standard-2025", "The standard definitions at four severity levels"],
    ["sam-underwriting", "Health questions and the effect of non-disclosure"],
  ]),
  related: ["severe-illness-cover", "income-protection-vs-disability-cover"],
  cta: "Book a 30-minute call with Mark Weston, an authorised adviser, on WhatsApp",
};
