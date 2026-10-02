/**
 * 06 Agreement and billing (portal/spec/06-agreement-and-billing.md; prototype agreement.html). Extends BrokerDocuments.tsx (INV-P07).
 * Part A e-sign: typed name + timestamp + SHA-256 of the exact document → smc_sign_document() (SECURITY DEFINER, own row, once);
 *   signatory fields → own brokers row; acceptances + hash → smc_portal_event('step.completed','agreement') (stamped timeline, W20 sends copies).
 * Part B billing: cycles, pricing, invoices_smc (own rows by RLS) and three pay options linking to billing/checkout/. No lock-in, no grace.
 */
import { useEffect, useState } from "react";
import PortalShell, { StepClip, usePortal } from "./PortalShell";
import { CHECKOUT_URL, CLIPS_BASE, errText, fmtDay, fmtDayTime, fmtZar, portalEvent, postWebhook, sha256Hex, smcDb } from "@/lib/smc";
import type { SmcAdminDocument, SmcCycle, SmcInvoice, SmcPricing } from "@/integrations/supabase/smc-types";

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
  const [invoices, setInvoices] = useState<SmcInvoice[]>([]);
  const [read, setRead] = useState(false);
  const [c112, setC112] = useState(false);
  const [annex, setAnnex] = useState(false);
  const [noPage, setNoPage] = useState(false);
  const [page, setPage] = useState(broker.fb_page_name || "");
  const [pageId, setPageId] = useState(broker.fb_page_id || "");
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
  const letter = docs.find((d) => d.kind === "authorisation_letter" && !d.signed_at) || null;
  const signed = !!agreement?.signed_at;
  const canSign = read && annex && name.trim().length >= 3 && !!agreement && !signed;

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
      const { error } = await smcDb.rpc("smc_sign_document", { p_document_id: f.id, p_signed_by_name: name.trim(), p_doc_sha256: hash, p_signer_ip: null, p_user_agent: ua });
      if (error) throw error;
      let letterHash: string | null = null;
      if (letter && annex) {
        letterHash = await docHash(letter);
        const r2 = await smcDb.rpc("smc_sign_document", { p_document_id: letter.id, p_signed_by_name: name.trim(), p_doc_sha256: letterHash, p_signer_ip: null, p_user_agent: ua });
        if (r2.error) throw r2.error;
      }
      await smcDb.from("brokers").update({ signatory_name: name.trim(), signatory_role: role.trim() || null, fb_page_name: noPage ? null : page.trim() || null, fb_page_id: noPage ? null : pageId.trim() || null }).eq("id", broker.id);
      await portalEvent("step.completed", "agreement", {
        document_id: f.id, version: f.version, doc_sha256: hash, letter_id: letter?.id || null, letter_sha256: letterHash,
        acceptances: { read: true, clause_11_2: c112, annex_1: annex, no_fb_page: noPage }, signed_by_name: name.trim(), signed_at_client: new Date().toISOString(),
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
        <p className="muted">It is written in plain words. Flat price per 30-day cycle, month to month, no lock-in. Read it, tick the boxes, type your name. Done.</p>
        <ul style={{ margin: "6px 0 10px", paddingLeft: 18, fontSize: 14 }}>
          <li>One flat price per cycle, never linked to policies.</li>
          <li>Month to month, no notice. No lock-in.</li>
          <li>Delivered leads are yours to use exclusively. We keep the campaign data, pages and ad account.</li>
          <li>Replacements for no-shows, unreachable and outside-criteria leads, up to your tier limit.</li>
          <li>Shortfall: the cycle extends up to 14 days, then a pro-rata credit.</li>
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
            <label className="chip" style={{ display: "flex" }}><input type="checkbox" checked={read} onChange={(e) => setRead(e.target.checked)} /> I have read clauses 1 to 16 and Schedules A to D.</label>
            <label className="chip" style={{ display: "flex", marginTop: 8 }}><input type="checkbox" checked={c112} onChange={(e) => setC112(e.target.checked)} /> I agree to clause 11.2: you may use my photo, voice and video to introduce me to leads. <span className="small">(Optional. You can change your mind later in the portal.)</span></label>
            <label className="chip" style={{ display: "flex", marginTop: 8 }}><input type="checkbox" checked={annex} onChange={(e) => setAnnex(e.target.checked)} /> I sign Annex 1: you may run ads from my Facebook Page if Meta needs that. I approve every ad first and I can withdraw it any time.</label>
            <div style={{ margin: "8px 0 0" }}>
              <label htmlFor="pg">Your Facebook Page name (for Annex 1)</label>
              <input id="pg" type="text" value={page} disabled={noPage} placeholder="e.g. your practice's Page" onChange={(e) => setPage(e.target.value)} />
              <label className="chip" style={{ display: "flex", marginTop: 6 }}><input type="checkbox" checked={noPage} onChange={(e) => setNoPage(e.target.checked)} /> I do not have a Facebook Page yet</label>
              <label htmlFor="pgid">Page ID <span className="small">(optional)</span></label>
              <input id="pgid" type="text" inputMode="numeric" value={pageId} disabled={noPage} onChange={(e) => setPageId(e.target.value)} />
            </div>
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
        <h3 style={{ marginTop: 12 }}>Next cycle: pick how you want to pay</h3>
        <p className="muted" style={{ margin: "0 0 8px" }}>Same price. No lock-in. You pick again each cycle. We show the renewal offer 7 days before your cycle ends. Your next cycle starts when you pay.</p>
        <a className="btn" href={payUrl("instant_eft")}>Pay by Instant EFT (recommended)</a>
        <a className="btn ghost" href={payUrl("manual_eft")}>Pay by EFT with a reference (no fee)</a>
        <a className="btn ghost" href={payUrl("card_autorenew")}>Pay by card and renew automatically (optional)</a>
        <p className="hint">Card renewal is a choice, not a requirement.</p>
        {broker.card_autorenew && (
          <div className="row" style={{ marginTop: 8 }}><span className="pill ok">Renew by card each cycle: On</span><button className="tap g" type="button" onClick={autorenewOff}>Switch off</button></div>
        )}
        {tiers.filter((t) => t.tier_code !== (cur?.tier_code || broker.tier_code)).length > 0 && (
          <>
            <h3 style={{ marginTop: 12 }}>Change tier for the next cycle</h3>
            <div className="row">
              {tiers.filter((t) => t.tier_code !== (cur?.tier_code || broker.tier_code)).map((t) => (
                <a key={t.tier_code} className="tap g" href={payUrl("instant_eft", t.tier_code)}>Move to {t.name}: {t.committed_leads} leads, {fmtZar(t.price_zar)}{vatLine(t)}</a>
              ))}
            </div>
          </>
        )}
        {err && signed && <p className="err">{err}</p>}
      </section>
    </>
  );
}

export default function Agreement() {
  return <PortalShell title="Agreement and billing"><Body /></PortalShell>;
}
