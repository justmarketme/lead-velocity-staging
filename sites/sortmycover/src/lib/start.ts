/* /start/: the per-lead page Lindi links to from WhatsApp (sortmycover.co.za/start/#lt=<token>). Pure helpers only (unit tested in
   tests/start.test.ts): token parsing, the v4 step machine (book first, then age, income and topics), the adviser confirm gate,
   slot grouping and formatting in South African time, meeting types, the contact numbers, the email check and did-you-mean.
   No DOM, no network. Flow and API: start-page v4 contract (Jono, 19 Oct 2026, mockup v4.2). */

/* ---------------- token ---------------- */
export const TOKEN_KEY = "smc_lt";
const TOKEN_RE = /^[A-Za-z0-9._~+/=-]{1,4096}$/;

/** Reads `lt` from a location.hash ("#lt=abc" or "#x=1&lt=abc"). The token travels in the fragment only (never the query string),
    so it is never sent to a server or in a referrer. Returns null when absent or malformed. */
export function readTokenFromHash(hash: string): string | null {
  const raw = (hash || "").replace(/^#/, "");
  if (!raw) return null;
  let v: string | null = null;
  try { v = new URLSearchParams(raw).get("lt"); } catch { return null; }
  if (!v) return null;
  v = v.trim();
  return TOKEN_RE.test(v) ? v : null;
}

/* ---------------- answers (asked after the booking) ---------------- */
export type AgeBand = "lt35" | "35_44" | "45_50" | "51plus";
/** Monthly income before tax, Jono's bands (final, 19 Oct 2026). */
export type IncomeBand = "lt15k" | "15k_30k" | "30k_50k" | "50k_80k" | "80kplus" | "prefer_not";
export type Topic = "life" | "disability_income" | "severe_illness" | "review" | "new_bond" | "will";

export interface Answers {
  age_band?: AgeBand;
  income_band?: IncomeBand;
  topics?: Topic[];
}

export const AGE_BANDS: { v: AgeBand; t: string }[] = [{ v: "lt35", t: "Under 35" }, { v: "35_44", t: "35 to 44" }, { v: "45_50", t: "45 to 50" }, { v: "51plus", t: "Over 50" }];
export const INCOME_BANDS: { v: IncomeBand; t: string }[] = [
  { v: "lt15k", t: "Up to R15,000" }, { v: "15k_30k", t: "R15,000 to R30,000" }, { v: "30k_50k", t: "R30,000 to R50,000" },
  { v: "50k_80k", t: "R50,000 to R80,000" }, { v: "80kplus", t: "R80,000 or more" }, { v: "prefer_not", t: "Prefer not to say" },
];
export const TOPICS: { v: Topic; t: string }[] = [
  { v: "life", t: "Life cover" }, { v: "disability_income", t: "Disability or income protection" }, { v: "severe_illness", t: "Severe illness cover" },
  { v: "review", t: "Review my cover" }, { v: "new_bond", t: "I just got a new bond" }, { v: "will", t: "I need a will" },
];
const isIn = <T extends string>(list: { v: T }[], x: unknown): x is T => list.some((o) => o.v === x);
export const isAgeBand = (x: unknown): x is AgeBand => isIn(AGE_BANDS, x);
export const isIncomeBand = (x: unknown): x is IncomeBand => isIn(INCOME_BANDS, x);
export const isTopic = (x: unknown): x is Topic => isIn(TOPICS, x);

/** Stored answers from GET /start, keeping only v4 values (older pages' intent / has_cover / budget_band / want are ignored). */
export function cleanAnswers(x: any): Answers {
  const out: Answers = {};
  if (x && isAgeBand(x.age_band)) out.age_band = x.age_band;
  if (x && isIncomeBand(x.income_band)) out.income_band = x.income_band;
  if (x && Array.isArray(x.topics)) { const t = TOPICS.map((o) => o.v).filter((v) => x.topics.includes(v)); if (t.length) out.topics = t; }
  return out;
}

/** Ticks or unticks a topic, keeping the page's order. */
export function toggleTopic(list: readonly Topic[] | undefined, t: Topic): Topic[] {
  const set = new Set(list || []);
  if (set.has(t)) set.delete(t); else set.add(t);
  return TOPICS.map((o) => o.v).filter((v) => set.has(v));
}
/** "Done" stays disabled until at least one topic is ticked. */
export const canFinishTopics = (list: readonly Topic[] | undefined) => !!list && list.filter(isTopic).length > 0;
export const answersComplete = (a: Answers) => !!a.age_band && !!a.income_band && canFinishTopics(a.topics);

/** Body for POST /start/answers (after the booking; no routing). Null until every answer is in. */
export function answersPayload(a: Answers, request_id: string) {
  if (!answersComplete(a)) return null;
  return { age_band: a.age_band!, income_band: a.income_band!, topics: a.topics!.filter(isTopic), request_id };
}

/* ---------------- steps ---------------- */
/** "details" is step 0, shown only on the no-token path (desktop CTAs link to /start/?ref=...): name, WhatsApp number, consent.
    "email" is the Teams invite step; "number" is the phone-call step (which number to call, an optional other number, the email). */
export type StepId = "details" | "time" | "email" | "number" | "age" | "income" | "topics" | "move";
/** Where a step leads: another step, "lead" (POST /lead, which returns the token every later call needs), "book" (the booking
    calls, then the Booked screen and "Carry on" to age) or "answers" (POST /start/answers, then All set). */
export type Next = StepId | "lead" | "book" | "answers";

export const TOTAL_STEPS = 5;
const NUMBER: Record<StepId, number> = { details: 0, time: 1, email: 2, number: 2, age: 3, income: 4, topics: 5, move: 0 };
export const stepNumber = (s: StepId) => NUMBER[s];
/** The pill and the bars: "n of 5" (time, invite, age, income, topics) on Lindi's link; "n of 6" when the visit started at step 0. */
export function progress(s: StepId, withDetails: boolean): { n: number; total: number } | null {
  if (s === "move") return null; // the reschedule screen shows "Move your call" instead of a count
  return withDetails ? { n: NUMBER[s] + 1, total: TOTAL_STEPS + 1 } : { n: NUMBER[s], total: TOTAL_STEPS };
}

export function nextStep(step: StepId, method: Method | null): Next {
  switch (step) {
    case "details": return "lead";
    case "time": return method === "phone" ? "number" : "email";
    case "email": return "book";
    case "number": return "book";
    case "age": return "income";
    case "income": return "topics";
    case "topics": return "answers";
    case "move": return method === "phone" ? "number" : "book"; // "book" here = POST /start/move (the page asks the number only when needed)
  }
}

/** Back links. Nothing goes back past the booking (it is kept) or to step 0 (the lead exists). */
export function prevStep(step: StepId): StepId | null {
  switch (step) {
    case "email": case "number": return "time";
    case "income": return "age";
    case "topics": return "income";
    default: return null;
  }
}

/** The calls the booking makes, in order: a phone call stores the numbers first (W05 uses call_number || phone). */
export const bookingCalls = (method: Method): ("contact" | "book")[] => (method === "phone" ? ["contact", "book"] : ["book"]);

export interface BookingState { start: string; end: string; method: string; held: boolean }
/** Where GET /start resumes: no booking → the time step (adviser first); a booking with every answer in → All set; a booking with
    answers missing → the age step (the booking stays whatever happens after it). */
export function resumeAt(booking: BookingState | null, a: Answers): "time" | "age" | "allset" {
  if (!booking) return "time";
  return answersComplete(a) ? "allset" : "age";
}

/** No token in the fragment or sessionStorage: start at step 0 (a desktop visit from a site CTA, or anyone without Lindi's link),
    except ?for=wills, which goes straight to the WhatsApp handoff (wills are a separate project, booked by Lindi on WhatsApp).
    "This link has expired" is kept for a token the API rejected. */
export function firstScreen(token: string | null, search = ""): "details" | "load" | "wills" {
  if (token) return "load";
  const q = new URLSearchParams(search);
  return q.get("for") === "wills" || isWillsRef(q.get("ref")) ? "wills" : "details";
}
/** A token that came only from sessionStorage (no #lt in this address) and fails to load is a leftover of an earlier visit, e.g.
    a desktop "Pick a time" click days later. It is dropped and the visit starts at the details step (or the wills hand-off),
    never an "expired" or error screen. A token from the link itself keeps the normal expired / error screens. */
export function onLoadFailure(kind: "expired" | "error", storedOnly: boolean, search = ""): "details" | "wills" | "expired" | "loadError" {
  if (storedOnly) { const f = firstScreen(null, search); return f === "wills" ? "wills" : "details"; }
  return kind === "expired" ? "expired" : "loadError";
}
/** startHref (src/lib/whatsapp.ts) sends only ?ref and ?via, so a wills page is recognised by its code: w-wills, w-home-wills,
    w-book-will and the like, or a theme B campaign code (b01 to b04). */
export const isWillsRef = (ref: string | null | undefined) => !!ref && (/^w-(?:[a-z0-9]+-)*wills?(?:-|$)/i.test(ref) || /^b\d{2}$/i.test(ref));

/* ---------------- adviser confirm gate (POST /start/adviser, before any open time) ---------------- */
export interface AdviserInfo { id: string; first_name: string; name: string; firm: string; fsp: string | number; bio: string | null; photo_url: string | null }
export interface AdviserReply { next: "adviser" | "slots" | "chat"; adviser?: AdviserInfo | null }
export type AfterAdviser = { k: "chat" } | { k: "adviser"; adviser: AdviserInfo } | { k: "slots" } | { k: "error" };

/** What the page does with a POST /start/adviser reply. `confirmed` is the adviser id sent as confirm_adviser (null on the first
    POST). The times open ONLY on 'slots' to a confirming POST for that same adviser; any other adviser re-shows the card. */
export function afterAdviser(r: AdviserReply, confirmed: string | null): AfterAdviser {
  if (r.next === "chat") return { k: "chat" };
  const adv = r.adviser && r.adviser.id ? r.adviser : null;
  if (r.next === "adviser") return adv ? { k: "adviser", adviser: adv } : { k: "error" };
  // next === "slots"
  if (confirmed && (!adv || adv.id === confirmed)) return { k: "slots" };
  return adv ? { k: "adviser", adviser: adv } : { k: "error" };
}

/** The required small print under "Book this time": shown with the adviser card, before the confirm that routes the lead. */
export const INTRO_DISCLOSURE = "Introduced by SortMyCover, which gives no advice. Advisers pay SortMyCover a fee that doesn't depend on whether you buy anything.";
export const fspLine = (fsp: string | number) => `Authorised FSP ${fsp}`;

/* ---------------- meeting type ---------------- */
/** Two meeting types only (Jono, 18 Oct 2026): a Teams call or a phone call. "whatsapp_call" is ignored even when the API lists it. */
export type Method = "teams" | "phone";
export const METHOD_ORDER: Method[] = ["teams", "phone"];
export const METHOD_LABEL: Record<Method, string> = { teams: "Microsoft Teams call", phone: "Phone call" };

/** Only the meeting types the server offers, in the page's fixed order (unknown values and WhatsApp call are ignored). */
export function availableMethods(methods: readonly string[] | null | undefined): Method[] {
  const set = new Set(methods || []);
  return METHOD_ORDER.filter((m) => set.has(m));
}
export function defaultMethod(methods: readonly string[] | null | undefined): Method | null {
  const av = availableMethods(methods);
  return av.includes("teams") ? "teams" : av[0] ?? null;
}
export const methodLabel = (m: string) => METHOD_LABEL[m as Method] ?? "Call";

/* ---------------- phone call: which number (POST /start/contact) ---------------- */
/** Any South African number (mobile or landline: 011 234 5678, 082 123 4567, +27..., 0027...) to +27..., or null. */
export function toSaNumber(v: string): string | null {
  let d = String(v || "").replace(/[^\d+]/g, "");
  if (d.indexOf("+") > 0) return null;
  d = d.replace(/^\+/, "");
  if (d.indexOf("0027") === 0) d = d.slice(4);
  else if (d.indexOf("27") === 0 && d.length === 11) d = d.slice(2);
  else if (d.charAt(0) === "0") d = d.slice(1);
  else return null;
  return /^[1-8]\d{8}$/.test(d) ? "+27" + d : null;
}

export interface ContactInput { use: "whatsapp" | "other"; other: string; alt: string }
export type ContactPayload = { call_number: string | null; alt_number?: string };
/** Body for POST /start/contact (without request_id), or the field to fix. call_number null = call the WhatsApp number. */
export function contactPayload(c: ContactInput): { ok: true; body: ContactPayload } | { ok: false; field: "call_number" | "alt_number" } {
  let call: string | null = null;
  if (c.use === "other") { call = toSaNumber(c.other); if (!call) return { ok: false, field: "call_number" }; }
  const altRaw = c.alt.trim();
  let alt: string | undefined;
  if (altRaw) { const a = toSaNumber(altRaw); if (!a) return { ok: false, field: "alt_number" }; alt = a; }
  return { ok: true, body: alt ? { call_number: call, alt_number: alt } : { call_number: call } };
}

/* ---------------- slots (South African time) ---------------- */
export const TZ = "Africa/Johannesburg";
export interface Slot { start: string; end: string }
export interface SlotRow extends Slot { day: string; time: string }
export interface SlotGroup { label: string; rows: SlotRow[] }

function parts(d: Date) {
  const f = new Intl.DateTimeFormat("en-ZA", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const o: Record<string, string> = {};
  for (const p of f.formatToParts(d)) o[p.type] = p.value;
  return o;
}
const MONTH_NUM: Record<string, number> = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };

/** "Tue 21 Oct" in South African time. */
export function formatDay(iso: string): string {
  const p = parts(new Date(iso));
  return `${p.weekday.replace(/\.$/, "")} ${+p.day} ${p.month.replace(/\.$/, "")}`;
}
/** "10:30" (24-hour) in South African time. */
export function formatTime(iso: string): string {
  const p = parts(new Date(iso));
  return `${p.hour.padStart(2, "0")}:${p.minute.padStart(2, "0")}`;
}
/** "Tue 21 Oct at 10:30". */
export const formatWhen = (iso: string, sep = " at ") => formatDay(iso) + sep + formatTime(iso);

/** Days since 1970-01-01 of the calendar date in South African time. */
function sastDayNumber(d: Date): number {
  const p = parts(d);
  return Math.floor(Date.UTC(+p.year, (MONTH_NUM[p.month.replace(/\.$/, "").slice(0, 3)] ?? 1) - 1, +p.day) / 86400000);
}
/** Monday-based week index (1970-01-01 was a Thursday, so +3 puts Monday at the start of each 7-day block). */
const weekIndex = (dayNum: number) => Math.floor((dayNum + 3) / 7);

/** Sorts the slots and groups them under "This week" / "Next week" / "Later" (weeks run Monday to Sunday, South African time). */
export function groupSlots(slots: readonly Slot[], now: Date): SlotGroup[] {
  const thisWeek = weekIndex(sastDayNumber(now));
  const sorted = [...slots].filter((s) => !isNaN(Date.parse(s.start))).sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const groups: SlotGroup[] = [];
  for (const s of sorted) {
    const w = weekIndex(sastDayNumber(new Date(s.start))) - thisWeek;
    const label = w <= 0 ? "This week" : w === 1 ? "Next week" : "Later";
    let g = groups[groups.length - 1];
    if (!g || g.label !== label) groups.push((g = { label, rows: [] }));
    g.rows.push({ ...s, day: formatDay(s.start), time: formatTime(s.start) });
  }
  return groups;
}

/** The first `n` rows across groups (the rest sit behind "More times"); empty groups are dropped. */
export function limitGroups(groups: SlotGroup[], n: number): SlotGroup[] {
  let left = n;
  const out: SlotGroup[] = [];
  for (const g of groups) {
    if (left <= 0) break;
    const rows = g.rows.slice(0, left);
    left -= rows.length;
    if (rows.length) out.push({ label: g.label, rows });
  }
  return out;
}
export const countRows = (groups: SlotGroup[]) => groups.reduce((n, g) => n + g.rows.length, 0);

/* ---------------- email ---------------- */
export function validEmail(s: string): boolean {
  const v = s.trim();
  return v.length <= 254 && /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[A-Za-z]{2,}$/.test(v);
}

const KNOWN_DOMAINS = ["gmail.com", "yahoo.com", "yahoo.co.za", "outlook.com", "hotmail.com", "icloud.com", "live.com", "live.co.za", "mweb.co.za", "webmail.co.za", "telkomsa.net", "vodamail.co.za"];
/** Typos edit distance alone would miss or map to the wrong domain. */
const TYPOS: Record<string, string> = { gmail: "gmail.com", gmial: "gmail.com", gmal: "gmail.com", "gmail.co": "gmail.com", "gmail.co.za": "gmail.com", yahoo: "yahoo.com", outlook: "outlook.com", hotmail: "hotmail.com", icloud: "icloud.com", "hotmail.co": "hotmail.com", "outlook.co": "outlook.com" };

function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1), i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1] ? d[i - 2][j - 2] + 1 : Infinity);
  return d[a.length][b.length];
}

