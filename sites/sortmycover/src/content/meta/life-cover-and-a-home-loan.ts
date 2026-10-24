import type { ArticleMeta } from "../types";
import { sourcesFrom } from "../evidence";

/* Cycle-1 paid ad "new-bond" links here. Keyword research (Desktop\EMMA\checklist\creative\blog\keyword-research.md, 16 Oct 2026):
   primary "life cover for bond"; also "credit life insurance home loan", "do you need life cover for a bond",
   "is credit life insurance compulsory in south africa". Claims ledger: new-bond-post.md. */
export const meta: ArticleMeta = {
  slug: "life-cover-and-a-home-loan",
  title: "Life cover and a home loan: what the paperwork says",
  titleTag: "Life cover for a bond: credit life explained",
  description:
    "What South African law and one bank's home loan conditions say about credit life, using an existing policy, and ceding cover. Information, not advice.",
  hub: 1,
  answer:
    "A lender may require credit life insurance on a home loan, capped at what is still owed. The National Credit Act lets a borrower decline the lender's policy and use one of their own. A ceded policy pays the bank first. Life cover is a separate contract that pays the people named on it. This is information, not advice.",
  datePublished: "2026-10-17",
  lastReviewed: "2026-10-17",
  author: { kind: "organization", name: "SortMyCover editorial team" },
  fact_checked_by: "SortMyCover editorial team",
  fact_checked_on: "2026-10-17",
  evidence: ["nca-s106", "ncr-credit-life-substitution", "ncr-guideline-002-2026", "cdh-2017", "fnb-home-loan", "sam-what-is-life-cover", "fsca-disability-cover", "fsca-life-insurance-booklet"],
  sources: sourcesFrom([
    ["nca-s106", "What a lender may require, and the right to use a policy of the borrower's own choice"],
    ["ncr-credit-life-substitution", "The lender must accept the borrower's own policy if it meets the regulations, including after the loan starts"],
    ["ncr-guideline-002-2026", "Cover may not materially exceed the outstanding balance"],
    ["cdh-2017", "The minimum benefits a credit life policy must include (law firm summary)"],
    ["fnb-home-loan", "One bank's published home loan conditions on life cover and cession"],
    ["sam-what-is-life-cover", "What life cover pays and to whom"],
    ["fsca-disability-cover", "The two forms of disability cover"],
    ["fsca-life-insurance-booklet", "Consumer rights before signing"],
  ]),
  related: ["what-is-credit-life-insurance", "income-protection-vs-disability-cover"],
  cta: "Book a 30-minute call with an authorised adviser",
};
