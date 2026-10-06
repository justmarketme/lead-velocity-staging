/**
 * 06 Agreement and billing (portal/spec/06-agreement-and-billing.md; prototype agreement.html). Extends BrokerDocuments.tsx (INV-P07).
 * Part A e-sign: typed name + timestamp + SHA-256 of the exact document + acceptances → smc_sign_document() 6-arg form
 *   (smc_08: acceptances stored on admin_documents.acceptances; signer IP captured server-side, p_signer_ip stays null);
 *   signatory fields → own brokers row; acceptances + hash → smc_portal_event('step.completed','agreement') (stamped timeline, W20 sends copies).
 * Part B billing: cycles, pricing, invoices_smc (own rows by RLS) and three pay options linking to billing/checkout/. No lock-in, no grace.
 */
import { useEffect, useState } from "react";
import PortalShell, { StepClip, usePortal } from "./PortalShell";
import { CHECKOUT_URL, CLIPS_BASE, PAYSTACK_ENABLED, errText, fmtDay, fmtDayTime, fmtZar, portalEvent, postWebhook, sha256Hex, smcDb } from "@/lib/smc";
import { TERMS, TOPUP_TEXT } from "@/lib/pricing";
import { TopUpSheet } from "./CycleCard";
import { AGREEMENT_STRUCTURE } from "@/lib/contract/agreement";
import type { SmcAdminDocument, SmcAgreementAcceptances, SmcCycle, SmcInvoice, SmcPricing, SmcSignDocumentArgs } from "@/integrations/supabase/smc-types";

const DOC_BUCKET = "admin-documents"; // INV-08; must be private (NH-15 S3)

function docText(d: SmcAdminDocument | null): string {
  const c = (d?.content_data || {}) as Record<string, unknown>;
  return String(c.body_md ?? c.markdown ?? c.text ?? c.body ?? "");
}
async function docHash(d: SmcAdminDocument): Promise<string> {
  if (d.file_path) {
    const { data, error } = await smcDb.storage.from(DOC_BUCKET).download(d.file_path);
    if (!error && data) return sha256Hex(await data.arrayBuffer());
  }
  return sha256Hex(JSON.stringify(d.content_data ?? {}));
}
async function openDoc(path: string | null) {
  if (!path) return;
  const { data } = await smcDb.storage.from(DOC_BUCKET).createSignedUrl(path, 300);
  if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
}

