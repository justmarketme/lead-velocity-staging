import type { ArticleMeta } from "../types";
import { sourcesFrom } from "../evidence";

/* Wills and estate (hub 5). Facts rest on government and statutory sources only (Jono, 18 Oct 2026: no reliance on the will provider). */
export const meta: ArticleMeta = {
  slug: "the-will-appointment",
  title: "What happens at the will appointment",
  description:
    "How a will call booked through SortMyCover works: who you speak to, how the will is finalised, signed and witnessed, and what it costs. Information, not advice.",
  hub: 5,
  answer:
    "SortMyCover books a 30-minute call with a will consultant on WhatsApp. Lindi sends the consultant's name and firm, with its FSP number, before the call. On the call the consultant talks through the will. It becomes valid once it is signed and witnessed as the Wills Act requires. This is information, not advice.",
  datePublished: "2026-10-11",
  lastReviewed: "2026-10-18",
  author: { kind: "organization", name: "SortMyCover editorial team" },
  fact_checked_by: "SortMyCover editorial team",
  fact_checked_on: "2026-10-18",
  evidence: ["act-wills-act", "master-wills", "gov-childrens-act-s27", "fsca-fais-register"],
  sources: sourcesFrom([
    ["act-wills-act", "Signing, witnesses and who may not benefit"],
    ["master-wills", "Witnesses' age"],
    ["gov-childrens-act-s27", "Appointing a guardian in a will"],
    ["fsca-fais-register", "Looking a firm up on the FSCA register"],
  ]),
  related: ["what-makes-a-will-valid", "where-to-keep-a-will"],
};
