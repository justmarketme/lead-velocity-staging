#!/usr/bin/env node
/* Meta enablement for SortMyCover: the Lead Ads webhook, the Page subscription and the CAPI dataset check.
   Runs on the EMMA VPS and reads the n8n env file. DRY RUN by default: it only GETs and prints what it would change.
   Writes (two POSTs, both idempotent) happen only with --apply.
     node scripts/meta-enable.mjs [--env /opt/leadvelocity-n8n/repo/.env] [--apply]
   It never prints a token, secret or verify token (values are reduced to "set" / "missing").
   What it does (see docs/CAPI-ENABLE-2026-10-18.md):
     1. The token belongs to the system user (GET /me).
     2. App webhook: object=page, field leadgen -> https://n8n.sortmycover.co.za/webhook/meta-leadgen, with the existing
        META_WEBHOOK_VERIFY_TOKEN (app token = META_APP_ID|META_APP_SECRET). POST only when missing or different.
     3. Page subscription: Page 61595175929084 subscribed to the app for leadgen. POST only when missing.
     4. Dataset 1088568384160686 is assigned to system user 61595186266038 (read-only check).
     5. Prints (never runs) the brands SQL, lists what is still manual, and recommends META_GRAPH_VERSION. */
import fs from "node:fs";
import { fileURLToPath } from "node:url";

export const DEFAULTS = {
  APP_ID: "2615802055547479",
  PAGE_ID: "61595175929084",
  DATASET_ID: "1088568384160686",
  SYSTEM_USER_ID: "61595186266038",
  WABA_ID: "1370588024885127",
  CALLBACK: "https://n8n.sortmycover.co.za/webhook/meta-leadgen",
  GRAPH_VERSION: "v25.0", // supported until Jul 2028 (v26.0 is the newest; pin deliberately)
};

