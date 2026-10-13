// Every transactional email Lead Velocity sends through Resend, on the shared Lead Velocity layout (lv_email.ts).
// Pure functions: values in, { subject, html, text } out. No network, no Deno APIs, so the Deno tests
// (lv_emails.test.ts) and the admin-only email-preview function render exactly what the senders send.
//
// Escaping rule: every caller-supplied value goes through esc() (or a helper that escapes: kv, badge, textBlocks, linkify).
// Each email also returns a plain-text twin (`text`) for deliverability.
import {
  badge, esc, grad, heading, htmlToText, kv, linkify, lvEmail, lvText, panel, para, steps, strong, textBlocks, href,
  type KvValue,
} from "./lv_email.ts";

export interface BuiltEmail {
  subject: string;
  html: string;
  text: string;
}

const WWW = "https://www.leadvelocity.co.za";
const F = "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const RSQUO = "&rsquo;";

type Step = { title: string; text?: string };
const stepsText = (items: Step[]) => items.map((s, i) => `${i + 1}. ${s.title}${s.text ? `: ${s.text}` : ""}`).join("\n");

/** "October 14, 2026" (en-US, as the senders always did). An unparseable value is shown as given. */
export function fmtDate(iso: unknown): string {
  const d = new Date(String(iso ?? ""));
  return Number.isNaN(d.getTime()) ? String(iso ?? "") : d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}
/** "14 Oct 2026, 08:30" (en-ZA) */
export function fmtDateTime(iso: unknown): string {
  if (!iso) return "—";
  const d = new Date(String(iso));
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" });
}
const capitalise = (s: unknown) => String(s ?? "").replace(/\b\w/g, (c) => c.toUpperCase());

/** Small print for invites: expiry, a copy-and-paste link for when the button fails, and the "ignore this" line. */
function inviteFinePrint(link: string, expiry: string): { html: string; text: string } {
  const html = `This invitation expires on <strong style="color:#ffffff;font-weight:600">${esc(expiry)}</strong>. If the button doesn${RSQUO}t work, copy and paste this link into your browser:<br><a href="${href(link)}" style="color:#b83df5;text-decoration:none;word-break:break-all">${esc(link)}</a><br><br>If you didn${RSQUO}t expect this invitation, you can safely ignore this email.`;
  const text = `This invitation expires on ${expiry}. If the button doesn't work, copy and paste this link into your browser:\n${link}\n\nIf you didn't expect this invitation, you can safely ignore this email.`;
  return { html, text };
}

// ---------------------------------------------------------------------------------------------- send-admin-invite
export function adminInviteEmail(d: { inviteLink: string; expiresAt: string }): BuiltEmail {
  const expiry = fmtDate(d.expiresAt);
  const list: Step[] = [
    { title: "Open your invite", text: "Click the button below to access your invite." },
    { title: "Create your account", text: "Choose a secure password." },
    { title: "Start managing the platform", text: "Leads, brokers and everything else, in one place." },
  ];
  const intro = `You${RSQUO}ve been invited to join Lead Velocity as an ${strong("Administrator")}. This gives you full access to manage leads, brokers and the platform.`;
  const fine = inviteFinePrint(d.inviteLink, expiry);
  const html = lvEmail({
    preheader: "Your Lead Velocity admin invitation is ready.",
    eyebrow: "Admin invitation",
    title: `You${RSQUO}re invited to ${grad("Lead Velocity")}`,
    intro,
    body: [heading("How to get started"), steps(list)],
    button: { label: "Accept Invitation", url: d.inviteLink },
    finePrint: fine.html,
  });
  const text = lvText({
    title: "You're invited to Lead Velocity", parts: [htmlToText(intro), `How to get started:\n${stepsText(list)}`],
    button: { label: "Accept Invitation", url: d.inviteLink }, finePrint: fine.text,
  });
  return { subject: "You've Been Invited as an Admin - Lead Velocity", html, text };
}

