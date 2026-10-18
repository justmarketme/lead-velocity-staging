/* /start/ pure helpers (src/lib/start.ts) and response mapping (src/lib/start-api.ts). */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BANNED } from "../src/build/wording";
import { AdviserIntro } from "../src/pages/Start";
import { createMockApi } from "../src/lib/start-mock";
import {
  INTRO_DISCLOSURE, adviserDisclosure, afterAnswers, answersPayload, availableMethods, defaultMethod, formatDay, formatTime, formatWhen, groupSlots, initials, limitGroups, methodLabel,
  nextStep, prevStep, readTokenFromHash, resumeAt, setAnswer, stepNumber, suggestEmail, validEmail, waLink, type AdviserInfo, type Answers, type StepId,
} from "../src/lib/start";
import { interpretAnswers, interpretBook } from "../src/lib/start-api";

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

describe("step machine", () => {
  const walk = (a: Answers, from: StepId = "intent") => {
    const path: string[] = [from];
    let s: StepId = from;
    for (;;) { const n = nextStep(s, a); path.push(n); if (n === "chat" || n === "submit") return path; s = n; }
  };
  it("a will and something else go straight back to the chat", () => {
    expect(walk({ intent: "will" })).toEqual(["intent", "chat"]);
    expect(walk({ intent: "other" })).toEqual(["intent", "chat"]);
    expect(answersPayload({ intent: "will", age_band: "lt35" }, "r1")).toEqual({ intent: "will", request_id: "r1" });
  });
  it("yes path: intent, age, cover, pay band, then submit (no want question)", () => {
    expect(walk({ intent: "life", has_cover: "yes" })).toEqual(["intent", "age", "cover", "budget", "submit"]);
  });
  it("no / not sure path adds the want question, still numbered 4 of 6", () => {
    expect(walk({ intent: "income", has_cover: "no" })).toEqual(["intent", "age", "cover", "budget", "want", "submit"]);
    expect(walk({ intent: "review", has_cover: "unsure" })).toContain("want");
    expect(stepNumber("budget")).toBe(4);
    expect(stepNumber("want")).toBe(4);
    expect([stepNumber("intent"), stepNumber("age"), stepNumber("cover"), stepNumber("adviser"), stepNumber("time"), stepNumber("email")]).toEqual([1, 2, 3, 5, 5, 6]);
  });
  it("time and email follow the answers", () => {
    expect(nextStep("time", {})).toBe("email");
    expect(prevStep("email", {})).toBe("time");
    expect(prevStep("time", { has_cover: "yes" })).toBe("adviser");
    expect(prevStep("adviser", { has_cover: "yes" })).toBe("budget");
    expect(prevStep("adviser", { has_cover: "no" })).toBe("want");
    expect(nextStep("adviser", {})).toBe("submit");
    expect(prevStep("intent", {})).toBeNull();
  });
  it("resumes at the first unanswered step", () => {
    expect(resumeAt({})).toBe("intent");
    expect(resumeAt({ intent: "will" })).toBe("chat");
    expect(resumeAt({ intent: "life" })).toBe("age");
    expect(resumeAt({ intent: "life", age_band: "lt35" })).toBe("cover");
    expect(resumeAt({ intent: "life", age_band: "lt35", has_cover: "no", budget_band: "lt750" })).toBe("want");
    // complete answers (even an already routed lead) resume at the adviser disclosure, never straight at the times
    expect(resumeAt({ intent: "life", age_band: "51plus", has_cover: "yes", budget_band: "lt750" })).toBe("adviser");
    expect(resumeAt({ intent: "life", age_band: "35_44", has_cover: "no", budget_band: "1500_plus", want: "family" })).toBe("adviser");
  });
  it("payload: want only on the no / not sure path; a changed cover answer clears the dependants", () => {
    const yes = answersPayload({ intent: "life", age_band: "45_50", has_cover: "yes", budget_band: "750_1250", want: "family" }, "r");
    expect(yes).toEqual({ intent: "life", age_band: "45_50", has_cover: "yes", budget_band: "750_1250", request_id: "r" });
    const no = answersPayload({ intent: "life", age_band: "45_50", has_cover: "no", budget_band: "lt750", want: "bond" }, "r");
    expect(no).toMatchObject({ has_cover: "no", want: "bond" });
    expect(no).not.toHaveProperty("confirm_adviser");
    expect(answersPayload({ intent: "life", age_band: "45_50", has_cover: "yes", budget_band: "lt750" }, "r", "mock-broker")).toMatchObject({ confirm_adviser: "mock-broker" });
    expect(answersPayload({ intent: "will" }, "r", "mock-broker")).toEqual({ intent: "will", request_id: "r" });
    const a = setAnswer({ intent: "life", has_cover: "no", budget_band: "lt750", want: "bond" }, "has_cover", "yes");
    expect(a.budget_band).toBeUndefined();
    expect(a.want).toBeUndefined();
    expect(setAnswer({ has_cover: "no", budget_band: "lt750" }, "has_cover", "no").budget_band).toBe("lt750");
  });
});

