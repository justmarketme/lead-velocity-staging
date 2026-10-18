// node --test scripts/meta-enable.test.mjs. Mocked fetch only: nothing reaches Meta.
import test from "node:test";
import assert from "node:assert/strict";
import { run, parseEnv, DEFAULTS } from "./meta-enable.mjs";

const ENV = {
  META_SYSTEM_USER_TOKEN: "SUT-secret-token-123", META_APP_SECRET: "app-secret-456", META_WEBHOOK_VERIFY_TOKEN: "verify-789",
  META_BUSINESS_ID: "222276519074106",
};

/** Fake Graph: state decides what the GETs return; every call is recorded. */
function fakeGraph(state) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    const u = new URL(url);
    const method = init.method || "GET";
    const params = method === "GET" ? u.searchParams : new URLSearchParams(init.body);
    const path = u.pathname.replace(/^\/v[\d.]+\//, "");
    calls.push({ method, path, params: Object.fromEntries(params) });
    const ok = (b) => ({ ok: true, status: 200, json: async () => b });
    if (method === "GET" && path === "me") return ok({ id: state.meId ?? DEFAULTS.SYSTEM_USER_ID, name: "SortMyCover n8n" });
    if (method === "GET" && path === `${DEFAULTS.APP_ID}/subscriptions`) return ok({ data: state.appSubs ?? [] });
    if (method === "POST" && path === `${DEFAULTS.APP_ID}/subscriptions`) return ok({ success: true });
    if (method === "GET" && path === DEFAULTS.PAGE_ID) return ok({ id: DEFAULTS.PAGE_ID, access_token: "PAGE-token-abc" });
    if (method === "GET" && path === `${DEFAULTS.PAGE_ID}/subscribed_apps`) return ok({ data: state.pageApps ?? [] });
    if (method === "POST" && path === `${DEFAULTS.PAGE_ID}/subscribed_apps`) return ok({ success: true });
    if (method === "GET" && path === DEFAULTS.DATASET_ID) return ok({ id: DEFAULTS.DATASET_ID, name: "SortMyCover dataset" });
    if (method === "GET" && path === `${DEFAULTS.DATASET_ID}/assigned_users`) return ok({ data: state.assigned ?? [] });
    return { ok: false, status: 400, json: async () => ({ error: { code: 100, message: `unexpected ${method} ${path}` } }) };
  };
  return { fetch, calls };
}
const capture = () => { const lines = []; return { lines, log: (s) => lines.push(String(s)) }; };
const DONE = {
  appSubs: [{ object: "page", callback_url: DEFAULTS.CALLBACK, active: true, fields: [{ name: "leadgen" }] }],
  pageApps: [{ id: DEFAULTS.APP_ID, subscribed_fields: ["leadgen"] }],
  assigned: [{ id: DEFAULTS.SYSTEM_USER_ID, tasks: ["MANAGE"] }],
};

test("dry run (default) only GETs and plans the two missing writes", async () => {
  const g = fakeGraph({ assigned: DONE.assigned });
  const out = capture();
  const r = await run({ env: ENV, fetch: g.fetch, log: out.log });
  assert.ok(g.calls.every((c) => c.method === "GET"), "no POST in a dry run");
  assert.deepEqual(r.changes, ["app-webhook", "page-subscription"]);
  assert.ok(out.lines.some((l) => l.startsWith("PLAN") && l.includes("subscriptions")));
});

test("--apply posts the webhook with the existing verify token, and the page subscription", async () => {
  const g = fakeGraph({ assigned: DONE.assigned });
  const r = await run({ env: ENV, fetch: g.fetch, apply: true, log: () => {} });
  const posts = g.calls.filter((c) => c.method === "POST");
  assert.equal(posts.length, 2);
  const hook = posts.find((c) => c.path.endsWith("/subscriptions"));
  assert.equal(hook.params.object, "page");
  assert.equal(hook.params.fields, "leadgen");
  assert.equal(hook.params.callback_url, DEFAULTS.CALLBACK);
  assert.equal(hook.params.verify_token, ENV.META_WEBHOOK_VERIFY_TOKEN);
  assert.equal(hook.params.access_token, `${DEFAULTS.APP_ID}|${ENV.META_APP_SECRET}`);
  const sub = posts.find((c) => c.path.endsWith("/subscribed_apps"));
  assert.equal(sub.params.subscribed_fields, "leadgen");
  assert.equal(sub.params.access_token, "PAGE-token-abc");
  assert.ok(r.ok);
});

