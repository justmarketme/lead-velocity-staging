import type { FaqItem } from "./types";
import { COST_LINE, FEE_LINE, NO_COMMISSION } from "@/lib/site";

export const HOW_STEPS = [
  { title: "Answer two quick questions", body: "Your age band and a monthly budget band. Then your first name and mobile number." },
  { title: "Pick a time", body: "You get your adviser’s name, practice and FSP number on WhatsApp, and choose a time that suits you." },
  { title: "Talk to the adviser for 30 minutes", body: "By video, WhatsApp or phone. The adviser tells you how they are paid. You decide afterwards. " + COST_LINE },
];

/* Campaign FAQ: the five items of spec C.1 item 6 (cost, who pays us, who is the adviser, what happens to my details, am I committed). */
export const CAMPAIGN_FAQ: FaqItem[] = [
  { id: "cost", q: "Does the call cost anything?", a: COST_LINE + " If you later choose a product, your adviser tells you how they are paid." },
  { id: "who-pays", q: "Who pays SortMyCover?", a: FEE_LINE + " " + NO_COMMISSION },
  { id: "adviser", q: "Who is the adviser?", a: "An adviser from a financial services provider authorised by the FSCA. You get their name, practice and FSP number on WhatsApp before you speak to them, and you can check them on the FSCA register." },
  { id: "info", q: "What happens to my details?", a: "Lead Velocity (Pty) Ltd, trading as SortMyCover, looks after them under POPIA. They go to one adviser, the one you are introduced to, and are never sold. Ad measurement with Meta happens only if you give the separate optional consent. Reply STOP to any message and we stop." },
  { id: "committed", q: "Am I committed to anything?", a: "No. You do not have to buy anything, on the call or after it. You can move or cancel the call from the WhatsApp message, at no cost." },
];

/* Home FAQ: the eight items of spec D.1. Site FAQ: those plus the extra objections. */
export const HOME_FAQ: FaqItem[] = [
  { id: "free", q: "Does the call really cost nothing?", a: COST_LINE + " If you later choose a product, your adviser tells you how they are paid." },
  { id: "money", q: "How do you make money?", a: FEE_LINE + " " + NO_COMMISSION + " The full explanation is on the [how we make money](/how-we-make-money/) page." },
  { id: "adviser", q: "Who is the adviser?", a: "An adviser from a financial services provider authorised by the FSCA. You get their name, practice and FSP number on WhatsApp before you speak to them." },
  { id: "authorised", q: "Is the adviser authorised?", a: "Check for yourself: put the FSP number you are sent into the [FSCA register search](https://www.fsca.co.za/FSB-Search/). SortMyCover only introduces you to advisers whose firm is shown there as authorised. [How to check an adviser](/learn/how-to-check-an-adviser/)." },
  { id: "details", q: "What do you do with my details?", a: "Lead Velocity (Pty) Ltd, trading as SortMyCover, looks after them under POPIA. They go to one adviser and are never sold. The [privacy notice](/privacy/) has the detail." },
  { id: "buy", q: "Do I have to buy anything?", a: "No. The call costs you nothing, and you decide afterwards." },
  { id: "stop", q: "Can I stop?", a: "Yes. Reply STOP to any WhatsApp, or email hello@sortmycover.co.za with the word STOP. We stop at once and tell the adviser." },
  { id: "complain", q: "Who do I complain to?", a: "Start with hello@sortmycover.co.za. The [complaints page](/complaints/) lists every route in order, including the routes for a complaint about an adviser." },
];

export const SITE_FAQ: FaqItem[] = [
  ...HOME_FAQ,
  { id: "scam", q: "Is this a scam?", a: "Fair question. SortMyCover is a trading name of Lead Velocity (Pty) Ltd, registration 2025/637858/07. The address, phone and email are in the footer of every page, and the adviser’s FSP number can be checked on the FSCA register before you speak to them. Nobody is asked for ID numbers, bank details or payment." },
  { id: "why-number", q: "Why do you need my mobile number?", a: "The adviser’s details and the times to choose from arrive on WhatsApp, and the call may be by WhatsApp or phone." },
  { id: "how-long", q: "How long is the call?", a: "About 30 minutes, at a time you pick. The quiz takes about a minute." },
  { id: "choose", q: "Can I choose my adviser?", a: "You are introduced to one adviser. You can check them on the FSCA register, and you decide after the call whether to go further." },
  { id: "insurer", q: "Is SortMyCover an insurer?", a: "No. SortMyCover is not a financial services provider. It does not sell cover, give advice, compare products or quote premiums. It introduces you to an adviser, who can." },
];
