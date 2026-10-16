import type { ArticleMeta } from "../types";
import { sourcesFrom } from "../evidence";

/* Search demand (Google Trends ZA and Google suggestions, 16 Oct 2026): "what is estate duty", "estate duty south africa",
   "inheritance tax south africa", "is life insurance part of an estate", "is life insurance taxable in south africa". */
export const meta: ArticleMeta = {
  slug: "estate-duty-south-africa",
  title: "Estate duty in South Africa, and why there is no inheritance tax",
  description:
    "What estate duty is in South Africa, the SARS rates and the R3.5 million abatement, who pays it, and how a life policy paid to a beneficiary is treated. Not advice.",
  hub: 4,
  answer:
    "South Africa has no inheritance tax. It has estate duty, a tax on a person's estate after death. SARS charges 20% on the first R30 million of the dutiable value and 25% above that, after an abatement of R3.5 million. The executor normally pays it. This is information, not advice.",
  datePublished: "2026-10-16",
  lastReviewed: "2026-10-16",
  author: { kind: "organization", name: "SortMyCover editorial team" },
  fact_checked_by: "SortMyCover editorial team",
  fact_checked_on: "2026-10-16",
  evidence: ["sars-estate-duty", "cl-will-no-cash"],
  sources: sourcesFrom([
    ["sars-estate-duty", "Estate duty rates, the abatement, who pays, and policies paid to a beneficiary"],
    ["cl-will-no-cash", "Estate costs, debts and taxes are paid before heirs inherit"],
  ]),
  related: ["estate-costs-and-a-will", "life-cover"],
};