// ---------------------------------------------------------------------------------------------- send-broker-invite
export function brokerInviteEmail(d: { brokerName?: string | null; inviteLink: string; expiresAt: string; portalType?: string | null }): BuiltEmail {
  const marketing = d.portalType === "marketing";
  const portalLabel = marketing ? "Elite Marketing Portal" : "Referral Broker Portal";
  const portalDescription = marketing
    ? "We generate leads and book them directly into your calendar — all you do is close."
    : "Upload your leads and track every referral in real-time through your dedicated portal.";
  const name = String(d.brokerName ?? "").trim();
  const list: Step[] = [
    { title: "Open your setup link", text: "Click the button below to access your setup link." },
    { title: "Create your password", text: "Choose a password and set up your security questions." },
    { title: "Track everything", text: "Access your broker dashboard and start tracking." },
  ];
  const intro = `You${RSQUO}ve been invited to join the Lead Velocity ${strong(esc(portalLabel))}. ${esc(portalDescription)}`;
  const fine = inviteFinePrint(d.inviteLink, fmtDate(d.expiresAt));
  const html = lvEmail({
    preheader: `Your Lead Velocity ${portalLabel} invitation is ready.`,
    eyebrow: portalLabel,
    title: `You${RSQUO}re invited${name ? `, ${grad(esc(name))}` : ""}.`,
    intro,
    body: [heading("How to get started"), steps(list)],
    button: { label: "Setup Your Account", url: d.inviteLink },
    finePrint: fine.html,
  });
  const text = lvText({
    title: `You're invited${name ? `, ${name}` : ""}.`, parts: [htmlToText(intro), `How to get started:\n${stepsText(list)}`],
    button: { label: "Setup Your Account", url: d.inviteLink }, finePrint: fine.text,
  });
  return { subject: `You've Been Invited to the ${portalLabel} — Lead Velocity`, html, text };
}

// ---------------------------------------------------------------------------------------------- send-communication
/** Does this look like HTML (the document senders pass <p>…</p>) rather than text typed into the compose box? */
export const looksLikeHtml = (s: string) => /<\/?(p|br|div|strong|b|em|i|u|ul|ol|li|a|table|tr|td|h[1-6]|span|blockquote|img)\b[^>]*>/i.test(s);

/**
 * The CRM appends a plain-text signature ("─────" rule, sender name, "Title | Lead Velocity", contact lines) to contract,
 * invoice and proposal emails. The layout carries its own signature block, so lift the name and title out and drop the text.
 */
export function splitTextSignature(content: string): { body: string; sender?: { name: string; title: string } } {
  const m = /(?:\s*<br\s*\/?>)*\s*─{10,}[ \t]*\r?\n\s*([^\r\n<>]{1,60}?)[ \t]*\r?\n[ \t]*([^\r\n|<>]{1,60}?)[ \t]*\|[ \t]*Lead Velocity[\s\S]*$/.exec(content);
  return m ? { body: content.slice(0, m.index), sender: { name: m[1].trim(), title: m[2].trim() } } : { body: content };
}

const P_STYLE = `margin:0 0 14px;font-family:${F};font-size:15px;line-height:25px;color:#b9b0d6`;
const A_STYLE = "color:#b83df5;text-decoration:none;font-weight:500";
const TAGS_STRONG = ["strong", "b"], TAGS_EM = ["em", "i"], TAGS_HEAD = ["h1", "h2", "h3", "h4", "h5", "h6"];

/**
 * Allow-list HTML for the dark layout: keeps paragraphs, line breaks, bold/italic/underline, lists, headings and links
 * (http/https/mailto/tel only), restyled in the Lead Velocity palette. Drops every attribute, script, style, image and
 * unknown tag (text kept). Output sits in a wrapper that sets the base font and colour, so bare text stays readable.
 */