describe("meeting type", () => {
  it("offers Teams and phone only, in a fixed order, defaulting to Teams", () => {
    expect(availableMethods(["phone", "whatsapp_call", "teams", "zoom"])).toEqual(["teams", "phone"]);
    expect(availableMethods(["whatsapp_call"])).toEqual([]);
    expect(availableMethods(undefined)).toEqual([]);
    expect(defaultMethod(["phone", "teams"])).toBe("teams");
    expect(defaultMethod(["phone", "whatsapp_call"])).toBe("phone");
    expect(defaultMethod([])).toBeNull();
    expect(methodLabel("teams")).toBe("Teams call");
    expect(methodLabel("phone")).toBe("Phone call");
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

describe("API response mapping", () => {
  it("/start/answers", () => {
    const adv = { id: "b1", first_name: "Mark", name: "Mark Weston", firm: "Oracle Private Wealth", fsp: "28418" };
    expect(interpretAnswers(200, { ok: true, next: "adviser", adviser: adv })).toEqual({ kind: "ok", next: "adviser", adviser: adv });
    expect(interpretAnswers(200, { ok: true, next: "slots" })).toEqual({ kind: "ok", next: "slots", adviser: null });
    expect(interpretAnswers(200, { ok: true, next: "chat" })).toEqual({ kind: "ok", next: "chat", adviser: null });
    expect(interpretAnswers(200, { ok: true, next: "adviser", adviser: { name: "No id" } })).toEqual({ kind: "ok", next: "adviser", adviser: null });
    expect(interpretAnswers(200, { ok: true, next: "somewhere" })).toEqual({ kind: "error" });
    expect(interpretAnswers(401, null)).toEqual({ kind: "expired" });
    expect(interpretAnswers(500, null)).toEqual({ kind: "error" });
    expect(interpretAnswers(400, { error: "bad" })).toEqual({ kind: "error" });
  });
  it("/book", () => {
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

describe("adviser disclosure before routing (two-phase POST /start/answers)", () => {
  const mark: AdviserInfo = { id: "mock-broker", first_name: "Mark", name: "Mark Weston", firm: "Oracle Private Wealth", fsp: "28418" };
  const other: AdviserInfo = { id: "b2", first_name: "Thandi", name: "Thandi Mokoena", firm: "Example Wealth", fsp: "12345" };
  it("the first POST names the adviser; the times open only on 'slots' to a POST confirming that same adviser", () => {
    expect(afterAnswers({ next: "adviser", adviser: mark }, null)).toEqual({ k: "adviser", adviser: mark });
    expect(afterAnswers({ next: "slots", adviser: mark }, "mock-broker")).toEqual({ k: "slots" });
    expect(afterAnswers({ next: "slots", adviser: null }, "mock-broker")).toEqual({ k: "slots" });
    expect(afterAnswers({ next: "chat" }, null)).toEqual({ k: "chat" });
    expect(afterAnswers({ next: "chat" }, "mock-broker")).toEqual({ k: "chat" });
  });
  it("never reaches the times without passing the adviser step", () => {
    // an unconfirmed 'slots' (backend out of step) shows the adviser if one came back, otherwise errors: never the times
    expect(afterAnswers({ next: "slots", adviser: mark }, null)).toEqual({ k: "adviser", adviser: mark });
    expect(afterAnswers({ next: "slots", adviser: null }, null)).toEqual({ k: "error" });
    expect(afterAnswers({ next: "adviser", adviser: null }, null)).toEqual({ k: "error" });
    // a full run: the questions, then phase 1, then phase 2
    const a: Answers = { intent: "life", age_band: "35_44", has_cover: "yes", budget_band: "750_1250" };
    const seen: string[] = [];
    let s: StepId = "intent";
    for (;;) { const n = nextStep(s, a); if (n === "submit" || n === "chat") break; seen.push(n); s = n; }
    expect(seen).not.toContain("time");
    const p1 = afterAnswers({ next: "adviser", adviser: mark }, null);
    expect(p1.k).toBe("adviser");
    const p2 = afterAnswers({ next: "slots", adviser: mark }, p1.k === "adviser" ? p1.adviser.id : null);
    expect(p2.k).toBe("slots");
  });
  it("a different adviser coming back re-shows part A (and must be confirmed again)", () => {
    expect(afterAnswers({ next: "adviser", adviser: other }, "mock-broker")).toEqual({ k: "adviser", adviser: other });
    expect(afterAnswers({ next: "slots", adviser: other }, "mock-broker")).toEqual({ k: "adviser", adviser: other });
  });
  it("renders the full disclosure from the API values with the confirm button, assuming no gender", () => {
    const [who, shared, intro] = adviserDisclosure(mark);
    expect(who).toBe("Mark Weston, Oracle Private Wealth, an authorised financial services provider (FSP 28418). Mark will be the one on the call with you.");
    expect(shared).toBe("SortMyCover shares your name, WhatsApp number and the answers you gave here with Mark to prepare for the call.");
    expect(intro).toBe("Introduced by SortMyCover. SortMyCover gives no financial advice, product comparisons or premium quotes. Advisers pay SortMyCover a fee that does not depend on whether you buy anything.");
    expect(intro).toBe(INTRO_DISCLOSURE);
    const html = renderToStaticMarkup(createElement(AdviserIntro, { adviser: other, busy: false, onConfirm: () => {} })).replace(/&#x27;/g, "'");
    for (const line of adviserDisclosure(other)) expect(html).toContain(line);
    expect(html).toContain("Example Wealth · authorised FSP 12345");
    expect(html).toContain("See Thandi's open times");
    expect(html).toMatch(/<em>Thandi\.<\/em>/);
    expect(html).toMatch(/class="st-adv-disclose" data-disclosure/);
    expect(html).not.toMatch(/\bhe\b|\bshe\b|\bhis\b|\bher\b/i);
  });
  it("the dev mock follows the same contract: adviser first, times only after confirming mock-broker", async () => {
    const api = createMockApi();
    const body = { intent: "life", age_band: "35_44", has_cover: "yes", budget_band: "lt750", request_id: "r1" };
    await expect(api.getSlots(7)).rejects.toThrow(/before the adviser was confirmed/);
    expect(await api.postAnswers(body)).toMatchObject({ kind: "ok", next: "adviser", adviser: { id: "mock-broker" } });
    expect(await api.postAnswers({ ...body, confirm_adviser: "mock-broker", request_id: "r2" })).toMatchObject({ kind: "ok", next: "slots" });
    const s = await api.getSlots(7);
    expect(s.kind === "ok" && s.data.slots.length).toBeGreaterThan(5);
  }, 10000);
});

describe("/start/ copy passes the site wording rules (automated assistant, authorised, no price wording)", () => {
  const files = ["src/pages/Start.tsx", "src/lib/start.ts", "src/lib/start-api.ts", "src/lib/start-mock.ts"].map((f) => fs.readFileSync(path.resolve(__dirname, "..", f), "utf8"));
  // client-visible copy: string literals that contain a space and a letter, and JSX text between tags (comments stripped)
  const copy = files.flatMap((src) => {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|\s)\/\/ .*$/gm, " ");
    const lits = [...code.matchAll(/"([^"\\\n]*)"|`([^`\n]*)`/g)].map((m) => m[1] ?? m[2]);
    const jsx = [...code.matchAll(/>([^<>{}();=&|\n]+)</g)].map((m) => m[1]);
    return [...lits, ...jsx].map((t) => t.trim()).filter((t) => /[A-Za-z]{2}/.test(t) && / /.test(t));
  });
  it("collects the page copy", () => {
    expect(copy).toContain("Pick the one closest.");
    expect(copy.some((c) => c.includes("Lindi will carry on with you"))).toBe(true);
    expect(copy.some((c) => c.includes("open times"))).toBe(true);
  });
  it("no banned word, no AI assistant, no licensed adviser, no price wording", () => {
    const EXTRA: [RegExp, string][] = [
      [/\bAI\b/, "AI"], [/licensed/i, "licensed"],
      [/\bfree\b|costs? (you )?nothing|no cost|at no charge|pays? nothing/i, "price wording"], [/Lead Velocity/, "Lead Velocity"],
    ];
    for (const c of copy) for (const [re, label] of [...BANNED, ...EXTRA]) expect(c, `${label}: ${c}`).not.toMatch(re);
  });
});
