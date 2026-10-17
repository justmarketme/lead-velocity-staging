import type { Block } from "../types";
import { ON_THE_CALL, SERIES_LINKS } from "../learn-shared";

/* Sources: config/evidence.json (see meta). No rand figure or percentage is published on this page: the draft's "national picture"
   section (ASISA 28 Oct 2025 averages) waits on the practitioner's clearance of Q-G1 (angles-final.md section 5). */
export const body: Block[] = [
  {
    type: "p",
    text: "Some people insure the car before the salary that pays for it. A monthly salary pays for the bond, the school fees and the groceries, yet it rarely has its own page in the household paperwork.",
  },
  {
    type: "p",
    text: "Three kinds of long-term cover are linked to an income: life cover, disability cover and income protection. The names sound alike. They pay out at different times and in different ways. This page sets out what each one is, using the definitions published by ASISA and the FSCA. It is information, not advice: SortMyCover is not a financial services provider.",
  },
  { type: "h2", text: "Life cover: paid on death" },
  {
    type: "p",
    text: "Life cover pays a benefit when the insured person dies. It is usually a lump sum, and sometimes a monthly payment. It goes to the people named on the policy or into the estate.",
  },
  {
    type: "p",
    text: "Life cover does not pay while the policyholder is alive and unable to work. That is the job of the next two types. [Life cover, in plain words](/cover/life-cover/) has more detail.",
  },
  { type: "h2", text: "Disability cover: a lump sum or an income" },
  { type: "p", text: "ASISA's consumer site describes disability cover as paying in one of two ways." },
  {
    type: "ul",
    items: [
      "**A lump sum.** This is paid once. In most cases it pays only when the loss of the ability to work is permanent.",
      "**A monthly income.** This form is usually called income protection. The FSCA says it can pay for temporary or permanent disability. It stops on recovery, on death, or when the policy ends.",
    ],
  },
  { type: "p", text: "Whether a claim pays depends on how the policy defines disability. ASISA lists the common definitions:" },
  {
    type: "ul",
    items: [
      "**Own occupation:** unable to do the person's own job (the widest definition).",
      "**Own or similar occupation:** unable to do that job or a similar one.",
      "**Any occupation:** unable to do any occupation, as the policy defines it.",
      "**Loss of function:** for example, loss of sight or of a limb.",
    ],
  },
  { type: "p", text: "[Disability cover, in plain words](/cover/disability-cover/) goes further." },
  { type: "h2", text: "Income protection: a monthly amount based on earnings" },
  {
    type: "p",
    text: "Income protection pays a monthly amount instead of a lump sum. The amount is based on what the person earns now. ASISA explains a few features that apply to most policies:",
  },
  {
    type: "ul",
    items: [
      "**How long it pays.** Temporary cover usually pays for 6, 12 or 24 months. Other cover can pay up to a retirement age set in the policy. ASISA's page gives ages between 55 and 70.",
      "**The waiting period.** Payments start only after a waiting period. It applies at the start of each claim, not only when the policy starts. The policyholder chooses its length when the policy is set up. Employees often match it to their sick leave.",
      "**The definition.** As with lump-sum cover, the policy wording sets out what counts as being unable to work.",
    ],
  },
  { type: "p", text: "[Income protection, in plain words](/cover/income-protection/) covers the waiting period in more detail." },
  { type: "h2", text: "Where severe illness cover fits" },
  {
    type: "p",
    text: "Severe illness cover is a fourth type. It pays a lump sum on diagnosis of a condition listed in the policy, even if recovery is expected. It is not linked to whether the person can work. [Severe illness cover, in plain words](/cover/severe-illness-cover/) explains how the lists work.",
  },
  { type: "h2", text: "At a glance" },
  {
    type: "ul",
    items: [
      "**Life cover** pays when the insured person dies. Usually a lump sum, paid once.",
      "**Lump-sum disability cover** pays when a disability is permanent, under the policy's definition. A once-off lump sum, paid once.",
      "**Income protection** pays when the person cannot work, under the policy's definition, after the waiting period. Paid monthly, based on earnings, until recovery, death or the end of the benefit term.",
    ],
  },
  { type: "h2", text: "What about cover through work?" },
  {
    type: "p",
    text: "Many employers offer group cover as part of a job. ASISA says this can include life cover and disability cover, and sometimes severe illness cover. Some employers offer income protection instead of a lump-sum disability benefit.",
  },
  {
    type: "p",
    text: "Group cover belongs to the employer's scheme. When someone leaves the job, the cover through that scheme usually ends. Some schemes have a **conversion option**. This lets a member turn group cover into a personal policy when they leave. ASISA says there is usually up to 60 days after leaving to do this, and the trustees or the employer have to agree to it. [Cover for business owners and directors](/learn/cover-for-business-owners-and-directors/) looks at what changes when there is no employer at all.",
  },
  {
    type: "p",
    text: "The benefits statement and the scheme rules show what a particular scheme includes. HR can share them. [How to read your payslip's cover line](/learn/how-to-read-your-payslips-cover-line/) explains where to look.",
  },
  { type: "h2", text: "Questions a household can take to an authorised adviser" },
  { type: "p", text: "ASISA suggests questions like these about group cover. They work for personal policies too." },
  {
    type: "ul",
    items: [
      "Is the disability benefit a lump sum or a monthly income?",
      "When does the monthly income stop?",
      "What is the waiting period, and does it match the sick leave?",
      "Is temporary disability covered, or only permanent disability?",
      "Which definition of disability applies?",
      "What is excluded?",
      "How is tax handled on the cover and on any payout?",
      "What happens to work cover if the job ends?",
    ],
  },
  {
    type: "p",
    text: "Two more facts help before any form is signed. Insurers ask health questions before they offer cover, and a condition that is not disclosed can lead to a claim being rejected. And under the Policyholder Protection Rules, a new policy can usually be cancelled within 31 days, subject to conditions. [Questions to ask a financial adviser](/learn/questions-to-ask-a-financial-adviser/) lists what an adviser must tell you.",
  },
  ...ON_THE_CALL("life, disability and income cover"),
  ...SERIES_LINKS("income-protection-vs-disability-cover"),
];
