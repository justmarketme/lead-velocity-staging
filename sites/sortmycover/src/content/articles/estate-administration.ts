import type { Block } from "../types";

/* Built on government and statutory sources (Jono, 18 Oct 2026); see docs/WILLS-ESTATE-SOURCES-2026-10-18.md. */
export const body: Block[] = [
  { type: "p", text: "When someone dies, their estate has to be wound up: what they owned is gathered, what they owed is paid, and the rest goes to the heirs. This is estate administration. This page sets out the steps the Master of the High Court describes." },
  { type: "h2", text: "Who winds up the estate?" },
  { type: "p", text: "The executor. A will names the executor, and the Master issues letters of executorship so that the executor can act. For an estate of R250 000 or less, the Master can issue letters of authority to a Master's representative instead. [Small estates and letters of authority](/wills/small-estates-letters-of-authority/) explains that route." },
  { type: "h2", text: "What are the steps?" },
  { type: "ol", items: [
    "**Report the estate.** The death is reported within 14 days, to the Master for the area where the person lived in the 12 months before death. Anyone holding the will must report the death.",
    "**Lodge the documents.** These include the death notice (J294), the death certificate, an inventory of the assets (J243) and, where there is no will, a next-of-kin affidavit (J192). Original wills are lodged in person.",
    "**Letters of executorship.** The Master issues them to the executor.",
    "**Tell SARS.** SARS asks to be told about the death. The estate is a separate taxpayer from the day after death.",
    "**Gather, value and pay.** The executor collects the assets, has them valued where needed, and pays the debts and costs.",
    "**The liquidation and distribution account.** The executor lodges it with the Master within six months of appointment, and it lies open for inspection.",
    "**Distribution.** The executor pays the heirs within two months after the inspection period.",
  ] },
  { type: "h2", text: "Can it be done online?" },
  { type: "p", text: "In part. Since 10 October 2023, estates can be registered online for the Johannesburg, Durban, Cape Town, Pretoria and Thohoyandou offices of the Master. Original wills are still lodged in person. [How to report a deceased estate](/wills/reporting-a-deceased-estate/) has the checklist." },
  { type: "h2", text: "What does the executor charge?" },
  { type: "p", text: "The Master puts the executor's fee at 3.5% of the gross value of the assets plus 6% of income collected after the death, unless the will sets a different fee. [Estate costs, and why a will does not pay them](/wills/estate-costs-and-a-will/) lists the other costs." },
  { type: "h2", text: "How long does it take?" },
  { type: "p", text: "It depends on the estate. The six-month and two-month periods above are the Master's targets for the account and the distribution. The executor can say what to expect for a particular estate." },
  { type: "h2", text: "Where SortMyCover fits" },
  { type: "p", text: "SortMyCover does not administer estates, draft wills or give advice. It books a call with a will consultant about a will. Questions about a particular estate are for its executor or the Master's office. The Master's helpline is 012 406 4805." },
];
