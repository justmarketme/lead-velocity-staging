// Thin wrapper: the W16 acceptance test is automation/billing/billing.test.js (28 offline tests). Run: node --test automation/billing/billing.test.js
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert";
test("W16 via billing.test.js", () => { const r = spawnSync(process.execPath, ["--test", "automation/billing/billing.test.js"], { encoding: "utf8" }); assert.strictEqual(r.status, 0, r.stdout + r.stderr); });

// I-48g: W16's Execute Workflow calls send the LOCAL-STAGING.md §7 input shapes (mapping Code nodes run on fixture rows).
import { readFileSync } from "node:fs";
import { codeNode, nodeRequire, runCode } from "./_n8ncode.mjs";
const WF16 = JSON.parse(readFileSync(new URL("../W16.json", import.meta.url), "utf8"));
const next16 = (name) => ((WF16.connections[name] || { main: [] }).main[0] || []).map((c) => c.node);
const MARK = { invoice_id: "i-1", reference: "LV-1042-B-202611", broker_id: "b-1", tier_code: "SMC_BRONZE", cycle_id: "c-1", broker_status: "invited", email: "x@example.invalid", whatsapp_number: "+27820000000", media_share_zar: "4950.00" };
// Same as runCode, plus $(name).all() (n8n has it; the shared harness only gives first/item).
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
async function run(wf, name, { items = [{}], refs = {} } = {}) {
  const fn = new AsyncFunction("$json", "$env", "$", "$input", "require", codeNode(wf, name).parameters.jsCode);
  const $ = (k) => { if (!(k in refs)) throw new Error(`$('${k}') not provided`); const r = [].concat(refs[k]).map((json) => ({ json })); return { all: () => r, first: () => r[0], item: r[0] }; };
  const all = items.map((json) => ({ json }));
  return fn(items[0], {}, $, { all: () => all, first: () => all[0] }, nodeRequire);
}

test("I-48g W16: W26 gets { op: first_payment, broker_id, cycle_id }, never W20's magic-link item", async () => {
  assert.deepEqual(next16("W20: welcome + magic link by WhatsApp and email"), ["W26: map first_payment input"]);
  assert.deepEqual(next16("W26: map first_payment input"), ["W26: go-live runner (first payment)"]);
  const w20Passthrough = { action_link: "https://example.invalid/magic?token=secret", email_otp: "123456" };
  const out = await runCode(WF16, "W26: map first_payment input", { json: w20Passthrough, refs: { "Mark invoice paid + create cycle": MARK } });
  assert.deepEqual(out, [{ json: { op: "first_payment", broker_id: "b-1", cycle_id: "c-1" } }]);
  assert.doesNotMatch(JSON.stringify(out), /action_link|token|@/);
});

test("I-48g W16: resume raises the ads budget by the cycle's media_share_zar with named ids", async () => {
  assert.deepEqual(next16("Resume: cycle starts now, routing on"), ["Ads: map raise input (resume)"]);
  assert.deepEqual(next16("Ads: map raise input (resume)"), ["Ads module: raise budget by media_share_zar"]);
  const resumeSql = WF16.nodes.find((n) => n.name === "Resume: cycle starts now, routing on").parameters.query;
  assert.match(resumeSql, /select media_share_zar from public\.cycles y where y\.id = \$2::uuid/, "amount from cycles.media_share_zar (migration smc_02 cycles column)");
  const out = await run(WF16, "Ads: map raise input (resume)", { items: [{ id: "b-1", media_share_zar: "4950.00" }], refs: { "Mark invoice paid + create cycle": MARK } });
  assert.deepEqual(out, [{ json: { op: "raise", action: "raise", broker_id: "b-1", cycle_id: "c-1", amount_zar: 4950, media_share_zar: 4950, reason: "resume_payment" } }]);
  const none = await run(WF16, "Ads: map raise input (resume)", { items: [{}], refs: { "Mark invoice paid + create cycle": MARK } });
  assert.deepEqual(none, [], "no resumed row -> no ads call");
});

test("I-48g W16: every sub-workflow call is fire-and-forget (a messaging/ads failure never fails the payment path)", () => {
  for (const n of WF16.nodes.filter((x) => x.type === "n8n-nodes-base.executeWorkflow")) assert.equal(n.parameters.options.waitForSubWorkflow, false, n.name);
});
