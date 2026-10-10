// Console Settings → Brands (src/lib/smcBrands.ts): format checks and the update payload for public.brands.
// Node strips the TS types itself (Node >= 23.6). Run: node --test automation/tests/brands-settings.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { errorsFor, formFromBrand, idsRecorded, normalise, updatePayload, validate, KNOWN_BUSINESS_PORTFOLIO } from "../../src/lib/smcBrands.ts";

const base = {
  id: "b1", code: "SMC", name: "SortMyCover", language: "en", domain: "sortmycover.co.za", staging_url: null,
  business_id: null, page_id: null, ig_user_id: null, waba_id: null, phone_number_id: null, standby_phone_number_id: null,
  ad_account_id: null, standby_ad_account_id: null, pixel_id: null, dataset_id: null, app_id: null, system_user_token_ref: null,
  booking_flow_id: null, flow_public_key_ref: null, handles: { custom_key: "kept" }, verification_status: null, disclosure_text: null,
  brand_kit_url: null, booking_ui: "list", page_status: "ok", ig_status: null, bv_status: null, ad_account_status: null, waba_quality: null,
  template_status: {}, emq: null, health_checked_at: null, health_alerts: [], insights_last_fetched_at: null,
  is_active: true, status: "active", created_at: "", updated_at: "",
};

test("formats: digits, act_, env var names (never a token), handles", () => {
  assert.equal(validate("digits", "2933520516724270"), null);
  assert.match(validate("digits", "12a45"), /Digits/);
  assert.equal(normalise("act", "1234567890"), "act_1234567890");
  assert.equal(validate("act", "act_1234567890"), null);
  assert.match(validate("act", "acct_123456"), /act_/);
  assert.equal(validate("envname", "META_SYSTEM_USER_TOKEN"), null);
  assert.match(validate("envname", "EAABsbCS1iHgBO7ZC"), /token/);
  assert.match(validate("envname", "EAA_TOKEN"), /token/, "the table CHECK rejects any value starting EAA");
  assert.match(validate("envname", "-----BEGIN PUBLIC KEY-----"), /key/);
  assert.match(validate("envname", "meta token"), /NAME/);
  assert.equal(normalise("handle", "@sortmycover"), "sortmycover");
  assert.equal(normalise("handle", "https://www.instagram.com/sortmycover/"), "sortmycover");
  assert.equal(normalise("handle", "https://www.tiktok.com/@sortmycover"), "sortmycover");
  assert.equal(validate("emq", "6.4"), null);
  assert.ok(validate("emq", "11"));
  assert.equal(validate("digits", ""), null, "empty = not recorded yet");
});

test("payload: only changed columns, empty → null, handles merged, nothing written for untouched fields", () => {
  const form = formFromBrand(base);
  assert.deepEqual(updatePayload(base, form), {});
  form.ad_account_id = " 1234567890 ";
  form["handles.ig"] = "@sortmycover";
  form.system_user_token_ref = "META_SYSTEM_USER_TOKEN";
  form.emq = "6.5";
  assert.deepEqual(updatePayload(base, form), {
    ad_account_id: "act_1234567890", system_user_token_ref: "META_SYSTEM_USER_TOKEN", emq: 6.5,
    handles: { custom_key: "kept", ig: "sortmycover" },
  });
  const saved = { ...base, ad_account_id: "act_1234567890", handles: { custom_key: "kept", ig: "sortmycover" } };
  const f2 = formFromBrand(saved);
  f2.ad_account_id = ""; f2["handles.ig"] = "";
  assert.deepEqual(updatePayload(saved, f2), { ad_account_id: null, handles: { custom_key: "kept" } });
});

test("errors block a token pasted into the ref field; the known portfolio ID is a hint only", () => {
  const form = formFromBrand(base);
  form.system_user_token_ref = "EAAG1234";
  form.page_id = "page";
  assert.deepEqual(Object.keys(errorsFor(form)).sort(), ["page_id", "system_user_token_ref"]);
  assert.equal(formFromBrand(base).business_id, "", "never pre-filled");
  assert.equal(KNOWN_BUSINESS_PORTFOLIO.id, "2933520516724270");
  assert.equal(idsRecorded({ ...base, page_id: "123456", app_id: "98765" }), 2);
});
