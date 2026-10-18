import type { ArticleMeta } from "../types";
import { sourcesFrom } from "../evidence";

/* Cycle-1 paid ad "salary-stops" links here. Keyword research (16 Oct 2026): primary "income protection vs disability cover",
   chosen so this overview does not compete with /cover/income-protection/ for "income protection south africa".
   The "national picture" section of the draft (ASISA rand averages, GATED-QG1) is not published until the practitioner clears it. */
export const meta: ArticleMeta = {
  slug: "income-protection-vs-disability-cover",
  title: "Income protection vs disability cover: what each one pays",
  titleTag: "Income protection vs disability cover",
  description:
    "Life cover, lump-sum disability cover and income protection in plain words: what each pays, when it stops, and what work cover includes. Not advice.",
  hub: 4,
  answer:
    "Life cover pays when the insured person dies. Lump-sum disability cover pays once, usually only when a disability is permanent. Income protection pays a monthly amount based on earnings after a waiting period, and stops on recovery, death or the end of the benefit term. Each policy's definition of disability decides whether a claim pays. This is information, not advice.",
  datePublished: "2026-10-17",
  lastReviewed: "2026-10-17",
  author: { kind: "organization", name: "SortMyCover editorial team" },
  fact_checked_by: "SortMyCover editorial team",
  fact_checked_on: "2026-10-17",
  evidence: [
    "sam-what-is-life-cover", "sam-what-is-disability-cover", "sam-disability-pay-out", "fsca-disability-cover", "sam-what-is-income-protection",
    "sam-income-protection-waiting", "sam-what-is-severe-illness", "sam-what-is-group-life", "sam-conversion-benefit", "sam-group-cover-questions",
    "sam-underwriting", "ppr-ltia-cooling-off",
  ],
  sources: sourcesFrom([
    ["sam-what-is-life-cover", "What life cover pays"],
    ["sam-what-is-disability-cover", "The lump-sum and income forms of disability cover"],
    ["sam-disability-pay-out", "The definitions of disability a policy can use"],
    ["fsca-disability-cover", "When an income benefit stops"],
    ["sam-what-is-income-protection", "How long income protection pays"],
    ["sam-income-protection-waiting", "How the waiting period works"],
    ["sam-what-is-severe-illness", "Where severe illness cover fits"],
    ["sam-what-is-group-life", "What a group scheme can include"],
    ["sam-conversion-benefit", "The conversion option on leaving a job"],
    ["sam-group-cover-questions", "Questions to ask about cover"],
    ["sam-underwriting", "Why health questions matter"],
    ["ppr-ltia-cooling-off", "The 31-day cooling-off period"],
  ]),
  related: ["income-protection", "disability-cover"],
  cta: "Book a 30-minute call with an authorised adviser",
};
