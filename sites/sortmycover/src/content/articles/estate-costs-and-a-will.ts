import type { Block } from "../types";
import { provider } from "@/lib/site";

const P = provider.name;

export const body: Block[] = [
  {
    type: "p",
    text: `People often think of a will and money as the same thing. They are not. This page explains the difference, using what ${P} publishes. It gives no amounts and makes no recommendation.`,
  },
  { type: "h2", text: "What does a will do with money?" },
  {
    type: "p",
    text: `A will gives instructions. It says who inherits and who deals with the estate. It does not add any cash to the estate. ${P} makes this point directly: a will gives instructions but no cash.`,
  },
  { type: "h2", text: "What is paid before the heirs inherit?" },
  {
    type: "p",
    text: `${P} explains that estate costs, debts and taxes are paid before the heirs inherit. In plain words, the estate settles what it owes first, and the heirs receive what is left. The costs it lists for its own estate-costs cover include:`,
  },
  {
    type: "ul",
    items: [
      "executor fees, for the person or firm who winds up the estate;",
      "testamentary trust fees, where the will sets up a trust;",
      "conveyancing fees, where property is transferred;",
      "other costs of winding up an estate.",
    ],
  },
  {
    type: "p",
    text: `Debts count too. ${P} notes that even a bank account, a retail account or a phone contract is part of an estate, so even a small estate has accounts to settle.`,
  },
  { type: "h2", text: "What happens when an estate has little cash?" },
  {
    type: "p",
    text: "The costs and debts still have to be paid before anything is passed on. Where the cash is not there, the estate has to find it some other way. How that works for a particular estate depends on what it holds and what it owes.",
  },
  { type: "h2", text: "How can an estate have cash?" },
  {
    type: "p",
    text: `${P} describes life cover as one way to give an estate cash, which it calls liquidity. It also offers its own optional cover, linked to the will, for estate costs such as the fees above. That cover is paid for monthly, its terms and conditions apply, and ${P} says quotes are subject to medicals. Its consultant explains the terms.`,
  },
  {
    type: "p",
    text: "Whether any cover suits a particular person is advice, and SortMyCover does not give advice. [Life cover, in plain words](/cover/life-cover/) explains what life cover is and is not.",
  },
  { type: "h2", text: "Does it cost anything to draft the will itself?" },
  {
    type: "p",
    text: `${P} says it does not charge to draft, update, store or retrieve a will. The optional estate-costs cover is separate and is paid for.`,
  },
  { type: "h2", text: "Where can I read about winding up an estate?" },
  {
    type: "p",
    text: "[What estate administration involves](/wills/estate-administration/) lists the steps an executor follows, including the account that shows what an estate held, what it paid and what it passes on.",
  },
];
