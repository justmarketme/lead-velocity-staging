import type { Block } from "../types";
import { ON_THE_CALL } from "../learn-shared";

/* Sources: config/evidence.json asisa-gap-release-2025-10 (every rand figure and percentage in "What the national numbers say"),
   asisa-lt-stats-2025 (lapses and new policies), sam-what-is-life-cover, sam-what-is-group-life, sam-conversion-benefit, fais-gcoc,
   fsca-life-insurance-booklet, sam-underwriting, ppr-ltia-cooling-off. ASISA's figures are dated national averages, quoted as
   printed in the media release of 28 Oct 2025, never as an amount for any person. Q-G1 gate: see meta. */
export const body: Block[] = [
  {
    type: "p",
    text: "\"How much life cover do I need?\" is one of the most searched questions about cover in South Africa. The honest answer has two parts. The first is that no website, including this one, can give a household its number. The second is that there are national figures, published and dated, that show why the question matters. This page sets out both, and then explains what a needs analysis is, because that is the step that turns a national average into one family's figure.",
  },
  {
    type: "p",
    text: "SortMyCover is not a financial services provider and gives no advice. Everything below is general information with its source named.",
  },
  { type: "h2", text: "What life cover is, in one paragraph" },
  {
    type: "p",
    text: "Life cover pays a benefit when the insured person dies. ASISA's consumer site describes it as usually a lump sum, sometimes a monthly payment, paid in return for regular premiums. The money goes either to the people named on the policy or into the estate, where debts are settled before heirs inherit. Funeral cover is a different, smaller benefit with its own terms; this page is about life cover. [Life cover, in plain words](/cover/life-cover/) has the longer version.",
  },
  { type: "h2", text: "What the national numbers say" },
  {
    type: "p",
    text: "Every year the Association for Savings and Investment South Africa (ASISA) publishes a study of the gap between the cover South Africans have and the cover their families would need. The most recent media release, dated 28 October 2025, uses data to the end of December 2024. These are its headline figures:",
  },
  {
    type: "ul",
    items: [
      "South Africa's 16.1 million formally employed income earners had enough life and disability cover to provide **39%** of the income their families would need if they died or became disabled.",
      "The average income earner would need at least **R2.1 million** of life cover and has **R0.8 million**, a gap of R1.3 million.",
      "For disability, the average family would need cover of **R3 million** and the gap per family is around R1.8 million.",
      "If an earner died, the household left behind would have to cut its spending by at least **34%**, or find about **R7 400** a month from somewhere else. For disability the figure is 37%.",
      "Across the country the life and disability gap was **R50.4 trillion** at the end of 2024, up from R35.4 trillion at the end of 2021, a rise of 12.5% a year.",
    ],
  },
  {
    type: "p",
    text: "These are averages across millions of people, dated to December 2024. They are not an amount offered to anyone and not a statement about any reader. General information, not advice.",
  },
  { type: "h2", text: "Why an average is not your number" },
  {
    type: "p",
    text: "An average hides the spread. One earner has a bond, three children at school and a parent to support. Another rents, has no dependants and holds group cover through work. Both sit inside the R2.1 million average, and neither is described by it.",
  },
  {
    type: "p",
    text: "The costs that would carry on without an income are the real question. They differ from one household to the next: a bond or rent, daily living costs, school fees, other debts, support for relatives, and for how many years each one runs. [What is a life cover gap](/learn/what-is-a-life-cover-gap/) explains the comparison in plain words. The size of the gap for a particular household depends on facts only that household knows.",
  },
  { type: "h2", text: "Cover also shrinks without anyone noticing" },
  {
    type: "p",
    text: "ASISA's long-term insurance statistics for 2025, released on 31 March 2026, show two sides of the same picture. South Africans bought 10.8 million new recurring-premium risk policies in 2025, of which 2.7 million were life, disability, critical illness and income protection policies. In the same year **8.7 million** risk policies lapsed, up from 8.2 million in 2024. ASISA defines a lapse as the policyholder stopping premiums on a risk policy, which leaves no fund value. Its words: unless lapsed policies are replaced, lapses widen South Africa's insurance gap.",
  },
  {
    type: "p",
    text: "Work cover moves too. ASISA says an employer's group scheme can include life and disability cover, and sometimes severe illness cover, but the cover belongs to the scheme. Someone who changes jobs, is retrenched or starts working for themselves can face lesser or no group benefits. Some schemes carry a conversion option that lets a leaving member turn the group cover into a personal policy, usually within 60 days and with the employer's or trustees' agreement. [How to read your payslip's cover line](/learn/how-to-read-your-payslips-cover-line/) shows where the scheme's terms are kept.",
  },
  { type: "h2", text: "What a needs analysis is" },
  {
    type: "p",
    text: "The FAIS General Code of Conduct sets out what an authorised adviser must do before giving advice. Section 8 requires the adviser to gather information about the client's needs, financial situation, risk profile and knowledge of products, to analyse it, and only then to identify products that fit. If the client holds back information or chooses a different product, section 8(4) requires the adviser to say what that means for the advice. Section 9 requires a written record of the advice where a product is taken up because of it.",
  },
  {
    type: "p",
    text: "That process is the needs analysis. It is the only way a national average becomes a figure for one household, and it is work for an authorised adviser. [Questions to ask a financial adviser](/learn/questions-to-ask-a-financial-adviser/) lists what the adviser must tell you in return.",
  },
  { type: "h2", text: "Questions a household can take to the call" },
  { type: "p", text: "These are questions, not a checklist of things anyone must do:" },
  {
    type: "ul",
    items: [
      "Which of our costs would carry on if an income stopped, and for how long?",
      "What cover do we already have through work, and what happens to it if the job ends?",
      "Does any policy we hold pay the bank first because it is ceded to a loan?",
      "Is the cover a lump sum, a monthly amount, or both, and which suits the costs we listed?",
      "What would the household do in the first month, and what in year five?",
      "How are you paid, and does that change if we take a product?",
    ],
  },
  { type: "h2", text: "Before anything is signed" },
  {
    type: "p",
    text: "The FSCA's consumer booklet on life insurance says a person can take a policy away to read before signing, ask for it to be explained in plain language, and ask an adviser for proof of their qualifications and full details of fees and commission.",
  },
  {
    type: "p",
    text: "Insurers ask health and family-history questions before offering cover. ASISA notes that a condition which is not disclosed can lead to a claim being rejected, so the answers on the form matter as much as the amount. And under the Policyholder Protection Rules, a new long-term policy can usually be cancelled within 31 days of receiving the policy summary or disclosure information, as long as no claim has been made and no insured event has happened. Premiums are refunded less the cost of the cover already enjoyed.",
  },
  ...ON_THE_CALL("life cover and the other kinds of cover"),
];
