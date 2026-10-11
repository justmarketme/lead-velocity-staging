import type { Block } from "../types";
import { provider } from "@/lib/site";

const P = provider.name;

export const body: Block[] = [
  {
    type: "p",
    text: `A will is a short document with a big job. This page sets out what it can do, what happens without one, and what it cannot do by itself. The facts come from what ${P}, the will provider SortMyCover introduces people to, publishes about wills.`,
  },
  { type: "h2", text: "What can a will record?" },
  {
    type: "p",
    text: `${P} describes a will as the document that records a person's last wishes. It can name:`,
  },
  {
    type: "ul",
    items: [
      "who inherits what, the heirs;",
      "the executor, the person or firm who deals with the estate after death;",
      "a guardian for minor children;",
      "a testamentary trust, such as a trust for children, and the trustees who run it.",
    ],
  },
  {
    type: "p",
    text: "The guardian and the children's trust have their own page: [guardians and children's trusts](/wills/guardians-and-childrens-trusts/).",
  },
  { type: "h2", text: "What happens if there is no valid will?" },
  {
    type: "p",
    text: `A person who dies without a valid will dies intestate. ${P} explains that the law of intestate succession then decides who inherits, not the person who died. The law sets the order. It does not know about a promise made to a friend, a wish about a particular item, or a preference about who runs the estate.`,
  },
  { type: "h2", text: "Is a will only for people with a lot of assets?" },
  {
    type: "p",
    text: `No. ${P} says a will matters however little or much a person owns. An estate is more than a house or investments. A bank account, a retail account or a phone contract is part of an estate too, and someone has to deal with each of them.`,
  },
  { type: "h2", text: "What can a will not do on its own?" },
  {
    type: "p",
    text: `A will gives instructions. It does not give the estate any cash. ${P} points out that estate costs, debts and taxes are paid before the heirs inherit. If the estate has little cash, those costs still have to be met from somewhere.`,
  },
  {
    type: "p",
    text: `${P} describes life cover as one way to give an estate cash, which it calls liquidity. Whether that suits a particular family is a question for an authorised adviser, not for this page. [Estate costs and a will](/wills/estate-costs-and-a-will/) explains the costs in more detail.`,
  },
  { type: "h2", text: "Does a will stay right forever?" },
  {
    type: "p",
    text: `A will reflects one moment. Marriage, divorce, a new child or a new property can change what a person wants it to say. ${P} says it does not charge to update a will it drafted, and that updates can be made as often as they are wanted.`,
  },
  { type: "h2", text: "Where does SortMyCover fit in?" },
  {
    type: "p",
    text: `SortMyCover does not draft wills and gives no advice. It books a call with a ${P} consultant, who talks you through the will and drafts it. [What happens at the will appointment](/wills/the-will-appointment/) describes that call, and [where a will is kept](/wills/where-to-keep-a-will/) covers what happens to the signed original.`,
  },
];
