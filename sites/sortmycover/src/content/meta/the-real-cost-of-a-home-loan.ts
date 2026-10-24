import type { ArticleMeta } from "../types";
import { sourcesFrom } from "../evidence";

/* Social week 2, Friday 31 Oct 2026 (research.md section 6; figures from checklist/creative/ads/house-call/research.md, 24 Oct 2026).
   Search phrases (Google autocomplete ZA, 24 Oct 2026): "transfer costs when buying a house in south africa", "how much is transfer
   duty in south africa", "bond registration costs in south africa", "bond registration costs vs transfer fees",
   "first time home buyer south africa requirements". Every rand figure is either read at SARS / the LSSA guideline / the Deeds
   Office schedule / the SARB, or computed from them with the method shown on the page. No bank is named. Building insurance is
   listed as a cost only; SMC's scope is the long-term cover. */
export const meta: ArticleMeta = {
  slug: "the-real-cost-of-a-home-loan",
  title: "Bond approved. What the approval letter does not add up, and the one cost you get to decide on",
  titleTag: "The real cost of a home loan in SA",
  description:
    "Transfer duty, attorney and Deeds Office fees on a R1.5 million home, the monthly instalment at prime 10.75%, and the one cost a household gets to choose.",
  hub: 1,
  answer:
    "A bond approval covers the house, not the costs around it. On a R1.5 million home the once-off transfer and bond costs come to roughly R97 500, and at prime 10.75% the instalment is about R15 228 a month. Credit life is the one line the law lets a borrower decide on. This is information, not advice.",
  datePublished: "2026-10-24",
  lastReviewed: "2026-10-24",
  author: { kind: "organization", name: "SortMyCover editorial team" },
  fact_checked_by: "SortMyCover editorial team",
  fact_checked_on: "2026-10-24",
  evidence: [
    "ooba-q2-2026", "sars-transfer-duty", "lssa-conveyancing-2025", "deeds-office-fees-2025", "bank-initiation-fee-2025", "sarb-mpc-2026-09",
    "nca-s106", "ncr-credit-life-substitution", "ncr-guideline-002-2026", "cdh-2017", "sam-what-is-life-cover",
  ],
  sources: sourcesFrom([
    ["ooba-q2-2026", "First-time buyers' share of applications, average first-time price, zero-deposit loans and the average deposit"],
    ["sars-transfer-duty", "The transfer duty table from 1 April 2025, unchanged for 2026/27"],
    ["lssa-conveyancing-2025", "The conveyancing fee guideline of 1 August 2025"],
    ["deeds-office-fees-2025", "Deeds Office fees from 1 April 2025"],
    ["bank-initiation-fee-2025", "The initiation fee quoted across 2025 conveyancing cost guides"],
    ["sarb-mpc-2026-09", "The repo rate of 7.25% from 25 September 2026 and prime at 10.75%, the second increase of 2026"],
    ["nca-s106", "What a lender may require, the cap at the outstanding balance, and the right to substitute a policy"],
    ["ncr-credit-life-substitution", "The lender must accept the borrower's own policy if it meets the regulations"],
    ["ncr-guideline-002-2026", "Cover may not materially exceed the outstanding balance"],
    ["cdh-2017", "The minimum benefits a credit life policy must include (law firm summary)"],
    ["sam-what-is-life-cover", "What life cover pays and to whom"],
  ]),
  related: ["life-cover-and-a-home-loan", "what-is-credit-life-insurance"],
  cta: "Book a 30-minute call with Mark Weston, an authorised adviser, on WhatsApp",
};
