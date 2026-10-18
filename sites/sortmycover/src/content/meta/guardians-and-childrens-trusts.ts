import type { ArticleMeta } from "../types";
import { sourcesFrom } from "../evidence";

/* Wills and estate (hub 5). Facts rest on government and statutory sources only (Jono, 18 Oct 2026: no reliance on the will provider). */
export const meta: ArticleMeta = {
  slug: "guardians-and-childrens-trusts",
  title: "Guardians and children's trusts in a will",
  description:
    "How a will can name a guardian for minor children, what the Guardian's Fund does with a child's inheritance, and where a trust fits. Information, not advice.",
  hub: 5,
  answer:
    "A parent who is the sole guardian can name a guardian for a minor child, and the Children's Act says that appointment must be in a will. Money a minor inherits without another arrangement goes to the Master's Guardian's Fund and is paid out at 18, or at an age the will sets. This is information, not advice.",
  datePublished: "2026-10-11",
  lastReviewed: "2026-10-18",
  author: { kind: "organization", name: "SortMyCover editorial team" },
  fact_checked_by: "SortMyCover editorial team",
  fact_checked_on: "2026-10-18",
  evidence: ["gov-childrens-act-s27", "master-guardians-fund", "master-intestate"],
  sources: sourcesFrom([
    ["gov-childrens-act-s27", "Appointing a guardian in a will"],
    ["master-guardians-fund", "How the Guardian's Fund holds and pays a child's inheritance"],
    ["master-intestate", "What happens without a valid will"],
  ]),
  related: ["guardians-fund", "what-a-will-does"],
};