export function cleanRichHtml(input: string): string {
  const aStack: boolean[] = [];
  const tokens = String(input ?? "").replace(/<(script|style|head|title)\b[\s\S]*?<\/\1\s*>/gi, "").replace(/<!--[\s\S]*?-->/g, "").split(/(<[^>]*>)/);
  let out = "";
  for (const tok of tokens) {
    if (!tok.startsWith("<") || !tok.endsWith(">")) {
      out += tok.replace(/&(?!#?[a-z0-9]+;)/gi, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      continue;
    }
    const m = /^<(\/?)([a-z][a-z0-9]*)\b([^>]*)>$/i.exec(tok);
    if (!m) continue;
    const close = m[1] === "/";
    const tag = m[2].toLowerCase();
    if (tag === "br") out += "<br>";
    else if (tag === "p") out += close ? "</p>" : `<p style="${P_STYLE}">`;
    else if (tag === "div") out += close ? "<br>" : "";
    else if (TAGS_STRONG.includes(tag)) out += close ? "</strong>" : `<strong style="color:#ffffff;font-weight:600">`;
    else if (TAGS_EM.includes(tag)) out += close ? "</em>" : "<em>";
    else if (tag === "u") out += close ? "</u>" : "<u>";
    else if (tag === "ul" || tag === "ol") out += close ? `</${tag}>` : `<${tag} style="margin:0 0 14px;padding-left:22px;font-family:${F};font-size:15px;line-height:25px;color:#b9b0d6">`;
    else if (tag === "li") out += close ? "</li>" : `<li style="margin:0 0 6px">`;
    else if (TAGS_HEAD.includes(tag)) out += close ? "</h2>" : `<h2 style="margin:22px 0 10px;font-family:${F};font-size:20px;line-height:26px;font-weight:700;letter-spacing:-0.3px;color:#ffffff">`;
    else if (tag === "a") {
      if (close) { if (aStack.pop()) out += "</a>"; continue; }
      const h = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(m[3]);
      const url = (h?.[1] ?? h?.[2] ?? "").replace(/&amp;/g, "&").trim();
      const ok = /^(https?:\/\/|mailto:|tel:)/i.test(url);
      aStack.push(ok);
      if (ok) out += `<a href="${href(url)}" style="${A_STYLE}">`;
    }
  }
  while (aStack.pop()) out += "</a>";
  out = out.replace(/(<br>\s*){3,}/g, "<br><br>").replace(/^(\s*<br>)+/, "").replace(/(<br>\s*)+$/, "").trim();
  return `<div style="font-family:${F};font-size:15px;line-height:25px;color:#b9b0d6">${out}</div>`;
}

/** send-communication email channel: a message typed in the CRM (plain text) or built by it (HTML), in the Lead Velocity layout. */
export function communicationEmail(d: { content: string; subject: string }): BuiltEmail {
  const { body, sender } = splitTextSignature(String(d.content ?? ""));
  const rich = looksLikeHtml(body);
  const bodyHtml = rich ? cleanRichHtml(body) : textBlocks(body);
  const bodyText = rich ? htmlToText(bodyHtml) : body.replace(/\r\n/g, "\n").trim();
  const html = lvEmail({ preheader: bodyText.replace(/\s+/g, " ").slice(0, 110), eyebrow: "Message from Lead Velocity", title: esc(d.subject), body: [bodyHtml], signoff: null, signature: sender });
  const text = lvText({ title: d.subject, parts: [bodyText], signoff: null, signature: sender });
  return { subject: d.subject, html, text };
}

// ---------------------------------------------------------------------------------------------- send-bulk-communication
/** One personalised plain-text message (already merged for this recipient) in the Lead Velocity layout. */
export function bulkCommunicationEmail(d: { message: string; subject: string }): BuiltEmail {
  const message = String(d.message ?? "").replace(/\r\n/g, "\n").trim();
  const html = lvEmail({
    preheader: message.replace(/\s+/g, " ").slice(0, 110), eyebrow: "Message from Lead Velocity", title: esc(d.subject), body: [textBlocks(message)],
    signoff: null, finePrint: "This email was sent from Lead Velocity.",
  });
  const text = lvText({ title: d.subject, parts: [message], signoff: null, finePrint: "This email was sent from Lead Velocity." });
  return { subject: d.subject, html, text };
}

// ---------------------------------------------------------------------------------------------- send-document-notification
export function documentSharedEmail(d: { documentName: string; documentCategory?: string | null; recipientName?: string | null }): BuiltEmail {
  const who = String(d.recipientName ?? "").trim() || "there";
  const intro = `Hi ${esc(who)}, a new document has been shared with you in your broker portal.`;
  const rows: Array<[string, KvValue]> = [["Name", d.documentName], ["Category", capitalise(d.documentCategory)]];
  const url = `${WWW}/broker/documents`;
  const html = lvEmail({
    preheader: `New document shared: ${d.documentName}`, eyebrow: "New document", title: `A document was ${grad("shared")} with you`, intro,
    body: [kv(rows, "Document details")], button: { label: "View Document", url }, signoff: null,
    finePrint: "This is an automated notification from Lead Velocity.",
  });
  const text = lvText({
    title: "A document was shared with you", parts: [htmlToText(intro), `Name: ${d.documentName}\nCategory: ${capitalise(d.documentCategory) || "-"}`],
    button: { label: "View Document", url }, signoff: null, finePrint: "This is an automated notification from Lead Velocity.",
  });
  return { subject: `New Document Shared: ${d.documentName}`, html, text };
}

// ---------------------------------------------------------------------------------------------- send-message-notification
export function messageNotificationEmail(d: { leadName: string; message: string; senderRole: string; recipientName?: string | null }): BuiltEmail {
  const senderLabel = d.senderRole === "admin" ? "Admin" : "Broker";
  const message = String(d.message ?? "");
  const shown = message.length > 200 ? message.substring(0, 200) + "..." : message;
  const who = String(d.recipientName ?? "").trim() || "there";
  const intro = `Hi ${esc(who)}, you have a new message regarding lead ${strong(esc(d.leadName))}.`;
  const quote = `<span style="font-style:italic;color:#ffffff">&ldquo;${esc(shown).replace(/\r?\n/g, "<br>")}&rdquo;</span>`;
  const html = lvEmail({
    preheader: shown.replace(/\s+/g, " ").slice(0, 110), eyebrow: `New message · ${senderLabel}`, title: `You have a ${grad("new message")}`, intro,
    body: [panel(quote, `Message from ${senderLabel}`)], button: { label: "View in Portal", url: WWW }, signoff: null,
    finePrint: "This is an automated notification from Lead Velocity.",
  });
  const text = lvText({
    title: "You have a new message", parts: [htmlToText(intro), `Message from ${senderLabel}:\n"${shown}"`],
    button: { label: "View in Portal", url: WWW }, signoff: null, finePrint: "This is an automated notification from Lead Velocity.",
  });
  return { subject: `New Message from ${senderLabel} - Lead: ${d.leadName}`, html, text };
}

// ---------------------------------------------------------------------------------------------- send-onboarding-notification
/** To the broker who just submitted the onboarding form. */
export function onboardingConfirmationEmail(d: { fullName?: string | null; preferredCallTime?: string | null }): BuiltEmail {
  const firstName = String(d.fullName || "there").trim().split(/\s+/)[0] || "there";
  const call = String(d.preferredCallTime ?? "").trim();
  const intro = `We${RSQUO}ve received your details and your strategy snapshot is in.`;
  const next = `A Lead Velocity consultant will review your profile and reach out shortly${call ? ` &mdash; you told us ${strong(esc(call))} suits you best` : ""}. If anything you submitted needs correcting, just reply to this email and we${RSQUO}ll update it.`;
  const html = lvEmail({
    preheader: "We've received your details. A consultant will be in touch shortly.", eyebrow: "Onboarding received",
    title: `Thanks, ${grad(esc(firstName))}.`, intro, body: [para(next), para("Talk soon,")], signoff: null,
  });
  const text = lvText({ title: `Thanks, ${firstName}.`, parts: [htmlToText(intro), htmlToText(next), "Talk soon,"], signoff: null });
  return { subject: "We've received your details — Lead Velocity", html, text };
}

export interface OnboardingRecord {
  full_name?: string | null; firm_name?: string | null; email?: string | null; phone_number?: string | null; whatsapp_number?: string | null;
  preferred_call_time?: string | null; product_focus?: unknown; geographic_focus_clarity?: string | null; timeline_to_start?: string | null;
  monthly_lead_spend?: string | null; desired_leads_weekly?: string | null; created_at?: string | null;
}
/** Internal alert to howzit@ with the whole submission. */
export function onboardingInternalEmail(r: OnboardingRecord): BuiltEmail {
  const products = Array.isArray(r.product_focus) ? (r.product_focus as string[]).join(", ") : "";
  const received = fmtDateTime(r.created_at);
  const rows: Array<[string, KvValue]> = [
    ["Name", r.full_name], ["Firm", r.firm_name], ["Email", r.email], ["Phone", r.phone_number], ["WhatsApp", r.whatsapp_number],
    ["Preferred call time", r.preferred_call_time], ["Products", products], ["Geography", r.geographic_focus_clarity],
    ["Timeline to start", r.timeline_to_start], ["Monthly lead spend", r.monthly_lead_spend], ["Desired leads/week", r.desired_leads_weekly], ["Submitted", received],
  ];
  const html = lvEmail({
    preheader: `${r.full_name || "Unknown"}${r.firm_name ? ` — ${r.firm_name}` : ""} submitted the onboarding form.`, eyebrow: "Internal · onboarding",
    title: `New broker ${grad("onboarding")}`, intro: `Received ${esc(received)}.`, body: [kv(rows, "Submission")], signoff: null,
    finePrint: "Manage this lead in the CRM &rarr; Onboarding.",
  });
  const text = lvText({
    title: "New broker onboarding submission", parts: [`Received ${received}.`, rows.map(([k, v]) => `${k}: ${String(v ?? "").trim() || "-"}`).join("\n")],
    signoff: null, finePrint: "Manage this lead in the CRM -> Onboarding.",
  });
  return { subject: `New onboarding: ${r.full_name || "Unknown"}${r.firm_name ? ` — ${r.firm_name}` : ""}`, html, text };
}

// ---------------------------------------------------------------------------------------------- send-sla-alert
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600), mins = Math.floor((seconds % 3600) / 60), secs = seconds % 60;
  if (hours > 0) return `${hours}h ${mins}m`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}
