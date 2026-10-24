import type { ArticleMeta } from "../types";
import { sourcesFrom } from "../evidence";

/* Cycle-1 paid ad "owners-directors" links here. Keyword research (16 Oct 2026): primary "life insurance for business owners";
   SA results are thin and dated. Compliance: no key-person, buy-and-sell or other business-cover product names (angles-final A5);
   no income claims. Claims ledger: owners-directors-post.md. */
export const meta: ArticleMeta = {
  slug: "cover-for-business-owners-and-directors",
  title: "Cover for business owners and directors: what changes without an employer",
  titleTag: "Life cover for business owners and directors",
  description:
    "What changes for life, disability and income cover when there is no employer scheme: group cover, the conversion option, UIF and the will. Not advice.",
  hub: 1,
  answer:
    "Employees often have life and disability cover through an employer's group scheme. That cover belongs to the scheme and usually ends with the job, though some schemes offer a conversion option. An owner, director or self-employed person is in no scheme unless one is set up, so personal policies are usually the route. This is information, not advice.",
  datePublished: "2026-10-17",
  lastReviewed: "2026-10-17",
  author: { kind: "organization", name: "SortMyCover editorial team" },
  fact_checked_by: "SortMyCover editorial team",
  fact_checked_on: "2026-10-17",
  evidence: ["sam-what-is-group-life", "sam-conversion-benefit", "sam-what-is-income-protection", "fsca-disability-cover", "govza-uif-illness", "vuk-uif-2019", "master-faq", "sam-underwriting"],
  sources: sourcesFrom([
    ["sam-what-is-group-life", "What an employer's group scheme can include"],
    ["sam-conversion-benefit", "What happens to group cover on leaving, and the conversion option"],
    ["sam-what-is-income-protection", "What income protection pays"],
    ["fsca-disability-cover", "The two forms of disability cover"],
    ["govza-uif-illness", "Who UIF illness benefits are for"],
    ["vuk-uif-2019", "Who does not have to pay UIF (government guide, 2019)"],
    ["master-faq", "Debts and costs are settled before heirs inherit"],
    ["sam-underwriting", "Why health questions matter"],
  ]),
  related: ["income-protection-vs-disability-cover", "life-events"],
  cta: "Book a 30-minute call with an authorised adviser",
};
