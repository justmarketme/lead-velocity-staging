import type { Block } from "../types";
import { WHERE_SORTMYCOVER_FITS } from "../cover-shared";

/* Every figure below is from SARS's Estate Duty page (config/evidence.json: sars-estate-duty). */
export const body: Block[] = [
  {
    type: "p",
    text: "People often search for inheritance tax in South Africa. There is no tax by that name. This page explains what there is instead, estate duty, using what SARS publishes. It does not work out what any estate owes.",
  },
  { type: "h2", text: "Is there inheritance tax in South Africa?" },
  {
    type: "p",
    text: "No. Heirs do not pay a tax on what they inherit. The tax is charged on the estate of the person who died, before the heirs receive anything. It is called estate duty, and SARS collects it.",
  },
  { type: "h2", text: "What is estate duty?" },
  {
    type: "p",
    text: "Estate duty is a tax on the dutiable value of a deceased person's estate. The Estate Duty Act sets out which deductions come off the value of the estate first. SARS then allows an abatement before the duty is worked out.",
  },
  { type: "h2", text: "How much is estate duty?" },
  {
    type: "ul",
    items: [
      "**20%** on the first R30 million of the dutiable value of the estate.",
      "**25%** on the dutiable value above R30 million.",
      "An **abatement of R3.5 million** is allowed against the net value of the estate before the duty is worked out.",
    ],
  },
  {
    type: "p",
    text: "In plain words, an estate whose net value, after the deductions the Act allows, is below the abatement pays no estate duty. Whether a particular estate is above or below it depends on what it holds and owes.",
  },
  { type: "h2", text: "Who pays estate duty?" },
  {
    type: "p",
    text: "SARS says it is normally the executor's responsibility to pay the duty levied on the property of the deceased. The executor pays it from the estate, along with the estate's costs and debts, before the heirs inherit.",
  },
  { type: "h2", text: "Is life cover part of an estate?" },
  {
    type: "p",
    text: "It can be. A life policy can be paid into the estate, or directly to a named beneficiary. SARS notes that where a policy is paid directly to a beneficiary, the estate duty attributable to that policy is payable by the beneficiary. So a payout that skips the estate is not always outside estate duty.",
  },
  {
    type: "p",
    text: "How a particular policy is treated depends on its terms and on the Act. That is a question for an authorised adviser, or for the executor once an estate is being wound up.",
  },
  { type: "h2", text: "What does this mean for a will?" },
  {
    type: "p",
    text: "A will says who inherits. It does not pay estate duty or any other cost. [Estate costs, and why a will does not pay them](/wills/estate-costs-and-a-will/) explains what is paid before heirs inherit, and [what estate administration involves](/wills/estate-administration/) describes the executor's steps.",
  },
  { type: "h2", text: "Questions to ask an adviser" },
  {
    type: "ul",
    items: [
      "Is a particular life policy paid into the estate or to a beneficiary, and how is it treated for estate duty?",
      "Would the estate have enough cash for estate duty, costs and debts, without selling property?",
      "Who is named as beneficiary on each policy, and is that still right?",
    ],
  },
  ...WHERE_SORTMYCOVER_FITS,
];
