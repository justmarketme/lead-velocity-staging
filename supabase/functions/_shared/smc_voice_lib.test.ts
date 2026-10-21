// deno test supabase/functions/_shared/smc_voice_lib.test.ts
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  ageBand, budgetBand, callbackClosedActivity, callbackDueAt, callContactAt, classifyOutcome, countsTowardCap, dialedWithin24h, elevenSignatureOk, helpTopics, IN_CRITERIA, inCallWindow, leadInterest,
  callbackAlertEmail, mintLeadToken, nextCallWindow, sastIso, SMC_CALLBACK_ALERT_CC, SMC_CALLBACK_ALERT_TO, twilioSignature, twilioSignatureOk,
  voiceContactRoute, voicePhoneOk, zaLineType,
} from "./smc_voice_lib.ts";
import { localZaFormat, normalizeZaPhone } from "./spoken.ts";

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

Deno.test("dial-time cap: another callback dialled to the number in the last 24 h blocks this one", () => {
  const now = sast("2026-10-19T08:00:00");
  const dialed = (id: string, at: string) => ({ id, metadata: { dialed_at: new Date(sast(at)).toISOString() } });
  assert(dialedWithin24h([dialed("a", "2026-10-18T09:00:00")], "b", now));
  assert(!dialedWithin24h([dialed("a", "2026-10-18T07:59:00")], "b", now), "older than 24 h");
  assert(!dialedWithin24h([dialed("b", "2026-10-19T07:00:00")], "b", now), "itself does not count");
  assert(!dialedWithin24h([{ id: "a", metadata: {} }, { id: "c", metadata: null }], "b", now), "never dialled");
});

