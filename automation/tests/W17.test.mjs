// Thin wrapper: the W17 acceptance test is automation/billing/billing.test.js (28 offline tests). Run: node --test automation/billing/billing.test.js
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert";
test("W17 via billing.test.js", () => { const r = spawnSync(process.execPath, ["--test", "automation/billing/billing.test.js"], { encoding: "utf8" }); assert.strictEqual(r.status, 0, r.stdout + r.stderr); });

// I-49b / I-45i: W17 forwards NDRs for W05 meeting invites to W05 invite_bounced (recipient only), run through the
// W17.json Code node as n8n runs it (_n8ncode.mjs).
test("W17 invite NDR -> W05 invite_bounced (recipient only; FNB mail and other NDRs ignored)", async () => {
  const { readFileSync } = await import("node:fs");
  const { runCode } = await import("./_n8ncode.mjs");
  const wf = JSON.parse(readFileSync(new URL("../W17.json", import.meta.url), "utf8"));
  const items = [
    { id: "m1", subject: "Undeliverable: Your call with Mark on Wed 7 Oct at 09:30", body: { content: "<p>Your message to <b>lerato.m@gmial.com</b> couldn't be delivered.</p> howzit@leadvelocity.co.za postmaster@outlook.com" } },
    { id: "m2", subject: "Undeliverable: Quarterly newsletter", body: { content: "Your message to someone@example.com couldn't be delivered." } },
    { id: "m3", subject: "FNB: payment received", body: { content: "R1 000.00 paid to howzit@leadvelocity.co.za" } }
  ];
  const out = (await runCode(wf, "Parse invite NDRs (recipient only)", { items })).map((x) => x.json);
  assert.deepStrictEqual(out, [{ op: "invite_bounced", recipient: "lerato.m@gmial.com", booking_id: null, graph_message_id: "m1" }]);
  const call = wf.nodes.find((n) => n.name === "W05: invite_bounced");
  assert.strictEqual(call.parameters.workflowId.value, "smc-w05");
  assert.strictEqual(call.parameters.options.waitForSubWorkflow, false);
  assert.strictEqual(wf.connections["Parse invite NDRs (recipient only)"].main[0][0].node, "W05: invite_bounced");
  assert.ok(wf.connections["Poll window"].main[0].some((c) => c.node === "Outlook: invite NDRs since watermark (howzit@)"));
});
