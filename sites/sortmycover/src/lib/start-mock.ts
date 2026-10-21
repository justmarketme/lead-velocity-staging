/* DEV ONLY: in-memory fake of the /start/ API (W39 v4), used when `npm run dev` opens /start/#lt=demo (or #lt=demo-booked, which
   resumes with a booking and no answers yet; add &move=1 for the Move your call screen). Start.tsx imports this behind `import.meta.env.DEV`, so the production build drops
   it (tests/dist.test.ts checks dist has no trace of it). */
import type { LeadPoster, StartApi } from "./start-api";
import { cleanAnswers, toSaNumber, type Answers, type Slot } from "./start";

const wait = (ms = 350) => new Promise((r) => setTimeout(r, ms));

/** About ten open half-hours over the next seven days, in South African time (UTC+2), skipping weekends. With `days` = 14 (the
    move screen) it returns up to 30 over the next 17 days, so a few lie past the 14-day cap the page applies. */
function sampleSlots(now = new Date(), days = 7): Slot[] {
  const out: Slot[] = [];
  const times = [[9, 0], [10, 30], [14, 0], [16, 0]];
  const cap = days > 7 ? 30 : 10, last = days > 7 ? days + 3 : 9;
  for (let d = 1; out.length < cap && d <= last; d++) {
    const day = new Date(now.getTime() + d * 86400000);
    const sast = new Date(day.getTime() + 2 * 3600000);
    const dow = sast.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    for (const [h, m] of times.slice(0, d % 2 ? 2 : 3)) {
      const y = sast.getUTCFullYear(), mo = sast.getUTCMonth(), dd = sast.getUTCDate();
      const start = new Date(Date.UTC(y, mo, dd, h - 2, m));
      const iso = (x: Date) => x.toISOString().slice(0, 19).replace(/Z$/, "");
      const toSast = (x: Date) => iso(new Date(x.getTime() + 2 * 3600000)) + "+02:00";
      out.push({ start: toSast(start), end: toSast(new Date(start.getTime() + 30 * 60000)) });
      if (out.length >= cap) break;
    }
  }
  return out;
}

export const MOCK_ADVISER = {
  id: "mock-broker", first_name: "Mark", name: "Mark Weston", firm: "Oracle Private Wealth", fsp: "28418",
  bio: "With 26 years' experience, I help families protect the people they love and plan for retirement, before and at retirement.",
  photo_url: null,
};

/** DEV: POST /lead for /start/?ref=demo (no token yet). A first name of "Blocked" exercises the neutral screen. */
export const mockPostLead: LeadPoster = async (body: any) => {
  await wait(500);
  if (/^blocked$/i.test(body.first_name || "")) return { kind: "neutral" };
  return { kind: "accepted", token: "demo", lead_id: "demo-lead" };
};

export interface MockLog { calls: string[] }

/** `booked`: start with a held booking and no answers (the resume-after-booking path). `log` records every call, in order. */
export function createMockApi(opts: { booked?: boolean; log?: MockLog } = {}): StartApi {
  let answers: Answers = {};
  let confirmed = !!opts.booked; // a booked lead is already routed
  let contactDone = false;
  let slots = sampleSlots();
  let taken = false;
  let booking: { start: string; end: string; method: string; held: boolean } | null = opts.booked ? { ...slots[1], method: "teams", held: false } : null;
  const log = (c: string) => opts.log?.calls.push(c);
  return {
    async getStart() {
      log("start");
      await wait();
      return { kind: "ok", data: { first_name: "Naledi", phone_pretty: "082 123 4567", adviser: MOCK_ADVISER, methods: ["teams", "whatsapp_call", "phone"], answers, contact: {}, booking } };
    },
    async postAdviser(body) {
      log(body.confirm_adviser ? "adviser:confirm" : "adviser");
      await wait();
      // two phases, like W39: no confirm names the adviser (no routing); confirming that adviser routes and opens the times
      if (body.confirm_adviser === MOCK_ADVISER.id) { confirmed = true; return { kind: "ok", next: "slots", adviser: MOCK_ADVISER }; }
      return { kind: "ok", next: "adviser", adviser: MOCK_ADVISER };
    },
    async postContact(body) {
      log("contact");
      await wait();
      if (body.call_number != null && !toSaNumber(body.call_number)) return { kind: "invalid", field: "call_number" };
      if (body.alt_number != null && !toSaNumber(body.alt_number)) return { kind: "invalid", field: "alt_number" };
      contactDone = true;
      return { kind: "ok" };
    },
    async postAnswers(body: any) {
      log("answers");
      await wait();
      const a = cleanAnswers(body);
      if (!a.age_band || !a.income_band || !a.topics?.length) return { kind: "error" };
      answers = a;
      return { kind: "ok" };
    },
    async getSlots(days) {
      log("slots");
      await wait();
      if (!confirmed) throw new Error("mock: slots requested before the adviser was confirmed");
      if (days > 7) return { kind: "ok", data: { slots: sampleSlots(new Date(), days).filter((s) => s.start !== booking?.start), tz: "Africa/Johannesburg", methods: ["teams", "phone"] } };
      return { kind: "ok", data: { slots, tz: "Africa/Johannesburg", methods: ["teams", "whatsapp_call", "phone"], adviser_first_name: "Mark" } };
    },
    async book(body) {
      log("book");
      await wait(600);
      if (body.method === "phone" && !contactDone) throw new Error("mock: phone booking before /start/contact");
      if (body.method === "phone" && "email" in body) throw new Error("mock: a phone booking carries no email");
      if (body.method === "teams" && !body.email) return { kind: "email" };
      if (/^bad@/.test(body.email || "")) return { kind: "email" };
      // the first booking of the third slot pretends someone else just took it, to exercise the 409 path
      if (!taken && body.slot_start === slots[2]?.start) {
        taken = true;
        slots = slots.filter((s) => s.start !== body.slot_start);
        return { kind: "taken", slots };
      }
      const s = slots.find((x) => x.start === body.slot_start) ?? slots[0];
      // like W05 (smoke #1, 21 Oct 2026): a phone call needs no email and is booked at once (confirmed on WhatsApp); Teams is
      // held until the email link is tapped
      if (body.method === "phone") {
        booking = { start: s.start, end: s.end, method: body.method, held: false };
        return { kind: "booked", info: { booking_id: "demo-1", start: s.start, end: s.end, method: body.method } };
      }
      booking = { start: s.start, end: s.end, method: body.method, held: true };
      return { kind: "held", info: { booking_id: "demo-1", start: s.start, end: s.end, method: body.method, verify: "email" } };
    },
    async move(body) {
      log("move");
      await wait(600);
      if (!booking) return { kind: "no_booking" };
      if (body.method === "phone" && booking.method !== "phone" && !contactDone) throw new Error("mock: move to a phone call before /start/contact");
      const start = new Date(body.slot_start);
      if (isNaN(start.getTime())) return { kind: "invalid" };
      const next = { start: body.slot_start, end: new Date(start.getTime() + 30 * 60000).toISOString(), method: body.method || booking.method, held: booking.held };
      booking = next;
      return { kind: "moved", booking: next };
    },
  };
}
