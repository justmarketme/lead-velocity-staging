import type { ArticleMeta } from "../types";
import { sourcesFrom } from "../evidence";

/* Wills and estate (hub 5). Every fact is a statement the will provider publishes (config/evidence.json, cl-*). */
export const meta: ArticleMeta = {
  slug: "what-a-will-does",
  title: "What a will does, and what it does not do",
  description:
    "What a will can record, what happens to an estate without one, and the jobs a will cannot do on its own, such as paying estate costs. Information, not advice.",
  hub: 5,
  answer:
    "A will records who inherits, who acts as executor and, for parents, who would look after minor children. Without a valid will, the law of intestate succession decides who inherits. A will gives instructions but no cash: estate costs and debts are paid before heirs inherit. This is information, not advice.",
  datePublished: "2026-10-11",
  lastReviewed: "2026-10-11",
  author: { kind: "organization", name: "SortMyCover editorial team" },
  fact_checked_by: "SortMyCover editorial team",
  fact_checked_on: "2026-10-11",
  evidence: ["cl-will-names-guardian", "cl-intestate", "cl-will-any-estate", "cl-will-no-cash"],
  sources: sourcesFrom([
    ["cl-will-names-guardian", "What a will can name and record"],
    ["cl-intestate", "What happens without a valid will"],
    ["cl-will-any-estate", "Small estates and everyday accounts"],
    ["cl-will-no-cash", "A will gives instructions, not cash"],
  ]),
  related: ["guardians-and-childrens-trusts", "estate-costs-and-a-will"],
};
