import type { ArticleMeta } from "../types";
import { sourcesFrom } from "../evidence";

/* Wills and estate (hub 5). Facts rest on government and statutory sources only (Jono, 18 Oct 2026: no reliance on the will provider). */
export const meta: ArticleMeta = {
  slug: "estate-costs-and-a-will",
  title: "Estate costs, and why a will does not pay them",
  description:
    "A will gives instructions but no cash. What estate costs are, including the executor's fee, when they are paid, and who can claim from an estate. Not advice.",
  hub: 5,
  answer:
    "A will gives instructions but no cash. Before heirs inherit, the executor pays the estate's debts and costs, including the executor's fee, which the Master puts at 3.5% of the gross assets unless the will sets another fee. Larger estates may also pay estate duty to SARS. This is information, not advice.",
  datePublished: "2026-10-11",
  lastReviewed: "2026-10-18",
  author: { kind: "organization", name: "SortMyCover editorial team" },
  fact_checked_by: "SortMyCover editorial team",
  fact_checked_on: "2026-10-18",
  evidence: ["master-faq", "master-wills", "master-deceased-estates", "sars-estate-duty", "gov-surviving-spouses-act"],
  sources: sourcesFrom([
    ["master-faq", "The executor's fee and the liquidation and distribution account"],
    ["master-wills", "A will can set a different executor's fee"],
    ["master-deceased-estates", "Appraisers and their tariff"],
    ["sars-estate-duty", "Estate duty, and duty on a policy paid to a beneficiary"],
    ["gov-surviving-spouses-act", "A surviving spouse's maintenance claim"],
  ]),
  related: ["estate-administration", "what-a-will-does"],
};
