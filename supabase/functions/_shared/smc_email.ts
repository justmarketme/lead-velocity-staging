// SortMyCover branded CLIENT emails. A SortMyCover lead (leads.brand_id IS NOT NULL) must never receive the dark Lead Velocity
// layout or the Lead Velocity sender. The look is the site's (19 Oct 2026, Jono: "to the T"): smc_layout.ts holds the tokens
// and the layout (white base, navy text and wordmark band, logo yellow accent, DM Sans, pill buttons). No other colour is used.
// Pure functions: values in, { subject, html, text } out (no Deno APIs), so they can be tested and previewed offline.
import { esc, htmlToText, textBlocks } from "./lv_email.ts";
import { cleanRichHtml, looksLikeHtml, type BuiltEmail } from "./lv_emails.ts";
import { SMC, P_STYLE, smcButtons, smcHeading, smcShell } from "./smc_layout.ts";

/** Every colour an SMC email may use (the site tokens, smc_layout.ts). */
export const SMC_BRAND = SMC;

export const SMC_FROM = "SortMyCover <hello@sortmycover.co.za>";
export const SMC_REPLY_TO = "hello@sortmycover.co.za";
const SITE = "https://sortmycover.co.za";
// brand/tokens.json brand.disclosure and sites/sortmycover/config/site.json company block.
const DISCLOSURE = "SortMyCover is a service of Lead Velocity (Pty) Ltd. We connect you with authorised financial services providers. We do not give financial advice, compare products or quote premiums.";
const ADDRESS = "210 Amarand Avenue, Pegasus Building 1, Menlyn Maine, Pretoria 0184";

/** SortMyCover rows carry a brand_id; every legacy Lead Velocity row keeps it NULL. */
export const isSmcLead = (lead: { brand_id?: string | null } | null | undefined): boolean => !!lead?.brand_id;

const P = P_STYLE;

