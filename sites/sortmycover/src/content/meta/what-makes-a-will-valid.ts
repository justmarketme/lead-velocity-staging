import type { ArticleMeta } from "../types";
import { sourcesFrom } from "../evidence";

/* Wills and estate (hub 5). Facts rest on government and statutory sources only (Jono, 18 Oct 2026: no reliance on the will provider). */
export const meta: ArticleMeta = {
  slug: "what-makes-a-will-valid",
  title: "What makes a will valid in South Africa",
  description:
    "What the Wills Act asks for a valid will in South Africa: age, signing, witnesses, why heirs are not witnesses, copies, divorce and court orders. Not advice.",
  hub: 5,
  answer:
    "Under the Wills Act, the person making the will signs it at the end in front of two or more witnesses aged 14 or older, who also sign. Each page except the last is signed too. A witness who would inherit can lose that benefit. A copy is not a valid will. This is information, not advice.",
  datePublished: "2026-10-18",
  lastReviewed: "2026-10-18",
  author: { kind: "organization", name: "SortMyCover editorial team" },
  fact_checked_by: "SortMyCover editorial team",
  fact_checked_on: "2026-10-18",
  evidence: ["act-wills-act", "master-wills"],
  sources: sourcesFrom([
    ["act-wills-act", "Signing, witnesses, court orders and who may not benefit"],
    ["master-wills", "Age, witnesses, copies, certification and divorce"],
  ]),
  related: ["the-will-appointment", "where-to-keep-a-will"],
};
