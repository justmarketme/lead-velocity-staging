import type { ArticleMeta } from "../types";
import { sourcesFrom } from "../evidence";

/* Wills and estate (hub 5). Facts rest on government and statutory sources only (Jono, 18 Oct 2026: no reliance on the will provider). */
export const meta: ArticleMeta = {
  slug: "small-estates-letters-of-authority",
  title: "Small estates and letters of authority",
  description:
    "How an estate of R250 000 or less is wound up in South Africa: letters of authority, the Master's representative, the forms and when an account is needed.",
  hub: 5,
  answer:
    "If an estate is worth R250 000 or less, the Master of the High Court can issue letters of authority instead of letters of executorship. A Master's representative then winds up the estate, usually without lodging a full account unless there are minor heirs. This is information, not advice.",
  datePublished: "2026-10-18",
  lastReviewed: "2026-10-18",
  author: { kind: "organization", name: "SortMyCover editorial team" },
  fact_checked_by: "SortMyCover editorial team",
  fact_checked_on: "2026-10-18",
  evidence: ["master-report-estate", "master-faq", "master-deceased-estates", "master-guardians-fund"],
  sources: sourcesFrom([
    ["master-report-estate", "Letters of authority and the forms"],
    ["master-faq", "The Master's representative and the account"],
    ["master-deceased-estates", "Which office, and the helpline"],
    ["master-guardians-fund", "Money due to a minor"],
  ]),
  related: ["reporting-a-deceased-estate", "guardians-fund"],
};
