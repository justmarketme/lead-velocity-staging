// deno test supabase/functions/_shared/smc_voice_lib.test.ts
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  ageBand, budgetBand, callbackDueAt, classifyOutcome, elevenSignatureOk, helpTopics, inCallWindow, leadInterest,
  mintLeadToken, nextCallWindow, sastIso, twilioSignatureOk,
} from "./smc_voice_lib.ts";

const sast = (s: string) => Date.parse(`${s}+02:00`);

Deno.test("CPA window: weekdays 08:00-20:00 (last start 19:45), Saturday 09:00-13:00, never Sunday/holiday", () => {
  assert(inCallWindow(sast("2026-10-14T08:00:00"))); // Wed
  assert(!inCallWindow(sast("2026-10-14T07:59:00")));
  assert(inCallWindow(sast("2026-10-14T19:45:00")));
  assert(!inCallWindow(sast("2026-10-14T19:46:00")));
  assert(inCallWindow(sast("2026-10-17T09:00:00"))); // Sat
  assert(!inCallWindow(sast("2026-10-17T12:50:00")));
  assert(!inCallWindow(sast("2026-10-18T10:00:00"))); // Sun
  assert(!inCallWindow(sast("2026-12-16T10:00:00"))); // Day of Reconciliation (Wed)
});

Deno.test("next window rolls over evenings, weekends and holidays", () => {
  assertEquals(sastIso(nextCallWindow(sast("2026-10-14T21:00:00"))), "2026-10-15T08:00:00+02:00");
  assertEquals(sastIso(nextCallWindow(sast("2026-10-17T13:30:00"))), "2026-10-19T08:00:00+02:00"); // Sat pm -> Mon
  assertEquals(sastIso(nextCallWindow(sast("2026-10-18T09:00:00"))), "2026-10-19T08:00:00+02:00"); // Sun -> Mon
  assertEquals(sastIso(nextCallWindow(sast("2026-12-15T22:00:00"))), "2026-12-17T08:00:00+02:00"); // skips 16 Dec
  assertEquals(sastIso(nextCallWindow(sast("2026-12-24T19:50:00"))), "2026-12-28T08:00:00+02:00"); // 25 Fri, 26 Sat holidays, 27 Sun
  assertEquals(sastIso(nextCallWindow(sast("2026-10-17T07:00:00"))), "2026-10-17T09:00:00+02:00"); // Sat opens 09:00
});

Deno.test("callback is due 5 minutes after the miss, inside the window", () => {
  assertEquals(sastIso(callbackDueAt(sast("2026-10-14T10:00:00"))), "2026-10-14T10:05:00+02:00");
  assertEquals(sastIso(callbackDueAt(sast("2026-10-14T19:43:00"))), "2026-10-15T08:00:00+02:00");
  assertEquals(sastIso(callbackDueAt(sast("2026-10-17T12:58:00"))), "2026-10-19T08:00:00+02:00");
});

Deno.test("answers map onto the CRM's constrained columns", () => {
  assertEquals(ageBand("35 to 44"), "35_44");
  assertEquals(ageBand("45-50"), "45_50");
  assertEquals(ageBand("under 35"), "lt35");
  assertEquals(ageBand("over 50"), "51plus");
  assertEquals(ageBand("I'm 47"), "45_50");
  assertEquals(budgetBand("R750 to R1,499"), "750_1499");
  assertEquals(budgetBand("under R750"), "lt750");
  assertEquals(budgetBand("R1,500 or more"), "1500_plus");
  assertEquals(budgetBand("not sure yet"), null);
  assertEquals(helpTopics("life cover and income protection"), ["income_protection", "life_cover"]);
  assertEquals(leadInterest(["wills"]), { reasons: [], product_interest: "wills" });
  assertEquals(leadInterest(["severe_illness", "life_cover"]), { reasons: ["other", "life_cover"], product_interest: "life_cover" });
});

Deno.test("lead token matches automation/security/lead-token.js", async () => {
  // Expected value computed with the Node implementation (mintLeadToken) for the same inputs.
  const t = await mintLeadToken("11111111-2222-3333-4444-555555555555", "x".repeat(40), 1_760_000_000_000);
  assertEquals(t, "lt1.11111111-2222-3333-4444-555555555555.1761209600.E4YAK_-3I0vzBWl19X1Lrb0AejCb_dH5CcawizVB0SI");
});

Deno.test("outcome: tool results beat the agent's own label", () => {
  const booked = [{ role: "user", message: "yes please" }, { role: "agent", tool_results: [{ tool_name: "book_appointment", result_value: '{"ok":true}' }] }];
  assertEquals(classifyOutcome(booked, {}, "inbound", 200), "booked");
  const wa = [{ role: "user", message: "ok" }, { role: "agent", tool_results: [{ tool_name: "send_whatsapp_followup", result_value: { ok: true } }] }];
  assertEquals(classifyOutcome(wa, {}, "inbound", 200), "whatsapp_handoff");
  const ooc = [{ role: "user", message: "I'm 62" }, { role: "agent", tool_results: [{ tool_name: "save_caller_details", result_value: '{"ok":true,"out_of_criteria":true}' }] }];
  assertEquals(classifyOutcome(ooc, {}, "inbound", 60), "out_of_criteria");
  assertEquals(classifyOutcome([{ role: "agent", message: "Hi" }], {}, "inbound", 6), "missed");
  assertEquals(classifyOutcome([{ role: "agent", message: "Hi" }], {}, "callback", 6), "no_answer");
  assertEquals(classifyOutcome([{ role: "user", message: "what do you do?" }, { role: "user", message: "ok thanks bye" }], {}, "inbound", 90), "info_only");
});

Deno.test("signatures", async () => {
  // Twilio's documented example (https://www.twilio.com/docs/usage/security#validating-requests).
  const ok = await twilioSignatureOk("12345", "https://mycompany.com/myapp.php?foo=1&bar=2",
    { CallSid: "CA1234567890ABCDE", Caller: "+12349013030", Digits: "1234", From: "+12349013030", To: "+18005551212" },
    "0/KCTR6DLpKmkAf8muzZqo1nDgQ=");
  assert(ok);
  const now = 1_760_000_000_000;
  const t = Math.floor(now / 1000);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("whsec"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.{"a":1}`)));
  const hex = [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
  assert(await elevenSignatureOk("whsec", `t=${t},v0=${hex}`, '{"a":1}', now));
  assert(!(await elevenSignatureOk("whsec", `t=${t},v0=${hex}`, '{"a":2}', now)));
  assert(!(await elevenSignatureOk("whsec", `t=${t - 3600},v0=${hex}`, '{"a":1}', now)));
});
