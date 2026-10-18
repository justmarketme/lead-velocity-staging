/* /start/: the per-lead page Lindi links to from WhatsApp (sortmycover.co.za/start/#lt=<token>). Pure helpers only (unit tested in
   tests/start.test.ts): token parsing, the step machine, slot grouping and formatting in South African time, meeting-type mapping,
   the email check and did-you-mean. No DOM, no network. */

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

/* ---------------- answers and steps ---------------- */
export type Intent = "life" | "income" | "illness" | "review" | "will" | "other";
export type AgeBand = "lt35" | "35_44" | "45_50" | "51plus";
/** Step 3 (Jono, 18 Oct 2026): four options. "yes" is the legacy value (stored answers from before the change, still accepted by
    W39) and takes the same path as yes_work / yes_own. */
export type HasCover = "yes_work" | "yes_own" | "no" | "unsure" | "yes";
export type BudgetBand = "lt750" | "750_1250" | "1250_1499" | "1500_plus";
export type Want = "family" | "bond" | "income" | "illness" | "unsure";

export interface Answers {
  intent?: Intent;
  age_band?: AgeBand;
  has_cover?: HasCover;
  budget_band?: BudgetBand;
  want?: Want;
}

/** "adviser" is step 5 part A: who the call is with, and what is shared with them, shown and confirmed before any open time is asked for. */
/** "details" is step 0, shown only on the no-token path (desktop CTAs link to /start/?ref=...): name, WhatsApp number, consent. */
export type StepId = "details" | "intent" | "age" | "cover" | "budget" | "want" | "adviser" | "time" | "email";
/** Where a step leads: another step, the WhatsApp handoff, "lead" (POST /lead, which returns the token every later call needs) or
    "submit" (POST the answers, then the server says adviser, slots or chat). */
export type Next = StepId | "chat" | "submit" | "lead";

