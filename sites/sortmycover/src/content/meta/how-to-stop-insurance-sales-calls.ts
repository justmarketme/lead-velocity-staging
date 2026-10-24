import type { ArticleMeta } from "../types";
import { sourcesFrom } from "../evidence";

/* Social week 2, Sunday 2 Nov 2026 (research.md section 6). Search phrases (Google autocomplete ZA, 24 Oct 2026):
   "how to stop insurance spam calls", "why do life insurance companies keep calling me", "opt out of marketing calls south africa",
   "national opt out registry south africa", "report spam calls south africa". Dates for the National Opt-Out Registry are from the
   NCC's own notice of 7 Oct 2026 and the ITWeb report of its briefing (8 Oct 2026). No insurer, bank or call centre is named, and
   the page never promises that calls from other companies will stop. */
export const meta: ArticleMeta = {
  slug: "how-to-stop-insurance-sales-calls",
  title: "Why insurers keep calling you, what the law says, and what changes in 2027",
  titleTag: "How to stop insurance sales calls in SA",
  description:
    "Insurance is South Africa's largest spam-call category. What POPIA already requires, how the National Opt-Out Registry works from 2027, and what to say on the call.",
  hub: 3,
  answer:
    "Insurance is the largest spam-call category in South Africa. POPIA already requires a marketer to get consent before electronic direct marketing and to ask for it only once. From 2027 the National Consumer Commission's Opt-Out Registry lets consumers block registered direct marketers, with fines of up to R1 million for those who ignore it. This is information, not advice.",
  datePublished: "2026-10-24",
  lastReviewed: "2026-10-24",
  author: { kind: "organization", name: "SortMyCover editorial team" },
  fact_checked_by: "SortMyCover editorial team",
  fact_checked_on: "2026-10-24",
  evidence: ["truecaller-2025", "ncc-opt-out-registry-2026", "itweb-opt-out-2026", "sapeople-opt-out-2026", "inforeg-cpa-statement-2026", "fais-gcoc", "fsca-fais-register", "own-privacy-notice"],
  sources: sourcesFrom([
    ["truecaller-2025", "South Africa's rank for spam calls and insurance as the largest spam category"],
    ["ncc-opt-out-registry-2026", "The registry's phases, 17.47 billion spam calls in the first half of 2026, monthly cleansing"],
    ["itweb-opt-out-2026", "Full enforcement from 15 April 2027 and the fines"],
    ["sapeople-opt-out-2026", "A registered block overrides earlier consent"],
    ["inforeg-cpa-statement-2026", "POPIA section 69: consent first, one request only, opting out is not consent"],
    ["fais-gcoc", "What a representative must tell a client at the earliest reasonable opportunity"],
    ["fsca-fais-register", "The public register of authorised providers"],
    ["own-privacy-notice", "How SortMyCover handles a number: one adviser, never sold, STOP"],
  ]),
  related: ["what-happens-to-your-details", "how-to-complain"],
  cta: "Book a 30-minute call with Mark Weston, an authorised adviser, on WhatsApp",
};
