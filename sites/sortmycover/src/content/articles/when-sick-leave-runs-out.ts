import type { Block } from "../types";
import { ON_THE_CALL } from "../learn-shared";

/* Sources: config/evidence.json bcea-sick-leave (s22-23, read in the gov.za Act PDF on 24 Oct 2026), labour-sick-leave-guide,
   govza-uif-illness, vuk-uif-2019, sam-what-is-group-life, sam-income-protection-waiting, sam-what-is-income-protection,
   fsca-disability-cover, sam-disability-pay-out. "30 days" is six weeks of a five-day week (computed from s22(2)); no rand figure
   is given for any UIF or policy benefit. */
export const body: Block[] = [
  {
    type: "p",
    text: "A long illness has a timeline, and the money follows it. On day one the employer pays. Some weeks later the paid sick days are used up. Months later, if the person is still off, the household is living on whatever was arranged before anyone got sick. This page walks through that timeline using three documents: the Basic Conditions of Employment Act, the Unemployment Insurance Fund's rules, and ASISA's plain-language description of income protection.",
  },
  {
    type: "p",
    text: "It is information, not advice, and it gives no rand figures for any person. SortMyCover is not a financial services provider.",
  },
  { type: "h2", text: "Day 1: paid sick leave under the BCEA" },
  {
    type: "p",
    text: "Section 22 of the Basic Conditions of Employment Act works in cycles. A **sick leave cycle** is 36 months of employment with the same employer. In every cycle an employee is entitled to paid sick leave equal to the number of days they would normally work in six weeks. For someone who works five days a week, that is **30 days** of paid sick leave in three years. For a six-day week it is 36 days.",
  },
  {
    type: "p",
    text: "The first six months of a job are different. During that period an employee earns one day of paid sick leave for every 26 days worked. The employer may deduct the days taken in those six months from the first cycle's entitlement.",
  },
  {
    type: "p",
    text: "Section 23 covers proof. An employer is not required to pay for sick leave if the employee has been absent for more than two consecutive days, or more than twice in eight weeks, and does not produce a medical certificate on request. The certificate has to come from a practitioner who may issue one. A contract or collective agreement can give more than the Act does; the Act is the floor.",
  },
  { type: "h2", text: "When the paid days are used up" },
  {
    type: "p",
    text: "The Act sets a floor for paid sick leave. It does not require an employer to keep paying once the cycle's days are finished. What happens next depends on the contract, the company's own policy and what the employer agrees to: unpaid leave, annual leave taken by agreement, or an employer scheme.",
  },
  { type: "h2", text: "UIF illness benefits" },
  {
    type: "p",
    text: "The government's service page says UIF illness benefits are for an employed contributor to the Unemployment Insurance Fund who is unable to work because of illness, and who is receiving less than their normal wages while on sick leave.",
  },
  {
    type: "p",
    text: "The government's own guide to the UIF, published by GCIS, adds the working rules. Illness benefits are only payable for an illness that lasts longer than seven days, a medical certificate must be submitted, and the claim has to be made within 12 months of being unable to work. The guide describes the Fund's benefit scale as between **38% and 60%** of salary, with lower earners at the higher end of the scale. Credits are built up at one day for every four days worked, and benefits run only as long as the credits last. The percentage, the credit days and the Fund's salary ceiling decide the amount, so this page gives no rand figure for any salary.",
  },
  {
    type: "p",
    text: "UIF is for people who contribute. The guide lists workers who do not pay UIF, including sole owners of a business and people who earn commission only. Someone who works for themselves is usually outside the Fund, which is why [cover for business owners and directors](/learn/cover-for-business-owners-and-directors/) is a separate guide.",
  },
  { type: "h2", text: "Where work cover fits" },
  {
    type: "p",
    text: "ASISA says an employer may offer life and disability cover as part of a group scheme, and that some employers offer income protection instead of a lump-sum disability benefit. Whether a particular scheme pays anything during a long illness, after what waiting period, and for how long, is in the benefits statement and the scheme rules. HR can share them. [How to read your payslip's cover line](/learn/how-to-read-your-payslips-cover-line/) shows where to look.",
  },
  { type: "h2", text: "Income protection: the waiting period explained" },
  {
    type: "p",
    text: "Income protection pays a monthly amount, based on the person's earnings, when they cannot work because of illness or injury as the policy defines it. ASISA's consumer site explains the feature that matters most on this timeline, the **waiting period**:",
  },
  {
    type: "ul",
    items: [
      "It runs from the start of each claim, not only from the start of the policy, and it applies to every claim.",
      "The policyholder chooses its length when the policy is set up. Employees often match it to their sick leave, so the benefit starts when the employer's paid days end.",
      "A longer waiting period means a lower premium; a shorter one costs more.",
      "A relapse within a set period after returning to work usually does not restart the waiting period.",
      "Some insurers call it a deferment or deferred period. The policy wording says which word it uses.",
    ],
  },
  {
    type: "p",
    text: "How long it pays is the other half. ASISA says temporary cover usually pays for 6, 12 or 24 months, and other cover can pay up to a retirement age chosen in the policy, between 55 and 70 on its page. The FSCA adds that an income benefit stops on recovery, on death, or when the policy ends. Whether a claim pays at all depends on the policy's definition of disability: own occupation, own or similar occupation, any occupation, or a loss of function. [Income protection, in plain words](/cover/income-protection/) and [income protection vs disability cover](/learn/income-protection-vs-disability-cover/) go further.",
  },
  { type: "h2", text: "One salary, three points in time" },
  {
    type: "p",
    text: "Put the documents side by side and the timeline for a five-day worker on a long illness looks like this. It is a sequence, not a prediction about anyone.",
  },
  {
    type: "ol",
    items: [
      "**Day 1 to day 30.** Paid sick leave under the BCEA, if the days are still available in the cycle, with a medical certificate after the second consecutive day if the employer asks. Any group income benefit is still inside its waiting period.",
      "**Day 31 onwards.** The Act's paid days are used up. Pay now depends on the employer's policy and the contract. A UIF contributor earning less than normal wages can claim illness benefits, at the Fund's percentage, for as long as their credit days last. An income protection policy with a 30-day waiting period would begin paying its monthly amount from here; one with a 90-day waiting period would still be waiting.",
      "**Month 4 and after.** UIF credits are finite and the employer's goodwill may be too. From here the household is living on whatever income protection or group benefit was set up before the illness, for the term that policy pays, or on savings. Lump-sum disability cover is a different product: it pays once, and usually only when the disability is permanent.",
    ],
  },
  { type: "h2", text: "Questions a household can take to an adviser" },
  {
    type: "ul",
    items: [
      "How many paid sick days do I have left in my current cycle, and what does my contract say after that?",
      "Does my group scheme include an income benefit, and what is its waiting period?",
      "If I took out income protection, which waiting period would line up with my sick leave?",
      "Would the benefit pay for 6, 12 or 24 months, or to a retirement age?",
      "Which definition of disability would apply, and what is excluded?",
      "If I work for myself, what replaces the BCEA and the UIF in this timeline?",
    ],
  },
  ...ON_THE_CALL("income protection and disability cover"),
];