/** "naledi@gmial.com" -> "naledi@gmail.com"; null when the domain is known, unrelated, or the address has no domain yet. */
export function suggestEmail(s: string): string | null {
  const v = s.trim();
  const at = v.lastIndexOf("@");
  if (at < 1 || at === v.length - 1) return null;
  const local = v.slice(0, at);
  const dom = v.slice(at + 1).toLowerCase();
  if (KNOWN_DOMAINS.includes(dom)) return null;
  if (TYPOS[dom]) return `${local}@${TYPOS[dom]}`;
  const tryFix = (d: string): string | null => {
    const max = d.length >= 9 ? 2 : 1; // short domains: one slip only, so a real small domain is not "corrected"
    let best: string | null = null, bestD = max + 1;
    for (const k of KNOWN_DOMAINS) { const x = distance(d, k); if (x < bestD) { bestD = x; best = k; } }
    return best && d.length >= 5 ? best : null;
  };
  // ".con" / ".cmo" style TLD slips on top of a name typo
  const fixed = tryFix(dom) ?? tryFix(dom.replace(/\.(con|cmo|ocm|vom|xom|om|comm)$/, ".com"));
  return fixed ? `${local}@${fixed}` : null;
}

/* ---------------- misc ---------------- */
/** wa.me link to the SortMyCover number, no prefilled text (the person is already in the chat). */
export const waLink = (number: string) => `https://wa.me/${(number || "").replace(/\D/g, "")}`;

