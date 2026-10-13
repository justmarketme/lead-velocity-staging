/** Pure quiz logic (no DOM). Covered by tests/quiz.test.ts. */

export type AgeBand = "lt35" | "35_44" | "45_50" | "51plus";

export const AGE_OPTIONS: { value: AgeBand; label: string }[] = [
  { value: "lt35", label: "18 to 34" },
  { value: "35_44", label: "35 to 44" },
  { value: "45_50", label: "45 to 50" },
  { value: "51plus", label: "51 or older" },
];

/** Age band the service accepts: 35 to 50. Same rule as the original landing quiz (age 35-44 and 45-50). Out of band people exit
 *  at once; nothing is sent or stored. The page asks NO budget question (Jono, 2026-10-13): the R1,500 figure was internal research
 *  for the ideal client, never a question for visitors. The self-declared budget band is asked later, on WhatsApp
 *  (deliverables/website/quiz-v2-and-whatsapp-step.md). */
export function ageInBand(a?: string): boolean {
  return a === "35_44" || a === "45_50";
}

/** South African mobile to E.164, or null. Accepts 082 123 4567, +27 82 123 4567, 0027 82..., 27821234567. */
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
export function prettyMobile(e: string): string {
  return e.replace(/^\+27(\d{2})(\d{3})(\d{4})$/, "+27 $1 $2 $3");
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DOMAINS = ["gmail.com", "outlook.com", "hotmail.com", "yahoo.com", "icloud.com", "live.com", "webmail.co.za", "mweb.co.za", "telkomsa.net", "vodamail.co.za", "outlook.co.za", "yahoo.co.za"];
function lev(a: string, b: string): number {
  const m: number[][] = [];
  for (let i = 0; i <= a.length; i++) m[i] = [i];
  for (let j = 0; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return m[a.length][b.length];
}
/** Mailcheck-style typo suggestion; MX / disposable checks happen server side (W05). */
export function suggestEmail(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 1) return null;
  const dom = email.slice(at + 1).toLowerCase();
  if (DOMAINS.includes(dom)) return null;
  let best: string | null = null, bd = 3;
  for (const d of DOMAINS) { const x = lev(dom, d); if (x < bd) { bd = x; best = d; } }
  return best ? email.slice(0, at + 1) + best : null;
}

/** Slot strings from /slots: ISO with +02:00; the page shows date and time straight from the string, in SAST. */
export function normaliseSlots(arr: unknown): string[] {
  const out: Record<string, 1> = {};
  (Array.isArray(arr) ? arr : []).forEach((s) => {
    const v = typeof s === "string" ? s : s && ((s as { start?: string; id?: string }).start || (s as { id?: string }).id);
    if (v && /^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(v)) out[v] = 1;
  });
  return Object.keys(out).sort();
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function dayLabel(iso: string): string {
  const p = iso.slice(0, 10).split("-");
  const d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
  return DAYS[d.getUTCDay()] + " " + +p[2] + " " + MONTHS[+p[1] - 1];
}
/** Group slots by day: first `maxDays` days, up to `perDay` times each. */
export function groupSlots(list: string[], maxDays = 5, perDay = 6): { day: string; slots: string[] }[] {
  const by: Record<string, string[]> = {};
  const order: string[] = [];
  list.forEach((s) => { const k = s.slice(0, 10); if (!by[k]) { by[k] = []; order.push(k); } by[k].push(s); });
  return order.slice(0, maxDays).map((k) => ({ day: k, slots: by[k].slice(0, perDay) }));
}

/** Methods that need an email for the meeting invite. Email is asked ONLY for these. */
/** Verify gate (2026-10-11): every booking needs an email. A new lead's email is never verified yet, and the booking reaches
 *  the adviser only after the emailed link / code confirms it. Teams / Zoom / Meet also get the invite there. */
export const NEEDS_EMAIL: Record<string, true> = { teams: true, zoom: true, google_meet: true, whatsapp_call: true, phone: true };

/** Which consent text is rendered. Named mode only when the practice and FSP number are both known. */
export function consentText(cfg: { named: { text: string; version: string }; generic: { text: string; version: string } }, mode: string, practice: string, fsp: string) {
  const useNamed = mode === "named" && !!practice && !!fsp;
  const c = useNamed ? cfg.named : cfg.generic;
  const main = c.text.replace("{practice_name}", practice).replace("{fsp_number}", fsp);
  return { text: main, version: c.version, mode: useNamed ? "named" : "generic" };
}

/** What the visitor wants to talk about. Sent to n8n as `product_interest`; the wills and estate campaign pages send "wills",
 *  the cover campaign pages "life_cover" (life, disability, severe illness or income cover; never funeral cover). */
export type ProductInterest = "life_cover" | "wills";
/** `?for=` values on /book/ (links from the home page, hubs and articles) -> product. Anything else: ask the first question. */
export function productFromParam(v: string | null | undefined): ProductInterest | null {
  if (v === "wills" || v === "will" || v === "estate") return "wills";
  if (v === "cover" || v === "life_cover" || v === "life") return "life_cover";
  return null;
}
/** Campaign theme -> product: theme B is wills and estate, theme A (and the generic page) is cover. */
export const productForTheme = (theme?: "A" | "B"): ProductInterest => (theme === "B" ? "wills" : "life_cover");
/** First question, "What would you like help with?". Sent as `help_with`; `product_interest` (routing: cover adviser or will
 *  provider) is derived from it, so W01 keeps receiving only "life_cover" or "wills". The reason in the visitor's own words, and
 *  the budget band, are asked on WhatsApp. "review" means an authorised adviser goes through the visitor's existing cover;
 *  SortMyCover itself never reviews cover (wording rule S1). */
export type HelpWith = "review" | "life" | "disability_income" | "severe_illness" | "wills";
export const HELP_OPTIONS: { value: HelpWith; label: string }[] = [
  { value: "review", label: "Review my existing cover" },
  { value: "life", label: "Life cover" },
  { value: "disability_income", label: "Disability or income protection" },
  { value: "severe_illness", label: "Severe illness cover" },
  { value: "wills", label: "My will and estate planning" },
];
export const productOfHelp = (h: HelpWith): ProductInterest => (h === "wills" ? "wills" : "life_cover");
/** Options shown for a known product: a cover page or ?for=cover shows the four cover options, no product shows all five.
 *  A wills page (product "wills") asks nothing: the answer is "wills". */
export function helpOptionsFor(product: ProductInterest | null): { value: HelpWith; label: string }[] {
  if (product === "wills") return [];
  return product === "life_cover" ? HELP_OPTIONS.filter((o) => o.value !== "wills") : HELP_OPTIONS;
}
/** Progress fraction for step n of total. */
export const progressOf = (n: number, total: number) => Math.min(1, Math.max(0, n / total));
