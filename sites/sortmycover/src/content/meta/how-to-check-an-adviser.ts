import type { ArticleMeta, Block } from "../types";

export const meta: ArticleMeta = {
  slug: "how-to-check-an-adviser",
  title: "How do I check that an adviser is authorised?",
  description:
    "Step by step: use the FSCA public register to look up an adviser or firm, and compare name, FSP number, licensed product categories and representative status.",
  hub: 3,
  answer:
    "You can look up any adviser on the FSCA public register, a search form on the FSCA website. Search by FSP number or name, then compare the name, FSP number, product categories and whether the person is listed as a representative. Ask the adviser if anything differs. This is information, not advice.",
  datePublished: "2026-10-10",
  lastReviewed: "2026-10-10",
  author: { kind: "organization", name: "SortMyCover editorial team" },
  fact_checked_by: "SortMyCover editorial team",
  fact_checked_on: "2026-10-10",
  sources: [
    {
      title: "FSCA public register search",
      publisher: "Financial Sector Conduct Authority",
      url: "https://www.fsca.co.za/FSB-Search/",
      accessed: "2026-10",
      used_for: "The search form itself",
    },
    {
      title: "Financial Advisory and Intermediary Services Act 37 of 2002",
      publisher: "SAFLII",
      url: "https://www.saflii.org/za/legis/consol_act/faaisa2002423/",
      accessed: "2026-10",
      used_for: "Meaning of financial services provider, representative and key individual",
    },
    {
      title: "FAIS General Code of Conduct (BN 80 of 2003, consolidated June 2020)",
      publisher: "Masthead (published copy)",
      url: "https://www.masthead.co.za/wp-content/uploads/2022/10/BN-80-of-2003-FAIS-GCOC-June-2020.pdf",
      accessed: "2026-10",
      used_for: "Details an authorised provider gives a client about themselves",
    },
  ],
  related: ["what-happens-on-a-30-minute-call", "how-to-complain"],
};