/** "Mark Weston" -> "MW". */
export function initials(name: string | null | undefined): string {
  const w = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!w.length) return "";
  return (w[0][0] + (w.length > 1 ? w[w.length - 1][0] : "")).toUpperCase();
}

/** Idempotency key for POSTs (8 to 64 characters). */
export function requestId(): string {
  const c = typeof crypto !== "undefined" ? crypto : undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b); else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

/* ---------------- step 0 (no token): details and consent ---------------- */
/**
 * The closing screens for a visit that began at step 0 (desktop / no Lindi link). That visitor has not been on WhatsApp yet, so
 * "back to WhatsApp" makes no sense (Jono, 20 Oct 2026): say what arrives there, from whom, and why it is the easy way.
 */
export const webNextWhatsApp = (number: string | null) =>
  `Next, look out for a WhatsApp from SortMyCover${number ? ` on ${number}` : ""} in the next minute. It has your booking details, and it's where your reminders come and where you can move or cancel your call with one tap. There's no app to download and nothing to log in to.`;
export const webSaveNumber = (smcNumber: string) => `Our WhatsApp number is ${smcNumber}. Save it as SortMyCover so you know it's us.`;
export const WEB_CHAT_NEXT = "Say hi to Lindi, SortMyCover's automated assistant, on WhatsApp. Lindi will help you find a time that suits you.";

