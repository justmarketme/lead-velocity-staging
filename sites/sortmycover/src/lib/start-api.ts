/* n8n client for /start/ (base API_BASE = n8n_base + api_prefix; W39 API v4, 19 Oct 2026). Every call carries the lead token in the
   X-Lead-Token header and nowhere else, never caches, never sends cookies or a referrer, and gives up after 10 s. The token is
   never logged. */
import { API_BASE } from "./site";
import { cleanAnswers, type AdviserInfo, type AdviserReply, type Answers, type BookingState, type Method, type Slot } from "./start";

/** GET /start may return the adviser without an id (not yet confirmable); POST /start/adviser always carries the id. */
export interface Adviser { id?: string; first_name: string; name: string; firm: string; fsp: string | number; bio: string | null; photo_url: string | null }
export type Booking = BookingState;
export interface StartData {
  first_name: string | null;
  phone_pretty: string | null;
  adviser: Adviser | null;
  methods: string[];
  answers: Answers;
  contact: { call_number?: string | null; alt_number?: string | null };
  booking: Booking | null;
}
export interface SlotsData { slots: Slot[]; tz?: string; methods?: string[]; adviser_first_name?: string; fallback?: string }
export interface BookBody { slot_start: string; method: string; email?: string; email_confirmed?: true; guest_email?: string; request_id: string; context: { source: "start_page" } }
export interface BookedInfo { booking_id?: string; start: string; end: string; method: string; join_url?: string; ics_url?: string; verify?: string }

type Fail = { kind: "expired" } | { kind: "error" };
export type StartResult = { kind: "ok"; data: StartData } | Fail;
export type AdviserResult = ({ kind: "ok" } & AdviserReply) | Fail;
export type ContactResult = { kind: "ok" } | { kind: "invalid"; field: "call_number" | "alt_number" } | Fail;
export type AnswersResult = { kind: "ok" } | Fail;
export type MoveResult =
  | { kind: "moved"; booking: { start: string; end: string; method: string; held?: boolean } }
  | { kind: "taken"; slots: Slot[] | null }
  | { kind: "no_booking" } // 409 no_booking: no live booking any more, so the normal flow
  | { kind: "invalid" }
  | Fail;
export interface MoveBody { slot_start: string; method?: string; request_id: string }
export type SlotsResult = { kind: "ok"; data: SlotsData } | Fail;
export type BookResult =
  | { kind: "booked"; info: BookedInfo }
  | { kind: "held"; info: BookedInfo }
  | { kind: "taken"; slots: Slot[] | null }
  | { kind: "email" }
  | Fail;

export interface StartApi {
  getStart(): Promise<StartResult>;
  postAdviser(body: { confirm_adviser?: string; request_id: string }): Promise<AdviserResult>;
  postContact(body: { call_number: string | null; alt_number?: string; request_id: string }): Promise<ContactResult>;
  postAnswers(body: object): Promise<AnswersResult>;
  getSlots(days: number): Promise<SlotsResult>;
  book(body: BookBody): Promise<BookResult>;
  move(body: MoveBody): Promise<MoveResult>;
}

