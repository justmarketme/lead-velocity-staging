import type { ArticleMeta } from "../types";
import { sourcesFrom } from "../evidence";

/* Social week 2, Tuesday 28 Oct 2026 (research.md section 6). Search phrases (Google autocomplete ZA, 24 Oct 2026):
   "life insurance claim rejection reasons", "reasons why life insurance claims are denied", "non disclosure of material facts in
   life insurance", "can life insurance refuse to pay out", "what happens if i stop paying my life insurance premium",
   "how long does a life insurance claim take to pay out" (answered without a number: no SA primary source gives one).
   The PPR grace-period length is not quoted (not re-read in Gazette 41321 by 24 Oct 2026). No insurer is named. */
export const meta: ArticleMeta = {
  slug: "why-life-insurance-claims-get-declined",
  title: "Why life insurance claims get declined in South Africa, and three habits that keep a claim payable",
  titleTag: "Why life insurance claims get declined",
  description:
    "ASISA's 2025 figures: 94.1% of death claims paid, 96% on life policies, and non-disclosure the most common reason for a decline. What lapses and exclusions do.",
  hub: 4,
  answer:
    "South African life insurers paid 94.1% of the death claims they processed in 2025, and 96% of claims against life policies. ASISA says a declined life claim is most often due to material non-disclosure. Other reasons are fraud, exclusions such as suicide in the first two years, and premiums that stopped. This is information, not advice.",
  datePublished: "2026-10-24",
  lastReviewed: "2026-10-24",
  author: { kind: "organization", name: "SortMyCover editorial team" },
  fact_checked_by: "SortMyCover editorial team",
  fact_checked_on: "2026-10-24",
  evidence: ["asisa-death-claims-2025", "asisa-lt-stats-2025", "sam-underwriting", "sam-what-is-life-cover", "fsca-life-insurance-booklet", "ppr-ltia-cooling-off"],
  sources: sourcesFrom([
    ["asisa-death-claims-2025", "Claims processed and paid in 2025, the rate for life policies, the reasons claims are declined, the five-year range"],
    ["asisa-lt-stats-2025", "8.7 million risk policies lapsed in 2025 and what a lapse is"],
    ["sam-underwriting", "Health questions, limited underwriting, exclusions and the effect of non-disclosure"],
    ["sam-what-is-life-cover", "What life cover pays and to whom"],
    ["fsca-life-insurance-booklet", "Consumer rights before signing"],
    ["ppr-ltia-cooling-off", "The 31-day cooling-off period"],
  ]),
  related: ["how-to-complain", "life-cover"],
  cta: "Book a 30-minute call with Mark Weston, an authorised adviser, on WhatsApp",
};
