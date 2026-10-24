// node --test scripts/meta-enable.test.mjs. Mocked fetch only: nothing reaches Meta.
import test from "node:test";
import assert from "node:assert/strict";
import { run, parseEnv, DEFAULTS } from "./meta-enable.mjs";

const ENV = {
  META_SYSTEM_USER_TOKEN: "SUT-secret-token-123", META_APP_SECRET: "app-secret-456", META_WEBHOOK_VERIFY_TOKEN: "verify-789",
  META_BUSINESS_ID: "222276519074106",
};

const APP_SCOPED = "122108167305506208"; // what /me returns for the system user (app-scoped), not 61595186266038

/** Fake Graph: state decides what the GETs return; every call is recorded. */
function fakeGraph(state) {
  const calls = [];
  const versions = [];
  const fetch = async (url, init = {}) => {
    const u = new URL(url);
    const method = init.method || "GET";
    const params = method === "GET" ? u.searchParams : new URLSearchParams(init.body);
    const path = u.pathname.replace(/^\/v[\d.]+\//, "");
    calls.push({ method, path, params: Object.fromEntries(params) });
    versions.push(/^\/(v[\d.]+)\//.exec(u.pathname)?.[1]);
    const ok = (b) => ({ ok: true, status: 200, json: async () => b });
    if (method === "GET" && path === "me") return ok({ id: state.meId ?? APP_SCOPED, name: "SortMyCover n8n" });
    if (method === "GET" && path === "debug_token") return ok({ data: state.debug ?? { is_valid: true, type: "SYSTEM_USER", app_id: DEFAULTS.APP_ID, user_id: APP_SCOPED } });
    if (method === "GET" && path === `${DEFAULTS.APP_ID}/subscriptions`) return ok({ data: state.appSubs ?? [] });
    if (method === "POST" && path === `${DEFAULTS.APP_ID}/subscriptions`) return ok({ success: true });
    if (method === "GET" && path === DEFAULTS.PAGE_ID) return ok({ id: DEFAULTS.PAGE_ID, access_token: "PAGE-token-abc" });
    if (method === "GET" && path === `${DEFAULTS.PAGE_ID}/subscribed_apps`) return ok({ data: state.pageApps ?? [] });
    if (method === "POST" && path === `${DEFAULTS.PAGE_ID}/subscribed_apps`) return ok({ success: true });
    if (method === "GET" && path === DEFAULTS.DATASET_ID) return ok({ id: DEFAULTS.DATASET_ID, name: "SortMyCover dataset" });
    if (method === "GET" && path === `${DEFAULTS.DATASET_ID}/assigned_users`) return ok({ data: state.assigned ?? [] });
    return { ok: false, status: 400, json: async () => ({ error: { code: 100, message: `unexpected ${method} ${path}` } }) };
  };
  return { fetch, calls, versions };
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

test("token check uses debug_token (SYSTEM_USER + is_valid), not the /me id", async () => {
  const g = fakeGraph(DONE);
  const out = capture();
  const r = await run({ env: ENV, fetch: g.fetch, log: out.log });
  assert.ok(r.ok);
  const dbg = g.calls.find((c) => c.path === "debug_token");
  assert.equal(dbg.params.input_token, ENV.META_SYSTEM_USER_TOKEN);
  assert.equal(dbg.params.access_token, `${DEFAULTS.APP_ID}|${ENV.META_APP_SECRET}`);
  assert.ok(!g.calls.some((c) => c.path === "me"), "no /me id comparison when the app secret is known");
  assert.ok(out.lines.some((l) => l.startsWith("PASS") && l.includes("system-user token")));
});

test("a valid USER (not SYSTEM_USER) token, or an invalid one, fails", async () => {
  for (const debug of [{ is_valid: true, type: "USER" }, { is_valid: false, type: "SYSTEM_USER" }]) {
    const g = fakeGraph({ ...DONE, debug });
    assert.equal((await run({ env: ENV, fetch: g.fetch, log: () => {} })).ok, false);
  }
});

test("without the app secret, the app-scoped /me id is a WARN, never a FAIL", async () => {
  const g = fakeGraph(DONE);
  const out = capture();
  const { META_APP_SECRET: _omit, ...env } = ENV;
  await run({ env, fetch: g.fetch, log: out.log });
  assert.ok(out.lines.some((l) => l.startsWith("WARN") && l.includes(APP_SCOPED)));
  assert.ok(!out.lines.some((l) => l.startsWith("FAIL") && l.includes("system-user token")));
});

test("dataset assignment matches the business id or the token's app-scoped id", async () => {
  for (const id of [DEFAULTS.SYSTEM_USER_ID, APP_SCOPED]) {
    const g = fakeGraph({ ...DONE, assigned: [{ id, tasks: ["MANAGE"] }] });
    assert.ok((await run({ env: ENV, fetch: g.fetch, log: () => {} })).ok, id);
  }
});

test("the default Page is the Graph Page id, never the profile id", () => {
  assert.equal(DEFAULTS.PAGE_ID, "1291324720737673");
  assert.notEqual(DEFAULTS.PAGE_ID, "61595175929084");
});

test("Graph version: META_GRAPH_VERSION first, META_API_VERSION as fallback, default v25.0", async () => {
  const urlVersion = async (env) => { const g = fakeGraph(DONE); await run({ env: { ...ENV, ...env }, fetch: g.fetch, log: () => {} }); return g.versions[0]; };
  assert.equal(await urlVersion({ META_GRAPH_VERSION: "v26.0", META_API_VERSION: "v23.0" }), "v26.0");
  assert.equal(await urlVersion({ META_API_VERSION: "v23.0" }), "v23.0");
  assert.equal(await urlVersion({}), "v25.0");
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
