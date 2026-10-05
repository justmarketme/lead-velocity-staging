// Thin wrapper: the W25 acceptance test is automation/billing/billing.test.js (29 offline tests). Run: node --test automation/billing/billing.test.js
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert";
test("W25 via billing.test.js", () => { const r = spawnSync(process.execPath, ["--test", "automation/billing/billing.test.js"], { encoding: "utf8" }); assert.strictEqual(r.status, 0, r.stdout + r.stderr); });
