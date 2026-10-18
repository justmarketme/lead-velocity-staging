import type { ArticleMeta } from "../types";
import { sourcesFrom } from "../evidence";

/* Wills and estate (hub 5). Facts rest on government and statutory sources only (Jono, 18 Oct 2026: no reliance on the will provider). */
export const meta: ArticleMeta = {
  slug: "reporting-a-deceased-estate",
  title: "How to report a deceased estate to the Master",
  description:
    "How a death is reported to the Master of the High Court in South Africa: the 14-day rule, which office, the J-forms, online registration and telling SARS.",
  hub: 5,
  answer:
    "A death is reported to the Master of the High Court within 14 days, at the office for the area where the person lived in the year before death. The family or executor lodges the death notice, the death certificate and other forms. Some offices accept registration online. This is information, not advice.",
  datePublished: "2026-10-18",
  lastReviewed: "2026-10-18",
  author: { kind: "organization", name: "SortMyCover editorial team" },
  fact_checked_by: "SortMyCover editorial team",
  fact_checked_on: "2026-10-18",
  evidence: ["master-report-estate", "master-deceased-estates", "gov-report-estate", "sars-estates", "sars-deceased-faq", "master-faq"],
  sources: sourcesFrom([
    ["master-report-estate", "The forms, letters and online registration"],
    ["master-deceased-estates", "Which office, and who must report"],
    ["gov-report-estate", "The 14-day rule"],
    ["sars-estates", "Telling SARS"],
    ["sars-deceased-faq", "The estate as a separate taxpayer"],
    ["master-faq", "The liquidation and distribution account"],
  ]),
  related: ["estate-administration", "small-estates-letters-of-authority"],
};