Deno.test("schedule-time cap ignores callbacks cancelled before any dial", () => {
  assert(!countsTowardCap({ state: "cancelled" }), "cancelled while callbacks were off");
  assert(countsTowardCap({ state: "cancelled", dialed_at: "2026-10-21T09:05:00Z" }), "dialled, then closed");
  assert(countsTowardCap({ state: "scheduled" }), "still queued");
  assert(countsTowardCap({ state: "done", dialed_at: "2026-10-21T09:05:00Z" }));
  assert(countsTowardCap(null));
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
  const cb = [{ role: "user", message: "rather call me" }, { role: "agent", tool_results: [{ tool_name: "request_callback", result_value: { ok: true } }] }];
  assertEquals(classifyOutcome(cb, {}, "inbound", 200), "callback_requested");
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

Deno.test("twilioSignature round-trips through twilioSignatureOk", async () => {
  const params = { CallSid: "CA1", From: "+27825550000", To: "+27600156480" };
  const sig = await twilioSignature("token", "https://x.test/twiml", params);
  assertEquals(await twilioSignatureOk("token", "https://x.test/twiml", params, sig), true);
  assertEquals(await twilioSignatureOk("other", "https://x.test/twiml", params, sig), false);
});

Deno.test("phone call is WhatsApp-only (Jono, 21 Oct 2026): no age, budget, adviser name or FSP on the call", async () => {
  for (const b of ["lt35", "35_44", "45_50", "51plus"]) assert(IN_CRITERIA.has(b), b);
  const { SMC_PROMPT, SMC_FIRST_MESSAGE, smcCallbackFirstMessage } = await import("./smc_receptionist_persona.ts");
  const spoken = SMC_PROMPT + SMC_FIRST_MESSAGE + smcCallbackFirstMessage("Thandi");
  assert(!/Which age group|under R750|R1,500|Mark Weston|Oracle|28418|FSP number \d|43826/.test(spoken));
  assert(smcCallbackFirstMessage(null).includes("We noticed we missed your call"));
  assert(SMC_PROMPT.includes("Never ask their age or age group"));
});

Deno.test("why WhatsApp (Jono, 18 Oct 2026): one spoken sentence in the consent ask; no price words, no AI", async () => {
  const { SMC_WHATSAPP_CONSENT_ASK } = await import("./smc_receptionist_persona.ts");
  assert(SMC_WHATSAPP_CONSENT_ASK.includes("WhatsApp is just quicker for most people: you get answers fast, with no call centre or waiting on hold, and your confirmation and reminders come there too."));
  assert(SMC_WHATSAPP_CONSENT_ASK.endsWith("Do I have your permission to contact you on WhatsApp on this number?"));
  assert(!/\bfree\b|\bcosts?\b|\bprice\b|\bR\d/i.test(SMC_WHATSAPP_CONSENT_ASK));
  assert(!/\bAI\b/.test(SMC_WHATSAPP_CONSENT_ASK));
});

Deno.test("call-back route (Jono, 21 Oct 2026): consent picks the route; a landline is fine for a call-back, not for WhatsApp", () => {
  assertEquals(voiceContactRoute({ whatsapp_consent: "yes" }), "whatsapp");
  assertEquals(voiceContactRoute({ whatsapp_consent: "Yes", callback_consent: "yes" }), "whatsapp");
  assertEquals(voiceContactRoute({ whatsapp_consent: "no", callback_consent: " YES " }), "callback");
  assertEquals(voiceContactRoute({ whatsapp_consent: "maybe" }), null);
  assertEquals(voiceContactRoute({}), null);
  const landline = normalizeZaPhone("012 345 6789")!;
  assertEquals(landline, "+27123456789");
  assert(!voicePhoneOk(landline, "whatsapp"));
  assert(voicePhoneOk(landline, "callback"));
  assert(voicePhoneOk("+27825551234", "whatsapp") && voicePhoneOk("+27825551234", "callback"));
  assert(voicePhoneOk("+27871234567", "callback"), "087 VoIP");
  assert(!voicePhoneOk("+27901234567", "callback"), "not an SA geographic or mobile range");
  assert(!voicePhoneOk("+447700900123", "callback"), "foreign");
  assert(!voicePhoneOk(null, "callback"));
  assertEquals(zaLineType("+27825551234"), "mobile");
  assertEquals(zaLineType("+27731234567"), "mobile");
  assertEquals(zaLineType("+27123456789"), "landline");
  assertEquals(zaLineType("+27214567890"), "landline");
  assertEquals(zaLineType("+27871234567"), "voip");
  assertEquals(zaLineType(null), "unknown");
  assertEquals(localZaFormat(landline), "012 345 6789");
});

Deno.test("call-back team alert: team addresses only (team-notify accepts them), number + time, never the adviser", async () => {
  const { plan } = await import("../team-notify/index.ts");
  const mail = callbackAlertEmail({
    firstName: "Gert", phoneSpoken: "012 345 6789", lineType: "landline", preferredTime: "weekday mornings", helpWith: ["life_cover", "wills"],
    conversationId: "conv_abc", leadId: "lead-1", atMs: sast("2026-10-21T10:00:00"),
  });
  assertEquals(mail.subject, "SortMyCover call-back: Gert on 012 345 6789");
  assert(mail.text.includes("Call: 012 345 6789 (landline)"));
  assert(mail.text.includes("Best time of day: weekday mornings"));
  assert(mail.text.includes("Wants help with: life cover, wills"));
  assert(mail.text.includes("not the adviser"));
  assert(!/Mark Weston|Oracle|28418|43826/.test(mail.text));
  assertEquals(plan({ to: SMC_CALLBACK_ALERT_TO, cc: SMC_CALLBACK_ALERT_CC, subject: mail.subject, text: mail.text }).ok, true);
  const t = callbackAlertEmail({ firstName: "T", phoneSpoken: "x", lineType: "unknown", preferredTime: null, helpWith: [], conversationId: "c", leadId: "l", atMs: 0, synthetic: true });
  assert(t.subject.startsWith("[TEST] "));
  assert(t.text.includes("Best time of day: not given") && t.text.includes("Wants help with: not sure"));
});

Deno.test("call-back offer on the phone: once, SortMyCover team (not the adviser), confirm number + time of day", async () => {
  const { SMC_PROMPT, SMC_CALLBACK_OFFER } = await import("./smc_receptionist_persona.ts");
  assertEquals(SMC_CALLBACK_OFFER, "No problem. Would you like someone from the SortMyCover team to give you a call back on this number instead?");
  assert(SMC_PROMPT.includes(`offer the call-back ONCE, in these words: "${SMC_CALLBACK_OFFER}"`));
  assert(SMC_PROMPT.includes("What time of day usually suits you best for a call?"));
  assert(SMC_PROMPT.includes("Done. Someone from the SortMyCover team will give you a call on that number"));
  assert(SMC_PROMPT.includes("never say the adviser will call"));
  assert(!/adviser's office/.test(SMC_PROMPT));
  assert(!/\bfree\b|\bno cost\b|\bAI\b/i.test(SMC_CALLBACK_OFFER));
});

Deno.test("sync-voice-agents attaches request_callback again (SortMyCover team call-back) and scores it", async () => {
  const src = await Deno.readTextFile(new URL("../sync-voice-agents/index.ts", import.meta.url));
  const attached = src.slice(src.indexOf("const SMC_TOOL_DEFS"), src.indexOf("export const SMC_BOOKING_TOOL_DEFS"));
  assert(attached.includes('name: "request_callback"'));
  assert(attached.includes("callback_consent"));
  assert(/upsertTools\(\[\.\.\.SMC_TOOL_DEFS, \.\.\.SMC_WHATSAPP_TOOL_DEFS\]/.test(src));
  assert(src.includes("callback_requested (said no to WhatsApp and request_callback returned ok"));
  assert(src.includes("a call-back from the SortMyCover team on a confirmed number"));
});

Deno.test("callback timeline rows: one per callback, only with a lead", () => {
  assertEquals(callbackClosedActivity("cb1", null, "no_answer", "no-answer"), null);
  assertEquals(callbackClosedActivity("cb1", undefined, "cancelled", "caller_spoke"), null);
  const na = callbackClosedActivity("cb1", "lead1", "no_answer", "completed, machine_start");
  assertEquals(na?.type, "voice_callback_no_answer");
  assertEquals(na?.key, "smcvoice:cbna:cb1");
  assertEquals(na?.payload, { callback_id: "cb1", result: "completed, machine_start" });
  const c = callbackClosedActivity("cb1", "lead1", "cancelled", "caller_reached_us");
  assertEquals(c?.type, "voice_callback_cancelled");
  assertEquals(c?.key, "smcvoice:cbcancel:cb1");
  assertEquals(c?.notes, "Automatic callback cancelled (caller_reached_us).");
});

Deno.test("last_contact_at = call end (stable across webhook retries), never in the future", () => {
  const now = Date.parse("2026-10-20T10:00:00Z");
  assertEquals(callContactAt(Date.parse("2026-10-20T09:50:00Z"), 120, now), "2026-10-20T09:52:00.000Z");
  assertEquals(callContactAt(0, 120, now), "2026-10-20T10:00:00.000Z");
  assertEquals(callContactAt(Date.parse("2026-10-20T09:59:00Z"), 600, now), "2026-10-20T10:00:00.000Z");
});

Deno.test("talk-over restatement (smoke test #46): the recording line AND the no-advice line, as in the opener", async () => {
  const { SMC_PROMPT, SMC_FIRST_MESSAGE } = await import("./smc_receptionist_persona.ts");
  const noAdvice = "I don't give financial advice, but I can set you up with a 30-minute call with an authorised adviser.";
  assert(SMC_FIRST_MESSAGE.includes(noAdvice));
  const rule = SMC_PROMPT.split("\n").find((l) => l.startsWith("- If they spoke over your opening"));
  assert(rule, "talk-over rule missing");
  assert(rule.includes(`"Just so you know, this call is recorded and transcribed. ${noAdvice}"`), rule);
});
