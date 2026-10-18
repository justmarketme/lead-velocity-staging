/* DEV ONLY: in-memory fake of the /start/ API, used when `npm run dev` opens /start/#lt=demo. Start.tsx imports this behind
   `import.meta.env.DEV`, so the production build drops it (tests/start.test.ts checks dist has no trace of it). */
import type { LeadPoster, StartApi } from "./start-api";
import type { Answers, Slot } from "./start";

const wait = (ms = 350) => new Promise((r) => setTimeout(r, ms));

/** About ten open half-hours over the next seven days, in South African time (UTC+2), skipping weekends. */
function sampleSlots(now = new Date()): Slot[] {
  const out: Slot[] = [];
  const times = [[9, 0], [10, 30], [14, 0], [16, 0]];
  for (let d = 1; out.length < 10 && d <= 9; d++) {
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
      if (out.length >= 10) break;
    }
  }
  return out;
}

const ADVISER = { id: "mock-broker", first_name: "Mark", name: "Mark Weston", firm: "Oracle Private Wealth", fsp: "28418" };

/** DEV: POST /lead for /start/?ref=demo (no token yet). A first name of "Blocked" exercises the neutral screen. */
export const mockPostLead: LeadPoster = async (body: any) => {
  await wait(500);
  if (/^blocked$/i.test(body.first_name || "")) return { kind: "neutral" };
  return { kind: "accepted", token: "demo", lead_id: "demo-lead" };
};

export function createMockApi(): StartApi {
  let answers: Answers = {};
  let routed = false;
  let confirmed = false;
  let slots = sampleSlots();
  let taken = false;
  return {
    async getStart() {
      await wait();
      return { kind: "ok", data: { first_name: "Naledi", adviser: routed ? ADVISER : null, methods: ["teams", "whatsapp_call", "phone"], answers, booking: null } };
    },
    async postAnswers(body: any) {
      await wait();
      const { confirm_adviser, request_id: _rid, ...rest } = body;
      answers = { ...answers, ...rest };
      if (body.intent === "will" || body.intent === "other") return { kind: "ok", next: "chat" };
      routed = true;
      // two phases, like W-start: the first POST routes and names the adviser; only a POST confirming that adviser opens the times
      if (confirm_adviser === ADVISER.id) confirmed = true;
      return confirm_adviser === ADVISER.id ? { kind: "ok", next: "slots", adviser: ADVISER } : { kind: "ok", next: "adviser", adviser: ADVISER };
    },
    async getSlots() {
      await wait();
      if (!confirmed) throw new Error("mock: slots requested before the adviser was confirmed");
      return { kind: "ok", data: { slots, tz: "Africa/Johannesburg", methods: ["teams", "whatsapp_call", "phone"], adviser_first_name: "Mark" } };
    },
    async book(body) {
      await wait(600);
      if (/^bad@/.test(body.email)) return { kind: "email" };
      // the first booking of the third slot pretends someone else just took it, to exercise the 409 path
      if (!taken && body.slot_start === slots[2]?.start) {
        taken = true;
        slots = slots.filter((s) => s.start !== body.slot_start);
        return { kind: "taken", slots };
      }
      const s = slots.find((x) => x.start === body.slot_start) ?? slots[0];
      return { kind: "held", info: { booking_id: "demo-1", start: s.start, end: s.end, method: body.method, verify: "email" } };
    },
  };
}
