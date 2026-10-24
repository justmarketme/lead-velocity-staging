import type { Block } from "../types";

/* Built on government and statutory sources (Jono, 18 Oct 2026); see docs/WILLS-ESTATE-SOURCES-2026-10-18.md. */
export const body: Block[] = [
  { type: "p", text: "When someone dies without a valid will, they die intestate. The Intestate Succession Act then decides who inherits, not the person who died. This page sets out the order using the guidance of the Master of the High Court, with examples." },
  { type: "h2", text: "The order of heirs" },
  { type: "ol", items: [
    "**A spouse and descendants:** children, and the children of a child who has died.",
    "**Parents**, if there is no spouse or descendant.",
    "**Brothers and sisters**, if there are no parents.",
    "**Other blood relatives**, nearest first.",
    "**The state**, only if there are no relatives at all.",
  ] },
  { type: "h2", text: "A spouse and children: the R250 000 rule" },
  { type: "p", text: "Where there is a spouse and there are children, the spouse inherits a child's share or R250 000, whichever is greater, and the children share the rest. The amount was fixed at R250 000 by a government notice in November 2014." },
  { type: "p", text: "The Master gives an example: an estate of R2 000 000, one spouse and three children. A child's share is R500 000, more than R250 000, so the spouse and each child receive R500 000." },
  { type: "p", text: "Where there is a spouse and no descendants, the spouse inherits the estate. Where there are descendants and no spouse, the descendants share it." },
  { type: "h2", text: "Married in community of property" },
  { type: "p", text: "In a marriage in community of property, the surviving spouse already owns half of the joint estate. Only the half that belonged to the person who died is inherited under these rules." },
  { type: "h2", text: "More than one spouse" },
  { type: "p", text: "Where a person had more than one spouse, each spouse is entitled to at least R250 000 where the estate allows. If the estate cannot cover that, the spouses share it equally and the descendants receive nothing from it. A customary marriage is proved with a registration certificate from Home Affairs." },
  { type: "h2", text: "Who counts as a spouse or a child?" },
  { type: "p", text: "The Master's guidance includes spouses in Muslim and Hindu marriages, and adopted children." },
  { type: "h2", text: "How a will changes this" },
  { type: "p", text: "The law follows family relationships. A will lets a person choose their heirs, name an executor and, for a sole guardian, appoint a guardian for minor children. [What a will does](/wills/what-a-will-does/) explains more." },
  { type: "h2", text: "Where SortMyCover fits" },
  { type: "p", text: "SortMyCover does not draft wills and gives no advice. It books a call with a will consultant. Lindi sends the consultant's name and firm on WhatsApp before the call. For a particular estate, the Master's helpline is 012 406 4805." },
];
