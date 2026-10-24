import type { Block } from "../types";
import { BEFORE_SIGNING, WHERE_SORTMYCOVER_FITS } from "../cover-shared";

export const body: Block[] = [
  {
    type: "p",
    text: "Income protection is the monthly form of disability cover. This page explains how it works, what the waiting period is, and what it is not, in general terms. It does not say how much cover anyone has or which policy suits them.",
  },
  { type: "h2", text: "What is income protection?" },
  {
    type: "p",
    text: "It is a policy that pays a monthly income, instead of a lump sum, while illness or injury stops the insured person from working. The benefit is based on the person's current income.",
  },
  {
    type: "p",
    text: "An income benefit stops when the person recovers, when they die, or when the policy ends. For a long-term disability it can run to a retirement age chosen in the policy, which ASISA's consumer site gives as anywhere from 55 to 70.",
  },
  { type: "h2", text: "Temporary or permanent?" },
  {
    type: "ul",
    items: [
      "**Temporary disability cover** pays for a limited time, usually 6, 12 or 24 months.",
      "**Permanent disability cover** can pay to the retirement age in the policy.",
      "**Partial disability cover** is also offered.",
    ],
  },
  { type: "h2", text: "What is the waiting period?" },
  {
    type: "p",
    text: "On income protection, the waiting period is the time a person has to be unable to work before payments start. Unlike most waiting periods, it does not apply only once when the policy starts: it applies at the start of every claim. Some insurers call it a deferment or deferred period; the policy wording says which term it uses.",
  },
  {
    type: "ul",
    items: [
      "The policyholder chooses its length when taking the policy. Employees can match it to their sick leave.",
      "The length chosen affects the premium.",
      "If the same condition comes back soon after the person returns to work, within a period the policy sets, the waiting period usually does not start again.",
    ],
  },
  { type: "h2", text: "What is income protection not?" },
  {
    type: "ul",
    items: [
      "It is not lump-sum [disability cover](/cover/disability-cover/), which pays once, for a permanent disability.",
      "It is not [severe illness cover](/cover/severe-illness-cover/), which pays a lump sum on the diagnosis of a listed condition.",
      "It does not pay for everything. A benefit may exclude work-related injuries, or take payments from the Compensation Fund into account.",
    ],
  },
  { type: "h2", text: "Does the insurer ask about health?" },
  {
    type: "p",
    text: "Usually, yes. Underwriting can mean detailed health questions and tests, or only a few questions. The insurer may offer cover with exclusions, at a higher premium, or decline. A condition that is not disclosed can lead to a claim being rejected later.",
  },
  ...BEFORE_SIGNING,
  { type: "h2", text: "Questions to ask an adviser about income protection" },
  {
    type: "ul",
    items: [
      "How long is the waiting period, and does it restart if the same condition comes back?",
      "Does it cover a temporary disability, a permanent one, or both?",
      "At what age does the income stop?",
      "Which definition of disability applies?",
      "What is excluded?",
      "How are you paid if I take this policy?",
    ],
  },
  ...WHERE_SORTMYCOVER_FITS,
];
