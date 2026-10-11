import type { Block } from "../types";
import { BEFORE_SIGNING, WHERE_SORTMYCOVER_FITS } from "../cover-shared";

export const body: Block[] = [
  {
    type: "p",
    text: "This page explains what life cover is and what it is not, in general terms, using consumer material from ASISA and the FSCA. It does not say whether anyone has enough cover, or which policy suits them.",
  },
  { type: "h2", text: "What is life cover?" },
  {
    type: "p",
    text: "Life cover is a policy that pays a benefit when the insured person dies. In return, the policyholder pays a regular premium. The benefit is usually a lump sum. Some policies pay it as a monthly amount instead.",
  },
  {
    type: "p",
    text: "Some policies also pay part of the benefit early if the insured person is diagnosed with a terminal illness. Whether a policy does this, and how much it pays early, differs from insurer to insurer.",
  },
  { type: "h2", text: "Who receives the money?" },
  {
    type: "p",
    text: "The benefit goes either to the beneficiaries named on the policy or into the estate. Money paid into the estate is used to settle the estate's debts first. What is left goes to the heirs under the will, or under the law of intestate succession if there is no valid will.",
  },
  {
    type: "p",
    text: "[Estate costs, and why a will does not pay them](/wills/estate-costs-and-a-will/) explains how an estate pays its costs, and [what a will does](/wills/what-a-will-does/) explains the will's side.",
  },
  { type: "h2", text: "What is life cover not?" },
  {
    type: "ul",
    items: [
      "It is not disability cover. Disability cover pays while the insured person is alive but cannot work. See [disability cover](/cover/disability-cover/).",
      "It is not severe illness cover, which pays on the diagnosis of a listed illness. See [severe illness cover](/cover/severe-illness-cover/).",
      "It is not cover attached to a loan. That is credit life, a different product, defined in the [glossary](/learn/glossary/).",
      "It is not a will. A will says who inherits; a policy pays money under its own terms.",
    ],
  },
  { type: "h2", text: "How does an insurer decide whether to offer cover?" },
  {
    type: "p",
    text: "This is called underwriting. With fully underwritten cover, the insurer asks detailed questions about health and family history, and may ask for tests such as a blood test. With limited underwriting there are only a few questions.",
  },
  {
    type: "p",
    text: "The insurer can then offer cover on its usual terms, offer it with exclusions, ask a higher premium, or decline. Policies with limited underwriting often exclude conditions the person already has, and some have a waiting period before deaths from natural causes are covered. A health condition that is not disclosed can lead to a claim being rejected later.",
  },
  ...BEFORE_SIGNING,
  { type: "h2", text: "Questions to ask an adviser about life cover" },
  {
    type: "ul",
    items: [
      "Who receives the benefit, and how do I name or change a beneficiary?",
      "Is this cover fully underwritten or limited, and what does that mean for exclusions or waiting periods?",
      "What does the policy not pay for?",
      "Does the policy pay anything early on a terminal illness diagnosis?",
      "How are you paid if I take this policy?",
    ],
  },
  ...WHERE_SORTMYCOVER_FITS,
];