export const TOTAL_STEPS = 6;
const NUMBER: Record<StepId, number> = { details: 0, intent: 1, age: 2, cover: 3, budget: 4, want: 4, adviser: 5, time: 5, email: 6 };
export const stepNumber = (s: StepId) => NUMBER[s];
/** The pill and the bars: "n of 6" on Lindi's token link; "n of 7" when the visit started at step 0 (it counts as step 1). */
export function progress(s: StepId, withDetails: boolean): { n: number; total: number } {
  return withDetails ? { n: NUMBER[s] + 1, total: TOTAL_STEPS + 1 } : { n: NUMBER[s], total: TOTAL_STEPS };
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

/** "A will" and "Something else" do not continue on the page: Lindi carries on in the chat. */
export const isChatIntent = (i?: Intent) => i === "will" || i === "other";
/** The "what would you want cover to do" follow-up is asked only when there is no cover now (or they are not sure). */
export const asksWant = (a: Answers) => a.has_cover === "no" || a.has_cover === "unsure";
/** Has cover now (through work, their own, or the legacy "yes"): the pay-band question, no "want" step. */
export const hasCoverNow = (a: Answers) => a.has_cover === "yes_work" || a.has_cover === "yes_own" || a.has_cover === "yes";

export function nextStep(step: StepId, a: Answers): Next {
  switch (step) {
    case "details": return "lead";
    case "intent": return isChatIntent(a.intent) ? "chat" : "age";
    case "age": return "cover";
    case "cover": return "budget";
    case "budget": return asksWant(a) ? "want" : "submit";
    case "want": return "submit";
    case "adviser": return "submit"; // POST again with confirm_adviser; only a confirmed 'slots' answer opens the times
    case "time": return "email";
    case "email": return "submit";
  }
}

export function prevStep(step: StepId, a: Answers): StepId | null {
  switch (step) {
    case "details": return null;
    case "intent": return null; // after step 0 the lead exists: there is no going back to re-send the details
    case "age": return "intent";
    case "cover": return "age";
    case "budget": return "cover";
    case "want": return "budget";
    case "adviser": return asksWant(a) ? "want" : "budget";
    case "time": return "adviser";
    case "email": return "time";
  }
}

/** Where to resume from prefilled answers: the first unanswered step, "chat" for a will / something else, or "adviser" when every
    question is answered (every age band continues; Jono, 18 Oct 2026). Never "time": even a lead that is already routed sees and
    confirms the adviser first. */
export function resumeAt(a: Answers): StepId | "chat" {
  if (!a.intent) return "intent";
  if (isChatIntent(a.intent)) return "chat";
  if (!a.age_band) return "age";
  if (!a.has_cover) return "cover";
  if (!a.budget_band) return "budget";
  if (asksWant(a) && !a.want) return "want";
  return "adviser";
}

/** Body for POST /start/answers. A will / something else sends the intent alone; `want` only on the no / not sure path;
    `confirm_adviser` only once the person has seen the adviser disclosure and pressed the button. */
export function answersPayload(a: Answers, request_id: string, confirm_adviser?: string | null) {
  if (isChatIntent(a.intent)) return { intent: a.intent, request_id };
  return {
    intent: a.intent,
    age_band: a.age_band,
    has_cover: a.has_cover,
    ...(a.budget_band ? { budget_band: a.budget_band } : {}),
    ...(asksWant(a) && a.want ? { want: a.want } : {}),
    ...(confirm_adviser ? { confirm_adviser } : {}),
    request_id,
  };
}

/* ---------------- adviser disclosure (before routing) ---------------- */
export interface AdviserInfo { id: string; first_name: string; name: string; firm: string; fsp: string | number }
export interface AnswersReply { next: "adviser" | "slots" | "chat"; adviser?: AdviserInfo | null }
export type AfterAnswers = { k: "chat" } | { k: "adviser"; adviser: AdviserInfo } | { k: "slots" } | { k: "error" };

/** What the page does with a POST /start/answers reply. `confirmed` is the adviser id sent as confirm_adviser (null on the first
    POST). The times open ONLY on 'slots' to a confirming POST for that same adviser; any other adviser re-shows part A. */
export function afterAnswers(r: AnswersReply, confirmed: string | null): AfterAnswers {
  if (r.next === "chat") return { k: "chat" };
  const adv = r.adviser && r.adviser.id ? r.adviser : null;
  if (r.next === "adviser") return adv ? { k: "adviser", adviser: adv } : { k: "error" };
  // next === "slots"
  if (confirmed && (!adv || adv.id === confirmed)) return { k: "slots" };
  return adv ? { k: "adviser", adviser: adv } : { k: "error" };
}

/** The required disclosure on part A, built from the API values (always shown in full). Gender-neutral. */
export function adviserDisclosure(a: Pick<AdviserInfo, "first_name" | "name" | "firm" | "fsp">): [string, string, string] {
  return [
    `${a.name}, ${a.firm}, an authorised financial services provider (FSP ${a.fsp}). ${a.first_name} will be the one on the call with you.`,
    `SortMyCover shares your name, WhatsApp number and the answers you gave here with ${a.first_name} to prepare for the call.`,
    INTRO_DISCLOSURE,
  ];
}
export const INTRO_DISCLOSURE = "Introduced by SortMyCover. SortMyCover gives no financial advice, product comparisons or premium quotes. Advisers pay SortMyCover a fee that does not depend on whether you buy anything.";

/** Changing an earlier answer drops the ones that depended on it (the band question and the follow-up differ by cover path). */
export function setAnswer<K extends keyof Answers>(a: Answers, key: K, value: Answers[K]): Answers {
  const out: Answers = { ...a, [key]: value };
  // the band question differs by path (what you pay vs what you could put towards cover): clear it only when the path changes
  if (key === "has_cover" && a.has_cover !== value && asksWant(a) !== asksWant(out)) { delete out.budget_band; delete out.want; }
  return out;
}

/* ---------------- meeting type ---------------- */
/** Two meeting types only (Jono, 18 Oct 2026): a Teams call or a phone call. "whatsapp_call" is ignored even when the API lists it. */
export type Method = "teams" | "phone";
export const METHOD_ORDER: Method[] = ["teams", "phone"];
export const METHOD_LABEL: Record<Method, string> = { teams: "Teams call", phone: "Phone call" };

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
/** The adviser named in the step 0 consent (consent_mode "named"). One place for the name, practice and FSP number. */
/** Under the WhatsApp number on step 0 (Jono, 18 Oct 2026): why WhatsApp, and what arrives there next. */
export const WHY_WHATSAPP = "Why WhatsApp? It's quick and easy: you get answers fast, with no call centre or waiting on hold. Your booking confirmation and reminders come here too.";
export const START_ADVISER = { name: "Mark Weston", practice: "Oracle Private Wealth", fsp: "28418" } as const;
export const startIntroLine = (a: { name: string; practice: string; fsp: string } = START_ADVISER) =>
  `You'll book a 30-minute call with ${a.name}, ${a.practice}, an authorised financial services provider (FSP ${a.fsp}).`;

/** The named consent text exactly as shown (and posted as consent_text): config/consent.json named.text with the practice and FSP. */
export function namedConsent(cfg: { named: { text: string; version: string } }, a: { practice: string; fsp: string } = START_ADVISER) {
  return { text: cfg.named.text.replace(/\{practice_name\}/g, a.practice).replace(/\{fsp_number\}/g, a.fsp), version: cfg.named.version, mode: "named" as const };
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
/** Body for POST /lead from step 0 (the removed quiz's postLead shape, consent_mode "named", start_page: true). */
export function leadBody(i: LeadInput, cfg: { named: { text: string; version: string }; ads: { text: string; version: string } }) {
  const c = namedConsent(cfg);
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