export function slaAlertEmail(d: { channel: string; severity: string; responseSeconds: number; thresholdSeconds: number; recipientType: string; recipientName?: string | null }): BuiltEmail {
  const critical = d.severity === "critical";
  const channel = String(d.channel ?? "").toUpperCase();
  const tone = critical ? "critical" : "warning";
  const colour = critical ? "#f87171" : "#fbbf24";
  const rows: Array<[string, KvValue]> = [
    ["Channel", channel],
    ["Response time", { html: `<span style="color:${colour}">${esc(formatDuration(d.responseSeconds))}</span>` }],
    ["SLA threshold", formatDuration(d.thresholdSeconds)],
    ["Recipient type", d.recipientType],
    ...(d.recipientName ? [["Recipient", d.recipientName] as [string, KvValue]] : []),
  ];
  const action = `${strong("Action required:")} please review and respond to this communication as soon as possible.`;
  const intro = `A ${esc(channel)} response took longer than the agreed service level.`;
  const html = lvEmail({
    preheader: `${critical ? "Critical" : "Warning"}: ${channel} response time exceeded the SLA.`, eyebrow: "SLA alert",
    title: `Response time ${grad("SLA exceeded")}`, intro, body: [badge(critical ? "Critical" : "Warning", tone), kv(rows), panel(action)],
    signoff: null, finePrint: "Lead Velocity &middot; Communication Management System",
  });
  const text = lvText({
    title: "Response time SLA exceeded", parts: [`${critical ? "CRITICAL" : "WARNING"}: ${htmlToText(intro)}`, rows.map(([k, v]) => `${k}: ${typeof v === "object" && v ? htmlToText(v.html) : v}`).join("\n"), htmlToText(action)],
    signoff: null, finePrint: "Lead Velocity - Communication Management System",
  });
  return { subject: `${critical ? "🚨 CRITICAL" : "⚠️ WARNING"} - ${channel} Response Time Exceeded SLA`, html, text };
}

