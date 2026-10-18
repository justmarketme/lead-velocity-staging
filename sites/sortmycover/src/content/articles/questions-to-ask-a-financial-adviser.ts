import type { Block } from "../types";
import { ON_THE_CALL, SERIES_LINKS } from "../learn-shared";

/* Sources: config/evidence.json fais-gcoc (sections 3, 5, 8 and 9), fsca-fais-register, fsca-life-insurance-booklet,
   ppr-ltia-cooling-off, sam-underwriting. "Advisers are paid by commission or by fees" is phrased only as a question. */
export const body: Block[] = [
  {
    type: "p",
    text: "Some questions are easier asked out loud. How does this cover work? What happens if an income stops? How is the adviser paid? A form cannot answer those. A conversation can.",
  },
  {
    type: "p",
    text: "A first call with an adviser goes more smoothly when both sides know what to expect. South African law already sets out much of what an authorised adviser has to tell a client. This page explains those rules in plain words and lists questions anyone can ask. It is information, not advice: SortMyCover is not a financial services provider.",
  },
  { type: "h2", text: "Step one: look the adviser up" },
  {
    type: "p",
    text: "Anyone can search the FSCA's public register of authorised financial services providers. The register shows whether a firm holds an authorisation, and for which kinds of products. It also lists the individual representatives who work under a firm.",
  },
  {
    type: "p",
    text: "To search, ask the adviser for their full name, their firm's name and the firm's FSP number. [How to check an adviser](/learn/how-to-check-an-adviser/) walks through the register step by step.",
  },
  {
    type: "p",
    text: "Being on the register shows that a firm is authorised. It does not rate the adviser or say whether a particular piece of advice suits a household.",
  },
  { type: "h2", text: "What an adviser must tell you" },
  {
    type: "p",
    text: "The FAIS General Code of Conduct is the rulebook for authorised advisers. It sets out information that an adviser must give a client at the earliest reasonable opportunity:",
  },
  {
    type: "ul",
    items: [
      "the firm's full name and contact details, and the names of contact people;",
      "its legal status, and which business takes responsibility for the adviser's actions;",
      "contact details for the firm's compliance department;",
      "which financial services the firm is authorised to provide, and any conditions on that;",
      "whether the firm holds professional indemnity or fidelity insurance;",
      "whether the adviser is working under supervision.",
    ],
  },
  { type: "p", text: "If the adviser gives this information out loud, the Code says it must be confirmed in writing within 30 days." },
  {
    type: "p",
    text: "The Code also deals with conflicts of interest. An adviser must avoid a conflict where possible, or reduce it where not. They must tell the client about any conflict and about the firm's policy for managing conflicts.",
  },
  { type: "h2", text: "How advice is built" },
  { type: "p", text: "Under the Code, advice follows a set order. Before giving advice, an adviser must:" },
  {
    type: "ol",
    items: [
      "ask about the client's needs and goals, financial situation, attitude to risk, and what the client already knows about the products;",
      "analyse that information;",
      "identify the products that fit.",
    ],
  },
  {
    type: "p",
    text: "A client can choose not to answer a question. If they do, the adviser must point out that the advice may be limited as a result. The same applies if a client picks a product other than the one the adviser recommended.",
  },
  { type: "h2", text: "The record of advice" },
  { type: "p", text: "When a client takes up a product because of advice, the adviser must keep a **record of advice**. It sets out:" },
  {
    type: "ul",
    items: [
      "a short summary of the information the advice was based on;",
      "the products that were considered;",
      "the product recommended, and why it was expected to meet the client's needs.",
    ],
  },
  { type: "p", text: "The client must get a copy in writing." },
  { type: "h2", text: "Before and after signing" },
  {
    type: "p",
    text: "The FSCA's consumer booklet on life insurance says a consumer can take a policy away to read it, and can ask for it to be explained in plain language. A consumer can also ask the adviser for proof of qualifications and for full details of fees and commission.",
  },
  { type: "p", text: "Two more facts are useful:" },
  {
    type: "ul",
    items: [
      "Insurers ask health questions before offering cover. ASISA notes that a condition that is not disclosed can lead to a claim being rejected.",
      "Under the Policyholder Protection Rules, a new long-term policy can be cancelled within 31 days of receiving the policy summary, if no claim has been made and no insured event has happened.",
    ],
  },
  { type: "h2", text: "Questions to ask on a first call" },
  { type: "p", text: "These are examples. Anyone can leave out a question or add their own." },
  { type: "p", text: "**About the adviser**" },
  {
    type: "ul",
    items: [
      "What is your FSP number, and are you a representative of a firm?",
      "Which kinds of products are you authorised to advise on?",
      "How are you paid, and does that change if I choose a product?",
      "Which insurers' products can you advise on?",
    ],
  },
  { type: "p", text: "**About the cover**" },
  {
    type: "ul",
    items: [
      "What is the difference between life cover, disability cover, income protection and severe illness cover? ([Income protection vs disability cover](/learn/income-protection-vs-disability-cover/) is a starting point.)",
      "What does a policy pay out, and when does it stop?",
      "What is a waiting period, and how does it work?",
      "What is excluded?",
      "How does cover through work fit in?",
      "How does cover fit around a bond, or around a business? ([Life cover and a home loan](/learn/life-cover-and-a-home-loan/) and [cover for business owners and directors](/learn/cover-for-business-owners-and-directors/) set out the facts.)",
    ],
  },
  { type: "p", text: "**About next steps**" },
  {
    type: "ul",
    items: [
      "What information will you need from me, and why?",
      "Will I get a record of advice in writing?",
      "Can I take time before I decide anything?",
      "What happens to my details after the call?",
    ],
  },
  { type: "p", text: "[What to bring to your call](/learn/what-to-bring-to-your-call/) lists the documents that make the first call go faster." },
  ...ON_THE_CALL("the different kinds of cover"),
  ...SERIES_LINKS("questions-to-ask-a-financial-adviser"),
];
