import type { ArticleMeta } from "../types";
import { sourcesFrom } from "../evidence";

export const meta: ArticleMeta = {
  slug: "guardians-and-childrens-trusts",
  title: "Guardians and children's trusts in a will",
  description:
    "How a will can name a guardian for minor children and set up a children's trust that holds an inheritance until an age the will sets. Information, not advice.",
  hub: 5,
  answer:
    "A will can name a guardian to look after minor children and can set up a children's trust, a testamentary trust that holds a child's inheritance until an age the will chooses. That age does not have to be 18 or 21. The will also names the trustees. This is information, not advice.",
  datePublished: "2026-10-11",
  lastReviewed: "2026-10-11",
  author: { kind: "organization", name: "SortMyCover editorial team" },
  fact_checked_by: "SortMyCover editorial team",
  fact_checked_on: "2026-10-11",
  evidence: ["cl-will-names-guardian", "cl-testamentary-trust", "cl-intestate"],
  sources: sourcesFrom([
    ["cl-will-names-guardian", "A will can name guardians, trustees and a testamentary trust"],
    ["cl-testamentary-trust", "How a children's trust holds an inheritance"],
    ["cl-intestate", "What happens without a valid will"],
  ]),
  related: ["what-a-will-does", "the-will-appointment"],
};
