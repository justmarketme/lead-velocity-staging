/**
 * Settings · Brands: field list, format checks and the update payload for public.brands (smc_02 §1, smc_06 §11).
 * Pure (no React, no Supabase) so automation/tests/brands-settings.test.mjs can run it under plain node.
 * Rules mirror the table: *_ref columns hold a secret NAME (brands_no_secret_values rejects '^EAA' and 'BEGIN');
 * every Meta object ID is digits; ad accounts carry the act_ prefix (setup-checklist G3 step 10).
 */
import type { SmcBrand, SmcBrandHandles } from "@/integrations/supabase/smc-types";

export type FieldKind = "digits" | "act" | "envname" | "handle" | "text" | "url" | "emq";

export interface FieldDef {
  key: string;            // column, or "handles.<k>" for a key inside handles jsonb
  label: string;
  gate: string;           // where in deliverables/meta-operator/setup-checklist.md the value comes from
  kind: FieldKind;
  help?: string;
  placeholder?: string;
}

export interface FieldGroup { title: string; fields: FieldDef[] }

/** Pre-known value: shown as a hint only, never written by the console. */
export const KNOWN_BUSINESS_PORTFOLIO = { name: "jono", id: "2933520516724270" };

export const GROUPS: FieldGroup[] = [
  { title: "Business portfolio (G1)", fields: [
    { key: "business_id", label: "Business portfolio ID", gate: "G1 step 8", kind: "digits",
      placeholder: `e.g. ${KNOWN_BUSINESS_PORTFOLIO.id}`,
      help: `Business Settings, Business info. Known portfolio "${KNOWN_BUSINESS_PORTFOLIO.name}" is ${KNOWN_BUSINESS_PORTFOLIO.id}; type it only if that is the portfolio used (checklist G1 step 1).` },
    { key: "verification_status", label: "Verification status", gate: "G1, G4, G5b", kind: "text",
      placeholder: "bv_submitted:2026-10-06; domain_verified:2026-10-07", help: "Append entries; separate with ; (BV, domain, display names)." },
  ] },
  { title: "Facebook Page and Instagram (G2)", fields: [
    { key: "page_id", label: "Page ID", gate: "G2a", kind: "digits" },
    { key: "handles.fb_standby_page_id", label: "Standby Page ID", gate: "G2 step 3", kind: "digits", help: "Stored in handles.fb_standby_page_id (no column yet, NH-MO-05)." },
    { key: "ig_user_id", label: "Instagram account ID", gate: "G2c step 10", kind: "digits" },
  ] },
  { title: "Ad accounts (G3)", fields: [
    { key: "ad_account_id", label: "Ad account ID", gate: "G3 step 10", kind: "act", placeholder: "act_1234567890", help: "Digits alone are accepted and saved as act_<digits>." },
    { key: "standby_ad_account_id", label: "Standby ad account ID", gate: "G3 step 10", kind: "act", placeholder: "act_1234567890" },
  ] },
  { title: "WhatsApp (G4)", fields: [
    { key: "waba_id", label: "WhatsApp Business Account ID", gate: "G4", kind: "digits" },
    { key: "phone_number_id", label: "Phone number ID (primary)", gate: "G4", kind: "digits", help: "The Cloud API phone number ID, not the phone number." },
    { key: "standby_phone_number_id", label: "Phone number ID (standby)", gate: "G4", kind: "digits" },
  ] },
  { title: "Pixel and dataset (G5)", fields: [
    { key: "pixel_id", label: "Pixel ID", gate: "G5 step 8", kind: "digits" },
    { key: "dataset_id", label: "Dataset ID", gate: "G5 step 8", kind: "digits", help: "Often the same number as the Pixel ID; record both as the screen shows them." },
    { key: "emq", label: "Event match quality", gate: "G5 step 7", kind: "emq", placeholder: "0.0 to 10.0", help: "W27 overwrites this on its next health check." },
  ] },
  { title: "App and system user (G6)", fields: [
    { key: "app_id", label: "App ID", gate: "G6a step 7", kind: "digits" },
    { key: "system_user_token_ref", label: "System user token: env var NAME", gate: "G6b step 5", kind: "envname", placeholder: "META_SYSTEM_USER_TOKEN",
      help: "The NAME of the .env variable, never the token. A value starting EAA is refused." },
  ] },
  { title: "Booking Flow (W28)", fields: [
    { key: "booking_flow_id", label: "Booking Flow ID", gate: "template runbook §6", kind: "digits" },
    { key: "flow_public_key_ref", label: "Flow public key: env var NAME", gate: "template runbook §6", kind: "envname", placeholder: "FLOW_PUBLIC_KEY", help: "The NAME only, never the PEM." },
  ] },
  { title: "Handles (G2, G9)", fields: [
    { key: "handles.fb", label: "Facebook", gate: "G2", kind: "handle", placeholder: "sortmycover" },
    { key: "handles.ig", label: "Instagram", gate: "G2c", kind: "handle", placeholder: "sortmycover" },
    { key: "handles.tiktok", label: "TikTok", gate: "G9", kind: "handle" },
    { key: "handles.yt", label: "YouTube", gate: "G9", kind: "handle" },
    { key: "handles.li", label: "LinkedIn", gate: "G9", kind: "handle" },
    { key: "handles.x", label: "X", gate: "G9", kind: "handle" },
  ] },
  { title: "Brand", fields: [
    { key: "brand_kit_url", label: "Brand kit URL", gate: "visual-producer", kind: "url" },
  ] },
];

