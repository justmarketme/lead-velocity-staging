// SortMyCover branded CLIENT emails. A SortMyCover lead (leads.brand_id IS NOT NULL) must never receive the dark Lead Velocity
// layout or the Lead Velocity sender. Colours, type and wording come from brand/tokens.json (SortMyCover brand system v1.0.0)
// and sites/sortmycover/config/site.json: amber #F5A623, charcoal #1F2933, off-white #FBF8F2, amber ink #2A1B02, white cards,
// rule #DCD6CB, muted #5C6672, DM Sans with a system fallback. No colour outside those tokens is used here.
// Pure functions: values in, { subject, html, text } out (no Deno APIs), so they can be tested and previewed offline.
import { esc, htmlToText, textBlocks } from "./lv_email.ts";
import { cleanRichHtml, looksLikeHtml, type BuiltEmail } from "./lv_emails.ts";

export const SMC_BRAND = {
  amber: "#F5A623", charcoal: "#1F2933", offWhite: "#FBF8F2", accentText: "#2A1B02",
  white: "#FFFFFF", muted: "#5C6672", rule: "#DCD6CB",
} as const;

export const SMC_FROM = "SortMyCover <hello@sortmycover.co.za>";
export const SMC_REPLY_TO = "hello@sortmycover.co.za";
const SITE = "https://sortmycover.co.za";
const F = "'DM Sans',system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
// brand/tokens.json brand.disclosure and sites/sortmycover/config/site.json company block.
const DISCLOSURE = "SortMyCover is a service of Lead Velocity (Pty) Ltd. We connect you with authorised financial services providers. We do not give financial advice, compare products or quote premiums.";
const ADDRESS = "210 Amarand Avenue, Pegasus Building 1, Menlyn Maine, Pretoria 0184";

/** SortMyCover rows carry a brand_id; every legacy Lead Velocity row keeps it NULL. */
export const isSmcLead = (lead: { brand_id?: string | null } | null | undefined): boolean => !!lead?.brand_id;

const B = SMC_BRAND;
const P = `margin:0 0 14px;font-family:${F};font-size:16px;line-height:24px;color:${B.charcoal}`;

/** Restyle the Lead Velocity-palette HTML that cleanRichHtml emits into SortMyCover colours (allow-listed output, safe to rewrite). */
function recolour(html: string): string {
  return html
    .replace(/color:#b9b0d6/g, `color:${B.charcoal}`)
    .replace(/color:#ffffff/g, `color:${B.charcoal}`)
    .replace(/color:#b83df5;text-decoration:none;font-weight:500/g, `color:${B.charcoal};text-decoration:underline;font-weight:500`);
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
}

/** The SortMyCover layout: off-white page, white card, amber top rule and CTA, charcoal type, brand disclosure footer. */
export function smcEmail(o: SmcEmailOptions): string {
  const url = o.button && /^https:\/\/[^\s"<>]+$/.test(o.button.url) ? esc(o.button.url) : SITE;
  const pre = o.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${B.offWhite};opacity:0">${esc(o.preheader)}</div>` : "";
  const button = o.button
    ? `<tr><td style="padding:6px 36px 28px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"><tr><td bgcolor="${B.amber}" style="border-radius:12px;background-color:${B.amber}"><a href="${url}" style="display:inline-block;padding:15px 28px;font-family:${F};font-size:16px;line-height:22px;font-weight:800;color:${B.accentText};text-decoration:none;border-radius:12px">${esc(o.button.label)}</a></td></tr></table></td></tr>` : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>SortMyCover</title>
</head>
<body style="margin:0;padding:0;background-color:${B.offWhite}" bgcolor="${B.offWhite}">
${pre}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${B.offWhite}" style="background-color:${B.offWhite}">
<tr><td align="center" style="padding:32px 12px 40px">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;font-family:${F}">
    <tr><td style="padding:0 4px 18px;font-family:${F};font-size:24px;line-height:28px;font-weight:800;letter-spacing:-0.3px;color:${B.charcoal}"><a href="${SITE}" style="color:${B.charcoal};text-decoration:none">SortMyCover</a></td></tr>
    <tr><td bgcolor="${B.white}" style="background-color:${B.white};border:1px solid ${B.rule};border-radius:16px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td height="6" bgcolor="${B.amber}" style="height:6px;line-height:6px;font-size:6px;background-color:${B.amber};border-radius:16px 16px 0 0">&nbsp;</td></tr>
        <tr><td style="padding:30px 36px 6px">
          <p style="margin:0 0 10px;font-family:${F};font-size:13px;line-height:18px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:${B.muted}">${esc(o.eyebrow)}</p>
          <h1 style="margin:0 0 18px;font-family:${F};font-size:28px;line-height:32px;font-weight:800;letter-spacing:-0.4px;color:${B.charcoal}">${esc(o.title)}</h1>
        </td></tr>
        <tr><td style="padding:0 36px 8px">${o.bodyHtml}</td></tr>
${button}
        <tr><td style="padding:6px 36px 30px"><p style="margin:0;font-family:${F};font-size:16px;line-height:24px;color:${B.charcoal}">Kind regards,<br><strong>${esc(o.signoff ?? "The SortMyCover team")}</strong></p></td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:20px 8px 0;font-family:${F};font-size:12px;line-height:18px;color:${B.muted}">${esc(DISCLOSURE)}<br>Questions? <a href="mailto:${SMC_REPLY_TO}" style="color:${B.muted};text-decoration:underline">${SMC_REPLY_TO}</a> &middot; <a href="${SITE}" style="color:${B.muted};text-decoration:underline">sortmycover.co.za</a><br>${esc(ADDRESS)}</td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
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
  const html = smcEmail({ preheader: line, eyebrow: "Booking confirmed", title: "Your call is booked", bodyHtml });
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
