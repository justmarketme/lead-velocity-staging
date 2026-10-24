import type { Block } from "../types";

/* Built on government and statutory sources (Jono, 18 Oct 2026); see docs/WILLS-ESTATE-SOURCES-2026-10-18.md. */
export const body: Block[] = [
  { type: "p", text: "A will is a short document with a big job. This page sets out what it can record, what happens without one, and what it cannot do by itself. The facts come from the Master of the High Court and the Acts that govern wills, listed under Sources." },
  { type: "h2", text: "What can a will record?" },
  { type: "p", text: "A will is the written record of a person's wishes for after their death. It can name:" },
  { type: "ul", items: [
    "**The heirs:** who inherits what.",
    "**The executor:** the person or firm who winds up the estate. The Master says the executor's fee is 3.5% unless the will sets a different fee.",
    "**A guardian for minor children.** Under section 27 of the Children's Act, a parent who is the sole guardian can appoint a guardian for a child, and that appointment must be in a will.",
    "**An age for a child's inheritance.** The Master's Guardian's Fund pays a child at 18, or at another age set in the will.",
  ] },
  { type: "h2", text: "Who can make a will?" },
  { type: "p", text: "The Master says a person of 16 or older who is mentally capable can make a will, and that witnesses must be 14 or older. [What makes a will valid](/wills/what-makes-a-will-valid/) covers signing and witnessing." },
  { type: "h2", text: "What happens without a valid will?" },
  { type: "p", text: "A person who dies without a valid will dies intestate. The Intestate Succession Act then decides who inherits, in a set order: a spouse and children first, then parents, then brothers and sisters, then other blood relatives. The law follows family relationships. It does not record personal wishes, such as leaving something to a friend. [Dying without a will: who inherits](/wills/intestate-succession/) works through examples." },
  { type: "h2", text: "Does a will pay for anything?" },
  { type: "p", text: "No. A will gives instructions. It does not give the estate any cash. The executor settles the estate's costs and debts first, through the liquidation and distribution account, and the heirs receive what is left. The Master says the executor lodges that account within six months of being appointed. [Estate costs, and why a will does not pay them](/wills/estate-costs-and-a-will/) explains the costs." },
  { type: "h2", text: "When does a will need updating?" },
  { type: "p", text: "A will reflects one moment. Marriage, divorce, a new child or a new property can change what a person wants it to say. The Master notes one rule about divorce: if a person dies within three months of a divorce, a gift to the former spouse in the will is treated as revoked." },
  { type: "h2", text: "Where SortMyCover fits" },
  { type: "p", text: "SortMyCover does not draft wills and gives no advice. It books a call with a will consultant. Lindi sends the consultant's name and firm on WhatsApp before the call. [What happens at the will appointment](/wills/the-will-appointment/) describes the call." },
];
