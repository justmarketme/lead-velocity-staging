/* n8n client for /start/ (base API_BASE = n8n_base + api_prefix). Every call carries the lead token in the X-Lead-Token header and
   nowhere else, never caches, never sends cookies or a referrer, and gives up after 10 s. The token is never logged. */
import { API_BASE } from "./site";
import type { AdviserInfo, Answers, AnswersReply, Slot } from "./start";

/** GET /start may return the adviser without an id (not yet confirmable); POST /start/answers always carries the id. */
export interface Adviser { id?: string; first_name: string; name: string; firm: string; fsp: string | number }
export interface Booking { start: string; end: string; method: string; held: boolean }
export interface StartData {
  first_name: string | null;
  adviser: Adviser | null;
  methods: string[];
  answers: Answers;
  booking: Booking | null;
}
export interface SlotsData { slots: Slot[]; tz?: string; methods?: string[]; adviser_first_name?: string; fallback?: string }
export interface BookBody { slot_start: string; method: string; email: string; email_confirmed: true; request_id: string; context: { source: "start_page" } }
export interface BookedInfo { booking_id?: string; start: string; end: string; method: string; join_url?: string; ics_url?: string; verify?: string }

type Fail = { kind: "expired" } | { kind: "error" };
export type StartResult = { kind: "ok"; data: StartData } | Fail;
export type AnswersResult = ({ kind: "ok" } & AnswersReply) | Fail;
export type SlotsResult = { kind: "ok"; data: SlotsData } | Fail;
export type BookResult =
  | { kind: "booked"; info: BookedInfo }
  | { kind: "held"; info: BookedInfo }
  | { kind: "taken"; slots: Slot[] | null }
  | { kind: "email" }
  | Fail;

export interface StartApi {
  getStart(): Promise<StartResult>;
  postAnswers(body: object): Promise<AnswersResult>;
  getSlots(days: number): Promise<SlotsResult>;
  book(body: BookBody): Promise<BookResult>;
}

const TIMEOUT_MS = 10_000;
const isAuth = (s: number) => s === 401 || s === 403;
const isSlotList = (x: unknown): x is Slot[] => Array.isArray(x) && x.every((s) => s && typeof s.start === "string");

/** Maps a /book response to what the page shows (pure; unit tested). */
export function interpretBook(status: number, body: any): BookResult {
  if (isAuth(status)) return { kind: "expired" };
  if (status === 409 || body?.error === "slot_taken") {
    const list = isSlotList(body?.slots) ? body.slots : isSlotList(body?.next) ? body.next : null;
    return { kind: "taken", slots: list };
  }
  if (status === 422 || (typeof body?.error === "string" && body.error.startsWith("email_"))) return { kind: "email" };
  if (status >= 200 && status < 300 && body && typeof body.start === "string") {
    const info: BookedInfo = { booking_id: body.booking_id, start: body.start, end: body.end, method: body.method, join_url: body.join_url, ics_url: body.ics_url, verify: body.verify };
    if (body.booked === true) return { kind: "booked", info };
    if (body.held === true) return { kind: "held", info };
  }
  return { kind: "error" };
}

const asAdviser = (x: any): AdviserInfo | null =>
  x && typeof x.id === "string" && x.id && typeof x.name === "string" && typeof x.first_name === "string" && typeof x.firm === "string" && x.fsp != null
    ? { id: x.id, first_name: x.first_name, name: x.name, firm: x.firm, fsp: x.fsp } : null;

export function interpretAnswers(status: number, body: any): AnswersResult {
  if (isAuth(status)) return { kind: "expired" };
  if (status >= 200 && status < 300 && body?.ok === true && ["adviser", "slots", "chat"].includes(body.next)) {
    return { kind: "ok", next: body.next, adviser: asAdviser(body.adviser) };
  }
  return { kind: "error" };
}

export function createStartApi(token: string, base: string = API_BASE): StartApi {
  async function call(method: "GET" | "POST", path: string, body?: object): Promise<{ status: number; data: any }> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      const headers: Record<string, string> = { "X-Lead-Token": token, Accept: "application/json" };
      if (body) headers["Content-Type"] = "application/json";
      const res = await fetch(base + path, {
        method, headers, body: body ? JSON.stringify(body) : undefined,
        cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer", signal: ctl.signal,
      });
      let data: any = null;
      try { data = await res.json(); } catch { /* empty or non-JSON body */ }
      return { status: res.status, data };
    } catch {
      return { status: 0, data: null }; // network error or timeout
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    async getStart() {
      const r = await call("GET", "/start");
      if (isAuth(r.status)) return { kind: "expired" };
      if (r.status === 200 && r.data && typeof r.data === "object") {
        const d = r.data;
        return { kind: "ok", data: { first_name: d.first_name ?? null, adviser: d.adviser ?? null, methods: Array.isArray(d.methods) ? d.methods : [], answers: d.answers ?? {}, booking: d.booking ?? null } };
      }
      return { kind: "error" };
    },
    async postAnswers(body) {
      const r = await call("POST", "/start/answers", body);
      return interpretAnswers(r.status, r.data);
    },
    async getSlots(days) {
      const r = await call("GET", `/slots?days=${days}`);
      if (isAuth(r.status)) return { kind: "expired" };
      if (r.status === 200 && r.data && Array.isArray(r.data.slots)) return { kind: "ok", data: r.data };
      return { kind: "error" };
    },
    async book(body) {
      const r = await call("POST", "/book", body);
      return interpretBook(r.status, r.data);
    },
  };
}

/* ---------- step 0: POST /lead (no token yet; the reply carries it) ---------- */
export type LeadResult =
  | { kind: "accepted"; token: string; lead_id?: string }
  | { kind: "neutral" } // not_qualified or suppressed: thank them, no booking
  | { kind: "rate" } // 429
  | { kind: "mobile" } // 422 on the number
  | { kind: "error" }; // 400 try_again, 5xx, network, or an accepted reply without a token (never proceed without one)

export function interpretLead(status: number, body: any): LeadResult {
  if (status === 429) return { kind: "rate" };
  if (body && (body.status === "not_qualified" || body.status === "suppressed" || body.out_of_band === true)) return { kind: "neutral" };
  if (status === 422 && /mobile/.test(String(body?.error || ""))) return { kind: "mobile" };
  if (status >= 200 && status < 300 && body?.ok === true && body.status === "accepted" && typeof body.lead_token === "string" && body.lead_token)
    return { kind: "accepted", token: body.lead_token, lead_id: body.lead_id };
  return { kind: "error" };
}

export type LeadPoster = (body: object) => Promise<LeadResult>;
export const postLead: LeadPoster = async (body) => {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(API_BASE + "/lead", {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body),
      cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer", signal: ctl.signal,
    });
    let data: any = null;
    try { data = await res.json(); } catch { /* empty body */ }
    return interpretLead(res.status, data);
  } catch {
    return { kind: "error" };
  } finally {
    clearTimeout(timer);
  }
};
