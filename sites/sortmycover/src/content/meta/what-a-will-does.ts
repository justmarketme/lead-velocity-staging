import type { ArticleMeta } from "../types";
import { sourcesFrom } from "../evidence";

/* Wills and estate (hub 5). Facts rest on government and statutory sources only (Jono, 18 Oct 2026: no reliance on the will provider). */
export const meta: ArticleMeta = {
  slug: "what-a-will-does",
  title: "What a will does, and what happens without one",
  description:
    "What a will can record, who can make one, what happens to an estate without one, and the jobs a will cannot do, such as paying estate costs. Not advice.",
  hub: 5,
  answer:
    "A will records who inherits, who acts as executor and, for a parent who is the sole guardian, who would look after minor children. Without a valid will, the Intestate Succession Act decides who inherits. A will gives instructions but no cash: the estate's costs and debts are settled before heirs inherit. This is information, not advice.",
  datePublished: "2026-10-11",
  lastReviewed: "2026-10-18",
  author: { kind: "organization", name: "SortMyCover editorial team" },
  fact_checked_by: "SortMyCover editorial team",
  fact_checked_on: "2026-10-18",
  evidence: ["master-wills", "master-intestate", "gov-childrens-act-s27", "master-guardians-fund", "master-faq"],
  sources: sourcesFrom([
    ["master-wills", "Who can make a will, the executor's fee and divorce"],
    ["master-intestate", "What happens without a valid will"],
    ["gov-childrens-act-s27", "Appointing a guardian in a will"],
    ["master-guardians-fund", "An age set in the will for a child's inheritance"],
    ["master-faq", "The liquidation and distribution account"],
  ]),
  related: ["intestate-succession", "guardians-and-childrens-trusts"],
};
