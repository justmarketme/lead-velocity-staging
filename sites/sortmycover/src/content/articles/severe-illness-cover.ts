import type { Block } from "../types";
import { BEFORE_SIGNING, WHERE_SORTMYCOVER_FITS } from "../cover-shared";

export const body: Block[] = [
  {
    type: "p",
    text: "Severe illness cover goes by several names: critical illness cover and dread disease cover are the same idea. This page explains what it is, how policies decide what counts, and what it is not, in general terms. It does not say whether anyone has enough cover or which policy suits them.",
  },
  { type: "h2", text: "What is severe illness cover?" },
  {
    type: "p",
    text: "It is a policy, or a benefit within a policy, that pays a lump sum when the insured person is diagnosed with a serious illness that the policy lists, such as cancer or a heart attack. Some policies also cover serious injuries.",
  },
  {
    type: "p",
    text: "It pays on the diagnosis, even if the person is expected to recover. The money is not limited to medical bills: it can be used for other costs that come with a serious illness.",
  },
  { type: "h2", text: "Which illnesses are covered?" },
  {
    type: "p",
    text: "The original core conditions were cancer, heart attack, stroke and coronary bypass surgery. Policies now list many more, from under a hundred to about three hundred conditions, each with its own definition. That makes policies hard to set side by side.",
  },
  { type: "h2", text: "Does every diagnosis pay the full amount?" },
  {
    type: "p",
    text: "Not always. Many policies pay a share of the benefit that depends on how severe the illness is. ASISA's Standard on Disclosures for Critical Illness Products sets standard definitions for heart attack, cancer, stroke and coronary bypass surgery at four severity levels, from A (most severe) to D (least severe).",
  },
  {
    type: "ul",
    items: [
      "Each insurer that is an ASISA member shows, in its quote and policy, what share of the benefit it pays at each level. The insurer sets those shares.",
      "If a claim is declined under the insurer's own definition, the claimant can ask for it to be assessed against the standard definitions too.",
      "Many policies pay only if the person survives a set number of days after the diagnosis, often 14 or 28 days.",
    ],
  },
  { type: "h2", text: "What is severe illness cover not?" },
  {
    type: "ul",
    items: [
      "It is not [disability cover](/cover/disability-cover/). Lump-sum disability cover pays only for a permanent inability to work; severe illness cover pays on the diagnosis itself.",
      "It is not [life cover](/cover/life-cover/), which pays when the insured person dies.",
      "It does not cover every illness: only the conditions, and severity levels, in the policy wording.",
    ],
  },
  { type: "h2", text: "Does the insurer ask about health?" },
  {
    type: "p",
    text: "Usually, yes. Underwriting can mean detailed health questions and tests, or only a few questions. Conditions a person already has may be excluded. A condition that is not disclosed can lead to a claim being rejected later.",
  },
  ...BEFORE_SIGNING,
  { type: "h2", text: "Questions to ask an adviser about severe illness cover" },
  {
    type: "ul",
    items: [
      "Which conditions does the policy list, and where are their definitions?",
      "What share of the benefit is paid at each severity level?",
      "Is there a survival period after diagnosis before it pays?",
      "Can a claim be assessed against the ASISA standard definitions?",
      "What is excluded, including any condition I already have?",
      "How are you paid if I take this policy?",
    ],
  },
  ...WHERE_SORTMYCOVER_FITS,
];