/** Restyle the Lead Velocity-palette HTML that cleanRichHtml emits into SortMyCover colours (allow-listed output, safe to rewrite). */
function recolour(html: string): string {
  return html
    .replace(/color:#b9b0d6/g, `color:${SMC.navy}`)
    .replace(/color:#ffffff/g, `color:${SMC.navy}`)
    .replace(/color:#b83df5;text-decoration:none;font-weight:500/g, `color:${SMC.navy};text-decoration:underline;font-weight:500`);
}
const smcBlocks = (t: unknown) => recolour(textBlocks(t)).replace(/(font-size:15px;line-height:25px)/g, "font-size:16px;line-height:24px");

export interface SmcEmailOptions {
  preheader?: string;
  eyebrow: string;
  /** Plain-text title (escaped here). */
  title: string;
  /** Body HTML already safe (build with smcBlocks/esc). */
  bodyHtml: string;
  button?: { label: string; url: string };
  signoff?: string;
  /** A word in the title set in the site's italic serif over the yellow marker. */
  accent?: string;
}

/** The SortMyCover layout (smc_layout.ts): the site's white page, navy wordmark band, yellow pill CTA, navy type. */
export function smcEmail(o: SmcEmailOptions): string {
  const button = o.button && /^https:\/\/[^\s"<>]+$/.test(o.button.url) ? smcButtons([{ href: o.button.url, label: o.button.label }])
    : o.button ? smcButtons([{ href: SITE, label: o.button.label }]) : undefined;
  const muted = "color:inherit;text-decoration:underline";
  return smcShell({
    docTitle: "SortMyCover", preheader: o.preheader, eyebrow: o.eyebrow, headingHtml: smcHeading(o.title, o.accent), bodyHtml: o.bodyHtml,
    actionsHtml: button, signoff: o.signoff,
    footerLines: [esc(DISCLOSURE), `Questions? <a href="mailto:${SMC_REPLY_TO}" style="${muted}">${SMC_REPLY_TO}</a> &middot; <a href="${SITE}" style="${muted}">sortmycover.co.za</a>`, esc(ADDRESS)],
  });
}

function smcText(title: string, parts: string[], signoff = "The SortMyCover team"): string {
  return [title, ...parts, `Kind regards,\n${signoff}`, `${DISCLOSURE}\nQuestions? ${SMC_REPLY_TO} | sortmycover.co.za\n${ADDRESS}`].join("\n\n") + "\n";
}

/** send-communication email channel for a SortMyCover lead: text typed in the CRM, or HTML built by it. */
export function smcCommunicationEmail(d: { content: string; subject: string }): BuiltEmail {
  const raw = String(d.content ?? "");
  // The CRM appends a Lead Velocity text signature to some messages; a SortMyCover client must not see it.
  const body = raw.replace(/(?:\s*<br\s*\/?>)*\s*─{10,}[ \t]*\r?\n[\s\S]*$/, "");
  const rich = looksLikeHtml(body);
  const bodyHtml = rich ? recolour(cleanRichHtml(body)) : smcBlocks(body);
  const bodyText = rich ? htmlToText(bodyHtml) : body.replace(/\r\n/g, "\n").trim();
  const html = smcEmail({ preheader: bodyText.replace(/\s+/g, " ").slice(0, 110), eyebrow: "A message from SortMyCover", title: d.subject, bodyHtml });
  return { subject: d.subject, html, text: smcText(d.subject, [bodyText]) };
}

/** send-bulk-communication email for a SortMyCover lead (message already merged for this recipient). */
export function smcBulkCommunicationEmail(d: { message: string; subject: string }): BuiltEmail {
  const message = String(d.message ?? "").replace(/\r\n/g, "\n").trim();
  const html = smcEmail({ preheader: message.replace(/\s+/g, " ").slice(0, 110), eyebrow: "A message from SortMyCover", title: d.subject, bodyHtml: smcBlocks(message) });
  return { subject: d.subject, html, text: smcText(d.subject, [message]) };
}

/**
 * The CLIENT's booking confirmation. Only what the client already knows or needs: their first name, when, and who will call.
 * Never the phone number on file, call notes, the lead status, the broker's firm/calendar email or any internal field.
 */
export function smcBookingConfirmationEmail(d: { firstName?: string | null; brokerName?: string | null; whenText: string }): BuiltEmail {
  const first = (d.firstName ?? "").trim() || "there";
  const who = (d.brokerName ?? "").trim();
  const line = who ? `${who} will meet you on ${d.whenText} (South African time).` : `Your adviser will meet you on ${d.whenText} (South African time).`;
  const parts = [`Hi ${first},`, `You're booked. ${line}`, "Need to change the time? Reply to this email or WhatsApp us and we'll sort it out."];
  const bodyHtml = parts.map((p) => `<p style="${P}">${esc(p)}</p>`).join("");
  const subject = `Booked: your SortMyCover call on ${d.whenText}`;
  const html = smcEmail({ preheader: line, eyebrow: "Booking confirmed", title: "Your call is booked", accent: "booked", bodyHtml });
  return { subject, html, text: smcText("Your call is booked", parts) };
}

/**
 * Which of these lead ids are SortMyCover leads? Reads leads.brand_id on its own so a database where the SortMyCover migrations
 * are not applied (no brand_id column) simply answers "none" and every email stays on the Lead Velocity path.
 */
// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- callers pass differently typed supabase clients
export async function smcLeadIds(supabase: any, ids: Array<string | null | undefined>): Promise<Set<string>> {
  const want = [...new Set(ids.filter((x): x is string => !!x))];
  if (want.length === 0) return new Set();
  try {
    const { data, error } = await supabase.from("leads").select("id, brand_id").in("id", want);
    if (error || !Array.isArray(data)) return new Set();
    return new Set(data.filter((r: { id: string; brand_id?: string | null }) => isSmcLead(r)).map((r: { id: string }) => r.id));
  } catch {
    return new Set();
  }
}
