/* Blocks shared by the four cycle-1 learn guides the paid ads link to (17 Oct 2026). Kept outside articles/ so the content
   glob never treats it as an article. Wording follows config/site.json and src/lib/site.ts: no price language, the fee line only. */
import type { Block } from "./types";

/** The 30-minute call, in process terms. `topic` completes "explains how ... work". Source: /learn/what-happens-on-a-30-minute-call/. */
export const ON_THE_CALL = (topic: string): Block[] => [
  { type: "h2", text: "What happens on the 30-minute call" },
  {
    type: "p",
    text: "SortMyCover books the call and introduces one authorised adviser. SortMyCover is not on the call and does not give advice.",
  },
  {
    type: "ul",
    items: [
      "The call is booked for a time you pick and lasts about 30 minutes.",
      "It can be a video call, a WhatsApp call or a phone call.",
      "At the start, the adviser gives their name, their firm, its FSP number and how they are paid.",
      `The adviser asks about the household and explains how ${topic} work.`,
      "Booking the call is not an application for any product. What happens after the call is between you and the adviser.",
      "Advisers pay SortMyCover a fee for the service. The fee does not depend on whether you buy anything.",
    ],
  },
  {
    type: "p",
    text: "[What happens on a 30-minute call](/learn/what-happens-on-a-30-minute-call/) has more detail. To book, use [the booking page](/book/) or message SortMyCover on WhatsApp at [+27 60 015 6480](https://wa.me/27600156480). Please do not send ID numbers, bank details or health details in a message.",
  },
];

const SERIES: [string, string][] = [
  ["life-cover-and-a-home-loan", "Life cover and a home loan: what the paperwork says"],
  ["income-protection-vs-disability-cover", "Income protection vs disability cover: what each one pays"],
  ["cover-for-business-owners-and-directors", "Cover for business owners and directors: what changes without an employer"],
  ["questions-to-ask-a-financial-adviser", "Questions to ask an authorised financial adviser, and what they must tell you"],
];

/** Links to the other three guides in the series (the current one is left out). */
export const SERIES_LINKS = (self: string): Block[] => [
  { type: "h2", text: "More guides in this series" },
  { type: "ul", items: SERIES.filter(([slug]) => slug !== self).map(([slug, title]) => `[${title}](/learn/${slug}/)`) },
];
