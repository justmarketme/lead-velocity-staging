/**
 * Broker self-service forms (portal): FSP number + practice name, and business WhatsApp number. Both save through
 * broker_update_profile() (migration 20261012180000): the broker's own row, these columns only, validated server-side,
 * frozen while routing is on. The CRM admin drawer reads the same brokers columns.
 */
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrokerPreview } from "@/lib/brokerPreview";
import { fmtZa, fspValid, normFsp, profileErrorText, toZaE164 } from "@/lib/brokerProfile";
import { m } from "./motion";

export interface ProfilePatch {
  firm_name?: string | null; fsp_number?: string | null; whatsapp_number?: string | null; whatsapp_confirmed_at?: string | null;
  /** from broker_decide_bio_suggestion() (LvReview BioReviewCard) */
  bio_short?: string | null; onboarding_progress?: Record<string, unknown>;
}

const input = "w-full min-h-[44px] rounded-xl border border-white/15 bg-white/[0.04] px-3 text-base text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-pink-400/60 disabled:opacity-60";
const primary = "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-slate-950 hover:bg-slate-200 disabled:opacity-60";
const ghost = "inline-flex min-h-[44px] items-center justify-center rounded-xl border border-white/15 px-4 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-60";

async function save(args: { p_firm_name?: string | null; p_fsp_number?: string | null; p_whatsapp_number?: string | null }): Promise<{ ok: boolean; data?: ProfilePatch; error?: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("broker_update_profile", args);
  if (error) return { ok: false, error: profileErrorText(error) };
  return { ok: true, data: data as ProfilePatch };
}

function Status({ err, ok }: { err: string | null; ok: string | null }) {
  if (err) return <p role="alert" className="text-sm text-rose-300">{err}</p>;
  if (ok) return <p role="status" className="text-sm text-emerald-300">{ok}</p>;
  return null;
}

/** FSP number + practice name. `suggestedFsp` (e.g. from the signed agreement) pre-fills an empty field. */
export function FspForm({ broker, suggestedFsp, onSaved, onCancel }: { broker: any; suggestedFsp?: string | null; onSaved: (p: ProfilePatch) => void; onCancel?: () => void }) {
  const preview = !!useBrokerPreview();
  const locked = !!broker?.routing_on;
  const [fsp, setFsp] = useState<string>(broker?.fsp_number || suggestedFsp || "");
  const [firm, setFirm] = useState<string>(broker?.firm_name || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setOk(null);
    if (preview) return setErr("Preview only: nothing is saved.");
    if (!fspValid(fsp)) return setErr("FSP number: digits only, 3 to 6 of them.");
    if (firm.trim().length < 2) return setErr("Practice name: as on your FSP licence.");
    setBusy(true);
    const r = await save({ p_fsp_number: normFsp(fsp), p_firm_name: firm.trim() });
    setBusy(false);
    if (!r.ok || !r.data) return setErr(r.error || "Something went wrong. Please try again.");
    setOk("Saved.");
    onSaved(r.data);
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs font-medium text-slate-400">FSP number</span>
          <input className={input} inputMode="numeric" autoComplete="off" maxLength={12} value={fsp} disabled={locked || busy}
            aria-invalid={fsp !== "" && !fspValid(fsp)} onChange={(e) => setFsp(e.target.value)} placeholder="e.g. 28418" />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-400">Practice name</span>
          <input className={input} autoComplete="organization" maxLength={120} value={firm} disabled={locked || busy} onChange={(e) => setFirm(e.target.value)} />
        </label>
      </div>
      <p className="text-xs text-slate-400">{locked ? "Locked while you receive leads. Ask Lead Velocity to change it." : "We check it on the FSCA register. Clients see it with your practice name."}</p>
      <Status err={err} ok={ok} />
      {!locked && (
        <div className="flex flex-wrap gap-2">
          <m.button whileTap={{ scale: 0.97 }} type="submit" className={primary} disabled={busy || preview}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Save</m.button>
          {onCancel && <button type="button" className={ghost} onClick={onCancel}>Cancel</button>}
        </div>
      )}
    </form>
  );
}

/** Business WhatsApp number: confirm the one on record (or his phone number as a suggestion), or enter another. */
export function WhatsAppForm({ broker, onSaved }: { broker: any; onSaved: (p: ProfilePatch) => void }) {
  const preview = !!useBrokerPreview();
  const locked = !!broker?.routing_on;
  const onRecord: string | null = broker?.whatsapp_number || null;
  const suggestion = onRecord || toZaE164(broker?.phone_number || "");
  const [editing, setEditing] = useState(!suggestion);
  const [value, setValue] = useState<string>(suggestion ? fmtZa(suggestion) : "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function submit(number: string) {
    setErr(null); setOk(null);
    if (preview) return setErr("Preview only: nothing is saved.");
    const e164 = toZaE164(number);
    if (!e164) return setErr("Use a South African number, e.g. +27 82 123 4567.");
    setBusy(true);
    const r = await save({ p_whatsapp_number: e164 });
    setBusy(false);
    if (!r.ok || !r.data) return setErr(r.error || "Something went wrong. Please try again.");
    setOk("Saved. New leads and bookings will reach you on this number.");
    setEditing(false);
    onSaved(r.data);
  }

  if (locked) return <p className="text-xs text-slate-400">Locked while you receive leads. Ask Lead Velocity to change it.</p>;
  return (
    <div className="space-y-3">
      {!editing && suggestion ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-base font-semibold text-white">{fmtZa(suggestion)}</span>
          <m.button whileTap={{ scale: 0.97 }} type="button" className={primary} disabled={busy || preview} onClick={() => submit(suggestion)}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}Confirm
          </m.button>
          <button type="button" className={ghost} onClick={() => setEditing(true)}>Use another number</button>
        </div>
      ) : (
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void submit(value); }} noValidate>
          <label className="block flex-1 min-w-[200px]">
            <span className="text-xs font-medium text-slate-400">Business WhatsApp number</span>
            <input className={input} type="tel" inputMode="tel" autoComplete="tel" value={value} placeholder="+27 82 123 4567"
              aria-invalid={value !== "" && !toZaE164(value)} onChange={(e) => setValue(e.target.value)} disabled={busy} />
          </label>
          <m.button whileTap={{ scale: 0.97 }} type="submit" className={primary} disabled={busy || preview}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Save</m.button>
          {suggestion && <button type="button" className={ghost} onClick={() => { setEditing(false); setValue(fmtZa(suggestion)); }}>Cancel</button>}
        </form>
      )}
      <Status err={err} ok={ok} />
    </div>
  );
}
