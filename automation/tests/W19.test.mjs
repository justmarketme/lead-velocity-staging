// Thin wrapper: the W19 acceptance test is automation/billing/billing.test.js (28 offline tests). Run: node --test automation/billing/billing.test.js
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert";
test("W19 via billing.test.js", () => { const r = spawnSync(process.execPath, ["--test", "automation/billing/billing.test.js"], { encoding: "utf8" }); assert.strictEqual(r.status, 0, r.stdout + r.stderr); });

// I-48g: every smc-whatsapp-send / smc-ads-budget call in W19 gets the LOCAL-STAGING.md §7 input (mapping nodes on fixture rows).
import { readFileSync } from "node:fs";
import { codeNode, nodeRequire, runCode, templateCounts } from "./_n8ncode.mjs";
const WF19 = JSON.parse(readFileSync(new URL("../W19.json", import.meta.url), "utf8"));
// I-54c: send nodes sit behind a generated "Live send? (X)" DRY_RUN gate; topology assertions look through it to X.
const next19 = (name, out = 0) => ((WF19.connections[name] || { main: [] }).main[out] || []).map((c) => c.node.replace(/^Live send\? \((.*)\)$/, "$1"));
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
async function run(name, { items = [{}], refs = {} } = {}) { // runCode plus $(name).all()
  const fn = new AsyncFunction("$json", "$env", "$", "$input", "require", codeNode(WF19, name).parameters.jsCode);
  const $ = (k) => { if (!(k in refs)) throw new Error(`$('${k}') not provided`); const r = [].concat(refs[k]).map((json) => ({ json })); return { all: () => r, first: () => r[0], item: r[0] }; };
  const all = items.map((json) => ({ json }));
  return fn(items[0], {}, $, { all: () => all, first: () => all[0] }, nodeRequire);
}
const ROW = { cycle_id: "c-1", broker_id: "b-1", tier_code: "SMC_BRONZE", ends_at: "2026-11-13T22:00:00Z", effective_end: "2026-11-13T22:00:00Z", status: "active", billing_ref: "1042",
  email: "broker@example.invalid", whatsapp_number: "+27820000000", contact_person: "Test Broker", card_autorenew: false, next_tier_code: null, broker_status: "active",
  open_ref: "LV-1042-B-202611", open_amount_excl_vat: "16500.00", open_vat_zar: null, price_zar: "16500.00", next_paid: false };
const SHAPE = ["to", "kind", "template", "variables", "buttons", "broker_id", "cycle_id", "lead_id", "correlation", "idempotency_key"];
function assertTemplatePayload(j, name) {
  for (const k of SHAPE) assert.ok(k in j, `${name}: ${k}`);
  assert.equal(j.kind, "template"); assert.equal(j.to, "+27820000000"); assert.equal(j.broker_id, "b-1"); assert.equal(j.lead_id, null);
  assert.equal(j.template.name, name);
  const c = templateCounts(name);
  assert.equal(j.template.body.length, c.body, `${name}: body vars`); assert.deepEqual(j.variables, j.template.body);
  assert.equal(j.template.buttons.length, c.url + c.quick_reply, `${name}: button params`); assert.deepEqual(j.buttons, j.template.buttons);
  assert.equal(j.correlation, j.idempotency_key); assert.ok(j.correlation.startsWith("W19:"));
  assert.doesNotMatch(JSON.stringify(j), /example\.invalid/, "no email address in the sender payload");
}

test("I-48g W19: offer -> broker_cycle_end payload built from the offer item, not the insert output", async () => {
  assert.deepEqual(next19("Offer: issue renewal invoice (idempotent)").sort(), ["Email: renewal offer from howzit@", "Offer: map to sender input"]);
  assert.deepEqual(next19("Offer: map to sender input"), ["WhatsApp: broker_cycle_end (renewal offer)"]);
  const offer = { row: ROW, invoice: { reference: "LV-1042-B-202612" }, template: { name: "broker_cycle_end", body: ["November", "13 Nov", "20", "20", "9", "4.0", "Replacements used: 2 of 4."], buttons: ["renew/LV-1042-B-202612", "r/c-1"] } };
  const out = await run("Offer: map to sender input", { items: [{ success: true }], refs: { "Offer: renewal invoice + message": offer } });
  assert.equal(out.length, 1); assertTemplatePayload(out[0].json, "broker_cycle_end");
  assert.equal(out[0].json.correlation, "W19:offer_t7:c-1:LV-1042-B-202612");
});

test("I-48g W19: T-3 reminder -> broker_renewal_reminder payload (6 body vars, Pay now suffix); email leg stays in W19", async () => {
  const rem = await runCode(WF19, "Reminder text (reference in bold)", { items: [{ ...ROW, action: "remind_t3" }] });
  const out = await run("Reminder: map to sender input", { items: rem.map((i) => i.json) });
  assert.equal(out.length, 1); assertTemplatePayload(out[0].json, "broker_renewal_reminder");
  assert.deepEqual(out[0].json.buttons, ["LV-1042-B-202611"]);
  assert.match(out[0].json.correlation, /^W19:remind_t3:c-1:\d{4}-\d{2}-\d{2}$/);
  const mail = WF19.nodes.find((n) => n.name === "Email: renewal reminder from howzit@");
  assert.equal(mail.type, "n8n-nodes-base.microsoftOutlook"); assert.ok(next19("Reminder text (reference in bold)").includes(mail.name));
});

