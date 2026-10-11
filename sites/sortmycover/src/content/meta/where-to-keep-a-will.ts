import type { ArticleMeta } from "../types";
import { sourcesFrom } from "../evidence";

export const meta: ArticleMeta = {
  slug: "where-to-keep-a-will",
  title: "Where a will is kept, and how it is found again",
  description:
    "What happens to a signed will after the appointment: courier collection, vault storage, the copy you keep, and updates and retrieval. Information, not advice.",
  hub: 5,
  answer:
    "After a will is signed, the will provider says it collects the original by courier at no charge, keeps it in a fire- and water-resistant vault and gives the client a copy. It says it does not charge to store, update or retrieve a will it drafted. This is information, not advice.",
  datePublished: "2026-10-11",
  lastReviewed: "2026-10-11",
  author: { kind: "organization", name: "SortMyCover editorial team" },
  fact_checked_by: "SortMyCover editorial team",
  fact_checked_on: "2026-10-11",
  evidence: ["cl-safe-custody", "cl-no-charge-will", "cl-estate-admin"],
  sources: sourcesFrom([
    ["cl-safe-custody", "Courier collection, vault storage and the client's copy"],
    ["cl-no-charge-will", "No charge to draft, update, store or retrieve a will"],
    ["cl-estate-admin", "What happens to an estate after death"],
  ]),
  related: ["the-will-appointment", "what-a-will-does"],
};