// ---------------------------------------------------------------------------------------------- send-scheduled-report
export interface ReportAnalytics {
  summary?: { total: number; outbound: number; inbound: number; success_rate: number };
  channels?: Record<string, { total: number; successful: number }>;
  response_times?: { count: number; average: number; min: number; max: number };
}
export function formatDateRange(start: Date, end: Date): string {
  const o: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${start.toLocaleDateString("en-US", o)} - ${end.toLocaleDateString("en-US", o)}`;
}
const CHANNEL_LABEL: Record<string, string> = { sms: "SMS", whatsapp: "WhatsApp", email: "Email", call: "Call" };
const channelLabel = (c: string) => CHANNEL_LABEL[c.toLowerCase()] ?? capitalise(c);
const reportDuration = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};
export function scheduledReportEmail(d: { name: string; frequency?: string | null; start: Date; end: Date; generatedAt: Date; analytics: ReportAnalytics }): BuiltEmail {
  const { summary, channels, response_times: rt } = d.analytics;
  const range = formatDateRange(d.start, d.end);
  const rateColour = (r: number) => (r >= 80 ? "#34d399" : r >= 60 ? "#fbbf24" : "#f87171");
  const blocks: string[] = [];
  const lines: string[] = [];
  if (summary) {
    blocks.push(heading("Summary"), kv([
      ["Total communications", summary.total], ["Outbound", summary.outbound], ["Inbound", summary.inbound],
      ["Success rate", { html: `<span style="color:${rateColour(summary.success_rate)}">${esc(summary.success_rate)}%</span>` }],
    ]));
    lines.push(`SUMMARY\nTotal communications: ${summary.total}\nOutbound: ${summary.outbound}\nInbound: ${summary.inbound}\nSuccess rate: ${summary.success_rate}%`);
  }
  if (channels) {
    const entries = Object.entries(channels);
    const rate = (c: { total: number; successful: number }) => (c.total > 0 ? Math.round((c.successful / c.total) * 100) : 0);
    blocks.push(heading("Channel breakdown"), kv(entries.map(([ch, s]) => [channelLabel(ch), `${s.successful} of ${s.total} successful (${rate(s)}%)`] as [string, KvValue])));
    lines.push(`CHANNEL BREAKDOWN\n${entries.map(([ch, s]) => `${channelLabel(ch)}: ${s.successful} of ${s.total} successful (${rate(s)}%)`).join("\n")}`);
  }
  if (rt && rt.count > 0) {
    blocks.push(heading("Response times"), kv([
      ["Average response time", reportDuration(rt.average)], ["Fastest response", reportDuration(rt.min)], ["Slowest response", reportDuration(rt.max)],
    ]));
    lines.push(`RESPONSE TIMES\nAverage: ${reportDuration(rt.average)}\nFastest: ${reportDuration(rt.min)}\nSlowest: ${reportDuration(rt.max)}`);
  }
  if (!blocks.length) { blocks.push(para("No report sections were selected for this report.")); lines.push("No report sections were selected for this report."); }
  const generated = d.generatedAt.toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg", dateStyle: "medium", timeStyle: "short" });
  const fine = `This is an automated report from Lead Velocity. Generated ${generated} (SAST).`;
  const html = lvEmail({
    preheader: `${d.name}: ${range}`, eyebrow: `Scheduled report${d.frequency ? ` · ${esc(capitalise(d.frequency))}` : ""}`,
    title: esc(d.name), intro: esc(range), body: blocks, signoff: null, finePrint: esc(fine),
  });
  const text = lvText({ title: d.name, parts: [range, ...lines], signoff: null, finePrint: fine });
  return { subject: `${d.name} - ${range}`, html, text };
}

// ---------------------------------------------------------------------------------------------- book-appointment
/** Ayanda's booking confirmation (goes to the broker's calendar address and the lead). `whenText` is already formatted in SAST. */
export function appointmentBookedEmail(d: { leadName: string; phone?: string | null; brokerName: string; firmName: string; whenText: string; notes?: string | null }): BuiltEmail {
  const rows: Array<[string, KvValue]> = [
    ["Lead", d.leadName], ["Phone", d.phone || "N/A"], ["Broker", `${d.brokerName} · ${d.firmName}`],
    ["Date & time", `${d.whenText} (SAST)`], ["Call notes", d.notes || "No notes provided."],
  ];
  const intro = `Ayanda booked an appointment for ${strong(esc(d.leadName))}.`;
  const note = `Lead status has been updated to ${strong("Booked")} in the Lead Velocity dashboard.`;
  const html = lvEmail({
    preheader: `${d.leadName} · ${d.whenText} (SAST)`, eyebrow: "Ayanda · AI voice agent", title: `Appointment ${grad("booked")}`, intro,
    body: [kv(rows, "Appointment details"), panel(note)], signoff: null,
  });
  const text = lvText({
    title: "Appointment booked", parts: [htmlToText(intro), rows.map(([k, v]) => `${k}: ${v}`).join("\n"), htmlToText(note)], signoff: null,
  });
  return { subject: `📅 Appointment Booked: ${d.leadName} — ${d.whenText}`, html, text };
}
