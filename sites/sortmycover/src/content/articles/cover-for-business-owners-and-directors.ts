import type { Block } from "../types";
import { ON_THE_CALL, SERIES_LINKS } from "../learn-shared";

/* Sources: config/evidence.json (see meta). Business-owned cover is mentioned once, generically: no product names (angles-final A5).
   The UIF point about sole owners rests on a 2019 government guide (vuk-uif-2019) and is phrased as such; directors paid through
   payroll are left as a question. */
export const body: Block[] = [
  {
    type: "p",
    text: "In many businesses, one person keeps everything moving: the clients, the staff, the cash flow. When the business depends on one person, the household often depends on that same person too.",
  },
  {
    type: "p",
    text: "Employees often have some cover through work without thinking about it. Owners, directors and the self-employed usually do not get it the same way. This page explains what group cover is, what happens when someone leaves it, and which questions an owner can take to an authorised adviser. It is information, not advice: SortMyCover is not a financial services provider.",
  },
  { type: "h2", text: "What employees usually get through work" },
  {
    type: "p",
    text: "ASISA, the industry body for life insurers, describes group cover on its consumer site. An employer may offer life and disability cover as part of a group scheme. Some schemes add severe illness cover. Some employers offer income protection instead of a lump-sum disability benefit. This often sits alongside membership of a retirement fund.",
  },
  {
    type: "p",
    text: "Group cover is part of the job. It belongs to the employer's scheme, and the member is in the scheme because they work there.",
  },
  { type: "h2", text: "What happens when someone leaves a job to run a business" },
  {
    type: "p",
    text: "ASISA notes that someone who is retrenched, changes jobs or starts working for themselves may end up with lesser or no group benefits.",
  },
  {
    type: "p",
    text: "Some group schemes have a **conversion option** (also called a continuation option). It lets a member turn their group cover into a personal policy when they leave. ASISA says:",
  },
  {
    type: "ul",
    items: [
      "there is usually up to 60 days after leaving to take it up;",
      "the scheme's trustees or the employer have to agree;",
      "the new policy is priced for the person's age when they convert;",
      "it can be valuable for someone who leaves employment to start a business.",
    ],
  },
  {
    type: "p",
    text: "Whether a scheme has this option is set out in its rules. HR or the scheme's administrator can say. [How to read your payslip's cover line](/learn/how-to-read-your-payslips-cover-line/) explains where those terms are kept.",
  },
  { type: "h2", text: "Owners and directors: no scheme unless someone sets one up" },
  {
    type: "p",
    text: "A business owner is not part of a group scheme unless the business has one and its rules include them. For a sole proprietor or a one-person company, personal policies are usually the main route to cover.",
  },
  { type: "p", text: "The same three types of cover apply as for anyone else:" },
  {
    type: "ul",
    items: [
      "**Life cover** pays a benefit when the insured person dies.",
      "**Disability cover** pays a lump sum once a disability is shown to be permanent, or a monthly income benefit.",
      "**Income protection** pays a monthly amount based on what the person earns now.",
    ],
  },
  {
    type: "p",
    text: "For an owner, \"what the person earns\" can be harder to pin down than for an employee with a payslip. How an insurer measures an owner's earnings, and which documents it asks for, is set by each policy. That is a question for an authorised adviser.",
  },
  {
    type: "p",
    text: "[Income protection vs disability cover](/learn/income-protection-vs-disability-cover/) explains how the three types differ.",
  },
  { type: "h2", text: "What about UIF?" },
  {
    type: "p",
    text: "The Unemployment Insurance Fund pays some benefits to workers. The government's services page says UIF illness benefits are for **employed contributors** who cannot work because of illness.",
  },
  {
    type: "p",
    text: "A government guide published in May 2019 lists sole owners of a business among the workers who do not have to pay UIF. A director who is paid through the company's payroll may be in a different position. The Department of Employment and Labour, or an accountant, can confirm which applies.",
  },
  { type: "h2", text: "Two sets of paperwork: the household and the business" },
  { type: "p", text: "An owner often has two sets of questions." },
  {
    type: "p",
    text: "**The household.** What would carry on if the owner's income stopped: the bond or rent, school fees, daily costs, other debts. [Life cover and a home loan](/learn/life-cover-and-a-home-loan/) looks at the bond on its own.",
  },
  {
    type: "p",
    text: "**The business.** Who would run it, pay the staff and deal with suppliers. Some cover is owned by a business rather than by a person. It has its own terms, its own tax treatment and its own rules about who is paid. An authorised adviser can explain how this works.",
  },
  {
    type: "p",
    text: "The two sets meet in one place: the estate. A business interest can form part of the owner's estate. Capital Legacy, a will and estate provider, says estate costs, debts and taxes are paid before heirs inherit, and that a will gives instructions but no cash. It describes life cover as one way to give an estate cash. [What a will does](/wills/what-a-will-does/) explains the will itself.",
  },
  {
    type: "p",
    text: "SortMyCover can also book a separate call with a Capital Legacy consultant about a will. Capital Legacy Solutions (Pty) Ltd is an authorised FSP (FSP 43826 on the FSCA register).",
  },
  { type: "h2", text: "Questions an owner can take to an authorised adviser" },
  {
    type: "ul",
    items: [
      "Did my last job's group cover have a conversion option, and has the window passed?",
      "Does the business have a group scheme, and do its rules include the owners?",
      "How would an insurer measure my earnings for income protection?",
      "What is the difference between cover I own and cover the business owns?",
      "How is tax handled for each kind of cover and its payouts?",
      "How does my cover fit with my will and my business partners, if any?",
      "How are you paid, and does that change if I choose a product?",
    ],
  },
  {
    type: "p",
    text: "Before any form is signed, two facts help. Insurers ask health questions, and a condition that is not disclosed can lead to a claim being rejected. And an adviser's FSP number can be looked up on the FSCA register. [How to check an adviser](/learn/how-to-check-an-adviser/) shows the steps, and [questions to ask a financial adviser](/learn/questions-to-ask-a-financial-adviser/) lists what the adviser must tell you.",
  },
  ...ON_THE_CALL("the different kinds of cover, for the household and the business,"),
  ...SERIES_LINKS("cover-for-business-owners-and-directors"),
];