const TIMEOUT_MS = 10_000;
const isAuth = (s: number) => s === 401 || s === 403;
const ok2xx = (s: number) => s >= 200 && s < 300;
const isSlotList = (x: unknown): x is Slot[] => Array.isArray(x) && x.every((s) => s && typeof s.start === "string");
const str = (x: unknown) => (typeof x === "string" && x.trim() ? x.trim() : null);
/** Only an https image URL is ever put in an <img>. */
const photo = (x: unknown) => { const v = str(x); return v && /^https:\/\/[^\s"'<>]+$/i.test(v) ? v : null; };

/** Maps a /book response to what the page shows (pure; unit tested). */
export function interpretBook(status: number, body: any): BookResult {
  if (isAuth(status)) return { kind: "expired" };
  if (status === 409 || body?.error === "slot_taken") {
    const list = isSlotList(body?.slots) ? body.slots : isSlotList(body?.next) ? body.next : null;
    return { kind: "taken", slots: list };
  }
  if (status === 422 || (typeof body?.error === "string" && body.error.startsWith("email_"))) return { kind: "email" };
  if (ok2xx(status) && body && typeof body.start === "string") {
    const info: BookedInfo = { booking_id: body.booking_id, start: body.start, end: body.end, method: body.method, join_url: body.join_url, ics_url: body.ics_url, verify: body.verify };
    if (body.booked === true) return { kind: "booked", info };
    if (body.held === true) return { kind: "held", info };
  }
  return { kind: "error" };
}

/** The adviser card values: name, firm and FSP are required; bio and photo are optional (null shows no bio line / initials). */
export function asAdviser(x: any, needId = true): Adviser | null {
  if (!x || typeof x.name !== "string" || typeof x.first_name !== "string" || typeof x.firm !== "string" || x.fsp == null) return null;
  const id = typeof x.id === "string" && x.id ? x.id : undefined;
  if (needId && !id) return null;
  return { ...(id ? { id } : {}), first_name: x.first_name, name: x.name, firm: x.firm, fsp: x.fsp, bio: str(x.bio), photo_url: photo(x.photo_url) };
}

export function interpretAdviser(status: number, body: any): AdviserResult {
  if (isAuth(status)) return { kind: "expired" };
  if (ok2xx(status) && body?.ok === true && ["adviser", "slots", "chat"].includes(body.next)) {
    return { kind: "ok", next: body.next, adviser: asAdviser(body.adviser) as AdviserInfo | null };
  }
  return { kind: "error" };
}

/** POST /start/move (contract "Reschedule (v4.6)"): 200 { ok, moved, booking:{start,end,method,held} } (moved:false = only the
    method changed), 409 slot_taken / no_booking, 400 invalid. */
export function interpretMove(status: number, body: any): MoveResult {
  if (isAuth(status)) return { kind: "expired" };
  if (body?.error === "no_booking") return { kind: "no_booking" };
  if (status === 409 || body?.error === "slot_taken") {
    const list = isSlotList(body?.slots) ? body.slots : isSlotList(body?.next) ? body.next : null;
    return { kind: "taken", slots: list };
  }
  if (status === 400 || body?.error === "invalid") return { kind: "invalid" };
  const b = body?.booking;
  if (ok2xx(status) && body?.ok === true && b && typeof b.start === "string") return { kind: "moved", booking: { start: b.start, end: b.end, method: b.method, ...(typeof b.held === "boolean" ? { held: b.held } : {}) } };
  return { kind: "error" };
}

/** The move: a switch to a phone call whose number is not confirmed stores the numbers (POST /start/contact) first. */
export async function runMove(
  api: Pick<StartApi, "postContact" | "move">,
  o: { contact: { call_number: string | null; alt_number?: string } | null; move: MoveBody; contactId: string },
): Promise<MoveResult | { kind: "contact"; field: "call_number" | "alt_number" }> {
  if (o.contact) {
    const c = await api.postContact({ ...o.contact, request_id: o.contactId });
    if (c.kind === "invalid") return { kind: "contact", field: c.field };
    if (c.kind !== "ok") return c;
  }
  return api.move(o.move);
}

export function interpretContact(status: number, body: any): ContactResult {
  if (isAuth(status)) return { kind: "expired" };
  if (status === 400 && body?.error === "invalid") return { kind: "invalid", field: body.field === "alt_number" ? "alt_number" : "call_number" };
  if (ok2xx(status) && body?.ok === true) return { kind: "ok" };
  return { kind: "error" };
}

export function interpretAnswers(status: number, body: any): AnswersResult {
  if (isAuth(status)) return { kind: "expired" };
  if (ok2xx(status) && body?.ok === true && (body.next === undefined || body.next === "done")) return { kind: "ok" };
  return { kind: "error" };
}

export function interpretStart(status: number, d: any): StartResult {
  if (isAuth(status)) return { kind: "expired" };
  if (status !== 200 || !d || typeof d !== "object") return { kind: "error" };
  const b = d.booking;
  const booking: Booking | null = b && typeof b.start === "string" ? { start: b.start, end: b.end, method: b.method, held: b.held === true } : null;
  return {
    kind: "ok",
    data: {
      first_name: str(d.first_name), phone_pretty: str(d.phone_pretty), adviser: asAdviser(d.adviser, false),
      methods: Array.isArray(d.methods) ? d.methods : [], answers: cleanAnswers(d.answers),
      contact: d.contact && typeof d.contact === "object" ? d.contact : {}, booking,
    },
  };
}

/** The booking for the chosen time: a phone call stores the numbers (POST /start/contact) first, then POST /book; Teams books
    straight away. A contact failure stops before /book. */
export type RunBookResult = BookResult | { kind: "contact"; field: "call_number" | "alt_number" };
export async function runBooking(
  api: Pick<StartApi, "postContact" | "book">,
  o: { method: Method; contact: { call_number: string | null; alt_number?: string } | null; book: BookBody; contactId: string },
): Promise<RunBookResult> {
  if (o.method === "phone") {
    if (!o.contact) return { kind: "contact", field: "call_number" };
    const c = await api.postContact({ ...o.contact, request_id: o.contactId });
    if (c.kind === "invalid") return { kind: "contact", field: c.field };
    if (c.kind !== "ok") return c;
  }
  return api.book(o.book);
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
      return interpretStart(r.status, r.data);
    },
    async postAdviser(body) {
      const r = await call("POST", "/start/adviser", body);
      return interpretAdviser(r.status, r.data);
    },
    async postContact(body) {
      const r = await call("POST", "/start/contact", body);
      return interpretContact(r.status, r.data);
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
    async move(body) {
      const r = await call("POST", "/start/move", body);
      return interpretMove(r.status, r.data);
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
  if (ok2xx(status) && body?.ok === true && body.status === "accepted" && typeof body.lead_token === "string" && body.lead_token)
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
