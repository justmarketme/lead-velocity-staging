import type { Block } from "../types";
import { provider } from "@/lib/site";

const P = provider.name;

export const body: Block[] = [
  {
    type: "p",
    text: `For parents of young children, one question often comes first: who would look after the children? This page explains the two things a will can do for minor children, using what ${P} publishes. The choices are personal, and this page makes no suggestion about them.`,
  },
  { type: "h2", text: "What is a guardian in a will?" },
  {
    type: "p",
    text: `${P} explains that a will can name a guardian for minor children: the person the parent wants to look after them. Naming someone in the will records the parent's wish in writing, in the same document that deals with the rest of the estate.`,
  },
  {
    type: "p",
    text: "Some things parents often think about before the appointment:",
  },
  {
    type: "ul",
    items: [
      "Who would they want to raise the children, and has that person agreed?",
      "Is there a second choice if the first person cannot do it?",
      "Is the person who looks after the children also the person they want to look after the money, or would they prefer someone else?",
    ],
  },
  { type: "h2", text: "What is a children's trust?" },
  {
    type: "p",
    text: `A children's trust is a kind of testamentary trust, which means a trust created by a will. ${P} describes it as a trust that holds a minor child's inheritance until an age the will sets. The will also names the trustees, the people or firm who run the trust and look after the money until then.`,
  },
  { type: "h2", text: "Does the inheritance have to be paid out at 18?" },
  {
    type: "p",
    text: `No. ${P} points out that the age set in the will does not have to be 18 or 21. The parent chooses the age when the child receives the inheritance, and records it in the will.`,
  },
  { type: "h2", text: "Why are the guardian and the trustees separate roles?" },
  {
    type: "p",
    text: "They are two different jobs. A guardian looks after the child. Trustees look after the money held for the child, under the terms of the trust. A will can give both jobs to the same person or to different people. Which suits a family is a personal choice, and the consultant at the will appointment can explain how each option works.",
  },
  { type: "h2", text: "What happens if the will says nothing about the children?" },
  {
    type: "p",
    text: `If there is no valid will at all, ${P} explains that the law of intestate succession decides who inherits. The law does not record a parent's choice of guardian or set up a trust with the parent's chosen age. [What a will does, and what it does not do](/wills/what-a-will-does/) covers this in more detail.`,
  },
  { type: "h2", text: "What happens next?" },
  {
    type: "p",
    text: `SortMyCover does not draft wills and gives no advice. It books a call with a ${P} consultant, who explains these choices and drafts the will. [What happens at the will appointment](/wills/the-will-appointment/) describes that call step by step.`,
  },
];
