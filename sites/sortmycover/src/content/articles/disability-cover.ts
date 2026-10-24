import type { Block } from "../types";
import { BEFORE_SIGNING, WHERE_SORTMYCOVER_FITS } from "../cover-shared";

export const body: Block[] = [
  {
    type: "p",
    text: "Disability cover is about income, not death: it pays while the insured person is alive but cannot work because of illness or injury. This page explains the main kinds and the words that decide whether a claim is paid, in general terms. It does not say whether anyone has enough cover.",
  },
  { type: "h2", text: "What are the two kinds of disability cover?" },
  {
    type: "ul",
    items: [
      "**A lump sum.** One payment, made once the disability is shown to be permanent. The lump-sum kind pays only for a permanent loss of the ability to work.",
      "**A monthly income.** A regular payment while the person cannot work, often called income protection or an income disability benefit. Income benefits can cover a temporary or a permanent disability, and stop on recovery, on death or at the end of the policy. [Income protection](/cover/income-protection/) has its own page.",
    ],
  },
  { type: "h2", text: "How does a policy define disability?" },
  {
    type: "p",
    text: "A claim succeeds only if the disability meets the policy's own definition. ASISA's consumer site describes the common ones:",
  },
  {
    type: "ul",
    items: [
      "**Own occupation:** the person cannot do their own job. This is the widest definition.",
      "**Own or similar occupation:** the person cannot do their own job or a similar one that suits their training and experience.",
      "**Any occupation:** the person cannot do any job at all.",
      "**Loss of function:** some policies use a physical or functional test instead, such as the loss of a limb, sight, hearing or speech.",
    ],
  },
  {
    type: "p",
    text: "The definition affects both what a claim needs to show and the premium. In most cases a lump-sum claim also needs the disability to be declared permanent: no substantial recovery is expected after reasonable treatment.",
  },
  { type: "h2", text: "What is disability cover not?" },
  {
    type: "ul",
    items: [
      "It is not [life cover](/cover/life-cover/), which pays when the insured person dies.",
      "It is not [severe illness cover](/cover/severe-illness-cover/). Severe illness cover pays on the diagnosis of a listed condition, even if the person is expected to recover. Lump-sum disability cover pays only for a permanent inability to work.",
      "It does not pay for everything. A benefit may exclude work-related injuries, or take payments from the Compensation Fund into account.",
    ],
  },
  { type: "h2", text: "Does the insurer ask about health?" },
  {
    type: "p",
    text: "Usually, yes. Underwriting can mean detailed health questions and tests, or only a few questions. The insurer may offer cover with exclusions, at a higher premium, or decline. A condition that is not disclosed can lead to a claim being rejected later.",
  },
  ...BEFORE_SIGNING,
  { type: "h2", text: "Questions to ask an adviser about disability cover" },
  {
    type: "ul",
    items: [
      "Is this benefit a lump sum or a monthly income?",
      "Which definition of disability does the policy use: own occupation, similar occupation, any occupation, or loss of function?",
      "Does it cover a temporary disability, or only a permanent one?",
      "If it pays an income, what is the waiting period, and at what age does the income stop?",
      "What is excluded?",
      "How are you paid if I take this policy?",
    ],
  },
  ...WHERE_SORTMYCOVER_FITS,
];
