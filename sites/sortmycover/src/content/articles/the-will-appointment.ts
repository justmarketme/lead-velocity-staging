import type { Block } from "../types";
import { provider } from "@/lib/site";

const P = provider.name;

export const body: Block[] = [
  {
    type: "p",
    text: `This page describes the will call you can book through SortMyCover, from the booking to the signed will. SortMyCover books the time. ${P} runs the appointment and drafts the will.`,
  },
  { type: "h2", text: "Who will I speak to?" },
  {
    type: "p",
    text: `A consultant from ${provider.legal_name}, which says it is ${provider.status}. ${P} calls its consultants consultants or Private Estate Specialists. You get the consultant's name on WhatsApp before the call.`,
  },
  { type: "h2", text: "How does the appointment happen?" },
  {
    type: "p",
    text: `${P} says its appointments can be in person, by phone or online. SortMyCover books a 30-minute slot, by video, WhatsApp or phone, at a time you pick. The 30 minutes is SortMyCover's booking format; ${P} does not publish a fixed length for its appointments.`,
  },
  { type: "h2", text: "What is talked about?" },
  {
    type: "p",
    text: "The consultant goes through what you want the will to say. It can help to think about these before the call:",
  },
  {
    type: "ul",
    items: [
      "who you want to inherit, and anything you want to leave to a particular person;",
      "who you want as executor;",
      "for parents of minor children, who you want as guardian, and whether you want a trust to hold a child's inheritance until a certain age;",
      "any existing will, so the consultant knows what it says.",
    ],
  },
  {
    type: "p",
    text: "[Guardians and children's trusts](/wills/guardians-and-childrens-trusts/) explains those two choices.",
  },
  { type: "h2", text: "When is the will valid?" },
  {
    type: "p",
    text: `${P} explains that its consultant finalises the will with the client at the appointment. A draft on its own, including one started online, is not a valid will. It becomes valid once it is finalised, signed and witnessed.`,
  },
  { type: "h2", text: "What does it cost?" },
  {
    type: "p",
    text: `The call costs you nothing. ${P} says it does not charge to draft, update, store or retrieve a will. It also offers optional cover for the costs of winding up an estate, at a monthly cost, and its consultant explains the terms. You decide afterwards.`,
  },
  { type: "h2", text: "What happens after the call?" },
  {
    type: "p",
    text: `${P} says it collects the signed will by courier and keeps it in a vault, and gives you a copy. [Where a will is kept](/wills/where-to-keep-a-will/) has the detail. Reply STOP to any SortMyCover message and we stop.`,
  },
  { type: "h2", text: "Does SortMyCover give advice on the call?" },
  {
    type: "p",
    text: "No. SortMyCover is not a financial services provider. It does not draft wills, does not join the call and gives no advice. It puts you in touch with the consultant and books the time.",
  },
];
