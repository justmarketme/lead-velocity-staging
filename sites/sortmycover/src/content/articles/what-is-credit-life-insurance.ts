import type { Block } from "../types";
import { BEFORE_SIGNING, WHERE_SORTMYCOVER_FITS } from "../cover-shared";

/* Figures and rules: config/evidence.json sanews-credit-life-regs (Credit Life Insurance Regulations, 2017) and
   ncr-credit-life-substitution (National Credit Act s106(4)). */
export const body: Block[] = [
  {
    type: "p",
    text: "Credit life insurance often comes up when a bond or loan is approved. This page explains what it is, what the law says about it, and how it differs from life cover, in general terms. It does not say whether any policy suits anyone.",
  },
  { type: "h2", text: "What is credit life insurance?" },
  {
    type: "p",
    text: "It is cover linked to a debt. Under the Credit Life Insurance Regulations, it must pay the outstanding debt if the borrower dies or becomes permanently disabled, and pay instalments for up to 12 months if the borrower loses their job. Someone who is not employed cannot be sold retrenchment cover. On a home loan it is often called bond protection.",
  },
  { type: "h2", text: "Is credit life compulsory for a home loan?" },
  {
    type: "p",
    text: "A lender can require cover for the debt. The National Credit Act also gives the borrower the right to turn down the policy the lender proposes and use a policy of their own choice instead. The lender must tell the borrower about this right.",
  },
  { type: "h2", text: "What can credit life cost?" },
  {
    type: "ul",
    items: [
      "On a **mortgage agreement**, the cost is capped at **R2 per R1,000** of the amount owed.",
      "On **other credit agreements**, such as personal loans and credit facilities, it is capped at **R4.50 per R1,000**.",
    ],
  },
  {
    type: "p",
    text: "The caps come from the 2017 regulations, which apply to credit agreements from their start date onwards. The National Credit Regulator has been reviewing them, so the current rules are worth checking.",
  },
  { type: "h2", text: "Credit life or life cover: what is the difference?" },
  {
    type: "ul",
    items: [
      "**Who is paid.** Credit life pays the lender, to settle or service the debt. Life cover pays the people or estate named in the policy.",
      "**How much.** Credit life follows the debt, so the benefit shrinks as the bond is paid down. Life cover pays the amount set in the policy.",
      "**What it is for.** Credit life protects one debt. Life cover can be used for whatever the family needs, which may include the bond.",
    ],
  },
  {
    type: "p",
    text: "[Life cover, in plain words](/cover/life-cover/) explains life cover, and [disability cover](/cover/disability-cover/) and [income protection](/cover/income-protection/) explain the cover that pays when illness or injury stops work.",
  },
  { type: "h2", text: "Questions to ask an adviser" },
  {
    type: "ul",
    items: [
      "Does an existing life policy meet the lender's requirements, and could it replace the lender's credit life?",
      "What happens to the bond, and to the household's income, if the main earner cannot work?",
      "Does a work benefit already pay anything towards the bond?",
    ],
  },
  ...BEFORE_SIGNING,
  ...WHERE_SORTMYCOVER_FITS,
];
