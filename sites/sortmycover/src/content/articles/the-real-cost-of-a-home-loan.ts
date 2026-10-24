import type { Block } from "../types";
import { ON_THE_CALL } from "../learn-shared";

/* Sources: config/evidence.json ooba-q2-2026, sars-transfer-duty, lssa-conveyancing-2025, deeds-office-fees-2025,
   bank-initiation-fee-2025, sarb-mpc-2026-09, nca-s106, ncr-credit-life-substitution, ncr-guideline-002-2026, cdh-2017,
   sam-what-is-life-cover. Totals and the instalment are computed from those inputs (method shown on the page; working in
   checklist/creative/ads/house-call/research.md, 24 Oct 2026). No bank is named. Building insurance is listed as a cost only. */
export const body: Block[] = [
  {
    type: "p",
    text: "The approval letter is a good day. It names the house, the loan and the instalment. What it does not add up is the second bill, the one from the attorneys, and the monthly lines that arrive after the keys. This page lists them with their sources, for a R1.5 million home bought with a 100% bond, and then turns to the one cost in the whole stack that the household gets to decide on.",
  },
  {
    type: "p",
    text: "Figures are from SARS, the Law Society of South Africa's conveyancing fee guideline, the Deeds Office schedule and the Reserve Bank, with the arithmetic shown. They are general information, not advice, and no bank is named. SortMyCover is not a financial services provider.",
  },
  { type: "h2", text: "Who is buying" },
  {
    type: "p",
    text: "First-time buyers are about half of the market. The bond originator ooba says they make up 48% of its applications, and that their average purchase price rose to **R1 315 396** in the second quarter of 2026, up 6.1% on a year earlier. More than 56.9% of all applications in the first half of 2026 were for zero-deposit loans, and where first-time buyers did pay a deposit, it averaged 8.9% of the price. In other words, most first-time buyers borrow the whole price and pay the costs below from savings.",
  },
  { type: "h2", text: "The once-off costs on a R1.5 million home" },
  {
    type: "p",
    text: "These are paid before registration, mostly to the two attorneys. They are not part of the bond unless the bank agrees to a cost-inclusive loan.",
  },
  {
    type: "ul",
    items: [
      "**Transfer duty: R8 700.** SARS charges no duty on the first R1 210 000 and 3% on the value above it, so on R1.5 million the duty is 3% of R290 000. The table from 1 April 2025 is unchanged for 2026/27. On a R2.5 million home the duty is R67 200.",
      "**Transfer attorney (conveyancer): about R36 250.** The Law Society of South Africa's guideline of 1 August 2025 works out at R25 370 for the first R1 million plus R2 050 for every R200 000 or part above that, which is R31 520 before VAT and about R36 250 with it. It is a guideline, not a tariff, and the fee is negotiable.",
      "**Bond registration attorney: about R36 250.** The same guideline applies to the bond amount, so on a 100% bond it is the same figure again.",
      "**Deeds Office fees: R1 646 for the transfer and R1 646 for the bond**, on the schedule in force from 1 April 2025.",
      "**Bank initiation fee: R6 037.50.** The figure quoted across 2025 conveyancing cost guides. It can be added to the loan, where it then attracts interest.",
      "**Post, petties and electronic lodgement: about R3 500 to each attorney.** Each firm sets its own.",
    ],
  },
  {
    type: "p",
    text: "Add those up and a R1.5 million home costs **roughly R97 500** before the first instalment. On a R2.5 million home the same list comes to roughly R181 000, with transfer duty the line that grows fastest. Sectional-title and estate buyers also pay levy clearance or homeowners' association consent fees, and anyone who moves in before registration pays occupational rent to the seller.",
  },
  { type: "h2", text: "The monthly line that moved twice this year" },
  {
    type: "p",
    text: "The Reserve Bank raised the repo rate to 7.25% from 25 September 2026, the second increase of the year, and the banks' prime lending rate followed to **10.75%**. At the start of 2026 prime was 10.25%.",
  },
  {
    type: "p",
    text: "On a R1.5 million bond over 20 years at prime, the instalment is about **R15 228** a month. At 10.25% it would have been about R14 725, so the two increases added about **R504** a month to the same loan. Over the full term, interest on that bond comes to roughly R2.15 million on top of the R1.5 million borrowed. Banks lend at rates above or below prime depending on the applicant, so a particular quote will differ.",
  },
  {
    type: "p",
    text: "The instalment is not the whole monthly cost. Municipal rates and services, a levy on sectional title or in an estate, a monthly bond administration fee, and building insurance on a house, which the National Credit Act allows a lender to require on bonded property, all arrive in the same month. Building insurance is a short-term product and is listed here as a cost only.",
  },
  { type: "h2", text: "The one line the household decides" },
  {
    type: "p",
    text: "Everything above is set by someone else: SARS, the attorneys, the Deeds Office, the bank, the municipality. One line is different. Under section 106 of the National Credit Act, a lender may require a borrower to keep **credit life insurance** for the term of the loan, capped at what is still owed. The same section says that where a lender proposes a particular policy, the borrower has the right to decline it and substitute a policy of their own choice, and the lender has to tell the borrower about that right.",
  },
  {
    type: "p",
    text: "The National Credit Regulator's guideline adds that the lender must accept the borrower's own policy if it meets the minimum benefits in the Credit Life Insurance Regulations, and that the choice can be made after the loan has started. A law firm's summary of those regulations says a credit life policy must cover at least death, permanent disability and temporary disability, and in certain cases unemployment. In March 2026 the Regulator repeated that credit life cover may not materially exceed the outstanding balance at any point.",
  },
  {
    type: "p",
    text: "That is why the household gets to decide. A credit life policy pays the lender, up to the balance of the loan. A personal life policy pays the people named on it, or the estate, for whatever amount was chosen when it was set up. A personal policy can be ceded to the bank, in which case the bank is paid first and the rest goes to the beneficiaries. Which arrangement a household wants, and whether a policy it already holds meets the lender's conditions, is a conversation for an authorised adviser. [Life cover and a home loan](/learn/life-cover-and-a-home-loan/) sets out the law in detail, and [what is credit life insurance](/learn/what-is-credit-life-insurance/) explains the cost caps.",
  },
  { type: "h2", text: "The question the approval letter does not ask" },
  {
    type: "p",
    text: "The bank asked whether the household can pay R15 228 a month. It did not ask what happens to that line if one income stops for six months, or for good. Credit life covers the loan in the events the policy lists. The rest of the month, the groceries, the school fees and the other debts, sits outside it. [Income protection vs disability cover](/learn/income-protection-vs-disability-cover/) explains what pays when someone is alive but cannot work, and [when sick leave runs out](/learn/when-sick-leave-runs-out/) walks through the timeline.",
  },
  { type: "h2", text: "Questions a household can take to an adviser" },
  {
    type: "ul",
    items: [
      "What do our loan conditions say about credit life or life cover?",
      "Does a policy we already have meet the lender's minimum terms, and what would ceding it mean for the people named on it?",
      "If we take the lender's credit life, what does it pay, in which events, and what does it leave out?",
      "What would pay the instalment if an income stopped but nobody died?",
      "How do waiting periods and definitions work on that cover?",
      "How are you paid, and does that change if we take a product?",
    ],
  },
  ...ON_THE_CALL("cover linked to a home loan"),
];