export const DISCLOSURE_MAX = 2000;
export const ALL_FIELDS: FieldDef[] = GROUPS.flatMap((g) => g.fields);

/** Form state: every field as a string (empty = not recorded) plus the disclosure text. */
export type BrandForm = Record<string, string>;

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));

export function formFromBrand(b: SmcBrand): BrandForm {
  const f: BrandForm = {};
  const handles = (b.handles || {}) as SmcBrandHandles;
  for (const d of ALL_FIELDS) {
    f[d.key] = d.key.startsWith("handles.") ? str(handles[d.key.slice(8)]) : str((b as unknown as Record<string, unknown>)[d.key]);
  }
  f.disclosure_text = str(b.disclosure_text);
  return f;
}

/** Trim, and the safe normalisations: digits-only ad account → act_<digits>; leading @ / profile URL off handles. */
export function normalise(kind: FieldKind, raw: string): string {
  const v = raw.trim();
  if (!v) return "";
  if (kind === "act") return /^\d+$/.test(v) ? `act_${v}` : v;
  if (kind === "digits") return v.replace(/\s+/g, "");
  if (kind === "handle") return v.replace(/^https?:\/\/(www\.)?[^/]+\/(@)?/i, "").replace(/^@/, "").replace(/\/+$/, "");
  return v;
}

/** Error text for one value (already normalised), or null when fine. Empty is always fine (not recorded yet). */
export function validate(kind: FieldKind, v: string): string | null {
  if (!v) return null;
  switch (kind) {
    case "digits": return /^\d{5,25}$/.test(v) ? null : "Digits only (Meta IDs are 5 to 25 digits).";
    case "act": return /^act_\d{5,25}$/.test(v) ? null : "Must be act_ followed by digits, e.g. act_1234567890.";
    case "envname":
      if (/^EAA/.test(v)) return "That looks like a token. Put the token in .env and type its NAME here.";
      if (/BEGIN/.test(v)) return "That looks like a key. Put it in .env and type its NAME here.";
      return /^[A-Z][A-Z0-9_]{2,63}$/.test(v) ? null : "An env var NAME: capitals, digits and _, e.g. META_SYSTEM_USER_TOKEN.";
    case "handle": return /^[A-Za-z0-9._-]{1,100}$/.test(v) ? null : "Handle only: letters, digits, . _ - (no spaces).";
    case "url": return /^https:\/\/\S+$/.test(v) ? null : "A full https:// link.";
    case "emq": { const n = Number(v); return /^\d{1,2}(\.\d)?$/.test(v) && n >= 0 && n <= 10 ? null : "A number from 0.0 to 10.0 (one decimal)."; }
    case "text": return v.length <= 500 ? null : "Keep it under 500 characters.";
  }
}

export function errorsFor(form: BrandForm): Record<string, string> {
  const e: Record<string, string> = {};
  for (const d of ALL_FIELDS) { const msg = validate(d.kind, normalise(d.kind, form[d.key] || "")); if (msg) e[d.key] = msg; }
  if ((form.disclosure_text || "").length > DISCLOSURE_MAX) e.disclosure_text = `Keep it under ${DISCLOSURE_MAX} characters.`;
  return e;
}

/**
 * Column → value map for PostgREST .update(): only columns that changed. Empty → null. handles is merged so keys this
 * screen does not manage are kept. Returns {} when nothing changed.
 */
export function updatePayload(original: SmcBrand, form: BrandForm): Record<string, unknown> {
  const before = formFromBrand(original);
  const out: Record<string, unknown> = {};
  const handles: Record<string, unknown> = { ...((original.handles || {}) as Record<string, unknown>) };
  let handlesChanged = false;
  for (const d of ALL_FIELDS) {
    const v = normalise(d.kind, form[d.key] || "");
    if (v === normalise(d.kind, before[d.key] || "")) continue;
    if (d.key.startsWith("handles.")) {
      const k = d.key.slice(8);
      if (v) handles[k] = v; else delete handles[k];
      handlesChanged = true;
    } else {
      out[d.key] = v === "" ? null : d.kind === "emq" ? Number(v) : v;
    }
  }
  if (handlesChanged) out.handles = handles;
  const disc = (form.disclosure_text || "").trim();
  if (disc !== (before.disclosure_text || "").trim()) out.disclosure_text = disc || null;
  return out;
}

/** "n of m" Meta IDs recorded (the IDs the setup-checklist §12 table asks for). */
export const REQUIRED_IDS = ["business_id", "page_id", "ig_user_id", "waba_id", "phone_number_id", "standby_phone_number_id",
  "ad_account_id", "standby_ad_account_id", "pixel_id", "dataset_id", "app_id", "system_user_token_ref"] as const;
export function idsRecorded(b: SmcBrand): number {
  return REQUIRED_IDS.filter((k) => str((b as unknown as Record<string, unknown>)[k]).trim() !== "").length;
}
