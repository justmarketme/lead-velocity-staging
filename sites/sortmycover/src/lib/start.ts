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
export type HasCover = "yes" | "no" | "unsure";
export type BudgetBand = "lt750" | "750_1250" | "1250_1499" | "1500_plus";
export type Want = "family" | "bond" | "income" | "illness" | "unsure";

export interface Answers {
  intent?: Intent;
  age_band?: AgeBand;
  has_cover?: HasCover;
  budget_band?: BudgetBand;
  want?: Want;
}

export type StepId = "intent" | "age" | "cover" | "budget" | "want" | "time" | "email";
/** Where a step leads: another step, the WhatsApp handoff, or "submit" (POST the answers, then the server says slots or chat). */
export type Next = StepId | "chat" | "submit";

export const TOTAL_STEPS = 6;
const NUMBER: Record<StepId, number> = { intent: 1, age: 2, cover: 3, budget: 4, want: 4, time: 5, email: 6 };
export const stepNumber = (s: StepId) => NUMBER[s];

/** "A will" and "Something else" do not continue on the page: Lindi carries on in the chat. */
export const isChatIntent = (i?: Intent) => i === "will" || i === "other";
/** The "what would you want cover to do" follow-up is asked only when there is no cover now (or they are not sure). */
export const asksWant = (a: Answers) => a.has_cover === "no" || a.has_cover === "unsure";

export function nextStep(step: StepId, a: Answers): Next {
  switch (step) {
    case "intent": return isChatIntent(a.intent) ? "chat" : "age";
    case "age": return "cover";
    case "cover": return "budget";
    case "budget": return asksWant(a) ? "want" : "submit";
    case "want": return "submit";
    case "time": return "email";
    case "email": return "submit";
  }
}

export function prevStep(step: StepId, a: Answers): StepId | null {
  switch (step) {
    case "intent": return null;
    case "age": return "intent";
    case "cover": return "age";
    case "budget": return "cover";
    case "want": return "budget";
    case "time": return asksWant(a) ? "want" : "budget";
    case "email": return "time";
  }
}

/** Where to resume from prefilled answers: the first unanswered step, "chat" for a will / something else, or "time" when every
    question is answered (every age band continues to the time step; Jono, 18 Oct 2026). */
export function resumeAt(a: Answers): StepId | "chat" {
  if (!a.intent) return "intent";
  if (isChatIntent(a.intent)) return "chat";
  if (!a.age_band) return "age";
  if (!a.has_cover) return "cover";
  if (!a.budget_band) return "budget";
  if (asksWant(a) && !a.want) return "want";
  return "time";
}

/** Body for POST /start/answers. A will / something else sends the intent alone; `want` only on the no / not sure path. */
export function answersPayload(a: Answers, request_id: string) {
  if (isChatIntent(a.intent)) return { intent: a.intent, request_id };
  return {
    intent: a.intent,
    age_band: a.age_band,
    has_cover: a.has_cover,
    ...(a.budget_band ? { budget_band: a.budget_band } : {}),
    ...(asksWant(a) && a.want ? { want: a.want } : {}),
    request_id,
  };
}

/** Changing an earlier answer drops the ones that depended on it (the band question and the follow-up differ by cover path). */
export function setAnswer<K extends keyof Answers>(a: Answers, key: K, value: Answers[K]): Answers {
  const out: Answers = { ...a, [key]: value };
  if (key === "has_cover" && a.has_cover !== value) { delete out.budget_band; delete out.want; }
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
