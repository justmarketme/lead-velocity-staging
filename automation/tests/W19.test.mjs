// Thin wrapper: the W19 acceptance test is automation/billing/billing.test.js (28 offline tests). Run: node --test automation/billing/billing.test.js
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert";
test("W19 via billing.test.js", () => { const r = spawnSync(process.execPath, ["--test", "automation/billing/billing.test.js"], { encoding: "utf8" }); assert.strictEqual(r.status, 0, r.stdout + r.stderr); });
