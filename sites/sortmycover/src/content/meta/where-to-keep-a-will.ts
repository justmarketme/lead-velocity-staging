import type { ArticleMeta } from "../types";
import { sourcesFrom } from "../evidence";

/* Wills and estate (hub 5). Facts rest on government and statutory sources only (Jono, 18 Oct 2026: no reliance on the will provider). */
export const meta: ArticleMeta = {
  slug: "where-to-keep-a-will",
  title: "Where a will is kept, and how it is found again",
  description:
    "Why the signed original of a will matters, where wills are kept, what happens to the original after a death, and questions to ask. Information, not advice.",
  hub: 5,
  answer:
    "A will only works if the signed original can be found. The Master of the High Court says a copy is not a valid will. When the person dies, whoever holds the original must report the death, and the original will is lodged with the Master in person. This is information, not advice.",
  datePublished: "2026-10-11",
  lastReviewed: "2026-10-18",
  author: { kind: "organization", name: "SortMyCover editorial team" },
  fact_checked_by: "SortMyCover editorial team",
  fact_checked_on: "2026-10-18",
  evidence: ["master-wills", "master-deceased-estates", "master-report-estate", "act-wills-act"],
  sources: sourcesFrom([
    ["master-wills", "A copy of a will is not a valid will"],
    ["master-deceased-estates", "Anyone holding a will must report the death"],
    ["master-report-estate", "Original wills are lodged in person"],
    ["act-wills-act", "Changes are signed and witnessed like the will"],
  ]),
  related: ["what-makes-a-will-valid", "estate-administration"],
};
