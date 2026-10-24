/* /start/ v4 (book first; Jono, 19 Oct 2026): pure helpers (src/lib/start.ts), response mapping and the booking sequence
   (src/lib/start-api.ts), the dev mock (src/lib/start-mock.ts) and the page copy. */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BANNED } from "../src/build/wording";
import { AdviserCard } from "../src/pages/Start";
import { MOCK_ADVISER, createMockApi, mockPostLead, type MockLog } from "../src/lib/start-mock";
import consentJson from "../config/consent.json";
import {
  AGE_BANDS, INCOME_BANDS, inviteLine, isLiveBooking, moveBody, moveNeedsNumber, moveWindowLine, prettyLocal, readMoveFromHash, withinDays, INTRO_DISCLOSURE, TOPICS, afterAdviser, answersComplete, answersPayload, availableMethods, bookBody, bookingCalls,
  canFinishTopics, cleanAnswers, contactPayload, defaultMethod, firstScreen, formatDay, formatTime, formatWhen, fspLine, groupSlots, guestEmail, initials,
  leadAttribution, leadBody, limitGroups, methodLabel, genericConsent, rateMessage, nextStep, onLoadFailure, prettyMobile, prevStep, progress, readTokenFromHash, resumeAt,
  stepNumber, suggestEmail, toE164, toSaNumber, toggleTopic, validEmail, waLink, WHY_WHATSAPP,
  type AdviserInfo, type Method, type Next, type StepId,
} from "../src/lib/start";
import {
  interpretAdviser, interpretMove, runMove, interpretAnswers, interpretBook, interpretContact, interpretLead, interpretStart, postLead, runBooking, type BookBody, type StartApi,
} from "../src/lib/start-api";

const PAGE = fs.readFileSync(path.resolve(__dirname, "../src/pages/Start.tsx"), "utf8");
const MARK: AdviserInfo = { ...MOCK_ADVISER };

/** Walks the step machine from the time step to the end, standing in for the API calls ("book" → Booked → Carry on → age). */
function walk(method: Method, from: StepId = "time"): (StepId | Next | "booked")[] {
  const out: (StepId | Next | "booked")[] = [from];
  let s: StepId = from;
  for (;;) {
    const n = nextStep(s, method);
    out.push(n);
    if (n === "answers") return out;
    if (n === "lead") { s = "time"; out.push("time"); continue; }
    if (n === "book") { out.push("booked"); s = "age"; out.push("age"); continue; }
    s = n;
  }
}

describe("step order (v4: book first)", () => {
  it("Teams: time, email, book, Booked, age, income, topics, answers", () => {
    expect(walk("teams")).toEqual(["time", "email", "book", "booked", "age", "income", "topics", "answers"]);
  });
  it("phone: time, the number step (with the email), book, Booked, age, income, topics, answers", () => {
    expect(walk("phone")).toEqual(["time", "number", "book", "booked", "age", "income", "topics", "answers"]);
  });
  it("no intent, has-cover, budget or want step any more", () => {
    for (const m of ["teams", "phone"] as Method[]) for (const gone of ["intent", "cover", "budget", "want", "adviser"]) expect(walk(m)).not.toContain(gone);
    for (const gone of ['"intent"', '"has_cover"', '"budget_band"', '"want"']) expect(PAGE).not.toContain(gone);
  });
  it("progress is n of 5 (time, invite, age, income, topics); 6 with step 0", () => {
    expect((["time", "email", "age", "income", "topics"] as StepId[]).map((s) => progress(s, false))).toEqual([1, 2, 3, 4, 5].map((n) => ({ n, total: 5 })));
    expect(progress("number", false)).toEqual({ n: 2, total: 5 });
    expect(stepNumber("number")).toBe(stepNumber("email"));
    expect(progress("details", true)).toEqual({ n: 1, total: 6 });
    expect(progress("time", true)).toEqual({ n: 2, total: 6 });
    expect(progress("topics", true)).toEqual({ n: 6, total: 6 });
  });
  it("back links: invite to time, income to age, topics to income; never back past the booking or to step 0", () => {
    expect(prevStep("email")).toBe("time");
    expect(prevStep("number")).toBe("time");
    expect(prevStep("income")).toBe("age");
    expect(prevStep("topics")).toBe("income");
    expect(prevStep("age")).toBeNull();
    expect(prevStep("time")).toBeNull();
    expect(prevStep("details")).toBeNull();
  });
});

describe("resume from GET /start", () => {
  const b = { start: "2026-10-21T10:30:00+02:00", end: "2026-10-21T11:00:00+02:00", method: "teams", held: false };
  const full = { age_band: "35_44", income_band: "30k_50k", topics: ["life"] } as const;
  it("no booking: the time step (adviser card first)", () => {
    expect(resumeAt(null, {})).toBe("time");
    expect(resumeAt(null, { ...full, topics: ["life"] })).toBe("time");
  });
  it("booking not held and answers complete: All set", () => {
    expect(resumeAt(b, { ...full, topics: ["life"] })).toBe("allset");
  });
  it("booking exists but answers missing: the age step (the booking is kept)", () => {
    expect(resumeAt(b, {})).toBe("age");
    expect(resumeAt({ ...b, held: true }, {})).toBe("age");
    expect(resumeAt(b, { age_band: "lt35", income_band: "lt15k" })).toBe("age");
    expect(resumeAt(b, { age_band: "lt35", income_band: "lt15k", topics: [] })).toBe("age");
  });
  it("old answers (intent, has_cover, budget_band, want) are ignored", () => {
    expect(cleanAnswers({ intent: "life", has_cover: "yes", budget_band: "lt750", want: "family", age_band: "45_50", topics: ["will", "nope", "life"] })).toEqual({ age_band: "45_50", topics: ["life", "will"] });
    expect(cleanAnswers(null)).toEqual({});
  });
  it("the mock resumes a booked lead at the age step, then All set once the answers are in", async () => {
    const api = createMockApi({ booked: true });
    const r = await api.getStart();
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.data.booking).toBeTruthy();
    expect(resumeAt(r.data.booking, r.data.answers)).toBe("age");
    expect(await api.postAnswers({ age_band: "35_44", income_band: "lt15k", topics: ["review"], request_id: "r1" })).toEqual({ kind: "ok" });
    const r2 = await api.getStart();
    expect(r2.kind === "ok" && resumeAt(r2.data.booking, r2.data.answers)).toBe("allset");
  }, 10000);
});

