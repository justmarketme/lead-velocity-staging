import type { Block } from "../types";
import { ON_THE_CALL, SERIES_LINKS } from "../learn-shared";

/* Sources: config/evidence.json nca-s106, ncr-credit-life-substitution, ncr-guideline-002-2026, cdh-2017, fnb-home-loan,
   sam-what-is-life-cover, fsca-disability-cover, fsca-life-insurance-booklet. Other banks' requirements: only stale or secondary
   sources were found, so they are not described. */
export const body: Block[] = [
  {
    type: "p",
    text: "A bond approval comes with a stack of documents: the offer, the loan conditions, the transfer papers. Somewhere in that stack, many households meet the words \"credit life\" or \"life cover\" for the first time. Some families add one more question to the list: what protects the bond if an income stops?",
  },
  {
    type: "p",
    text: "This page sets out what South African law says, what one bank publishes, and which questions a household can take to an authorised adviser. It does not say what any household has or lacks. SortMyCover is not a financial services provider and gives no advice.",
  },
  { type: "h2", text: "Credit life and life cover are two different things" },
  {
    type: "p",
    text: "**Credit life insurance** is cover linked to a loan. Under the National Credit Act, a lender may require a borrower to keep credit life insurance for the term of the loan. The Act caps that cover: at no time may it be more than what the borrower still owes on the loan.",
  },
  {
    type: "p",
    text: "The National Credit Regulator (NCR) repeated this in a guideline in March 2026. It said the cover should stay in line with the outstanding balance and should not be much higher than it at any point.",
  },
  {
    type: "p",
    text: "A law firm's summary of the 2017 Credit Life Insurance Regulations says a credit life policy must cover at least death, permanent disability and temporary disability, and in certain cases unemployment. Each policy's own wording sets out how it works. [What is credit life insurance?](/learn/what-is-credit-life-insurance/) covers the cost caps in the regulations.",
  },
  {
    type: "p",
    text: "**Life cover** is a personal policy. It pays a benefit when the insured person dies. The money goes to the people named on the policy or into the estate. If it goes into the estate, debts are settled before heirs inherit. [Life cover, in plain words](/cover/life-cover/) has more detail.",
  },
  {
    type: "p",
    text: "So the two do different jobs. Credit life is shaped around one debt. Life cover is shaped around whatever the policyholder chose when the policy was set up.",
  },
  { type: "h2", text: "Does a bank ask for cover on a home loan?" },
  {
    type: "p",
    text: "It depends on the lender and on the loan conditions. The law allows a lender to require credit life, but it does not say every lender must.",
  },
  {
    type: "p",
    text: "One example: FNB's home loan page says it will require life cover as a condition of granting new and further loans. It also says there are cases where this does not apply, and that these are set out in the loan conditions. The same page lists conditions for the policy, such as showing the start date and the total amount of cover.",
  },
  {
    type: "p",
    text: "We did not find current, primary pages for other banks' requirements, so this page does not describe them. The loan conditions document is the place to look. It is written for that specific loan.",
  },
  {
    type: "p",
    text: "FNB's page also lists a separate requirement for homeowner's cover on the building itself. That is a different kind of insurance (short-term insurance), and it is not covered here.",
  },
  { type: "h2", text: "Can a borrower use a policy they already have?" },
  {
    type: "p",
    text: "The National Credit Act gives borrowers a choice. If a lender proposes a particular credit insurance policy, the borrower must be told of the right to decline it and use a policy of their own choice instead.",
  },
  { type: "p", text: "The NCR's June 2024 guideline adds two points:" },
  {
    type: "ul",
    items: [
      "The lender must accept the borrower's own policy if it meets the minimum benefits and limits set in the Credit Life Insurance Regulations.",
      "This also applies when the borrower makes that choice after the loan has started.",
    ],
  },
  {
    type: "p",
    text: "FNB's page says the same in its own words. A borrower may provide their own policy to be ceded to the bank, as long as it has enough cover to pay off the outstanding balance, or the registered bond amount, at the time of cession. FNB also says it can reject proposed credit insurance that is not suitable.",
  },
  { type: "h2", text: "What does \"ceding\" a policy mean?" },
  {
    type: "p",
    text: "Ceding means signing over the right to a policy's payout, or part of it, to someone else. Here, that someone is the bank.",
  },
  {
    type: "p",
    text: "FNB's page explains the effect plainly. When a policy is ceded, the bank's right comes first, and the bank is paid before the people named as beneficiaries. Whatever is left after the bank is paid goes to the beneficiaries.",
  },
  {
    type: "p",
    text: "This is why a household may want to know two things about any ceded policy: how much of it goes to the bank, and how much would be left for the people named on it.",
  },
  { type: "h2", text: "What a bond-linked policy is not designed to do" },
  {
    type: "p",
    text: "Credit life is built around the loan. By law its cover cannot be more than what is owed. It is paid towards the loan, not to the family.",
  },
  {
    type: "p",
    text: "Other costs carry on after a bond is paid off: daily living costs, school fees, other debts. Those sit outside a loan-linked policy.",
  },
  {
    type: "p",
    text: "An income that stops for a while, without anyone dying, is a separate question too. Disability cover comes in two main forms. A lump sum is paid once a disability is shown to be permanent. An income benefit pays monthly, and it stops on recovery, death or the end of the policy. The terms of each policy decide what it pays and when. [Income protection vs disability cover](/learn/income-protection-vs-disability-cover/) sets the two side by side.",
  },
  { type: "h2", text: "Questions a household can take to an authorised adviser" },
  { type: "p", text: "These are questions, not a checklist of things anyone must do:" },
  {
    type: "ul",
    items: [
      "What do our loan conditions say about credit life or life cover?",
      "Does a policy we already have meet the lender's minimum terms?",
      "If a policy is ceded to the bank, what is left for the people named on it?",
      "What would pay out if an income stopped but nobody died?",
      "How do waiting periods and the policy's definitions work?",
      "How are you paid, and does that change if we choose a product?",
    ],
  },
  {
    type: "p",
    text: "The FSCA's consumer booklet on life insurance says a consumer can ask an adviser for full details of fees and commission. An adviser must be able to show that they are authorised. Anyone can look up an FSP number on the FSCA register. [How to check an adviser](/learn/how-to-check-an-adviser/) shows the steps, and [questions to ask a financial adviser](/learn/questions-to-ask-a-financial-adviser/) lists what the adviser must tell you.",
  },
  ...ON_THE_CALL("the different kinds of cover"),
  ...SERIES_LINKS("life-cover-and-a-home-loan"),
];
