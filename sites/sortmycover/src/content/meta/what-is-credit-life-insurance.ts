import type { ArticleMeta } from "../types";
import { sourcesFrom } from "../evidence";

/* Search demand (Google Trends ZA, 16 Oct 2026): "what is credit life insurance" rising 50%, "credit life insurance south africa",
   "credit life insurance vs life insurance", "is life insurance compulsory for home loan", "bond protection plan". */
export const meta: ArticleMeta = {
  slug: "what-is-credit-life-insurance",
  title: "What is credit life insurance, and how is it different from life cover?",
  description:
    "Credit life insurance on a bond or loan: what it pays, the legal cost caps, the right to use your own policy, and how it differs from life cover. Not advice.",
  hub: 4,
  answer:
    "Credit life insurance pays a debt, such as a bond, if the borrower dies or becomes permanently disabled, and pays instalments for a time after job loss. It pays the lender, not the family. The National Credit Act lets a borrower use a policy of their own choice instead. This is information, not advice.",
  datePublished: "2026-10-16",
  lastReviewed: "2026-10-16",
  author: { kind: "organization", name: "SortMyCover editorial team" },
  fact_checked_by: "SortMyCover editorial team",
  fact_checked_on: "2026-10-16",
  evidence: ["sanews-credit-life-regs", "ncr-credit-life-substitution", "fsca-life-insurance-booklet"],
  sources: sourcesFrom([
    ["sanews-credit-life-regs", "What credit life must pay, and the cost caps"],
    ["ncr-credit-life-substitution", "The right to substitute a policy of the borrower's own choice"],
    ["fsca-life-insurance-booklet", "Consumer rights before signing"],
  ]),
  related: ["life-cover", "income-protection"],
};