const CTX = { broker_id: "b-1", cycle_id: "c-1", action: "cycle_end", reference: "LV-1042-B-202611", total_cents: "1650000", tier_code: "SMC_BRONZE", attempts: 0, authorization_code: null, media_share_zar: "4950.00" };
test("I-48g W19: routing off -> ads lower { op, broker_id, cycle_id, amount_zar: 0, reason } from the cycle-end context", async () => {
  assert.deepEqual(next19("Routing off, cycle not renewed (no grace)"), ["Routing off: map ads lower input"]);
  assert.deepEqual(next19("Routing off: map ads lower input"), ["Ads module: lower budget by media_share_zar"]);
  const out = await run("Routing off: map ads lower input", { items: [{ success: true }], refs: { "Cycle end: open invoice + card token": CTX } });
  assert.deepEqual(out, [{ json: { op: "lower", action: "lower", broker_id: "b-1", cycle_id: "c-1", amount_zar: 0, media_share_zar: 4950, reason: "cycle_not_renewed" } }]);
  const retry = await run("Routing off: map ads lower input", { refs: { "Cycle end: open invoice + card token": { ...CTX, action: "retry_card" } } });
  assert.deepEqual(retry, [], "never on a card retry");
});

test("I-50h W19: pay link (cycle ended / card failed) -> broker_cycle_ended, day-7 come-back -> broker_come_back; email legs keep the bold reference", async () => {
  assert.deepEqual(next19("Card auto-renew on?", 1), ["Pay link: map to sender input"]);
  assert.deepEqual(next19("Day-3 retry failed? -> pay link"), ["Pay link: map to sender input"]);
  assert.deepEqual(next19("Pay link: map to sender input").sort(), ["Email: pay link from howzit@", "WhatsApp + email: pay link (card failed / cycle ended)"]);
  const claimed = [{ ...ROW, action: "cycle_end", effective_end: "2026-11-27T22:00:00Z" }]; // extended cycle: the end date is effective_end
  const ended = await run("Pay link: map to sender input", { items: [{ op: "lower", broker_id: "b-1", cycle_id: "c-1" }], refs: { "Cycle end: open invoice + card token": CTX, "Claimed rows only": claimed } });
  const declined = await run("Pay link: map to sender input", { items: [{ success: true }], refs: { "Cycle end: open invoice + card token": { ...CTX, action: "retry_card", authorization_code: "AUTH_x" }, "Claimed rows only": claimed } });
  for (const [out, reason, re] of [[ended, "it reached its end date", /cycle has ended/], [declined, "the card payment was declined", /card was declined/]]) {
    assert.equal(out.length, 1); const j = out[0].json;
    assertTemplatePayload(j, "broker_cycle_ended");
    assert.equal(j.cycle_id, "c-1");
    assert.deepEqual(j.variables, ["Test", reason, "Sat 28 Nov", "LV-1042-B-202611"]);
    assert.doesNotMatch(reason, /[A-Z.]/, "reason is lower case with no full stop");
    assert.deepEqual(j.buttons, ["LV-1042-B-202611"]);
    assert.match(j.correlation, /^W19:pay_link:c-1:\d{4}-\d{2}-\d{2}$/);
    assert.match(j.text, re); assert.match(j.text, /\*LV-1042-B-202611\*/); assert.match(j.text, /checkout\/\?ref=LV-1042-B-202611/); // email leg
    assert.doesNotMatch(JSON.stringify(j), /example\.invalid|AUTH_x/);
  }
  const back = await run("Come back: map to sender input", { items: [{ ...ROW, action: "come_back" }] });
  assert.equal(back.length, 1); assertTemplatePayload(back[0].json, "broker_come_back"); assert.equal(back[0].json.correlation, "W19:come_back:c-1");
  assert.deepEqual(back[0].json.variables, ["Test", "LV-1042-B-202611"]); assert.deepEqual(back[0].json.buttons, ["LV-1042-B-202611"]);
  assert.match(back[0].json.text, /^Hi Test, /); assert.doesNotMatch(back[0].json.text, /guarantee|hurry|free\b/i);
  assert.deepEqual(next19("Come back: map to sender input").sort(), ["Email: 'come back any time' from howzit@", "WhatsApp + email: 'come back any time' (once, day 7)"]);
  for (const n of ["Email: pay link from howzit@", "Email: 'come back any time' from howzit@"]) assert.match(WF19.nodes.find((x) => x.name === n).parameters.bodyContent, /\$json\.text/);
});

test("I-48g W19: every sender call is fed by a Code node; every sub-workflow call is fire-and-forget", () => {
  const into = (name) => Object.entries(WF19.connections).filter(([, c]) => c.main.some((o) => o.some((x) => x.node === name))).map(([k]) => k);
  for (const n of WF19.nodes.filter((x) => x.type === "n8n-nodes-base.executeWorkflow")) {
    assert.equal(n.parameters.options.waitForSubWorkflow, false, n.name);
    if (["smc-whatsapp-send", "smc-ads-budget"].includes(n.parameters.workflowId.value))
      for (const src of into(n.name)) assert.equal(WF19.nodes.find((x) => x.name === src).type, "n8n-nodes-base.code", `${n.name} <- ${src}`);
  }
});
