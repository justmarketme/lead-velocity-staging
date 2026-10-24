import type { ArticleMeta } from "../types";
import { sourcesFrom } from "../evidence";

/* Social week 2, Wednesday 29 Oct 2026 (research.md section 6). Search phrases (Google autocomplete ZA, 24 Oct 2026):
   "sick leave south africa how many days", "sick leave south africa first 6 months", "what happens when sick leave runs out",
   "uif illness benefits south africa", "how much does uif pay for illness", "income protection waiting period explained",
   "how long does income protection last". No rand UIF payout is stated for any salary: the Fund's scale and ceiling are the
   Fund's, and personal numbers are for the UIF and the adviser. The UIF thresholds (seven days, 12 months) are quoted from the
   government guide (vuk-uif-2019); confirm against labour.gov.za before deploy, as flagged in research.md section 11. */
export const meta: ArticleMeta = {
  slug: "when-sick-leave-runs-out",
  title: "When sick leave runs out: what the BCEA, the UIF and an income protection waiting period each do",
  titleTag: "What happens when sick leave runs out",
  description:
    "Paid sick leave under the BCEA (30 days in three years for a five-day week), UIF illness benefits, and how an income protection waiting period works. Not advice.",
  hub: 1,
  answer:
    "The Basic Conditions of Employment Act gives a five-day worker 30 days of paid sick leave in each 36-month cycle. When that is used up, UIF illness benefits can pay a contributor a share of salary for a limited period. Income protection pays a monthly amount after a waiting period chosen when the policy starts. This is information, not advice.",
  datePublished: "2026-10-24",
  lastReviewed: "2026-10-24",
  author: { kind: "organization", name: "SortMyCover editorial team" },
  fact_checked_by: "SortMyCover editorial team",
  fact_checked_on: "2026-10-24",
  evidence: [
    "bcea-sick-leave", "labour-sick-leave-guide", "govza-uif-illness", "vuk-uif-2019", "sam-what-is-group-life", "sam-income-protection-waiting",
    "sam-what-is-income-protection", "fsca-disability-cover", "sam-disability-pay-out",
  ],
  sources: sourcesFrom([
    ["bcea-sick-leave", "Sections 22 and 23: the 36-month cycle, six weeks' worth of paid sick leave, one day per 26 days worked in the first six months, medical certificates"],
    ["labour-sick-leave-guide", "The Department of Employment and Labour's plain-language guide to the same rules"],
    ["govza-uif-illness", "Who may claim UIF illness benefits"],
    ["vuk-uif-2019", "The government guide's description of the UIF benefit scale, the seven-day illness threshold, the 12-month claim window and who does not contribute"],
    ["sam-what-is-group-life", "Some employers include income protection in a group scheme"],
    ["sam-income-protection-waiting", "How the waiting period on income protection works"],
    ["sam-what-is-income-protection", "How long income protection pays"],
    ["fsca-disability-cover", "When an income benefit stops"],
    ["sam-disability-pay-out", "The definitions of disability a policy can use"],
  ]),
  related: ["income-protection-vs-disability-cover", "income-protection"],
  cta: "Book a 30-minute call with Mark Weston, an authorised adviser, on WhatsApp",
};
