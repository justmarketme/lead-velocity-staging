import type { ArticleMeta } from "../types";
import { sourcesFrom } from "../evidence";

/* Cycle-1 paid ad "adviser-conversation" links here. Keyword research (16 Oct 2026): primary "questions to ask a financial adviser";
   also "how to check if a financial advisor is registered in south africa", "what must a financial adviser disclose".
   Sits between /learn/what-happens-on-a-30-minute-call/ (process) and /learn/how-to-check-an-adviser/ (register steps) and links to both. */
export const meta: ArticleMeta = {
  slug: "questions-to-ask-a-financial-adviser",
  title: "Questions to ask an authorised financial adviser, and what they must tell you",
  titleTag: "Questions to ask a financial adviser in SA",
  description:
    "What an authorised adviser must tell you under the FAIS Code, how to look them up on the FSCA register, and questions to ask on a first call. Not advice.",
  hub: 3,
  answer:
    "Under the FAIS General Code of Conduct an authorised adviser must give a client the firm's details, its authorisation, how conflicts are handled and, where advice leads to a product, a written record of advice. Anyone can look an adviser up on the FSCA register, and can ask how the adviser is paid. This is information, not advice.",
  datePublished: "2026-10-17",
  lastReviewed: "2026-10-17",
  author: { kind: "organization", name: "SortMyCover editorial team" },
  fact_checked_by: "SortMyCover editorial team",
  fact_checked_on: "2026-10-17",
  evidence: ["fais-gcoc", "fsca-fais-register", "fsca-life-insurance-booklet", "ppr-ltia-cooling-off", "sam-underwriting"],
  sources: sourcesFrom([
    ["fais-gcoc", "What a provider must disclose (s5), conflicts of interest (s3), how advice is built (s8) and the record of advice (s9)"],
    ["fsca-fais-register", "The public register of authorised providers"],
    ["fsca-life-insurance-booklet", "Consumer rights before and after signing"],
    ["ppr-ltia-cooling-off", "The 31-day cooling-off period"],
    ["sam-underwriting", "Why health questions matter"],
  ]),
  related: ["how-to-check-an-adviser", "what-happens-on-a-30-minute-call"],
  cta: "Book a 30-minute call with an authorised adviser",
};
