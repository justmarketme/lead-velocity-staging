import type { ArticleMeta } from "../types";
import { sourcesFrom } from "../evidence";

/* Wills and estate (hub 5). Facts rest on government and statutory sources only (Jono, 18 Oct 2026: no reliance on the will provider). */
export const meta: ArticleMeta = {
  slug: "guardians-fund",
  title: "The Guardian's Fund: when the Master holds a child's inheritance",
  titleTag: "The Guardian's Fund explained",
  description:
    "What the Master's Guardian's Fund is, how a child's inheritance gets there, paying school fees and maintenance, claiming at 18, and the 30-year limit.",
  hub: 5,
  answer:
    "The Guardian's Fund, run by the Master of the High Court, holds money for minors and others who cannot receive it directly. It earns interest, can pay school fees and maintenance on application, and is claimed at 18 or at an age set in the will. Unclaimed money is forfeited after 30 years. This is information, not advice.",
  datePublished: "2026-10-18",
  lastReviewed: "2026-10-18",
  author: { kind: "organization", name: "SortMyCover editorial team" },
  fact_checked_by: "SortMyCover editorial team",
  fact_checked_on: "2026-10-18",
  evidence: ["master-guardians-fund", "master-faq", "gov-childrens-act-s27"],
  sources: sourcesFrom([
    ["master-guardians-fund", "How the fund holds, pays and forfeits money"],
    ["master-faq", "When a Master's representative lodges an account"],
    ["gov-childrens-act-s27", "Appointing a guardian in a will"],
  ]),
  related: ["guardians-and-childrens-trusts", "small-estates-letters-of-authority"],
};
