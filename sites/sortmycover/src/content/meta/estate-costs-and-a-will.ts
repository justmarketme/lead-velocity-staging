import type { ArticleMeta } from "../types";
import { sourcesFrom } from "../evidence";

export const meta: ArticleMeta = {
  slug: "estate-costs-and-a-will",
  title: "Estate costs, and why a will does not pay them",
  description:
    "A will gives instructions but no cash. What estate costs are, when they are paid, and what the will provider says about giving an estate cash. Not advice.",
  hub: 5,
  answer:
    "A will says who inherits, but it does not put cash in the estate. Estate costs, debts and taxes are paid before the heirs inherit. The will provider describes life cover as one way to give an estate cash, and offers optional estate-costs cover at a monthly cost. This is information, not advice.",
  datePublished: "2026-10-11",
  lastReviewed: "2026-10-11",
  author: { kind: "organization", name: "SortMyCover editorial team" },
  fact_checked_by: "SortMyCover editorial team",
  fact_checked_on: "2026-10-11",
  evidence: ["cl-will-no-cash", "cl-lpp", "cl-will-any-estate"],
  sources: sourcesFrom([
    ["cl-will-no-cash", "Costs, debts and taxes are paid before heirs inherit; life cover as one source of estate cash"],
    ["cl-lpp", "The provider's optional cover for estate costs"],
    ["cl-will-any-estate", "What counts as part of an estate"],
  ]),
  related: ["what-a-will-does", "estate-administration"],
};
