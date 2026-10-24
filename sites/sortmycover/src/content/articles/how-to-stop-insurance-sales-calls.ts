import type { Block } from "../types";
import { ON_THE_CALL } from "../learn-shared";

/* Sources: config/evidence.json truecaller-2025 (report figures via May 2026 coverage), ncc-opt-out-registry-2026 (NCC notice,
   7 Oct 2026), itweb-opt-out-2026, sapeople-opt-out-2026, inforeg-cpa-statement-2026 (statement of 21 Apr 2026, text read),
   fais-gcoc, fsca-fais-register, own-privacy-notice. No insurer, bank or call centre is named. SortMyCover cannot stop other
   companies calling and the page does not say it can. */
export const body: Block[] = [
  {
    type: "p",
    text: "An unknown number at lunchtime. Another at four. A different number tomorrow, the same script. If you have ever asked for one quote and then heard from six call centres, you already know why \"why do life insurance companies keep calling me\" is a common search. This page explains how big the problem is, what the law already says, what changes with the National Opt-Out Registry, and what to say on the call.",
  },
  {
    type: "p",
    text: "It names no company. It also makes no promise that calls from other companies will stop, because nobody can promise that. SortMyCover is not a financial services provider and gives no advice.",
  },
  { type: "h2", text: "How big the problem is" },
  {
    type: "p",
    text: "Truecaller's 2025 global report, covered in May 2026, ranked South Africa ninth in the world for spam calls, with about 30% of calls from unknown numbers flagged as spam. South Africa is unusual in one respect: **insurance is the largest spam category** here, at 14% of spam calls, ahead of financial services at 10% and debt collection at 6%. The National Consumer Commission's own notice of 7 October 2026 cites Truecaller's 2026 report: South Africans received **17.47 billion** spam calls between January and June 2026, up 25.2% on the year before.",
  },
  { type: "h2", text: "Why your number travels" },
  {
    type: "p",
    text: "A number usually starts its journey on a form. A quote request, a competition entry or an app sign-up carries terms that allow the details to be passed to partners, and each partner may pass them on again. Months later the person cannot remember which box they ticked. That is the chain the Information Regulator and the Consumer Commission are both trying to break, from different ends.",
  },
  { type: "h2", text: "What POPIA already says" },
  {
    type: "p",
    text: "The Information Regulator set out the position in a media statement on 21 April 2026, after the new Consumer Protection Act regulations were gazetted. Section 69 of the Protection of Personal Information Act prohibits direct marketing by electronic communication unless the person has consented, or is an existing customer of the marketer, subject to conditions. The Regulator treats spam calls as falling under this section. Its statement makes four points:",
  },
  {
    type: "ul",
    items: [
      "**Consent comes first.** A marketer cannot send unsolicited electronic direct marketing to someone who has not consented.",
      "**One request only.** A marketer may approach a person only once to ask for that consent, and not at all if the person has previously withheld it.",
      "**Opting out is not consent.** In the Regulator's words, consent is a voluntary, specific and informed expression of will, so by merely opting out a person cannot be regarded as having given consent.",
      "**Customers only.** Under section 69(3), a marketer can only keep a database of people who are its customers.",
    ],
  },
  {
    type: "p",
    text: "The Regulator also said that POPIA applies whether or not a person registers on the new opt-out registry. The registry protects people who register; POPIA protects everyone else.",
  },
  { type: "h2", text: "What changes with the National Opt-Out Registry" },
  {
    type: "p",
    text: "The Consumer Protection Act Amendment Regulations, gazetted on 15 April 2026, create a National Opt-Out Registry run by the National Consumer Commission. The Commission's notice of 7 October 2026 sets out the phases:",
  },
  {
    type: "ol",
    items: [
      "**Registration, 15 September to December 2026.** Direct marketers register on the system. The Commission says a failure to register after this period may be a contravention of section 11 of the Act.",
      "**Cleansing, December 2026 to April 2027.** Registered marketers clean their lists against the registry, and must keep doing so every month before any campaign.",
      "**Consumer blocks, from May 2027.** Consumers who have registered on the registry can pre-emptively block direct marketers, so that they do not receive unwanted direct communication.",
    ],
  },
  {
    type: "p",
    text: "At the Commission's media briefing, reported by ITWeb on 8 October 2026, it said it will enforce the regulations in full from **15 April 2027**. Contraventions can be referred to the National Consumer Tribunal, which may impose an administrative fine of up to **R1 million or 10%** of the marketer's annual turnover in the preceding financial year, whichever is greater. The Commission has also said that a registered pre-emptive block overrides previous consent to electronic direct marketing. Guidance for consumers on how to register will follow from the Commission; its portal is at thencc.org.za.",
  },
  { type: "h2", text: "What you can do on the next call" },
  {
    type: "ol",
    items: [
      "**Ask who is calling and where they got your number.** A representative of a financial services provider must, at the earliest reasonable opportunity, give their name and contact details, the name of the firm, its FSP number and the services it is authorised for. The FAIS General Code of Conduct requires it. Anyone can check an FSP number on the FSCA's public register; [how to check an adviser](/learn/how-to-check-an-adviser/) shows the steps.",
      "**Say that you do not consent and want your details removed.** Under section 69 that withholds consent, and the marketer may not ask again. Note the date, the number and the company name.",
      "**Complain if it continues.** The Information Regulator handles complaints under POPIA; from 2027 the Consumer Commission handles breaches of the registry. [How to complain](/learn/how-to-complain/) lists the routes and what to send.",
      "**Register a block when the registry opens to consumers.** The Commission has said this will be possible from May 2027.",
    ],
  },
  {
    type: "p",
    text: "None of this stops a company that has never heard of the law. It does give the person on the receiving end a script, a record and a place to send it.",
  },
  { type: "h2", text: "How SortMyCover handles a number" },
  {
    type: "p",
    text: "SortMyCover is the other end of this chain. When someone asks for a call, their details go to one authorised financial services provider, the one named when they agreed or in the first WhatsApp message they receive. The details are never sold and are not given to anyone else to market to them. There is no call centre: the call is booked for a time the person picks, with one named adviser. Replying STOP to any message ends the contact, and SortMyCover tells the adviser. [What happens to your details](/learn/what-happens-to-your-details/) is the plain-language summary, and the [privacy notice](/privacy/) is the full one.",
  },
  {
    type: "p",
    text: "What SortMyCover cannot do is stop other companies calling. The law above is the tool for that.",
  },
  ...ON_THE_CALL("cover, on a call you booked"),
];