test("idempotent: everything already in place means no POST even with --apply", async () => {
  const g = fakeGraph(DONE);
  const r = await run({ env: ENV, fetch: g.fetch, apply: true, log: () => {} });
  assert.equal(g.calls.filter((c) => c.method === "POST").length, 0);
  assert.deepEqual(r.changes, []);
  assert.ok(r.ok);
});

test("existing page fields are kept when leadgen is added", async () => {
  const g = fakeGraph({ ...DONE, pageApps: [{ id: DEFAULTS.APP_ID, subscribed_fields: ["feed"] }] });
  await run({ env: ENV, fetch: g.fetch, apply: true, log: () => {} });
  assert.equal(g.calls.find((c) => c.method === "POST").params.subscribed_fields, "feed,leadgen");
});

test("dataset not assigned to the system user fails the run", async () => {
  const g = fakeGraph({ ...DONE, assigned: [{ id: "999", tasks: ["MANAGE"] }] });
  const out = capture();
  const r = await run({ env: ENV, fetch: g.fetch, log: out.log });
  assert.equal(r.ok, false);
  assert.ok(out.lines.some((l) => l.startsWith("FAIL") && l.includes("dataset")));
});

test("a token of another user fails the owner check", async () => {
  const g = fakeGraph({ ...DONE, meId: "123" });
  assert.equal((await run({ env: ENV, fetch: g.fetch, log: () => {} })).ok, false);
});

test("missing token: no Graph call needs it, the run fails, nothing is posted", async () => {
  const g = fakeGraph(DONE);
  const r = await run({ env: { META_APP_SECRET: "app-secret-456", META_WEBHOOK_VERIFY_TOKEN: "verify-789" }, fetch: g.fetch, apply: true, log: () => {} });
  assert.equal(r.ok, false);
  assert.ok(!g.calls.some((c) => c.path === "me"));
  assert.equal(g.calls.filter((c) => c.method === "POST").length, 0);
});

test("never prints a secret, even inside a Graph error", async () => {
  const leaky = async () => ({ ok: false, status: 400, json: async () => ({ error: { code: 190, message: `bad token ${ENV.META_SYSTEM_USER_TOKEN} / ${ENV.META_APP_SECRET}` } }) });
  const out = capture();
  await run({ env: ENV, fetch: leaky, apply: true, log: out.log });
  const all = out.lines.join("\n");
  for (const s of Object.values(ENV).filter((v) => v !== ENV.META_BUSINESS_ID)) assert.ok(!all.includes(s), `leaked ${s.slice(0, 4)}`);
  assert.ok(all.includes("[redacted]"));
});

test("the page token fetched at run time is redacted too", async () => {
  const g = fakeGraph({ ...DONE, pageApps: [] });
  const base = g.fetch;
  const fetch = async (url, init = {}) => (init.method === "POST" && url.includes("subscribed_apps"))
    ? { ok: false, status: 400, json: async () => ({ error: { code: 200, message: "denied for PAGE-token-abc" } }) } : base(url, init);
  const out = capture();
  await run({ env: ENV, fetch, apply: true, log: out.log });
  assert.ok(!out.lines.join("\n").includes("PAGE-token-abc"));
});

test("prints the brands SQL and the manual list, recommends a Graph version", async () => {
  const g = fakeGraph(DONE);
  const out = capture();
  const r = await run({ env: ENV, fetch: g.fetch, log: out.log });
  assert.match(r.sql, /update public\.brands set pixel_id = '1088568384160686', dataset_id = '1088568384160686', waba_id = '1370588024885127' where code = 'SMC';/);
  assert.ok(r.manual.some((m) => m.includes("Meta system user token (Bearer)")));
  assert.ok(r.manual.some((m) => m.includes("smc-capi-send") && m.includes("W12")));
  assert.ok(out.lines.some((l) => l.includes(`Recommended META_GRAPH_VERSION: ${DEFAULTS.GRAPH_VERSION}`)));
});

test("parseEnv reads quoted values and strips comments", () => {
  assert.deepEqual(parseEnv('A=1\n# x\nB="two words"\nC=3   # note\nlower=no\n'), { A: "1", B: "two words", C: "3" });
});