/** Under the WhatsApp number on step 0 (Jono, 18 Oct 2026): why WhatsApp, and what arrives there next. */
export const WHY_WHATSAPP = "Why WhatsApp? It's quick and easy: you get answers fast, with no call centre or waiting on hold. Your booking confirmation and reminders come here too.";

/**
 * Step 0 names no adviser (Jono, 20 Oct 2026: the introduction to the adviser comes on WhatsApp and by email, not on the website
 * before booking). The consent is config/consent.json generic, exactly as shown and posted as consent_text; W01 then requires the
 * adviser to be disclosed before routing, which the booking step's adviser card does (W39 adviser_disclosed).
 */
export function genericConsent(cfg: { generic: { text: string; version: string } }) {
  return { text: cfg.generic.text, version: cfg.generic.version, mode: "generic" as const };
}

/** South African mobile to +27..., or null. Accepts 082 123 4567, +27 82 123 4567, 0027 82..., 27821234567 (06x, 07x, 08x). */
export function toE164(v: string): string | null {
  let d = String(v || "").replace(/[^\d+]/g, "");
  if (d.indexOf("+") > 0) return null;
  d = d.replace(/^\+/, "");
  if (d.indexOf("0027") === 0) d = d.slice(4);
  else if (d.indexOf("27") === 0 && d.length === 11) d = d.slice(2);
  else if (d.charAt(0) === "0") d = d.slice(1);
  else return null;
  return /^[678]\d{8}$/.test(d) ? "+27" + d : null;
}
/** "+27112345678" -> "011 234 5678" (how the number to call is shown back). */
export const prettyLocal = (e: string) => e.replace(/^\+27(\d{2})(\d{3})(\d{4})$/, "0$1 $2 $3");
export const prettyMobile = (e: string) => e.replace(/^\+27(\d{2})(\d{3})(\d{4})$/, "+27 $1 $2 $3");
export const validFirstName = (s: string) => { const v = s.trim(); return v.length >= 1 && v.length <= 60 && /\p{L}/u.test(v); };