describe("age, income and topics (POST /start/answers after booking)", () => {
  it("age bands", () => {
    expect(AGE_BANDS.map((o) => o.v)).toEqual(["lt35", "35_44", "45_50", "51plus"]);
  });
  it("income uses Jono's six bands and codes", () => {
    expect(INCOME_BANDS).toEqual([
      { v: "lt15k", t: "Up to R15,000" }, { v: "15k_30k", t: "R15,000 to R30,000" }, { v: "30k_50k", t: "R30,000 to R50,000" },
      { v: "50k_80k", t: "R50,000 to R80,000" }, { v: "80kplus", t: "R80,000 or more" }, { v: "prefer_not", t: "Prefer not to say" },
    ]);
    // the earlier draft codes are not sent
    for (const old of ["lt20k", "20k_40k", "40k_60k", "60k_100k", "100kplus"]) expect(cleanAnswers({ income_band: old })).toEqual({});
    expect(cleanAnswers({ income_band: "30k_50k" })).toEqual({ income_band: "30k_50k" });
    expect(PAGE).toContain("Before tax. A band is enough.");
  });
  it("topics: six options, multi-select in page order, Done only once one is ticked", () => {
    expect(TOPICS.map((o) => o.v)).toEqual(["life", "disability_income", "severe_illness", "review", "new_bond", "will"]);
    expect(TOPICS.map((o) => o.t)).toEqual(["Life cover", "Disability or income protection", "Severe illness cover", "Review my cover", "I just got a new bond", "I need a will"]);
    expect(canFinishTopics(undefined)).toBe(false);
    expect(canFinishTopics([])).toBe(false);
    let t = toggleTopic(undefined, "will");
    t = toggleTopic(t, "life");
    expect(t).toEqual(["life", "will"]);
    expect(canFinishTopics(t)).toBe(true);
    t = toggleTopic(toggleTopic(t, "life"), "will");
    expect(t).toEqual([]);
    expect(canFinishTopics(t)).toBe(false);
    expect(PAGE).toMatch(/disabled=\{!ready \|\| busy\}/);
    expect(PAGE).toContain("Pick as many as you like.");
  });
  it("the payload needs all three; no routing fields", () => {
    expect(answersPayload({ age_band: "lt35", income_band: "lt15k" }, "r")).toBeNull();
    expect(answersPayload({ age_band: "lt35", topics: ["life"] }, "r")).toBeNull();
    expect(answersPayload({ age_band: "51plus", income_band: "prefer_not", topics: ["life", "new_bond"] }, "r")).toEqual({ age_band: "51plus", income_band: "prefer_not", topics: ["life", "new_bond"], request_id: "r" });
    expect(answersComplete({ age_band: "51plus", income_band: "prefer_not", topics: ["will"] })).toBe(true);
  });
  it("the mock rejects incomplete answers", async () => {
    const api = createMockApi();
    expect((await api.postAnswers({ age_band: "lt35", income_band: "lt15k", topics: [], request_id: "r" })).kind).toBe("error");
    expect((await api.postAnswers({ age_band: "lt35", income_band: "1500_plus", topics: ["life"], request_id: "r" })).kind).toBe("error");
  }, 10000);
});

