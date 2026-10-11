import type { ArticleMeta } from "../types";
import { sourcesFrom } from "../evidence";

export const meta: ArticleMeta = {
  slug: "estate-administration",
  title: "What estate administration involves",
  description:
    "The steps an executor follows after a death, as the will provider lists them: reporting the estate, Letters of Executorship, the L&D account and distribution.",
  hub: 5,
  answer:
    "Estate administration is the process of winding up a person's estate after death. The steps include reporting the estate, obtaining Letters of Executorship, drawing up a liquidation and distribution account, a 21-day inspection period, paying what the estate owes and passing on the rest. This is information, not advice.",
  datePublished: "2026-10-11",
  lastReviewed: "2026-10-11",
  author: { kind: "organization", name: "SortMyCover editorial team" },
  fact_checked_by: "SortMyCover editorial team",
  fact_checked_on: "2026-10-11",
  evidence: ["cl-estate-admin", "cl-will-no-cash", "cl-will-names-guardian", "cl-testamentary-trust"],
  sources: sourcesFrom([
    ["cl-estate-admin", "The steps of estate administration and the provider's executor service"],
    ["cl-will-no-cash", "Costs, debts and taxes are paid before heirs inherit"],
    ["cl-will-names-guardian", "A will names the executor, trustees and any testamentary trust"],
    ["cl-testamentary-trust", "How a children's trust holds an inheritance"],
  ]),
  related: ["estate-costs-and-a-will", "what-a-will-does"],
};
