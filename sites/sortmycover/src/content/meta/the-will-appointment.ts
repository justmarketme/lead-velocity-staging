import type { ArticleMeta } from "../types";
import { sourcesFrom } from "../evidence";

export const meta: ArticleMeta = {
  slug: "the-will-appointment",
  title: "What happens at the will appointment",
  description:
    "How a will call booked through SortMyCover works: who you speak to, how the will is finalised, signed and witnessed, and what it costs. Information, not advice.",
  hub: 5,
  answer:
    "You speak to a consultant from the will provider, by phone, video or in person. The consultant goes through your wishes and finalises the will with you; it becomes valid only once signed and witnessed. The provider says it does not charge to draft the will. This is information, not advice.",
  datePublished: "2026-10-11",
  lastReviewed: "2026-10-11",
  author: { kind: "organization", name: "SortMyCover editorial team" },
  fact_checked_by: "SortMyCover editorial team",
  fact_checked_on: "2026-10-11",
  evidence: ["cl-consultant-meetings", "cl-no-charge-will", "cl-will-names-guardian", "cl-lpp", "cl-provider-identity"],
  sources: sourcesFrom([
    ["cl-consultant-meetings", "Who finalises the will, and the appointment options"],
    ["cl-no-charge-will", "No charge to draft or update a will"],
    ["cl-will-names-guardian", "What a will can name"],
    ["cl-lpp", "The optional estate-costs cover the consultant may explain"],
    ["cl-provider-identity", "The provider's status as an authorised financial services provider"],
  ]),
  related: ["where-to-keep-a-will", "guardians-and-childrens-trusts"],
};