describe("adviser confirm gate (two-phase POST /start/adviser before any open time)", () => {
  const other: AdviserInfo = { id: "b2", first_name: "Thandi", name: "Thandi Mokoena", firm: "Example Wealth", fsp: "12345", bio: null, photo_url: null };
  it("the first POST names the adviser; the times open only on 'slots' to a POST confirming that same adviser", () => {
    expect(afterAdviser({ next: "adviser", adviser: MARK }, null)).toEqual({ k: "adviser", adviser: MARK });
    expect(afterAdviser({ next: "slots", adviser: MARK }, "mock-broker")).toEqual({ k: "slots" });
    expect(afterAdviser({ next: "slots", adviser: null }, "mock-broker")).toEqual({ k: "slots" });
    expect(afterAdviser({ next: "chat" }, null)).toEqual({ k: "chat" });
  });
  it("an unconfirmed 'slots' never opens the times; a different adviser must be confirmed again", () => {
    expect(afterAdviser({ next: "slots", adviser: MARK }, null)).toEqual({ k: "adviser", adviser: MARK });
    expect(afterAdviser({ next: "slots", adviser: null }, null)).toEqual({ k: "error" });
    expect(afterAdviser({ next: "adviser", adviser: null }, null)).toEqual({ k: "error" });
    expect(afterAdviser({ next: "slots", adviser: other }, "mock-broker")).toEqual({ k: "adviser", adviser: other });
  });
  it("no /slots before the confirm: the mock refuses, and the page guards fetchSlots on the confirmed id", async () => {
    const log: MockLog = { calls: [] };
    const api = createMockApi({ log });
    await expect(api.getSlots(7)).rejects.toThrow(/before the adviser was confirmed/);
    expect(await api.postAdviser({ request_id: "r1" })).toMatchObject({ kind: "ok", next: "adviser", adviser: { id: "mock-broker", bio: MOCK_ADVISER.bio, photo_url: null } });
    await expect(api.getSlots(7)).rejects.toThrow(/before the adviser was confirmed/);
    expect(await api.postAdviser({ confirm_adviser: "mock-broker", request_id: "r2" })).toMatchObject({ kind: "ok", next: "slots" });
    const s = await api.getSlots(7);
    expect(s.kind === "ok" && s.data.slots.length).toBeGreaterThan(5);
    expect(log.calls.indexOf("adviser:confirm")).toBeLessThan(log.calls.lastIndexOf("slots"));
    expect(PAGE).toMatch(/if \(!confirmed\.current\) return; \/\/ never ask for times/);
    expect(PAGE).toMatch(/onClick=\{\(\) => requestAdviser\(adviser\.id\)\}/);
  }, 15000);
  it("the card: initials without a photo, name, firm, Authorised FSP n, and the bio in quotes", () => {
    const html = renderToStaticMarkup(createElement(AdviserCard, { adviser: MARK })).replace(/&#x27;/g, "'");
    expect(html).toContain(">MW<");
    expect(html).not.toContain("<img");
    expect(html).toContain("<strong>Mark Weston</strong>");
    expect(html).toContain("Oracle Private Wealth");
    expect(html).toContain("Authorised FSP 28418");
    expect(html).toContain("“With 26 years' experience, I help families protect the people they love and plan for retirement, before and at retirement.”");
    expect(fspLine(12345)).toBe("Authorised FSP 12345");
  });
  it("the card: a photo when photo_url is set, and no bio line when bio is null", () => {
    const html = renderToStaticMarkup(createElement(AdviserCard, { adviser: { ...other, photo_url: "https://example.com/t.jpg" } }));
    expect(html).toMatch(/<img[^>]+src="https:\/\/example\.com\/t\.jpg"/);
    expect(html).not.toContain("st-bio");
    // a photo that fails to load (blocked, 404) falls back to the initials
    expect(PAGE).toContain("onError={() => setBroken(true)}");
    expect(PAGE).toMatch(/const pic = adviser\.photo_url && !broken \? adviser\.photo_url : null/);
    expect(html).not.toContain("“");
  });
  it("the required small print sits under Book this time, in the contract wording", () => {
    expect(INTRO_DISCLOSURE).toBe("Introduced by SortMyCover, which gives no advice. Advisers pay SortMyCover a fee that doesn't depend on whether you buy anything.");
    expect(PAGE.indexOf(">Book this time<")).toBeLessThan(PAGE.indexOf("{INTRO_DISCLOSURE}"));
    expect(PAGE).toMatch(/data-disclosure>\{INTRO_DISCLOSURE\}/);
  });
});

describe("meeting type", () => {
  it("offers Teams and phone only, in a fixed order, defaulting to Teams, with the v4 labels", () => {
    expect(availableMethods(["phone", "whatsapp_call", "teams", "zoom"])).toEqual(["teams", "phone"]);
    expect(availableMethods(["whatsapp_call"])).toEqual([]);
    expect(availableMethods(undefined)).toEqual([]);
    expect(defaultMethod(["phone", "teams"])).toBe("teams");
    expect(defaultMethod(["phone", "whatsapp_call"])).toBe("phone");
    expect(defaultMethod([])).toBeNull();
    expect(methodLabel("teams")).toBe("Microsoft Teams call");
    expect(methodLabel("phone")).toBe("Phone call");
  });
});

describe("phone call: POST /start/contact, only on phone, before /book", () => {
  const body: BookBody = { slot_start: "2026-10-21T10:30:00+02:00", method: "phone", request_id: "b1", context: { source: "start_page" } };
  const fake = (contact: "ok" | "invalid" = "ok") => {
    const calls: string[] = [];
    const api: Pick<StartApi, "postContact" | "book"> = {
      async postContact(b) { calls.push("contact:" + JSON.stringify(b)); return contact === "ok" ? { kind: "ok" } : { kind: "invalid", field: "alt_number" }; },
      async book(b) { calls.push("book:" + b.method); return { kind: "held", info: { start: b.slot_start, end: "", method: b.method } }; },
    };
    return { api, calls };
  };
  it("the booking calls in order", () => {
    expect(bookingCalls("phone")).toEqual(["contact", "book"]);
    expect(bookingCalls("teams")).toEqual(["book"]);
  });
  it("phone: contact first, then book", async () => {
    const { api, calls } = fake();
    const r = await runBooking(api, { method: "phone", contact: { call_number: null, alt_number: "+27112345678" }, book: body, contactId: "c1" });
    expect(r.kind).toBe("held");
    expect(calls).toEqual(['contact:{"call_number":null,"alt_number":"+27112345678","request_id":"c1"}', "book:phone"]);
  });
  it("Teams: no contact call", async () => {
    const { api, calls } = fake();
    await runBooking(api, { method: "teams", contact: null, book: { ...body, method: "teams" }, contactId: "c1" });
    expect(calls).toEqual(["book:teams"]);
  });
  it("a rejected number stops before /book", async () => {
    const { api, calls } = fake("invalid");
    expect(await runBooking(api, { method: "phone", contact: { call_number: null, alt_number: "+27112345678" }, book: body, contactId: "c1" })).toEqual({ kind: "contact", field: "alt_number" });
    expect(calls.some((c) => c.startsWith("book"))).toBe(false);
  });
  it("the mock refuses a phone booking without the contact call, and logs contact before book", async () => {
    const log: MockLog = { calls: [] };
    const api = createMockApi({ log });
    await expect(api.book(body)).rejects.toThrow(/before \/start\/contact/);
    expect(await runBooking(api, { method: "phone", contact: { call_number: null }, book: body, contactId: "c1" })).toMatchObject({ kind: "held" });
    expect(log.calls.slice(-2)).toEqual(["contact", "book"]);
  }, 15000);
  it("numbers: the WhatsApp number by default (call_number null), a different one, an optional other number", () => {
    expect(contactPayload({ use: "whatsapp", other: "", alt: "" })).toEqual({ ok: true, body: { call_number: null } });
    expect(contactPayload({ use: "whatsapp", other: "garbage", alt: "" })).toEqual({ ok: true, body: { call_number: null } });
    expect(contactPayload({ use: "other", other: "072 555 1234", alt: "011 234 5678" })).toEqual({ ok: true, body: { call_number: "+27725551234", alt_number: "+27112345678" } });
    expect(contactPayload({ use: "other", other: "", alt: "" })).toEqual({ ok: false, field: "call_number" });
    expect(contactPayload({ use: "whatsapp", other: "", alt: "12345" })).toEqual({ ok: false, field: "alt_number" });
    expect(toSaNumber("+27 11 234 5678")).toBe("+27112345678");
    expect(toSaNumber("0027 82 123 4567")).toBe("+27821234567");
    for (const bad of ["", "+44 7700 900123", "0912345678", "011 234 567"]) expect(toSaNumber(bad), bad).toBeNull();
  });
  it("the number step: WhatsApp number prefilled and selected, a different number opens a field", () => {
    expect(PAGE).toContain("Call my WhatsApp number");
    expect(PAGE).toContain("Use a different number");
    expect(PAGE).toMatch(/useState<"whatsapp" \| "other">\("whatsapp"\)/);
    expect(PAGE).toMatch(/\{sel === "other" && \(/);
    expect(PAGE).toContain("Another number, in case we can't reach you");
  });
});

describe("someone else joining (optional guest, Teams invite step only)", () => {
  it("unticked, blank or a phone call sends nothing; filled must be a complete address", () => {
    expect(guestEmail("teams", false, "thabo@gmail.com")).toEqual({ ok: true });
    expect(guestEmail("teams", true, "  ")).toEqual({ ok: true });
    expect(guestEmail("teams", true, " thabo@gmail.com ")).toEqual({ ok: true, guest_email: "thabo@gmail.com" });
    expect(guestEmail("teams", true, "thabo@gmail")).toEqual({ ok: false });
    expect(guestEmail("phone", true, "thabo@gmail.com")).toEqual({ ok: true });
    expect(guestEmail("phone", true, "thabo@gmail")).toEqual({ ok: true });
  });
  it("guest_email is in the /book body only when filled, and only for Teams", () => {
    const base = { slot_start: "s", method: "teams" as Method, email: "n@gmail.com", request_id: "r" };
    expect(bookBody(base)).not.toHaveProperty("guest_email");
    expect(bookBody({ ...base, guest_email: undefined })).not.toHaveProperty("guest_email");
    expect(bookBody({ ...base, guest_email: "thabo@gmail.com" })).toMatchObject({ guest_email: "thabo@gmail.com", email_confirmed: true, context: { source: "start_page" } });
    expect(bookBody({ ...base, method: "phone", guest_email: "thabo@gmail.com" })).not.toHaveProperty("guest_email");
  });
  it("the field shows only when ticked, with did-you-mean, on the Teams step only; switching to phone clears it", () => {
    expect(PAGE).toMatch(/\{guestOn && \(\s*<div className="st-field" id="st-guest-box">/);
    expect(PAGE).toMatch(/const sug = guestOn \? suggestEmail\(guest\) : null/);
    expect(PAGE.match(/guestField\("/g)?.length).toBe(1);
    expect(PAGE).toContain('guestField("Add a partner or family member to the invite")');
    expect(PAGE).not.toContain("Add their email so they get the details too");
    expect(PAGE).toMatch(/if \(m !== "teams"\) \{ setGuestOn\(false\); setGuest\(""\); setGuestErr\(null\); \}/);
    expect(PAGE).toContain("Someone else joining?");
    expect(PAGE.match(/\{inviteNote\(b\)\}/g)?.length).toBe(2); // Booked and All set
  });
});

describe("invite line on Booked and All set: held (waiting on the email link) vs booked", () => {
  it("held: nothing is sent yet, so it says what happens after the tap (with and without a guest)", () => {
    expect(inviteLine(true, "thabo@gmail.com")).toBe("Once you tap the link in your email, we'll send the invite to you and thabo@gmail.com.");
    expect(inviteLine(true, null)).toBe("Once you tap the link in your email, we'll send your invite.");
    expect(inviteLine(true, "thabo@gmail.com")).not.toMatch(/We've sent/);
  });
  it("booked: names the guest it went to; nothing extra without a guest", () => {
    expect(inviteLine(false, "thabo@gmail.com")).toBe("We've sent the invite to you and thabo@gmail.com.");
    expect(inviteLine(false, null)).toBeNull();
  });
  it("the page shows it for Teams only, from the booking's held state", () => {
    expect(PAGE).toContain('b && b.method !== "phone" ? inviteLine(b.held, guestSent) : null');
    expect(PAGE).not.toContain("We've sent the invite to you and {guestSent}");
  });
});

describe("phone path: numbers only, no email (Jono, 19 Oct 2026)", () => {
  it("the number step has no email or guest field; the Teams step has both", () => {
    const num = PAGE.slice(PAGE.indexOf('case "number": {'), PAGE.indexOf('case "age":'));
    expect(num).toContain("Which number should");
    expect(num).not.toMatch(/emailField|guestField|st-email/);
    const teams = PAGE.slice(PAGE.indexOf('case "email": {'), PAGE.indexOf('case "number": {'));
    expect(teams).toContain('emailField("Email address")');
    expect(teams).toContain("guestField(");
  });
  it("/book for phone carries no email; Teams carries the email", () => {
    const p = bookBody({ slot_start: "s", method: "phone", email: "n@gmail.com", request_id: "r" });
    expect(p).not.toHaveProperty("email");
    expect(p).not.toHaveProperty("email_confirmed");
    expect(p).toEqual({ slot_start: "s", method: "phone", request_id: "r", context: { source: "start_page" } });
    expect(bookBody({ slot_start: "s", method: "teams", email: " n@gmail.com ", request_id: "r" })).toMatchObject({ email: "n@gmail.com", email_confirmed: true });
  });
  it("the mock refuses an email on a phone booking", async () => {
    const api = createMockApi();
    await api.postContact({ call_number: null, request_id: "c" });
    await expect(api.book({ slot_start: "x", method: "phone", email: "n@gmail.com", email_confirmed: true, request_id: "b", context: { source: "start_page" } })).rejects.toThrow(/no email/);
  }, 10000);
  it("the phone booked screen says who calls which number, with confirmation on WhatsApp", () => {
    expect(PAGE).toContain("Your confirmation and reminders come on WhatsApp.");
    expect(PAGE).toMatch(/b\.method === "phone"\s*\? <p className="st-done-p">\{Who\} will call you/);
    expect(prettyLocal("+27112345678")).toBe("011 234 5678");
  });
});

describe("reschedule: Move your call (#lt=...&move=1)", () => {
  const now = new Date("2026-10-19T12:00:00+02:00"); // Monday
  const live = { start: "2026-10-21T10:30:00+02:00", end: "2026-10-21T11:00:00+02:00", method: "teams", held: false };
  it("reads move=1 together with lt", () => {
    expect(readMoveFromHash("#lt=abc&move=1")).toBe(true);
    expect(readTokenFromHash("#lt=abc&move=1")).toBe("abc");
    expect(readMoveFromHash("#lt=abc")).toBe(false);
    expect(readMoveFromHash("#lt=abc&move=0")).toBe(false);
  });
  it("only a live booking opens the move screen; otherwise the normal flow", () => {
    expect(isLiveBooking(live, now)).toBe(true);
    expect(isLiveBooking(null, now)).toBe(false);
    expect(isLiveBooking({ ...live, start: "2026-10-18T10:30:00+02:00" }, now)).toBe(false);
    expect(PAGE).toMatch(/if \(moveAsked\.current && isLiveBooking\(d\.booking, new Date\(\)\)\)/);
    expect(PAGE).toContain("setMoving(false); // no live booking: the normal flow");
  });
  it("shows the current booking in the summary box, the toggle and the 14-day line", () => {
    const mv = PAGE.slice(PAGE.indexOf('case "move": {'), PAGE.indexOf('case "time": {'));
    expect(mv).toContain("Pick a <em>new time</em>");
    expect(mv).toMatch(/<dt>Your call now<\/dt><dd>\{formatWhen\(b\.start, ", "\)\}<\/dd>/);
    expect(mv).toMatch(/<dt>With<\/dt><dd>\{shown\.name\}<\/dd>/);
    expect(mv).toMatch(/<dt>How<\/dt><dd>\{methodLabel\(b\.method\)\}<\/dd>/);
    expect(mv).toContain('aria-label="Meeting type"');
    expect(mv).toContain("{moveWindowLine(new Date())}");
    expect(PAGE).toContain("Move my call");
    expect(PAGE).toContain("Done, your call is moved to");
    expect(moveWindowLine(now)).toBe("Open times up to Mon 2 Nov (14 days from today).");
  });
  it("no slot past 14 days (or in the past)", () => {
    const mk = (d: string) => ({ start: d, end: d });
    const list = withinDays([mk("2026-10-19T11:00:00+02:00"), mk("2026-10-20T09:00:00+02:00"), mk("2026-11-02T12:00:00+02:00"), mk("2026-11-02T12:30:00+02:00"), mk("2026-11-10T09:00:00+02:00"), mk("bad")], now);
    expect(list.map((s) => s.start)).toEqual(["2026-10-20T09:00:00+02:00", "2026-11-02T12:00:00+02:00"]);
    expect(PAGE).toContain("api.current!.getSlots(14)");
    expect(PAGE).toContain("withinDays(r.data.slots, new Date())");
  });
  it("the mock offers times past 14 days, which the cap removes", async () => {
    const api = createMockApi({ booked: true });
    const r = await api.getSlots(14);
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    const n = new Date();
    expect(r.data.slots.some((s) => Date.parse(s.start) > n.getTime() + 14 * 86400000)).toBe(true);
    expect(withinDays(r.data.slots, n).every((s) => Date.parse(s.start) <= n.getTime() + 14 * 86400000)).toBe(true);
  }, 10000);
  it("the POST /start/move body", () => {
    expect(moveBody("2026-10-24T14:00:00+02:00", "teams", "m1")).toEqual({ slot_start: "2026-10-24T14:00:00+02:00", method: "teams", request_id: "m1" });
  });
  it("a switch to phone with no confirmed number asks the number step first, then contact, then move", async () => {
    expect(moveNeedsNumber("phone", live, {})).toBe(true);
    expect(moveNeedsNumber("phone", live, { call_number: "+27821234567" })).toBe(false);
    expect(moveNeedsNumber("phone", { ...live, method: "phone" }, {})).toBe(false);
    expect(moveNeedsNumber("teams", live, {})).toBe(false);
    const log: MockLog = { calls: [] };
    const api = createMockApi({ booked: true, log });
    await expect(api.move(moveBody("2026-10-24T14:00:00+02:00", "phone", "m0"))).rejects.toThrow(/before \/start\/contact/);
    const r = await runMove(api, { contact: { call_number: null }, move: moveBody("2026-10-24T14:00:00+02:00", "phone", "m1"), contactId: "c1" });
    expect(r).toMatchObject({ kind: "moved", booking: { start: "2026-10-24T14:00:00+02:00", method: "phone" } });
    expect(log.calls.slice(-2)).toEqual(["contact", "move"]);
    const r2 = await runMove(api, { contact: null, move: moveBody("2026-10-27T09:00:00+02:00", "teams", "m2"), contactId: "c2" });
    expect(r2).toMatchObject({ kind: "moved" });
    expect(log.calls.slice(-1)).toEqual(["move"]);
  }, 15000);
  it("maps /start/move replies like /book", () => {
    const b = { start: "2026-10-24T14:00:00+02:00", end: "2026-10-24T14:30:00+02:00", method: "teams" };
    expect(interpretMove(200, { ok: true, booking: b })).toEqual({ kind: "moved", booking: b });
    expect(interpretMove(200, { ok: true, moved: true, booking: { ...b, held: true } })).toEqual({ kind: "moved", booking: { ...b, held: true } });
    expect(interpretMove(200, { ok: true, moved: false, booking: { ...b, held: false } })).toEqual({ kind: "moved", booking: { ...b, held: false } });
    expect(interpretMove(409, { error: "no_booking" })).toEqual({ kind: "no_booking" });
    expect(interpretMove(503, { error: "try_again" })).toEqual({ kind: "error" });
    expect(interpretMove(409, { error: "slot_taken", slots: [b] })).toEqual({ kind: "taken", slots: [b] });
    expect(interpretMove(409, { error: "slot_taken" })).toEqual({ kind: "taken", slots: null });
    expect(interpretMove(400, { error: "invalid", field: "slot_start" })).toEqual({ kind: "invalid" });
    expect(PAGE).toContain("setMoving(false); setBooking(null); setPicked(null); setSlots(null);");
    expect(interpretMove(401, null)).toEqual({ kind: "expired" });
    expect(interpretMove(200, { ok: true })).toEqual({ kind: "error" });
    expect(interpretMove(0, null)).toEqual({ kind: "error" });
  });
});

describe("API response mapping", () => {
  it("/start/adviser", () => {
    const adv = { id: "b1", first_name: "Mark", name: "Mark Weston", firm: "Oracle Private Wealth", fsp: "28418", bio: "Hi there", photo_url: "https://x.co/a.jpg" };
    expect(interpretAdviser(200, { ok: true, next: "adviser", adviser: adv })).toEqual({ kind: "ok", next: "adviser", adviser: adv });
    expect(interpretAdviser(200, { ok: true, next: "adviser", adviser: { ...adv, bio: "", photo_url: "javascript:alert(1)" } })).toMatchObject({ adviser: { bio: null, photo_url: null } });
    expect(interpretAdviser(200, { ok: true, next: "adviser", adviser: { ...adv, photo_url: "http://x.co/a.jpg" } })).toMatchObject({ adviser: { photo_url: null } });
    expect(interpretAdviser(200, { ok: true, next: "slots" })).toEqual({ kind: "ok", next: "slots", adviser: null });
    expect(interpretAdviser(200, { ok: true, next: "chat" })).toEqual({ kind: "ok", next: "chat", adviser: null });
    expect(interpretAdviser(200, { ok: true, next: "adviser", adviser: { name: "No id" } })).toEqual({ kind: "ok", next: "adviser", adviser: null });
    expect(interpretAdviser(200, { ok: true, next: "somewhere" })).toEqual({ kind: "error" });
    expect(interpretAdviser(401, null)).toEqual({ kind: "expired" });
    expect(interpretAdviser(500, null)).toEqual({ kind: "error" });
  });
  it("/start/contact", () => {
    expect(interpretContact(200, { ok: true })).toEqual({ kind: "ok" });
    expect(interpretContact(400, { error: "invalid", field: "alt_number" })).toEqual({ kind: "invalid", field: "alt_number" });
    expect(interpretContact(400, { error: "invalid", field: "call_number" })).toEqual({ kind: "invalid", field: "call_number" });
    expect(interpretContact(403, null)).toEqual({ kind: "expired" });
    expect(interpretContact(500, null)).toEqual({ kind: "error" });
  });
  it("/start/answers", () => {
    expect(interpretAnswers(200, { ok: true, next: "done" })).toEqual({ kind: "ok" });
    expect(interpretAnswers(200, { ok: true, next: "slots" })).toEqual({ kind: "error" });
    expect(interpretAnswers(401, null)).toEqual({ kind: "expired" });
    expect(interpretAnswers(400, { error: "bad" })).toEqual({ kind: "error" });
  });
  it("GET /start", () => {
    const r = interpretStart(200, { first_name: "Naledi", phone_pretty: "082 123 4567", adviser: { first_name: "Mark", name: "Mark Weston", firm: "F", fsp: 1, bio: null }, methods: ["teams"], answers: { intent: "life", age_band: "lt35" }, contact: {}, booking: { start: "s", end: "e", method: "phone", held: true } });
    expect(r).toEqual({ kind: "ok", data: { first_name: "Naledi", phone_pretty: "082 123 4567", adviser: { first_name: "Mark", name: "Mark Weston", firm: "F", fsp: 1, bio: null, photo_url: null }, methods: ["teams"], answers: { age_band: "lt35" }, contact: {}, booking: { start: "s", end: "e", method: "phone", held: true } } });
    expect(interpretStart(200, { first_name: null, booking: null })).toMatchObject({ kind: "ok", data: { booking: null, phone_pretty: null, adviser: null } });
    expect(interpretStart(401, null)).toEqual({ kind: "expired" });
    expect(interpretStart(500, null)).toEqual({ kind: "error" });
  });
  it("/book (409 taken, 422 email)", () => {
    const b = { start: "2026-10-21T10:30:00+02:00", end: "2026-10-21T11:00:00+02:00", method: "teams" };
    expect(interpretBook(200, { booked: true, booking_id: "x", ...b }).kind).toBe("booked");
    expect(interpretBook(201, { booked: false, held: true, verify: "email", booking_id: "x", ...b }).kind).toBe("held");
    expect(interpretBook(409, { error: "slot_taken", slots: [b] })).toEqual({ kind: "taken", slots: [b] });
    expect(interpretBook(409, { error: "slot_taken", next: [b] })).toEqual({ kind: "taken", slots: [b] });
    expect(interpretBook(409, { error: "slot_taken" })).toEqual({ kind: "taken", slots: null });
    expect(interpretBook(422, { error: "email_invalid" })).toEqual({ kind: "email" });
    expect(interpretBook(403, null)).toEqual({ kind: "expired" });
    expect(interpretBook(0, null)).toEqual({ kind: "error" });
    expect(interpretBook(200, { booked: false })).toEqual({ kind: "error" });
  });
});

describe("/start/ copy passes the site wording rules", () => {
  const files = ["src/pages/Start.tsx", "src/lib/start.ts", "src/lib/start-api.ts", "src/lib/start-mock.ts"].map((f) => fs.readFileSync(path.resolve(__dirname, "..", f), "utf8"));
  // client-visible copy: string literals that contain a space and a letter, and JSX text between tags (comments stripped)
  const copy = files.flatMap((src) => {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|\s)\/\/ .*$/gm, " ");
    const lits = [...code.matchAll(/"([^"\\\n]*)"|`([^`\n]*)`/g)].map((m) => m[1] ?? m[2]);
    const jsx = [...code.matchAll(/>([^<>{}();=&|\n]+)</g)].map((m) => m[1]);
    // JSX text broken up by {expressions}: "Just a few quick things so {who} is well prepared."
    const mixed = [...code.matchAll(/[>}]([^<>{}();=&|\n]+)[<{]/g)].map((m) => m[1]);
    return [...lits, ...jsx, ...mixed].map((t) => t.trim()).filter((t) => /[A-Za-z]{2}/.test(t) && / /.test(t));
  });
  it("collects the page copy", () => {
    expect(copy).toContain("Pick as many as you like.");
    expect(copy.some((c) => c.includes("Lindi will carry on with you"))).toBe(true);
    expect(copy.some((c) => c.includes("Just a few quick things so"))).toBe(true);
    expect(copy.some((c) => c.includes("has what they need"))).toBe(true);
  });
  it("no banned word, no free / no cost, no AI or virtual assistant, no licensed, no Lead Velocity, no he/she for the adviser", () => {
    const EXTRA: [RegExp, string][] = [
      [/\bAI\b/, "AI"], [/\b(AI|virtual) assistant/i, "AI / virtual assistant"], [/licensed/i, "licensed"],
      [/\bfree\b|costs? (you )?nothing|no cost|at no charge|pays? nothing/i, "price wording"], [/Lead Velocity/, "Lead Velocity"],
      [/\b(he|she|his|her|him|hers)\b/i, "he/she"],
    ];
    for (const c of copy) for (const [re, label] of [...BANNED, ...EXTRA]) expect(c, `${label}: ${c}`).not.toMatch(re);
  });
  it("no STOP in the page's own copy (the verbatim named consent is config), and the only help address is hello@sortmycover.co.za", () => {
    for (const c of copy) expect(c, c).not.toMatch(/\bSTOP\b/);
    const all = files.join("\n");
    const emails = [...all.matchAll(/[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.(?:co\.za|com|net|org)\b/g)].map((m) => m[0]);
    const help = emails.filter((e) => /sortmycover|leadvelocity|vantagestack/i.test(e));
    for (const e of help) expect(e).toBe("hello@sortmycover.co.za");
  });
});

describe("token from the fragment", () => {
  it("reads lt from the hash only", () => {
    expect(readTokenFromHash("#lt=abc.DEF-123_x")).toBe("abc.DEF-123_x");
    expect(readTokenFromHash("#utm=1&lt=tok")).toBe("tok");
    expect(readTokenFromHash("lt=tok")).toBe("tok");
  });
  it("rejects missing, empty or malformed tokens", () => {
    expect(readTokenFromHash("")).toBeNull();
    expect(readTokenFromHash("#")).toBeNull();
    expect(readTokenFromHash("#lt=")).toBeNull();
    expect(readTokenFromHash("#other=1")).toBeNull();
    expect(readTokenFromHash("#lt=<script>")).toBeNull();
    expect(readTokenFromHash("#lt=" + "a".repeat(5000))).toBeNull();
  });
});

describe("slots in South African time", () => {
  it("formats day and 24-hour time in Africa/Johannesburg whatever the input offset", () => {
    expect(formatDay("2026-10-21T10:30:00+02:00")).toBe("Wed 21 Oct");
    expect(formatTime("2026-10-21T10:30:00+02:00")).toBe("10:30");
    expect(formatTime("2026-10-21T22:05:00Z")).toBe("00:05");
    expect(formatDay("2026-10-21T22:05:00Z")).toBe("Thu 22 Oct");
    expect(formatWhen("2026-10-20T09:00:00+02:00")).toBe("Tue 20 Oct at 09:00");
    expect(formatWhen("2026-10-20T09:00:00+02:00", ", ")).toBe("Tue 20 Oct, 09:00");
  });
  it("groups Monday-to-Sunday weeks, sorted, with the SAST date deciding the week", () => {
    const now = new Date("2026-10-18T10:00:00+02:00"); // Sunday
    const g = groupSlots([
      { start: "2026-10-19T09:00:00+02:00", end: "2026-10-19T09:30:00+02:00" }, // Monday: next week
      { start: "2026-10-18T20:00:00+02:00", end: "2026-10-18T20:30:00+02:00" }, // Sunday: this week
      { start: "2026-10-25T23:30:00+02:00", end: "2026-10-26T00:00:00+02:00" }, // Sunday night: next week
      { start: "2026-10-26T00:30:00+02:00", end: "2026-10-26T01:00:00+02:00" }, // Monday 00:30 SAST (still Sunday in UTC): later
      { start: "not a date", end: "" },
    ], now);
    expect(g.map((x) => [x.label, x.rows.map((r) => `${r.day} ${r.time}`)])).toEqual([
      ["This week", ["Sun 18 Oct 20:00"]],
      ["Next week", ["Mon 19 Oct 09:00", "Sun 25 Oct 23:30"]],
      ["Later", ["Mon 26 Oct 00:30"]],
    ]);
  });
  it("a Monday just after midnight SAST (Sunday in UTC) counts as the new week", () => {
    const now = new Date("2026-10-18T22:15:00Z"); // Mon 19 Oct 00:15 SAST
    const g = groupSlots([{ start: "2026-10-19T09:00:00+02:00", end: "2026-10-19T09:30:00+02:00" }, { start: "2026-10-26T09:00:00+02:00", end: "x" }], now);
    expect(g.map((x) => x.label)).toEqual(["This week", "Next week"]);
  });
  it("limits the visible rows across groups", () => {
    const now = new Date("2026-10-18T10:00:00+02:00");
    const mk = (d: number, h: number) => ({ start: `2026-10-${String(d).padStart(2, "0")}T${String(h).padStart(2, "0")}:00:00+02:00`, end: "" });
    const g = groupSlots([mk(19, 9), mk(19, 10), mk(20, 9), mk(26, 9), mk(26, 10), mk(27, 9)], now);
    const l = limitGroups(g, 4);
    expect(l.map((x) => [x.label, x.rows.length])).toEqual([["Next week", 3], ["Later", 1]]);
    expect(limitGroups(g, 0)).toEqual([]);
  });
});

describe("email", () => {
  it("validates a complete address", () => {
    expect(validEmail("naledi.m@gmail.com")).toBe(true);
    expect(validEmail(" a@b.co.za ")).toBe(true);
    for (const bad of ["", "naledi", "naledi@", "naledi@gmail", "na ledi@gmail.com", "a@b.c", "a@@b.com", "a@.com"]) expect(validEmail(bad), bad).toBe(false);
  });
  it("suggests the common domain for typos", () => {
    expect(suggestEmail("naledi@gmial.com")).toBe("naledi@gmail.com");
    expect(suggestEmail("naledi@gmal.com")).toBe("naledi@gmail.com");
    expect(suggestEmail("naledi@gmail.con")).toBe("naledi@gmail.com");
    expect(suggestEmail("naledi@gmail.co")).toBe("naledi@gmail.com");
    expect(suggestEmail("naledi@gmail")).toBe("naledi@gmail.com");
    expect(suggestEmail("naledi@yaho.com")).toBe("naledi@yahoo.com");
    expect(suggestEmail("naledi@outlok.com")).toBe("naledi@outlook.com");
    expect(suggestEmail("naledi@hotmial.com")).toBe("naledi@hotmail.com");
    expect(suggestEmail("naledi@iclod.com")).toBe("naledi@icloud.com");
    expect(suggestEmail("Naledi.M@GMIAL.COM")).toBe("Naledi.M@gmail.com");
  });
  it("leaves correct and unrelated domains alone", () => {
    for (const ok of ["naledi@gmail.com", "naledi@yahoo.co.za", "naledi@mweb.co.za", "naledi@oraclewealth.co.za", "naledi@abc.com", "naledi@", "naledi"]) expect(suggestEmail(ok), ok).toBeNull();
  });
});

describe("misc", () => {
  it("wa.me link has digits only and no prefilled text", () => {
    expect(waLink("+27 60 015 6480")).toBe("https://wa.me/27600156480");
  });
  it("initials", () => {
    expect(initials("Mark Weston")).toBe("MW");
    expect(initials("Mark van der Merwe")).toBe("MM");
    expect(initials("Mark")).toBe("M");
    expect(initials(null)).toBe("");
  });
});

describe("step 0 (no token: desktop visits from a site CTA)", () => {
  it("explains why WhatsApp under the number, wired to the field", () => {
    expect(WHY_WHATSAPP).toMatch(/^Why WhatsApp\?/);
    expect(WHY_WHATSAPP).toMatch(/no call centre/);
    const page = fs.readFileSync(path.resolve(__dirname, "../src/pages/Start.tsx"), "utf8");
    expect(page).toMatch(/aria-describedby="st-phone-why st-phone-err"/);
    expect(page).toMatch(/id="st-phone-why">\{WHY_WHATSAPP\}/);
  });
  it("a leftover stored token that fails to load falls back to step 0 (or the wills hand-off), never a dead end", () => {
    expect(onLoadFailure("expired", true, "?ref=w-home")).toBe("details");
    expect(onLoadFailure("error", true, "?ref=w-home&via=google")).toBe("details"); // timeout / network / CORS
    expect(onLoadFailure("error", true, "")).toBe("details");
    expect(onLoadFailure("expired", true, "?ref=w-learn&for=wills")).toBe("wills");
    // a token from the link itself keeps the honest screens
    expect(onLoadFailure("expired", false, "?ref=w-home")).toBe("expired");
    expect(onLoadFailure("error", false, "")).toBe("loadError");
  });
  it("starts at step 0 without a token; with one it loads", () => {
    expect(firstScreen(null)).toBe("details");
    expect(firstScreen("")).toBe("details");
    expect(firstScreen("tok")).toBe("load");
    expect(firstScreen(null, "?ref=w-book&via=google")).toBe("details");
    expect(firstScreen(null, "?ref=a02")).toBe("details");
    expect(firstScreen(null, "?ref=w-learn-bond")).toBe("details");
    // wills go to the WhatsApp handoff: by ?for=wills, or by the page code startHref sends (it carries only ref and via)
    for (const s of ["?for=wills", "?ref=w-wills", "?ref=w-home-wills", "?ref=w-book-will&via=fb", "?ref=b02"]) expect(firstScreen(null, s), s).toBe("wills");
    expect(firstScreen("tok", "?ref=w-wills")).toBe("load");
  });
  it("normalises South African mobiles to +27 and rejects the rest", () => {
    expect(toE164("082 123 4567")).toBe("+27821234567");
    expect(toE164("0821234567")).toBe("+27821234567");
    expect(toE164("+27 82 123 4567")).toBe("+27821234567");
    expect(toE164("27821234567")).toBe("+27821234567");
    expect(toE164("0027 82 123 4567")).toBe("+27821234567");
    expect(toE164("060 015 6480")).toBe("+27600156480");
    expect(toE164("071-234-5678")).toBe("+27712345678");
    for (const bad of ["", "012 345 6789", "082 123 456", "082 123 45678", "+44 7700 900123", "82 123 4567", "08x 123 4567", "1+27821234567"]) expect(toE164(bad), bad).toBeNull();
    expect(prettyMobile("+27821234567")).toBe("+27 82 123 4567");
  });
  it("step 0 shows the generic consent exactly and names no adviser (Jono, 20 Oct 2026: introduced on WhatsApp and email)", () => {
    const c = genericConsent(consentJson);
    expect(c.text).toBe("I agree that SortMyCover, a service of Lead Velocity (Pty) Ltd, may message me on WhatsApp to book and remind me about my call, and may share my details with an adviser from an FSCA-authorised financial services provider (FSP), who may contact me by WhatsApp or phone about that call. I am 18 or older. I can opt out at any time by replying STOP.");
    expect(c.version).toBe("CONSENT-GENERIC-v5web");
    expect(c.mode).toBe("generic");
    expect(c.text).not.toMatch(/Oracle|Mark|28418|\{|\}/);
    const step0 = PAGE.slice(PAGE.indexOf('case "details":'), PAGE.indexOf('id="st-consent-err"'));
    expect(step0.length).toBeGreaterThan(500);
    expect(step0).not.toMatch(/Mark|Oracle|28418|startIntroLine|adviser/);
  });
  it("step order with step 0: details, then POST /lead, then the time step; the pill counts 1 of 6", () => {
    expect(nextStep("details", null)).toBe("lead");
    expect(walk("teams", "details")).toEqual(["details", "lead", "time", "email", "book", "booked", "age", "income", "topics", "answers"]);
    expect(prevStep("details")).toBeNull();
    expect(prevStep("time")).toBeNull();
    expect(progress("details", true)).toEqual({ n: 1, total: 6 });
  });
  it("builds the /lead body in the old quiz shape with the generic consent, ref and via", () => {
    const b = leadBody({ first_name: " Naledi ", mobile: "+27821234567", ads: null, honeypot: "", origin: "https://sortmycover.co.za", search: "?ref=c03&via=home-hero&utm_campaign=x", started_at: "2026-10-18T10:00:00.000Z", request_id: "req-12345678", user_agent: "UA", now: 1_790_000_000_000 }, consentJson);
    expect(b).toMatchObject({
      first_name: "Naledi", mobile: "+27821234567", consent: true, consent_text: genericConsent(consentJson).text, consent_version: "CONSENT-GENERIC-v5web", consent_mode: "generic",
      consent_ads: false, consent_ads_text: consentJson.ads.text, consent_ads_version: consentJson.ads.version,
      page_url: "https://sortmycover.co.za/start/", started_at: "2026-10-18T10:00:00.000Z", request_id: "req-12345678", company_website: "", honeypot: "", start_page: true,
    });
    expect(b.context).toMatchObject({ ref: "c03", utm: { ref: "c03", utm_source: "home-hero", utm_campaign: "x" }, page_url: "https://sortmycover.co.za/start/" });
    expect(leadBody({ first_name: "A", mobile: "+27821234567", ads: "give", honeypot: "", origin: "o", search: "", started_at: "", request_id: "r", user_agent: "", now: 0 }, consentJson).consent_ads).toBe(true);
    expect(leadAttribution("?via=x&utm_source=y").utm.utm_source).toBe("y");
  });
  it("maps /lead replies, and never proceeds without a lead_token", () => {
    expect(interpretLead(200, { ok: true, status: "accepted", lead_id: "l1", lead_token: "t1" })).toEqual({ kind: "accepted", token: "t1", lead_id: "l1" });
    expect(interpretLead(200, { ok: true, status: "accepted", lead_id: "l1" })).toEqual({ kind: "error" });
    expect(interpretLead(200, { ok: true, status: "accepted", lead_token: "" })).toEqual({ kind: "error" });
    expect(interpretLead(200, { ok: true, status: "not_qualified" })).toEqual({ kind: "neutral" });
    expect(interpretLead(200, { ok: true, status: "suppressed" })).toEqual({ kind: "neutral" });
    expect(interpretLead(429, {})).toEqual({ kind: "rate", retry_after_s: null });
    expect(interpretLead(429, { error: "rate_limited", retry_after_s: 86400 })).toEqual({ kind: "rate", retry_after_s: 86400 });
    expect(rateMessage(86400, "+27 60 015 6480")).toBe("This number has reached today's limit for booking requests. Please try again tomorrow, or message us on WhatsApp on +27 60 015 6480.");
    expect(rateMessage(3600, "+27 60 015 6480")).toMatch(/^Too many tries from this connection\. Please try again in an hour/);
    expect(rateMessage(null, "x")).toMatch(/in an hour/);
    expect(interpretLead(400, { error: "try_again" })).toEqual({ kind: "error" });
    expect(interpretLead(422, { error: "mobile_invalid" })).toEqual({ kind: "mobile" });
    expect(interpretLead(0, null)).toEqual({ kind: "error" });
  });
  it("POST /lead goes to /lead only, with no lead token header", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const orig = globalThis.fetch;
    globalThis.fetch = (async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response(JSON.stringify({ ok: true, status: "accepted", lead_id: "l", lead_token: "tok" }), { status: 200 }); }) as typeof fetch;
    try {
      expect(await postLead({ first_name: "A" })).toEqual({ kind: "accepted", token: "tok", lead_id: "l" });
    } finally { globalThis.fetch = orig; }
    expect(calls.length).toBe(1);
    expect(calls[0].url).toMatch(/\/webhook\/smc\/lead$/);
    expect(JSON.stringify(calls[0].init.headers)).not.toMatch(/X-Lead-Token/i);
  });
  it("the dev mock /lead returns the demo token", async () => {
    expect(await mockPostLead({ first_name: "Naledi" })).toEqual({ kind: "accepted", token: "demo", lead_id: "demo-lead" });
  });
  it("step 0 copy (consent, ads text) passes the wording rules", () => {
    for (const c of [genericConsent(consentJson).text, consentJson.ads.text, consentJson.ads.label, consentJson.ads.decline]) {
      for (const [re, label] of BANNED) expect(c, `${label}: ${c}`).not.toMatch(re);
      expect(c).not.toMatch(/\bAI\b|licensed|costs? (you )?nothing|\bfree\b/i);
    }
  });
});
