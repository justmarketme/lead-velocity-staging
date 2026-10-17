/* WhatsApp-first calls to action (Jono, 17 Oct 2026). Every primary CTA opens the chat widget: Lindi's intro, the approved
   consent tick (consent.json generic, the same text as the booking form), then WhatsApp with a prefilled opener. There is no
   booking on the site (Jono, 17 Oct 2026): WhatsApp is the only way to book.
   The opener is the contract with W07 (Lindi), documented in docs/WHATSAPP-OPENERS.md: it names the topic, carries the consent
   statement in the person's own words (so the WhatsApp chat itself records consent, even without JavaScript) and ends with
   "Ref <code>", the page or ad the chat came from. */
import { consentCfg, provider, site } from "./site";

export const WA_DIGITS: string = String(site.whatsapp_number || "").replace(/\D/g, "");
export const WA_LABEL = "Chat on WhatsApp";
export const CONSENT_VERSION: string = consentCfg.generic.version;
export const CONSENT_TEXT: string = consentCfg.generic.text;

export interface ChatContext {
  /** Completes "I'd like to chat about ..." in plain words. */
  topic: string;
  /** Short source code: w-<section> for site pages, the angle's meta_code (a01..b04) for campaign pages. */
  ref: string;
  /** Wills and estate: the opener names the will provider instead of an adviser. */
  wills?: boolean;
}

const COVER = (topic: string, ref: string): ChatContext => ({ topic, ref });
const WILL = (topic: string, ref: string): ChatContext => ({ topic, ref, wills: true });

export const DEFAULT_CHAT: ChatContext = { topic: "cover for my family", ref: "w-site" };

const LEARN: Record<string, ChatContext> = {
  "life-cover-and-a-home-loan": COVER("life cover and my home loan", "w-learn-bond"),
  "income-protection-vs-disability-cover": COVER("income protection and disability cover", "w-learn-income"),
  "cover-for-business-owners-and-directors": COVER("cover as a business owner", "w-learn-owner"),
  "questions-to-ask-a-financial-adviser": COVER("a call with an authorised adviser", "w-learn-adviser"),
  "what-is-credit-life-insurance": COVER("credit life and life cover", "w-learn"),
};
const COVER_TYPES: Record<string, string> = {
  "life-cover": "life cover", "disability-cover": "disability cover", "income-protection": "income protection", "severe-illness-cover": "severe illness cover",
};

/** The chat context for an apex page. */
export function contextFor(pathname: string): ChatContext {
  const seg = pathname.split("/").filter(Boolean);
  if (seg[0] === "wills") return WILL("a will", "w-wills");
  if (seg[0] === "cover") return COVER(COVER_TYPES[seg[1]] ?? "cover for my family", "w-cover");
  if (seg[0] === "learn") return LEARN[seg[1]] ?? COVER("cover for my family", "w-learn");
  if (seg[0] === "book") return { ...DEFAULT_CHAT, ref: "w-book" };
  if (seg.length === 0) return { ...DEFAULT_CHAT, ref: "w-home" };
  return DEFAULT_CHAT;
}

/** Campaign landing pages: one topic per ad angle, ref = the angle's neutral meta code. */
const ANGLE_TOPICS: Record<string, string> = {
  "adviser-conversation": "a call with an authorised adviser",
  "new-bond": "cover and my new bond",
  "salary-stops": "income protection",
  "cover-gap": "my life cover",
  "owners-directors": "cover as a business owner",
  "new-baby": "cover for my family",
  "children-guardian": "a will and a guardian for my children",
  "will-myth": "a will",
  "will-and-cover": "a will",
  "where-is-the-will": "a will",
};
export function campaignContext(a: { slug: string; meta_code: string; theme?: string }): ChatContext {
  const topic = ANGLE_TOPICS[a.slug] ?? (a.theme === "B" ? "a will" : "cover for my family");
  return a.theme === "B" ? WILL(topic, a.meta_code) : COVER(topic, a.meta_code);
}

/** The prefilled first message. Plain words; the tail is machine-readable for Lindi (docs/WHATSAPP-OPENERS.md):
    "Ref <code>" = the page or landing page, and "via <source>/<campaign>/<content>" = where the visitor came from before that. */
export function opener(c: ChatContext, via?: string): string {
  const who = c.wills ? `share my details with ${provider.name}` : "share my details with an authorised adviser";
  return `Hi Lindi, I'd like to chat about ${c.topic}. I agree that SortMyCover may message me on WhatsApp about this and ${who}. Ref ${c.ref}${via ? " via " + via : ""}`;
}

export const waHref = (c: ChatContext, via?: string) => `https://wa.me/${WA_DIGITS}?text=${encodeURIComponent(opener(c, via))}`;

const tag = (v: string | undefined, max: number) => (v || "").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max);
/** Where the visitor came from, for the opener (Jono, 17 Oct 2026: every opt-in must show its origin in the CRM).
    First touch, from the stored attribution (utm_* and fbclid, src/lib/pixel.ts) and, failing that, the referrer host:
    "ig/<campaign>/<content>" or "fb/..." for ads (ads carry utm_source={{site_source_name}}), "ig" / "fb" / "google" for an
    organic post, link or search, nothing for a direct visit. Read only when "Open WhatsApp" is tapped, never during render. */
export function sourceTag(a: { utm?: Record<string, string>; fbclid?: string; ref?: string }, referrer: string): string {
  const u = a.utm || {};
  let src = tag(u.utm_source, 16);
  if (src === "instagram") src = "ig";
  if (src === "facebook") src = "fb";
  if (!src && a.fbclid) src = "fb";
  if (!src) {
    let host = "";
    try { host = a.ref || (referrer ? new URL(referrer).hostname : ""); } catch { /* ignore */ }
    if (/instagram\.com$/.test(host)) src = "ig";
    else if (/(^|\.)facebook\.com$|^fb\.me$|(^|\.)fb\.com$/.test(host)) src = "fb";
    else if (/(^|\.)google\./.test(host)) src = "google";
    else if (host && !/sortmycover\.co\.za$/.test(host)) src = tag(host.replace(/^www\./, ""), 24);
  }
  if (!src) return "";
  return [src, tag(u.utm_campaign, 32), tag(u.utm_content, 32)].filter(Boolean).join("/");
}

/** What to expect on WhatsApp, in the order Lindi runs it (flow spec, 17 Oct 2026). Shown with every WhatsApp CTA. */
export const WA_STEPS = (wills?: boolean): string[] => [
  "Lindi says hello and asks what you need help with. Tap an option.",
  "She asks a few short questions, such as your age band.",
  wills ? `She introduces your ${provider.name} consultant and offers times for the call. Pick one.` : "She introduces your adviser, with their name, firm and FSP number, and offers times. Pick one.",
  "She confirms your email for the calendar invite, then reminds you before the call.",
];
/** One-line version for tight spots (hero micro line, CTA card). */
export const WA_EXPECT = "On WhatsApp, Lindi asks what you need and a few short questions, then shows you your adviser and times to pick.";

/** Any CTA asks the widget to open with its own context. */
export const CHAT_EVENT = "smc:chat";
export function openChat(c: ChatContext) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent<ChatContext>(CHAT_EVENT, { detail: c }));
}
