import type { ArticleMeta } from "../types";
import { sourcesFrom } from "../evidence";

/* Wills and estate (hub 5). Facts rest on government and statutory sources only (Jono, 18 Oct 2026: no reliance on the will provider). */
export const meta: ArticleMeta = {
  slug: "estate-administration",
  title: "What an executor does: estate administration in plain words",
  description:
    "The steps an executor follows after a death, as the Master describes them: reporting the estate, letters of executorship, the account and distribution.",
  hub: 5,
  answer:
    "When someone dies, the estate is reported to the Master of the High Court within 14 days. An executor then gathers the assets, pays the debts and costs, lodges a liquidation and distribution account within six months of appointment, and pays the heirs. This is information, not advice.",
  datePublished: "2026-10-11",
  lastReviewed: "2026-10-18",
  author: { kind: "organization", name: "SortMyCover editorial team" },
  fact_checked_by: "SortMyCover editorial team",
  fact_checked_on: "2026-10-18",
  evidence: ["master-report-estate", "master-deceased-estates", "master-faq", "sars-estates", "sars-deceased-faq"],
  sources: sourcesFrom([
    ["master-report-estate", "Reporting an estate, the forms and online registration"],
    ["master-deceased-estates", "Which Master's office, and who must report"],
    ["master-faq", "The account, distribution and the executor's fee"],
    ["sars-estates", "Telling SARS about a death"],
    ["sars-deceased-faq", "The deceased estate as a separate taxpayer"],
  ]),
  related: ["reporting-a-deceased-estate", "estate-costs-and-a-will"],
};
