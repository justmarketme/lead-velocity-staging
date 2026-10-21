// @vitest-environment jsdom
/* /start/ and the phone's own Back (Android Back, a swipe back), driven through the whole page against the dev mock API (#lt=demo).
   One history entry guards the steps that show "‹ Back"; the browser's Back runs the same back(step). These prove that Back never
   reaches a step before the booking, never cuts off a booking in flight, and never traps anyone: from a screen without "‹ Back" one
   press leaves the page (21 Oct 2026). */
import { createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Start from "../src/pages/Start";
import { TOKEN_KEY } from "../src/lib/start";

// the page runs on real (mock-API) timers here, so updates are not wrapped in act()
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = false;

let root: Root;
let host: HTMLDivElement;
let entries: number; // history.length when the page opened

async function until(ok: () => boolean, what: string, ms = 6000) {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) throw new Error("timed out waiting for " + what + " (heading: " + heading() + ")");
    await new Promise((r) => setTimeout(r, 15));
  }
}
const settle = () => new Promise((r) => setTimeout(r, 60));
const heading = () => host?.querySelector("h1")?.textContent || "";
const guard = () => !!history.state?.smcBack;
const button = (label: string | RegExp) => [...host.querySelectorAll("button")].find((b) => (typeof label === "string" ? b.textContent === label : label.test(b.textContent || ""))) as HTMLButtonElement;
const click = (label: string | RegExp) => { const b = button(label); expect(b, String(label)).toBeTruthy(); b.click(); };
function type(id: string, v: string) {
  const el = host.querySelector("#" + id) as HTMLInputElement;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, v);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}
/** The phone's Back: one history step back, then let the page react. */
async function pressBack() {
  const popped = new Promise((r) => window.addEventListener("popstate", r, { once: true }));
  history.back();
  await popped;
  await settle();
}

function open(hash: string) {
  try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* none */ }
  history.replaceState(null, "", "/prev/"); // the page the visitor came from (WhatsApp, or a site page)
  history.pushState(null, "", "/start/" + hash);
  entries = history.length;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  root.render(h(MemoryRouter, { initialEntries: ["/start/"] }, h(Start)));
}

beforeEach(() => {
  window.matchMedia = ((q: string) => ({ matches: q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as any;
  window.scrollTo = (() => {}) as any;
});
afterEach(() => { root.unmount(); host.remove(); });

/** Lindi's link to the email step: See Mark's times, the first open time, Book this time. */
async function toEmailStep() {
  open("#lt=demo");
  await until(() => !!button(/^See Mark's times$/), "the adviser card");
  expect(guard()).toBe(false); // the time step has no "‹ Back": no guard
  click(/^See Mark's times$/);
  await until(() => host.querySelectorAll(".st-slot").length > 0, "open times");
  (host.querySelector(".st-slot") as HTMLButtonElement).click();
  await settle();
  click("Book this time");
  await until(() => !!host.querySelector("#st-email"), "the email step");
  await settle();
}

describe("/start/: the phone's Back", () => {
  it("on a step with ‹ Back it goes back a step; on the time step it then leaves the page (one press, no trap)", async () => {
    await toEmailStep();
    expect(guard()).toBe(true);
    expect(history.length).toBe(entries + 1); // exactly one guard entry
    await pressBack();
    expect(heading()).toMatch(/^Pick a time/);
    expect(host.querySelector(".st-slot[aria-pressed=true]"), "the chosen time is kept").toBeTruthy();
    expect(guard()).toBe(false);
    await pressBack();
    expect(location.pathname).toBe("/prev/");
  }, 20000);

  it("after the booking it never reaches the time or email step: Back from Booked leaves the page", async () => {
    await toEmailStep();
    type("st-email", "naledi@example.com");
    click("Book my call");
    await until(() => /^You're booked/.test(heading()), "Booked");
    await until(() => !guard(), "the guard to drop");
    await settle();
    expect(heading()).toMatch(/^You're booked/);
    expect(location.pathname).toBe("/start/");
    await pressBack();
    expect(location.pathname).toBe("/prev/");
    expect(heading()).toMatch(/^You're booked/);
    expect(host.querySelector("#st-email")).toBeNull();
    expect(host.querySelector(".st-slot")).toBeNull();
  }, 20000);

  it("a Back press while the booking is being sent is held: the booking completes, then Back leaves", async () => {
    await toEmailStep();
    type("st-email", "naledi@example.com");
    click("Book my call");
    await until(() => button(/^Booking/)?.disabled === true, "the booking call");
    await pressBack();
    expect(host.querySelector("#st-email"), "still on the email step").toBeTruthy();
    expect(guard()).toBe(true); // the guard went straight back
    await until(() => /^You're booked/.test(heading()), "Booked");
    await until(() => !guard(), "the guard to drop");
    await settle();
    await pressBack();
    expect(location.pathname).toBe("/prev/");
    expect(heading()).toMatch(/^You're booked/);
  }, 20000);

  it("after the booking (resumed at age): topics → income → age, then the page closes; never a step before the booking", async () => {
    open("#lt=demo-booked");
    await until(() => /^Which age band/.test(heading()), "the age step");
    await settle();
    expect(guard()).toBe(false); // age has no "‹ Back"
    click("35 to 44");
    await until(() => /monthly income/.test(heading()), "the income step");
    await settle();
    expect(guard()).toBe(true);
    (host.querySelector(".st-opts .st-opt") as HTMLButtonElement).click();
    await until(() => /to go through/.test(heading()), "the topics step");
    await settle();
    expect(history.length).toBe(entries + 1); // still one guard entry, not one per step
    await pressBack();
    expect(heading()).toMatch(/monthly income/);
    expect(guard()).toBe(true);
    await pressBack();
    expect(heading()).toMatch(/^Which age band/);
    expect(guard()).toBe(false);
    await pressBack();
    expect(location.pathname).toBe("/prev/");
    expect(heading()).toMatch(/^Which age band/);
  }, 20000);

  it("the on-screen ‹ Back to a screen without it drops the guard, so the next phone Back leaves the page", async () => {
    open("#lt=demo-booked");
    await until(() => /^Which age band/.test(heading()), "the age step");
    click("35 to 44");
    await until(() => /monthly income/.test(heading()), "the income step");
    await settle();
    expect(guard()).toBe(true);
    click("‹ Back");
    await until(() => /^Which age band/.test(heading()) && !guard(), "age without a guard");
    await settle();
    await pressBack();
    expect(location.pathname).toBe("/prev/");
  }, 20000);

  it("Move your call: the number step goes back to Move your call, which then leaves the page", async () => {
    open("#lt=demo-booked&move=1");
    await until(() => host.querySelectorAll(".st-slot").length > 0, "the move times");
    click("Phone call");
    (host.querySelector(".st-slot") as HTMLButtonElement).click();
    await settle();
    click("Move my call");
    await until(() => !!host.querySelector("#st-alt"), "the number step");
    await settle();
    expect(guard()).toBe(true);
    await pressBack();
    expect(heading()).toMatch(/^Pick a new time/);
    expect(guard()).toBe(false);
    await pressBack();
    expect(location.pathname).toBe("/prev/");
  }, 20000);
});