/** Parses a .env file (KEY=value, # comments, optional quotes). */
export function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let v = m[2].replace(/\s+#.*$/, "").trim();
    if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

/** Removes every known secret value from a string before it is printed. */
export function redactor(env) {
  const secrets = ["META_SYSTEM_USER_TOKEN", "META_APP_SECRET", "META_WEBHOOK_VERIFY_TOKEN", "PAGE_ACCESS_TOKEN"]
    .map((k) => env[k]).filter((v) => v && v.length >= 6);
  const fn = (s) => secrets.reduce((t, v) => t.split(v).join("[redacted]"), String(s));
  fn.add = (v) => { if (v && v.length >= 6) secrets.push(v); }; // tokens fetched at run time (the page token)
  return fn;
}

export async function run({ env, fetch: f = globalThis.fetch, apply = false, log = console.log }) {
  const R = redactor(env);
  const say = (status, name, evidence = "") => log(R(`${status.padEnd(5)} ${name.padEnd(34)} ${evidence}`));
  const ids = {
    app: env.META_APP_ID || DEFAULTS.APP_ID,
    page: env.PAGE_ID || DEFAULTS.PAGE_ID,
    dataset: env.PIXEL_ID || env.DATASET_ID || DEFAULTS.DATASET_ID,
    systemUser: DEFAULTS.SYSTEM_USER_ID,
    waba: env.WABA_ID || DEFAULTS.WABA_ID,
  };
  const version = env.META_GRAPH_VERSION || DEFAULTS.GRAPH_VERSION;
  const base = `https://graph.facebook.com/${version}`;
  const result = { ok: true, changes: [], manual: [] };
  const bad = (name, why) => { result.ok = false; say("FAIL", name, why); };

  async function graph(method, path, params, token) {
    const qs = new URLSearchParams({ ...params, access_token: token });
    const url = `${base}/${path}`;
    const res = method === "GET"
      ? await f(`${url}?${qs}`, { method })
      : await f(url, { method, headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: qs.toString() });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.error) {
      const e = body.error || {};
      throw new Error(`HTTP ${res.status} code ${e.code ?? "?"}${e.error_subcode ? "/" + e.error_subcode : ""}: ${e.message ?? "no body"}`);
    }
    return body;
  }

  say("INFO", "mode", apply ? "APPLY (writes allowed)" : "dry run (GET only)");
  for (const k of ["META_SYSTEM_USER_TOKEN", "META_APP_SECRET", "META_WEBHOOK_VERIFY_TOKEN", "META_APP_ID", "META_BUSINESS_ID", "META_GRAPH_VERSION"]) {
    say("INFO", `env ${k}`, env[k] ? "set" : "missing");
  }
  const sut = env.META_SYSTEM_USER_TOKEN;

  // 1. Token owner
  if (!sut) bad("system-user token", "META_SYSTEM_USER_TOKEN missing (waits on KG)");
  else {
    try {
      const me = await graph("GET", "me", { fields: "id,name" }, sut);
      if (me.id === ids.systemUser) say("PASS", "token is the system user", `${me.name ?? ""} (${me.id})`);
      else bad("token is the system user", `token belongs to ${me.id}, expected ${ids.systemUser}`);
    } catch (e) { bad("token is the system user", e.message); }
  }

  // 2. App webhook (object page, field leadgen)
  if (!env.META_APP_SECRET || !env.META_WEBHOOK_VERIFY_TOKEN) {
    bad("app leadgen webhook", `needs META_APP_SECRET and META_WEBHOOK_VERIFY_TOKEN (app ${ids.app})`);
  } else {
    const appToken = `${ids.app}|${env.META_APP_SECRET}`;
    try {
      const subs = await graph("GET", `${ids.app}/subscriptions`, {}, appToken);
      const page = (subs.data || []).find((s) => s.object === "page");
      const hasLeadgen = !!page?.fields?.some((x) => (x.name ?? x) === "leadgen");
      if (page && page.callback_url === DEFAULTS.CALLBACK && hasLeadgen && page.active !== false) {
        say("PASS", "app leadgen webhook", `already ${DEFAULTS.CALLBACK} (leadgen)`);
      } else {
        const why = !page ? "no page subscription" : page.callback_url !== DEFAULTS.CALLBACK ? `callback is ${page.callback_url}` : "leadgen field missing";
        if (!apply) { say("PLAN", "app leadgen webhook", `would POST ${ids.app}/subscriptions object=page fields=leadgen (${why})`); result.changes.push("app-webhook"); }
        else {
          await graph("POST", `${ids.app}/subscriptions`, { object: "page", callback_url: DEFAULTS.CALLBACK, fields: "leadgen", include_values: "true", verify_token: env.META_WEBHOOK_VERIFY_TOKEN }, appToken);
          say("DONE", "app leadgen webhook", `set to ${DEFAULTS.CALLBACK} (Meta verified the callback)`); result.changes.push("app-webhook");
        }
      }
    } catch (e) { bad("app leadgen webhook", e.message); }
  }

  // 3. Page subscribed to the app for leadgen (page token from the system user, or PAGE_ACCESS_TOKEN)
  if (!sut && !env.PAGE_ACCESS_TOKEN) bad("page leadgen subscription", "needs META_SYSTEM_USER_TOKEN (or PAGE_ACCESS_TOKEN)");
  else {
    try {
      const pageToken = env.PAGE_ACCESS_TOKEN || (await graph("GET", ids.page, { fields: "access_token" }, sut)).access_token;
      if (!pageToken) throw new Error("no page access token (is the Page assigned to the system user?)");
      R.add(pageToken);
      const apps = await graph("GET", `${ids.page}/subscribed_apps`, {}, pageToken);
      const mine = (apps.data || []).find((a) => String(a.id) === ids.app);
      if (mine && (mine.subscribed_fields || []).includes("leadgen")) say("PASS", "page leadgen subscription", `Page ${ids.page} -> app ${ids.app}`);
      else if (!apply) { say("PLAN", "page leadgen subscription", `would POST ${ids.page}/subscribed_apps subscribed_fields=leadgen`); result.changes.push("page-subscription"); }
      else {
        const fields = [...new Set([...(mine?.subscribed_fields || []), "leadgen"])].join(",");
        await graph("POST", `${ids.page}/subscribed_apps`, { subscribed_fields: fields }, pageToken);
        say("DONE", "page leadgen subscription", `Page ${ids.page} subscribed (${fields})`); result.changes.push("page-subscription");
      }
    } catch (e) { bad("page leadgen subscription", e.message); }
  }

  // 4. Dataset assigned to the system user (read-only)
  if (!sut) bad("dataset assigned to system user", "needs META_SYSTEM_USER_TOKEN");
  else {
    try {
      const ds = await graph("GET", ids.dataset, { fields: "id,name" }, sut);
      if (env.META_BUSINESS_ID) {
        const au = await graph("GET", `${ids.dataset}/assigned_users`, { business: env.META_BUSINESS_ID, fields: "id,name,tasks" }, sut);
        const me = (au.data || []).find((u) => String(u.id) === ids.systemUser);
        if (me) say("PASS", "dataset assigned to system user", `${ds.name ?? ids.dataset}: ${(me.tasks || []).join(", ") || "assigned"}`);
        else bad("dataset assigned to system user", `system user ${ids.systemUser} not in assigned_users of ${ids.dataset}`);
      } else {
        say("WARN", "dataset assigned to system user", `token can read ${ds.name ?? ids.dataset}; set META_BUSINESS_ID to verify the assignment itself`);
      }
    } catch (e) { bad("dataset assigned to system user", `${e.message} (assign it in Business settings -> Datasets, full control)`); }
  }

  // 5. Printed, never run
  const sql = `update public.brands set pixel_id = '${DEFAULTS.DATASET_ID}', dataset_id = '${ids.dataset}', waba_id = '${ids.waba}' where code = 'SMC';`;
  log("\n-- brands row (run by hand after review; this script never writes to the database):\n" + sql);
  result.sql = sql;
  result.manual = [
    "n8n credential 'Meta system user token (Bearer)' (Header Auth, Authorization: Bearer <token>) for smc-capi-send",
    "activate smc-capi-send (import_wf.sh SUB-capi-send) and W12 (Attended), on the main session's go",
    `META_GRAPH_VERSION=${DEFAULTS.GRAPH_VERSION} in the VPS .env (code default is v21.0)`,
    "CAPI_TEST_EVENT_CODE for the test-event run, removed afterwards (docs/CAPI-ENABLE-2026-10-18.md step 6)",
  ];
  log("\nStill manual:\n" + result.manual.map((m) => `- ${m}`).join("\n"));
  log(`\nRecommended META_GRAPH_VERSION: ${DEFAULTS.GRAPH_VERSION} (current: ${env.META_GRAPH_VERSION || "unset"})`);
  return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const i = process.argv.indexOf("--env");
  const file = i > 0 ? process.argv[i + 1] : "/opt/leadvelocity-n8n/repo/.env";
  const env = fs.existsSync(file) ? parseEnv(fs.readFileSync(file, "utf8")) : (console.error(`env file not found: ${file}`), process.exit(2));
  const r = await run({ env, apply: process.argv.includes("--apply") });
  process.exit(r.ok ? 0 : 1);
}
