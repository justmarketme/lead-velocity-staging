import type { ArticleMeta } from "../types";
import { sourcesFrom } from "../evidence";

/* Wills and estate (hub 5). Facts rest on government and statutory sources only (Jono, 18 Oct 2026: no reliance on the will provider). */
export const meta: ArticleMeta = {
  slug: "intestate-succession",
  title: "Dying without a will in South Africa: who inherits",
  titleTag: "Dying without a will: who inherits",
  description:
    "Who inherits when someone dies without a valid will in South Africa: the order of heirs, the R250 000 rule for a spouse, and worked examples. Not advice.",
  hub: 5,
  answer:
    "Without a valid will, the Intestate Succession Act decides who inherits. A spouse and children come first: the spouse receives a child's share or R250 000, whichever is more, and the children share the rest. Without them, parents, then brothers and sisters, then other relatives inherit. This is information, not advice.",
  datePublished: "2026-10-18",
  lastReviewed: "2026-10-18",
  author: { kind: "organization", name: "SortMyCover editorial team" },
  fact_checked_by: "SortMyCover editorial team",
  fact_checked_on: "2026-10-18",
  evidence: ["master-intestate", "gov-intestate-amount", "master-deceased-estates"],
  sources: sourcesFrom([
    ["master-intestate", "The order of heirs, the examples and who counts"],
    ["gov-intestate-amount", "The R250 000 amount"],
    ["master-deceased-estates", "Proving a customary marriage, and the helpline"],
  ]),
  related: ["what-a-will-does", "small-estates-letters-of-authority"],
};
