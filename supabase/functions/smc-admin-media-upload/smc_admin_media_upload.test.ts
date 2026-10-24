// smc-admin-media-upload handler: relay auth, input checks, SMC-broker check and the storage upload path.
// Synthetic data only; fetch is a fake (no Supabase). Smoke test 21 Oct 2026 #26.
//   npx deno test --allow-env supabase/functions/smc-admin-media-upload/smc_admin_media_upload.test.ts
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import { fakeFetch, isRest, jsonResponse, post, rest, served, sha256Hex, SUPABASE, testEnv, type Call } from "../_shared/test_handler_harness.ts";
import "./index.ts";

const URL_ = "https://fn.test/functions/v1/smc-admin-media-upload";
const TOKEN = "n8n-internal-token-for-tests";
const BROKER = "f688380e-0000-4000-8000-000000000001";
const PNG = btoa(String.fromCharCode(0x89, 0x50, 0x4e, 0x47, 1, 2, 3));

async function setup(o: { smcBroker?: boolean; uploadStatus?: number } = {}): Promise<Call[]> {
  testEnv();
  const hash = await sha256Hex(TOKEN);
  return fakeFetch([
    (c) => (isRest(c, "relay_tokens") ? rest(c, { sha256: hash }) : undefined),
    (c) => (isRest(c, "brokers") ? rest(c, o.smcBroker === false ? null : { id: BROKER }) : undefined),
    (c) => c.method === "POST" && c.url.startsWith(`${SUPABASE}/storage/v1/object/broker-media/`)
      ? (o.uploadStatus && o.uploadStatus !== 200
        ? jsonResponse({ statusCode: String(o.uploadStatus), error: "Error", message: "bucket full" }, o.uploadStatus)
        : { Key: "broker-media/x", Id: "obj-1" })
      : undefined,
  ]);
}
const good = { broker_id: BROKER, filename: "smc-01-objection.png", content_type: "image/png", content_base64: PNG };
const call = (body: unknown, key = TOKEN) => served()(post(URL_, body, key ? { "x-api-key": key } : {}));

Deno.test("smc-admin-media-upload: POST only", async () => {
  await setup();
  const r = await served()(new Request(URL_, { method: "GET" }));
  assertEquals(r.status, 405);
  assertEquals(await r.json(), { error: "POST only" });
});

Deno.test("smc-admin-media-upload: refuses a missing or wrong token (relay_tokens 'n8n-internal'), uploads nothing", async () => {
  for (const key of ["", "wrong"]) {
    const calls = await setup();
    const r = await call(good, key);
    assertEquals(r.status, 401);
    assertEquals(await r.json(), { error: "unauthorised" });
    assertMatch(calls.find((c) => c.url.includes("relay_tokens"))!.url, /name=eq\.n8n-internal/);
    assert(!calls.some((c) => c.url.includes("/storage/")), "no upload");
  }
});

Deno.test("smc-admin-media-upload: each bad field is named and nothing is uploaded", async () => {
  const cases: [Record<string, unknown> | string, string][] = [
    ["{oops", "body must be JSON"],
    [{ ...good, broker_id: "../other" }, "broker_id"],
    [{ ...good, filename: "../../etc/passwd" }, "filename"],
    [{ ...good, filename: "a".repeat(121) }, "filename"],
    [{ ...good, content_type: "text/html" }, "content_type"],
    [{ ...good, content_base64: "***" }, "content_base64"],
    [{ ...good, content_base64: "" }, "size"],
  ];
  for (const [body, error] of cases) {
    const calls = await setup();
    const r = await call(body);
    assertEquals(r.status, 400, error);
    assertEquals(await r.json(), { error });
    assert(!calls.some((c) => c.url.includes("/storage/")), `no upload for ${error}`);
  }
});

Deno.test("smc-admin-media-upload: only an SMC broker (brand_id set) gets media", async () => {
  const calls = await setup({ smcBroker: false });
  const r = await call(good);
  assertEquals(r.status, 404);
  assertEquals(await r.json(), { error: "unknown SMC broker" });
  const q = decodeURIComponent(calls.find((c) => isRest(c, "brokers"))!.url);
  assertMatch(q, /id=eq\.f688380e-0000-4000-8000-000000000001/);
  assertMatch(q, /brand_id=not\.is\.null/);
});

Deno.test("smc-admin-media-upload: upserts into broker-media/<broker>/ads/<filename> with the content type", async () => {
  const calls = await setup();
  const r = await call(good);
  assertEquals(r.status, 200);
  assertEquals(await r.json(), { path: `${BROKER}/ads/smc-01-objection.png` });
  const up = calls.find((c) => c.url.includes("/storage/"))!;
  assertEquals(up.url, `${SUPABASE}/storage/v1/object/broker-media/${BROKER}/ads/smc-01-objection.png`);
  assertEquals(up.headers.get("x-upsert"), "true");
  assertEquals(up.headers.get("authorization"), "Bearer service-role-test-key");
});

Deno.test("smc-admin-media-upload: a storage error is passed back as 502", async () => {
  await setup({ uploadStatus: 400 });
  const r = await call({ ...good, content_type: "video/mp4", filename: "reel.mp4" });
  assertEquals(r.status, 502);
  assertMatch((await r.json()).error, /^upload: bucket full/);
});
