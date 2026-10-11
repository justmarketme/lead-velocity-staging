import type { Block } from "../types";
import { provider } from "@/lib/site";

const P = provider.name;

export const body: Block[] = [
  {
    type: "p",
    text: `When someone dies, their estate has to be wound up: what they owned is gathered, what they owed is paid, and the rest goes to the heirs. This is called estate administration. This page lists the steps as ${P} describes them. It does not give timeframes, because those differ from estate to estate.`,
  },
  { type: "h2", text: "Who does the work?" },
  {
    type: "p",
    text: `The executor. A will names the executor, the person or firm who winds up the estate. ${P} says it administers deceased estates in-house, and that it can act as executor through its own executor and trust company.`,
  },
  { type: "h2", text: "What are the steps?" },
  {
    type: "p",
    text: `${P} lists these stages:`,
  },
  {
    type: "ol",
    items: [
      "**Reporting the estate** to start the administration.",
      "**Letters of Executorship** for the executor.",
      "**The liquidation and distribution account**, often called the L&D account: the account of how the estate is wound up and shared out.",
      "**A 21-day inspection period.** The account is open for inspection for 21 days.",
      "**Distribution.** What is left after the estate's costs and debts goes to the heirs.",
      "**The filing slip**, the last stage on the list.",
    ],
  },
  { type: "h2", text: "Why are costs and debts paid first?" },
  {
    type: "p",
    text: `${P} explains that estate costs, debts and taxes are paid before the heirs inherit. The heirs receive what is left. [Estate costs, and why a will does not pay them](/wills/estate-costs-and-a-will/) covers this in more detail.`,
  },
  { type: "h2", text: "What does a will change?" },
  {
    type: "p",
    text: `A will decides who inherits and who acts as executor. Without a valid will, ${P} explains, the law of intestate succession decides who inherits. [What a will does, and what it does not do](/wills/what-a-will-does/) explains the difference.`,
  },
  { type: "h2", text: "Who looks after money left to children?" },
  {
    type: "p",
    text: `A will can set up a testamentary trust, such as a children's trust, and name the trustees who run it. ${P} describes a children's trust as one that holds a minor child's inheritance until an age the will sets. [Guardians and children's trusts](/wills/guardians-and-childrens-trusts/) explains more.`,
  },
  { type: "h2", text: "How long does it take?" },
  {
    type: "p",
    text: `It depends on the estate. ${P}'s own pages give different targets in different places, so this page does not quote one. The executor can say what to expect for a particular estate.`,
  },
  { type: "h2", text: "Where does SortMyCover fit in?" },
  {
    type: "p",
    text: `SortMyCover does not administer estates, draft wills or give advice. It books a call with a ${P} consultant about a will. Questions about a particular estate are for the executor or ${P} directly.`,
  },
];
