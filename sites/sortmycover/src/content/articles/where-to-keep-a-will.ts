import type { Block } from "../types";
import { provider } from "@/lib/site";

const P = provider.name;

export const body: Block[] = [
  {
    type: "p",
    text: `A will only helps if the signed original can be found when it matters. This page describes what ${P}, the will provider SortMyCover introduces people to, says happens to a will after it is signed.`,
  },
  { type: "h2", text: "What happens to the signed original?" },
  {
    type: "p",
    text: `${P} says it collects a client's signed will by courier, at no charge. It then keeps the original in a vault that it describes as fire- and water-resistant.`,
  },
  { type: "h2", text: "Do I keep a copy?" },
  {
    type: "p",
    text: `Yes. ${P} says it gives the client a copy of the will. The copy shows what the will says. The original is the signed document that is kept in the vault.`,
  },
  { type: "h2", text: "What does storage cost?" },
  {
    type: "p",
    text: `${P} says it does not charge to store or retrieve a will it drafted. It also says it does not charge to draft or update one.`,
  },
  { type: "h2", text: "Can the will be changed later?" },
  {
    type: "p",
    text: `Yes. Life changes, and a will can change with it. ${P} says updates can be made as often as they are wanted, at no charge.`,
  },
  { type: "h2", text: "Who knows where the will is?" },
  {
    type: "p",
    text: "That is a personal choice. Some people tell the executor, a partner or an adult child that a will exists and who holds it. Telling someone where the will is does not mean telling them what it says.",
  },
  { type: "h2", text: "What happens to the will after a death?" },
  {
    type: "p",
    text: `Once someone dies, their estate is wound up. ${P} lists reporting the estate as the first stage of that process, and says it administers deceased estates in-house and can act as executor. [What estate administration involves](/wills/estate-administration/) lists every stage.`,
  },
  { type: "h2", text: "Questions people ask about storage" },
  {
    type: "p",
    text: `These are useful questions to put to the ${P} consultant at the appointment:`,
  },
  {
    type: "ul",
    items: [
      "Where is the original kept, and how is it collected after signing?",
      "When will I receive my copy, and in what form?",
      "How do my family or executor ask for the original when the time comes?",
      "How do I update the will, and what happens to the old version?",
    ],
  },
  { type: "h2", text: "Where does SortMyCover fit in?" },
  {
    type: "p",
    text: `SortMyCover does not draft or store wills and gives no advice. It books a call with a ${P} consultant. [What happens at the will appointment](/wills/the-will-appointment/) describes that call, and [what estate administration involves](/wills/estate-administration/) covers what happens to an estate after death.`,
  },
];