/** Where the visit came from, for the lead record: ?ref=<page code>&via=<source>, plus any utm_* (the old quiz's context.utm shape,
    in which "ref" is one of the keys). */
export function leadAttribution(search: string): { ref: string | null; utm: Record<string, string> } {
  const q = new URLSearchParams(search || "");
  const utm: Record<string, string> = {};
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) { const v = q.get(k); if (v) utm[k] = v.slice(0, 100); }
  const ref = q.get("ref") ? q.get("ref")!.slice(0, 60) : null;
  const via = q.get("via");
  if (via && !utm.utm_source) utm.utm_source = via.slice(0, 60);
  if (ref) utm.ref = ref;
  return { ref, utm };
}

export interface LeadInput {
  first_name: string; mobile: string; ads: "give" | "decline" | null; honeypot: string;
  origin: string; search: string; started_at: string; request_id: string; user_agent: string; now: number;
}
/** Body for POST /lead from step 0 (the removed quiz's postLead shape, consent_mode "generic", start_page: true). */
export function leadBody(i: LeadInput, cfg: { generic: { text: string; version: string }; ads: { text: string; version: string } }) {
  const c = genericConsent(cfg);
  const { ref, utm } = leadAttribution(i.search);
  return {
    first_name: i.first_name.trim(), mobile: i.mobile, consent: true as const,
    consent_text: c.text, consent_version: c.version, consent_mode: c.mode,
    consent_ads: i.ads === "give", consent_ads_text: cfg.ads.text, consent_ads_version: cfg.ads.version,
    angle: "generic", lang: "en", started_at: i.started_at, request_id: i.request_id, page_url: i.origin + "/start/",
    company_website: i.honeypot, honeypot: i.honeypot, turnstile_token: "", start_page: true as const,
    context: { event_id: i.request_id, event_name: "Lead", fbp: null, fbc: null, utm, fbclid: null, ref, page_url: i.origin + "/start/", user_agent: i.user_agent, ts: Math.floor(i.now / 1000) },
  };
}

