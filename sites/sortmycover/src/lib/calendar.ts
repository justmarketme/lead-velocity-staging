/* Desktop calendar booking (Jono, 17 Oct 2026): on a desktop, opening WhatsApp can mean switching to another app, so desktop
   visitors can also pick a time in Cal.com. Mobile stays WhatsApp-first. The calendar is Cal.com's own booking page in an iframe
   (no Cal.com script on our pages, CSP frame-src only). The plain booking URL is used, not /embed: the /embed page stays blank
   until Cal.com's embed script talks to it, and we do not load that script. The Cal.com event asks for name, email, WhatsApp number and the WhatsApp
   consent; after a booking, n8n sends a WhatsApp utility template so Lindi confirms the details (email by link, never a code).
   Inert until config/site.json -> calcom_link is set (for example "sortmycover/adviser-call"). */
import { site } from "./site";

export const CAL_LINK: string = String((site as { calcom_link?: string }).calcom_link || "").replace(/^\/+|\/+$/g, "");
export const CAL_ENABLED = CAL_LINK.length > 0;
export const CAL_ORIGIN = "https://app.cal.com";

/** The booking page URL. `ref` fills the event's hidden "ref" question (page code + where the visitor came from, same as the
    WhatsApp opener); utm_* pass through as Cal.com's own UTM tracking. */
export function calSrc(ref: string, utm: Record<string, string> = {}): string {
  const q = new URLSearchParams({ layout: "month_view", theme: "light", ref });
  for (const [k, v] of Object.entries(utm)) if (/^utm_(source|medium|campaign|term|content)$/.test(k) && v) q.set(k, v.slice(0, 80));
  return `${CAL_ORIGIN}/${CAL_LINK}?${q.toString()}`;
}

/** Any calendar CTA asks the widget layer to open the calendar with its own context. */
export const CAL_EVENT = "smc:cal";
