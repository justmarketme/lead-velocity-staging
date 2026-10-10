import type { FaqItem } from "./types";
import { COST_LINE } from "@/lib/site";

export const HOW_STEPS = [
  { title: "Answer two quick questions", body: "Your age band and a monthly budget band. Then your first name and mobile number." },
  { title: "Get your adviser’s details on WhatsApp", body: "You get their name, practice and FSP number straight away. You can check them on the FSCA register." },
  { title: "Have the call", body: "About 30 minutes, by video, WhatsApp or phone, at the time you picked. You decide afterwards. " + COST_LINE },
];

export const CAMPAIGN_FAQ: FaqItem[] = [
  { id: "how-long", q: "How long is the call?", a: "The quiz takes about a minute. The call is about 30 minutes, at a time you pick." },
  { id: "cost", q: "Does the call cost anything?", a: COST_LINE + " There is no obligation to buy anything. Advisers pay Lead Velocity a flat fee that never depends on whether you buy. SortMyCover takes no commission and no share of any premium. If you later choose a product, your adviser tells you how they are paid." },
  { id: "adviser", q: "Who is the adviser?", a: "An adviser from an authorised financial services provider. You get their name, practice and FSP number on WhatsApp before you speak to them. You can check them on the FSCA register." },
  { id: "info", q: "What happens to my information?", a: "Lead Velocity (Pty) Ltd, trading as SortMyCover, looks after it under POPIA. Your details go to one adviser, the one you are introduced to, and are never sold. Ad measurement with Meta happens only if you tick the separate optional box. Reply STOP to any message and we stop." },
  { id: "cancel", q: "Can I cancel or change the time?", a: "Yes. You can move or cancel the call from the WhatsApp message, at no cost." },
  { id: "insurer", q: "Is SortMyCover an insurer?", a: "No. SortMyCover is not a financial services provider. It does not sell cover, give advice, compare products or quote premiums. It introduces you to an authorised adviser, who can." },
];

export const SITE_FAQ: FaqItem[] = [
  ...CAMPAIGN_FAQ,
  { id: "scam", q: "Is this a scam?", a: "Fair question. SortMyCover is a trading name of Lead Velocity (Pty) Ltd, registration 2025/637858/07. The address, phone and email are in the footer of every page, and the adviser’s FSP number can be checked on the FSCA register before you speak to them. Nobody is asked for ID numbers, bank details or payment." },
  { id: "why-number", q: "Why do you need my mobile number?", a: "The adviser’s details and the times to choose from arrive on WhatsApp, and the call may be by WhatsApp or phone." },
  { id: "money", q: "How does SortMyCover make money?", a: "Advisers pay Lead Velocity a flat fee for each 30-day cycle. It is the same whether or not anyone buys a policy. You pay nothing. The full explanation is on the [how we make money](/how-we-make-money/) page." },
  { id: "choose", q: "Can I choose my adviser?", a: "You are introduced to one adviser. You can check them on the FSCA register, and you decide after the call whether to go further." },
  { id: "stop", q: "How do I stop messages?", a: "Reply STOP to any WhatsApp, or email hello@sortmycover.co.za with the word STOP. We stop at once and tell the adviser." },
  { id: "complain", q: "Where do I complain?", a: "Start with hello@sortmycover.co.za. The [complaints page](/complaints/) lists every route in order, including the routes for a complaint about an adviser." },
];
