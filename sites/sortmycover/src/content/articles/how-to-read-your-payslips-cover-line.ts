import type { Block } from "../types";

export const body: Block[] = [
  {
    type: "p",
    text: "A payslip is a short document. A cover line on it is a label, and a label is only a starting point. This page explains the words you may see and where to find the full terms.",
  },
  { type: "h2", text: "Where does a cover line show up?" },
  {
    type: "p",
    text: "Not every payslip shows one. Some employers deduct a contribution for the cover and print it on the payslip. Others pay for the cover themselves, so the payslip shows nothing at all.",
  },
  {
    type: "p",
    text: "The benefits statement is usually the fuller place to look. Many employers or benefit administrators issue one each year. Some keep it on an employee portal.",
  },
  { type: "h2", text: "What do the common labels usually mean?" },
  {
    type: "p",
    text: "Employers and administrators use different words for similar things. These are typical meanings:",
  },
  {
    type: "ul",
    items: [
      "**Group life or death benefit:** a lump sum paid to the people named if a member dies while still in the employer's scheme.",
      "**Disability benefit:** a payment if a member cannot work because of illness or injury. Whether it is a lump sum or a regular payment depends on the scheme.",
      "**Funeral benefit:** a sum towards funeral costs. Some schemes cover the member only. Others include family members.",
      "**Risk benefit:** a general label. It can stand for some or all of the above.",
    ],
  },
  {
    type: "p",
    text: "A label tells you the kind of benefit. It does not tell you the amount, the conditions or who is named.",
  },
  { type: "h2", text: "Why is work cover tied to the employer?" },
  {
    type: "p",
    text: "Group cover is arranged by the employer for a group of staff under one scheme. The member belongs to the scheme because of the job. This is why group life cover is usually tied to the employer and normally ends when the job ends.",
  },
  {
    type: "p",
    text: "The scheme rules say whether anything can be continued after the job ends. That is a question for HR or the benefit administrator.",
  },
  { type: "h2", text: "Where are the real terms?" },
  {
    type: "p",
    text: "The real terms are in the scheme rules and in the benefits statement. They set out how the amount is worked out, who can be named, what is left out and how a claim is made. A payslip does not carry any of that.",
  },
  {
    type: "p",
    text: "Questions that are worth putting to HR or the benefit administrator:",
  },
  {
    type: "ol",
    items: [
      "What exactly does this line stand for?",
      "How is the amount worked out?",
      "Who is named as the beneficiary, and how do I change that?",
      "Is there a waiting period, or anything the cover does not pay for?",
      "What happens to the cover when the job ends?",
      "Can I get a copy of the scheme rules?",
    ],
  },
  { type: "h2", text: "What if there is no cover line at all?" },
  {
    type: "p",
    text: "A payslip with no cover line does not tell you whether cover exists. The employer may pay for it without showing it, or there may be none. HR can confirm which.",
  },
  { type: "h2", text: "Who can explain what this means for one person?" },
  {
    type: "p",
    text: "SortMyCover does not give advice and does not explain products. Advice about a particular person's cover comes from an authorised financial services provider. If you want to speak to one, [how to check an adviser](/learn/how-to-check-an-adviser/) shows how to confirm an adviser is on the FSCA register.",
  },
  {
    type: "p",
    text: "For the idea of comparing work cover with what a household's costs would be, see [what a life cover gap is](/learn/what-is-a-life-cover-gap/).",
  },
];
