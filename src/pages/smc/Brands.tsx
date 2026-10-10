/**
 * Console · Settings → Brands (setup-checklist §0 rule 5 "RECORD", §12 table). Jonathan types the Meta IDs for each
 * brands row (SMC, CK) here during the G-steps. Admin only: ConsoleLayout gates the screen and RLS "smc admin all"
 * gates the table; every save is written to audit_log by the smc_audit trigger (Salesforce: audit on every write).
 * Secrets never come here: *_ref fields take the env var NAME (the table CHECK also refuses 'EAA…' / 'BEGIN').
 * W27 health fields are shown read-only; W27 writes them.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import ConsoleLayout from "./ConsoleLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { errText, fmtDayTime, smcDb } from "@/lib/smc";
import { DISCLOSURE_MAX, GROUPS, REQUIRED_IDS, errorsFor, formFromBrand, idsRecorded, normalise, updatePayload, type BrandForm, type FieldDef } from "@/lib/smcBrands";
import type { SmcBrand } from "@/integrations/supabase/smc-types";

const HEALTH: { key: keyof SmcBrand; label: string }[] = [
  { key: "page_status", label: "Page" }, { key: "ig_status", label: "Instagram" }, { key: "bv_status", label: "Business verification" },
  { key: "ad_account_status", label: "Ad account" }, { key: "waba_quality", label: "WhatsApp quality" }, { key: "emq", label: "EMQ" },
];

function Field({ d, value, error, onChange }: { d: FieldDef; value: string; error?: string; onChange: (v: string) => void }) {
  const id = `f-${d.key.replace(".", "-")}`;
  const shown = normalise(d.kind, value);
  return (
    <div>
      <label htmlFor={id} className="mb-1 flex flex-wrap items-baseline gap-x-2 text-sm font-medium">
        {d.label}<span className="font-mono text-xs text-muted-foreground">{d.key} · {d.gate}</span>
      </label>
      <Input id={id} value={value} placeholder={d.placeholder} autoComplete="off" spellCheck={false}
        inputMode={d.kind === "digits" ? "numeric" : undefined} aria-invalid={!!error} aria-describedby={`${id}-h`}
        className={`font-mono ${error ? "border-destructive" : ""}`} onChange={(e) => onChange(e.target.value)} />
      <p id={`${id}-h`} className={`mt-1 text-xs ${error ? "text-destructive" : "text-muted-foreground"}`}>
        {error || (shown && shown !== value.trim() ? `Saves as ${shown}` : d.help || "")}
      </p>
    </div>
  );
}

export default function Brands() {
  const [brands, setBrands] = useState<SmcBrand[]>([]);
  const [code, setCode] = useState<string>("SMC");
  const [form, setForm] = useState<BrandForm>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await smcDb.from("brands").select("*").order("created_at", { ascending: true });
    if (error) { setErr(errText(error)); return; }
    setErr(null);
    setBrands((data ?? []) as SmcBrand[]);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const brand = brands.find((b) => b.code === code) || null;
  useEffect(() => { if (brand) setForm(formFromBrand(brand)); }, [brand]);

  const errors = useMemo(() => errorsFor(form), [form]);
  const payload = useMemo(() => (brand ? updatePayload(brand, form) : {}), [brand, form]);
  const dirty = Object.keys(payload).length > 0;
  const hasErrors = Object.keys(errors).length > 0;

  const save = useCallback(async () => {
    if (!brand || !dirty || hasErrors || busy) return;
    setBusy(true); setMsg(null); setErr(null);
    const { data, error } = await smcDb.from("brands").update(payload).eq("id", brand.id).select("*").single();
    setBusy(false);
    if (error) { setErr(errText(error)); return; }
    const saved = data as SmcBrand;
    setBrands((all) => all.map((b) => (b.id === saved.id ? saved : b)));
    setMsg(`${saved.name}: saved ${Object.keys(payload).join(", ")}. ${idsRecorded(saved)} of ${REQUIRED_IDS.length} Meta IDs recorded.`);
  }, [brand, dirty, hasErrors, busy, payload]);

  // Close: keyboard first. Ctrl/Cmd+S saves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); void save(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  function pick(c: string) {
    if (c === code) return;
    if (dirty && !window.confirm("Discard unsaved changes on this brand?")) return;
    setMsg(null); setCode(c);
  }

  const set = (k: string) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const alerts = Array.isArray(brand?.health_alerts) ? brand!.health_alerts : [];
  const templates = brand?.template_status ? Object.entries(brand.template_status) : [];

  return (
    <ConsoleLayout>
      <h1 className="mb-1 text-xl font-bold">Settings · Brands</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Record the Meta IDs for each brand as the setup checklist reaches them. Secrets stay in .env; type only their NAME here. Every save is audited.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2" role="tablist" aria-label="Brand">
        {brands.map((b) => (
          <button key={b.id} role="tab" aria-selected={b.code === code} onClick={() => pick(b.code)}
            className={`rounded-md border px-3 py-1.5 text-sm font-medium ${b.code === code ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted"}`}>
            {b.name} <span className="font-mono text-xs opacity-80">{b.code}</span>
            <span className="ml-2 text-xs opacity-80">{b.status} · {idsRecorded(b)}/{REQUIRED_IDS.length} IDs</span>
          </button>
        ))}
      </div>

      {msg && <p className="mb-3 rounded-md border border-border bg-card p-3 text-sm" role="status">{msg}</p>}
      {err && <p className="mb-3 rounded-md border border-destructive p-3 text-sm text-destructive" role="alert">{err}</p>}
      {!brand ? (
        <p className="text-sm text-muted-foreground">{brands.length ? `No brand ${code}.` : "Loading brands…"}</p>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <section className="mb-5 rounded-md border border-border bg-card p-4" aria-labelledby="health-h">
            <h2 id="health-h" className="mb-2 font-semibold">Health (W27, read-only)</h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3 lg:grid-cols-6">
              {HEALTH.map((h) => (
                <div key={h.key}><dt className="text-xs text-muted-foreground">{h.label}</dt><dd className="font-medium">{brand[h.key] === null || brand[h.key] === undefined || brand[h.key] === "" ? "–" : String(brand[h.key])}</dd></div>
              ))}
            </dl>
            <p className="mt-2 text-xs text-muted-foreground">
              Last checked {brand.health_checked_at ? fmtDayTime(brand.health_checked_at) : "never"} · insights fetched {brand.insights_last_fetched_at ? fmtDayTime(brand.insights_last_fetched_at) : "never"} · templates {templates.length ? templates.map(([k, v]) => `${k}: ${typeof v === "object" && v && "status" in v ? String((v as { status: unknown }).status) : String(v)}`).join(", ") : "none synced"}
            </p>
            {alerts.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-sm text-destructive">
                {alerts.map((a, i) => <li key={i}>{typeof a === "string" ? a : JSON.stringify(a)}</li>)}
              </ul>
            )}
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            {GROUPS.map((g) => (
              <fieldset key={g.title} className="rounded-md border border-border bg-card p-4">
                <legend className="px-1 font-semibold">{g.title}</legend>
                <div className="grid gap-3">
                  {g.fields.map((d) => <Field key={d.key} d={d} value={form[d.key] || ""} error={errors[d.key]} onChange={set(d.key)} />)}
                </div>
              </fieldset>
            ))}
            <fieldset className="rounded-md border border-border bg-card p-4 lg:col-span-2">
              <legend className="px-1 font-semibold">Disclosure (DW §1, DISC-FULL-v1)</legend>
              <Textarea id="f-disclosure_text" rows={4} value={form.disclosure_text || ""} aria-invalid={!!errors.disclosure_text}
                onChange={(e) => set("disclosure_text")(e.target.value)} />
              <p className={`mt-1 text-xs ${errors.disclosure_text ? "text-destructive" : "text-muted-foreground"}`}>
                {errors.disclosure_text || `${(form.disclosure_text || "").length}/${DISCLOSURE_MAX} · paste the approved wording exactly.`}
              </p>
            </fieldset>
          </div>

          <div className="sticky bottom-0 mt-5 flex flex-wrap items-center gap-3 border-t border-border bg-background/95 py-3 backdrop-blur">
            <Button type="submit" disabled={!dirty || hasErrors || busy}>{busy ? "Saving…" : "Save"}</Button>
            <Button type="button" variant="outline" disabled={!dirty || busy} onClick={() => setForm(formFromBrand(brand))}>Undo changes</Button>
            <span className="text-sm text-muted-foreground">
              {hasErrors ? `${Object.keys(errors).length} field(s) need fixing` : dirty ? `Changed: ${Object.keys(payload).join(", ")} · Ctrl+S` : "No changes"}
            </span>
          </div>
        </form>
      )}
    </ConsoleLayout>
  );
}