function Body() {
  const { broker, reload } = usePortal();
  const [docs, setDocs] = useState<SmcAdminDocument[]>([]);
  const [cycles, setCycles] = useState<SmcCycle[]>([]);
  const [tiers, setTiers] = useState<SmcPricing[]>([]);
  const [topup, setTopup] = useState(false);
  const [invoices, setInvoices] = useState<SmcInvoice[]>([]);
  const [read, setRead] = useState(false);
  // Clause 17.3 (Client Materials) is a term of the agreement, so it is accepted with the main tick and stored
  // as acceptances.clause_11_2 = true (DB key kept from the old numbering). The new agreement has no Annex 1 /
  // Facebook-Page fallback, so annex_1 / no_page are written as false and the Page fields are left untouched.
  const c112 = true;
  const annex = false;
  const noPage = false;
  const [name, setName] = useState(broker.signatory_name || broker.contact_person || "");
  const [role, setRole] = useState(broker.signatory_role || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [d, c, p, i] = await Promise.all([
        smcDb.from("admin_documents").select("*").eq("broker_id", broker.id).in("kind", ["agreement", "authorisation_letter"]).order("created_at", { ascending: false }),
        smcDb.from("cycles").select("*").eq("broker_id", broker.id).order("cycle_no", { ascending: false }).limit(3),
        smcDb.from("pricing").select("*").is("active_to", null).order("sort_order"),
        smcDb.from("invoices_smc").select("*").eq("broker_id", broker.id).order("issued_at", { ascending: false }).limit(12),
      ]);
      setDocs((d.data as SmcAdminDocument[]) || []);
      setCycles((c.data as SmcCycle[]) || []);
      setTiers((p.data as SmcPricing[]) || []);
      setInvoices((i.data as SmcInvoice[]) || []);
    })();
  }, [broker.id]);

  const agreement = docs.find((d) => d.kind === "agreement") || null;
  const signed = !!agreement?.signed_at;
  const canSign = read && name.trim().length >= 3 && !!agreement && !signed;

  async function sign() {
    if (!agreement) return;
    setBusy(true); setErr(null);
    try {
      // version guard: no silent re-signing of a document that changed while the broker was reading
      const { data: fresh } = await smcDb.from("admin_documents").select("*").eq("id", agreement.id).maybeSingle();
      const f = fresh as SmcAdminDocument | null;
      if (!f || f.signed_at || f.version !== agreement.version) { setErr("We updated the agreement while you were reading. Please read it again."); setBusy(false); return; }
      const hash = await docHash(f);
      if (f.doc_sha256 && f.doc_sha256 !== hash) { setErr("We updated the agreement while you were reading. Please read it again."); setBusy(false); return; }
      const ua = navigator.userAgent.slice(0, 300);
      const acceptances: SmcAgreementAcceptances = { read: true, clause_11_2: c112, annex_1: annex, no_page: noPage, version: f.version || undefined };
      const args: SmcSignDocumentArgs = { p_document_id: f.id, p_signed_by_name: name.trim(), p_doc_sha256: hash, p_signer_ip: null, p_user_agent: ua, p_acceptances: acceptances };
      const { error } = await smcDb.rpc("smc_sign_document", args);
      if (error) throw error;
      const letterHash: string | null = null; // the Annex 1 authorisation letter is no longer part of signing
      await smcDb.from("brokers").update({ signatory_name: name.trim(), signatory_role: role.trim() || null }).eq("id", broker.id);
      await portalEvent("step.completed", "agreement", {
        document_id: f.id, version: f.version, doc_sha256: hash, letter_id: null, letter_sha256: letterHash,
        acceptances: { read: true, clause_11_2: c112, annex_1: annex, no_page: noPage }, signed_by_name: name.trim(), signed_at_client: new Date().toISOString(),
      });
      setDone(hash);
      void reload();
    } catch (e) {
      setErr(errText(e));
    }
    setBusy(false);
  }

  const cur = cycles[0];
  const curTier = tiers.find((t) => t.tier_code === (cur?.tier_code || broker.tier_code));
  const curInvoice = invoices.find((i) => i.cycle_id === cur?.id && i.kind === "cycle");
  const payUrl = (pay: string, tier?: string) => `${CHECKOUT_URL}${CHECKOUT_URL.includes("?") ? "&" : "?"}tier=${encodeURIComponent(tier || cur?.tier_code || broker.tier_code || "")}&pay=${pay}&cycle=next`;
  const vatLine = (t?: SmcPricing) => (t?.vat_rate ? ` + VAT ${(t.vat_rate * 100).toFixed(0)}%` : " excl. VAT");

  async function invoicePdf(inv: SmcInvoice) {
    if (!inv.document_id) return;
    const { data } = await smcDb.from("admin_documents").select("file_path").eq("id", inv.document_id).maybeSingle();
    await openDoc((data as { file_path: string | null } | null)?.file_path || null);
  }
  async function autorenewOff() {
    const r = await postWebhook("billing-autorenew", { on: false });
    setErr(r.ok ? null : `Could not switch it off here yet (${r.error}). Message us and we'll do it now.`);
    if (r.ok) void reload();
  }

  return (
    <>
      <section className="card">
        <h2>Sign your agreement</h2>
        <p className="muted">It is written in plain words. Flat price per {TERMS.cycle_days}-day cycle, month to month, no lock-in. Read it, tick the boxes, type your name. Done.</p>
        {/* Summary of the Lead Generation Services Agreement (clauses 6, 7, 8.3, 11, 12); numbers from src/lib/pricing.ts */}
        <ul style={{ margin: "6px 0 10px", paddingLeft: 18, fontSize: 14 }}>
          <li>One flat price per cycle, never linked to policies, premiums or sales. No commission, ever.</li>
          <li>Month to month. Cancel with {TERMS.cancel_notice_days} days' written notice before your next cycle. If you don't pay for the next cycle, the agreement simply ends.</li>
          <li>We won't give the same consumer's enquiry to another broker. We keep the campaign data, pages, ad accounts and consent records.</li>
          <li>No-show replacements are goodwill, not a right: no-shows only, up to {TERMS.goodwill_replacements_per_week} requests a week, with proof sent within 30 minutes of the start time.</li>
          <li>You tell us only whether each lead attended and could be reached. Nothing about advice, sales, policies or premiums.</li>
          <li>Shortfall: we deliver the balance within {TERMS.shortfall_rollover_days} days after the cycle. Anything still owed carries into your next paid cycle, or is refunded if you stop.</li>
        </ul>
        {!agreement && <p className="alert">Your agreement is being prepared. We'll message you on WhatsApp when it's ready to sign.</p>}
        {agreement && (
          <>
            <div className="scroll-doc" tabIndex={0} aria-label="Broker Services Agreement, scrollable" style={{ whiteSpace: "pre-wrap" }}>
              <b>{agreement.name}</b>{agreement.version ? ` · version ${agreement.version}` : ""}{"\n"}{docText(agreement) || "Open the full agreement below."}
            </div>
            {agreement.file_path && <p style={{ margin: "8px 0 0" }}><button className="tap g" type="button" onClick={() => openDoc(agreement.file_path)}>Open the full agreement (PDF)</button></p>}
          </>
        )}
        {agreement && (signed || done) ? (
          <div className="next-slot" role="status" style={{ marginTop: 12 }}><span style={{ fontSize: 26 }}>✓</span><div><b>Signed{agreement.signed_at ? ` ${fmtDayTime(agreement.signed_at)}` : ""}{agreement.signed_by_name ? ` by ${agreement.signed_by_name}` : ""}.</b>A copy is on its way to your email and to howzit@leadvelocity.co.za. Document fingerprint (SHA-256) {(done || agreement.doc_sha256 || "").slice(0, 12)}… saved.</div></div>
        ) : agreement && (
          <div className="sig" style={{ marginTop: 12 }}>
            <label className="chip" style={{ display: "flex" }}><input type="checkbox" checked={read} onChange={(e) => setRead(e.target.checked)} /> I have read and agree to clauses 1 to {AGREEMENT_STRUCTURE.lastClause} and Schedules 1 to {AGREEMENT_STRUCTURE.schedules}, including clause {AGREEMENT_STRUCTURE.clientMaterialsClause}: you may use my name, photograph, practice name, FSP number and short biography in the Intro Card and WhatsApp messages to consumers you introduce to me (never in ads).</label>
            <div className="row2">
              <div><label htmlFor="sn">Your full name</label><input id="sn" type="text" value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div><label htmlFor="sr">Your role</label><input id="sr" type="text" value={role} placeholder="e.g. Director" onChange={(e) => setRole(e.target.value)} /></div>
            </div>
            <p className="hint">By tapping Sign you sign for your practice. We record your name, the date and time, your device and a fingerprint of the exact document. Copies go to you and to howzit@leadvelocity.co.za.</p>
            {err && <p className="err" role="alert">{err}</p>}
            <div style={{ height: 10 }} />
            <button className="btn" type="button" disabled={!canSign || busy} onClick={sign}>{busy ? "Signing…" : "Sign agreement"}</button>
          </div>
        )}
      </section>
      <StepClip title="signing and paying" length="0:35" file={`${CLIPS_BASE}/agreement.mp4`} />

      <section className="card" id="billing">
        <h2>Your cycle and how you pay</h2>
        {cur ? (
          <table className="tbl"><tbody>
            <tr><th>Cycle</th><th>Tier</th><th>Price</th><th>Status</th></tr>
            <tr>
              <td>Cycle {cur.cycle_no}{cur.starts_at ? ` · ${fmtDay(cur.starts_at)}` : ""}{cur.ends_at ? ` to ${fmtDay(cur.extended_until || cur.ends_at)}` : " · starts when routing starts"}</td>
              <td>{curTier?.name || cur.tier_code} · {cur.committed_leads} leads committed</td>
              <td>{fmtZar(cur.price_zar)}<span className="small">{vatLine(curTier)}</span></td>
              <td><span className={`pill ${curInvoice?.status === "paid" ? "ok" : cur.status === "not_renewed" ? "warn" : "info"}`}>{curInvoice?.status === "paid" ? "Paid" : cur.status === "not_renewed" ? "Not renewed" : curInvoice ? "Due" : cur.status}</span></td>
            </tr>
          </tbody></table>
        ) : <p className="muted">Your first cycle appears here once payment is confirmed.</p>}
        {invoices.length > 0 && (
          <>
            <h3 style={{ marginTop: 12 }}>Invoices and receipts</h3>
            <table className="tbl"><tbody>
              {invoices.map((i) => (
                <tr key={i.id}><td>{i.invoice_no}<br /><span className="small">Ref {i.reference}</span></td><td>{fmtZar(i.total_zar, 2)}</td>
                  <td><span className={`st${i.status === "paid" ? " ok" : ""}`}>{i.status}</span></td>
                  <td style={{ textAlign: "right" }}>{i.document_id && <button className="tap g" type="button" onClick={() => invoicePdf(i)}>PDF</button>}</td></tr>
              ))}
            </tbody></table>
          </>
        )}
        <h3 style={{ marginTop: 12 }}>{PAYSTACK_ENABLED ? "Next cycle: pick how you want to pay" : "Next cycle: payment by EFT, in advance"}</h3>
        <p className="muted" style={{ margin: "0 0 8px" }}>Same price. No lock-in. Payment is by EFT, in advance, per 30-day cycle. The payment details are on your invoice. We show the renewal offer 7 days before your cycle ends. Your next cycle starts when you pay.</p>
        {PAYSTACK_ENABLED && <a className="btn" href={payUrl("instant_eft")}>Pay by Instant EFT (recommended)</a>}
        <a className={PAYSTACK_ENABLED ? "btn ghost" : "btn"} href={payUrl("manual_eft")}>Pay by EFT with a reference (no fee)</a>
        {PAYSTACK_ENABLED && <a className="btn ghost" href={payUrl("card_autorenew")}>Pay by card and renew automatically (optional)</a>}
        {PAYSTACK_ENABLED && <p className="hint">Card renewal is a choice, not a requirement.</p>}
        {broker.card_autorenew && (
          <div className="row" style={{ marginTop: 8 }}><span className="pill ok">Renew by card each cycle: On</span><button className="tap g" type="button" onClick={autorenewOff}>Switch off</button></div>
        )}
        {tiers.filter((t) => t.tier_code !== (cur?.tier_code || broker.tier_code)).length > 0 && (
          <>
            <h3 style={{ marginTop: 12 }}>Change tier for the next cycle</h3>
            <div className="row">
              {tiers.filter((t) => t.tier_code !== (cur?.tier_code || broker.tier_code)).map((t) => (
                <a key={t.tier_code} className="tap g" href={payUrl(PAYSTACK_ENABLED ? "instant_eft" : "manual_eft", t.tier_code)}>Move to {t.name}: {t.committed_leads} leads, {fmtZar(t.price_zar)}{vatLine(t)}</a>
              ))}
            </div>
          </>
        )}
        <h3 style={{ marginTop: 12 }}>Need more leads this cycle?</h3>
        <p className="muted" style={{ margin: "0 0 8px" }}>{TOPUP_TEXT}</p>
        <button className="btn ghost" type="button" onClick={() => setTopup(true)}>Request a top-up</button>
        <TopUpSheet open={topup} onClose={() => setTopup(false)} />
        {err && signed && <p className="err">{err}</p>}
      </section>
    </>
  );
}

export default function Agreement() {
  return <PortalShell title="Agreement and billing"><Body /></PortalShell>;
}