/* ---------------- optional guest on the invite (Jono, 19 Oct 2026) ---------------- */
/** "Someone else joining?" (Teams invite step only): the guest's email for POST /book as guest_email. A phone call, unticked or
    blank sends nothing; a filled field must be a complete address (same check as the main email). */
export function guestEmail(method: Method | null, on: boolean, v: string): { ok: true; guest_email?: string } | { ok: false } {
  const e = (v || "").trim();
  if (method !== "teams" || !on || !e) return { ok: true };
  return validEmail(e) ? { ok: true, guest_email: e } : { ok: false };
}
/** The /book body. Teams: the email (and guest_email only when there is one). Phone: no email at all (the confirmation and
    reminders come on WhatsApp; Jono, 19 Oct 2026). */
export function bookBody(o: { slot_start: string; method: Method; email?: string; guest_email?: string; request_id: string }) {
  const teams = o.method === "teams";
  return {
    slot_start: o.slot_start, method: o.method,
    ...(teams ? { email: (o.email || "").trim(), email_confirmed: true as const } : {}),
    ...(teams && o.guest_email ? { guest_email: o.guest_email } : {}),
    request_id: o.request_id, context: { source: "start_page" as const },
  };
}

/* ---------------- reschedule: "Move your call" (#lt=...&move=1; Jono, 19 Oct 2026, mockup frames 12 to 14) ---------------- */
export const MOVE_DAYS = 14;
const DAY_MS = 86400000;
/** `move=1` in the fragment, read together with lt. */
export function readMoveFromHash(hash: string): boolean {
  try { return new URLSearchParams((hash || "").replace(/^#/, "")).get("move") === "1"; } catch { return false; }
}
/** A booking that can still be moved: it exists and has not started. Anything else falls back to the normal flow. */
export const isLiveBooking = (b: BookingState | null | undefined, now: Date): b is BookingState => !!b && Date.parse(b.start) > now.getTime();
/** Only times from now up to 14 days from today (the server is asked for days=14; this is the page's own cap). */
export function withinDays(slots: readonly Slot[], now: Date, days = MOVE_DAYS): Slot[] {
  const from = now.getTime(), to = from + days * DAY_MS;
  return slots.filter((s) => { const t = Date.parse(s.start); return !isNaN(t) && t > from && t <= to; });
}
/** "Open times up to Sun 2 Nov (14 days from today)." */
export const moveWindowLine = (now: Date, days = MOVE_DAYS) => `Open times up to ${formatDay(new Date(now.getTime() + days * DAY_MS).toISOString())} (${days} days from today).`;
/** Moving to a phone call asks the number step first unless the number is already confirmed (the call was a phone call, or a
    call number is stored). */
export const moveNeedsNumber = (method: Method, booking: BookingState, contact: { call_number?: string | null } | null | undefined) =>
  method === "phone" && booking.method !== "phone" && !contact?.call_number;
/** Body for POST /start/move: { slot_start, method?, request_id } (contract "Reschedule (v4.6)"); the method is always sent. */
export const moveBody = (slot_start: string, method: Method, request_id: string) => ({ slot_start, method, request_id });

/** The invite line on Booked and All set (Teams only; a phone call has no invite). While the booking is held (waiting on the email
    link) nothing has been sent yet, so it says what happens after the tap; once booked it names the guest it went to. */
export function inviteLine(held: boolean, guest: string | null): string | null {
  if (held) return guest ? `Once you tap the link in your email, we'll send the invite to you and ${guest}.` : "Once you tap the link in your email, we'll send your invite.";
  return guest ? `We've sent the invite to you and ${guest}.` : null;
}
