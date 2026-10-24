import type { Block } from "../types";

export const body: Block[] = [
  {
    type: "p",
    text: "The Financial Sector Conduct Authority (FSCA) keeps a public list of authorised financial services providers. Anyone can search it. The register is run by the FSCA, not by SortMyCover. The page below takes you through a search in six steps.",
  },
  { type: "h2", text: "What should I have ready before I start?" },
  {
    type: "p",
    text: "Ask the adviser for four details: their full name, their firm's name, the firm's FSP number and their own status at the firm. A real adviser gives these on request. SortMyCover also passes on the adviser's name and FSP number when it introduces you.",
  },
  { type: "h2", text: "How do I search the register?" },
  {
    type: "ol",
    items: [
      "Open the search form: [FSCA public register search](https://www.fsca.co.za/FSB-Search/). It is a form, so you type in what you know and it returns a result.",
      "Search by the FSP number if you have it. A number is more exact than a name, because several firms can have similar names.",
      "If you only have a name, search by the firm's name first, then by the person.",
      "Open the entry that matches. Read the name, the FSP number and the status shown.",
      "Compare each detail with what the adviser told you.",
      "If a detail differs or you cannot find the entry, ask the adviser to explain before you share anything more.",
    ],
  },
  {
    type: "p",
    text: "The form and its labels may change over time. The ideas below stay the same.",
  },
  { type: "h2", text: "What should the details match?" },
  {
    type: "ul",
    items: [
      "**Name:** the firm name and the person's name match what you were given.",
      "**FSP number:** the number on the register is the number the adviser gave you.",
      "**Authorised categories or products:** the entry lists the kinds of financial product the firm is authorised to advise on or sell. Look for the kind you are asking about, such as life insurance.",
      "**Status:** the entry shows the firm as authorised, not suspended or withdrawn.",
      "**Representative or key individual:** the person appears in one of these roles at the firm.",
    ],
  },
  { type: "h2", text: "What is the difference between an FSP and a representative?" },
  {
    type: "p",
    text: "A financial services provider, or FSP, is the business or sole trader that holds the authorisation. Its FSP number identifies it.",
  },
  {
    type: "p",
    text: "A representative is an individual who gives advice or other services on behalf of an FSP. A representative works under the firm's authorisation and is listed against it.",
  },
  {
    type: "p",
    text: "A key individual is a person approved to manage and oversee the FSP's financial services activities. A small firm often has one person who is both a key individual and a representative.",
  },
  { type: "h2", text: "What does being on the register tell me?" },
  {
    type: "p",
    text: "It tells you the firm holds an authorisation and for which product categories. It does not tell you whether a particular piece of advice is suitable. It also does not rate the adviser. Those are separate questions.",
  },
  { type: "h2", text: "Does SortMyCover appear on the register?" },
  {
    type: "p",
    text: "No. SortMyCover is a service of Lead Velocity (Pty) Ltd. It is not a financial services provider and does not give advice. The register is for the adviser you are introduced to.",
  },
  { type: "h2", text: "What if the details do not match?" },
  {
    type: "p",
    text: "Ask the adviser first, because a typing error is a common reason. If you are still unsure, stop and do not share personal details. The FSCA is the body to ask about the register. If you have a complaint, [how to complain](/learn/how-to-complain/) lists the routes. You can also read [what happens on the 30-minute call](/learn/what-happens-on-a-30-minute-call/) to see when the adviser shares these details.",
  },
];
