/**
 * 06 Agreement (portal/spec/06-agreement-and-billing.md). Extends BrokerDocuments.tsx (INV-P07).
 * 20 Oct 2026 (D5): SortMyCover billing lives in the CRM order (lead_orders + the smc_order_capacity view); the old
 * cycles / pricing / invoices_smc tables and smc_sign_document were dropped with the CRM-nurture chain. This page shows the
 * signed agreement (admin_documents, private bucket, signed URL) and the broker's order(s): leads committed, counted so
 * far, still to come and whether it is paid. No pay buttons and no e-sign here: Lead Velocity sends the order and its
 * contract, and the signed PDF appears above once it is on file.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PortalShell, { usePortal } from "./PortalShell";
import { fmtDay, fmtZar, smcDb } from "@/lib/smc";
import { downloadAdminDocument } from "@/lib/adminDocs";
import type { SmcAdminDocument } from "@/integrations/supabase/smc-types";

const DOC_BUCKET = "admin-documents"; // INV-08; must be private (NH-15 S3)

async function openDoc(path: string | null) {
  if (!path) return;
  const { data } = await smcDb.storage.from(DOC_BUCKET).createSignedUrl(path, 300);
  if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
}

/** One row of the smc_order_capacity view (own rows: filtered by broker_id). */
interface OrderCapacity {
  lead_order_id: string;
  title: string | null;
  status: string | null;
  lead_count: number | null;
  paid_at: string | null;
  created_at: string | null;
  capacity: number | null;
  counted: number | null;
  remaining: number | null;
}
/** lead_orders.amount_zar is stored in cents. */
interface OrderRow { id: string; amount_zar: number | null; contract_signed_at: string | null }

function Body() {
  const { broker } = usePortal();
  const [docs, setDocs] = useState<SmcAdminDocument[]>([]);
  const [orders, setOrders] = useState<OrderCapacity[]>([]);
  const [amounts, setAmounts] = useState<Record<string, OrderRow>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const [d, c, o] = await Promise.all([
        smcDb.from("admin_documents").select("*").eq("broker_id", broker.id).in("kind", ["agreement", "signed_agreement"]).order("created_at", { ascending: false }),
        smcDb.from("smc_order_capacity").select("lead_order_id, title, status, lead_count, paid_at, created_at, capacity, counted, remaining").eq("broker_id", broker.id).order("created_at", { ascending: false }),
        smcDb.from("lead_orders").select("id, amount_zar, contract_signed_at").eq("broker_id", broker.id),
      ]);
      setDocs((d.data as SmcAdminDocument[]) || []);
      setOrders((c.data as OrderCapacity[]) || []);
      setAmounts(Object.fromEntries(((o.data as OrderRow[]) || []).map((r) => [r.id, r])));
      setLoaded(true);
    })();
  }, [broker.id]);

  const signedDoc = docs.find((d) => d.kind === "signed_agreement") || docs.find((d) => d.kind === "agreement" && d.signed_at) || null;

  return (
    <>
      <section className="card">
        <h2>Your agreement</h2>
        {signedDoc ? (
          <>
            <div className="next-slot" role="status"><span style={{ fontSize: 26 }}>✓</span><div><b>{signedDoc.name}</b>Signed{signedDoc.signed_at ? ` ${fmtDay(signedDoc.signed_at)}` : ""}{signedDoc.signed_by ? ` by ${signedDoc.signed_by}` : ""}.</div></div>
            {signedDoc.file_path && (
              <p style={{ margin: "10px 0 0", display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="tap g" type="button" onClick={() => openDoc(signedDoc.file_path)}>View (PDF)</button>
                <button className="tap" type="button" onClick={() => { const p = signedDoc.file_path as string; void downloadAdminDocument(p, p.split("/").pop() || "agreement.pdf"); }}>Download</button>
              </p>
            )}
          </>
        ) : (
          <p className="muted">{loaded ? "Your signed agreement will show here once it is on file. Questions? Message us on WhatsApp." : "Loading…"}</p>
        )}
      </section>

      <section className="card" id="billing">
        <h2>Your order</h2>
        {orders.length ? (
          <table className="tbl"><tbody>
            <tr><th>Order</th><th>Leads</th><th>Price</th><th>Status</th></tr>
            {orders.map((o) => {
              const row = amounts[o.lead_order_id];
              const paid = !!o.paid_at || o.status === "paid" || o.status === "delivered";
              return (
                <tr key={o.lead_order_id}>
                  <td>{o.title || "Lead order"}{o.created_at ? <><br /><span className="small">Since {fmtDay(o.created_at)}</span></> : null}</td>
                  <td>{o.capacity ?? o.lead_count ?? 0} committed<br /><span className="small">{o.counted ?? 0} counted so far · {o.remaining ?? 0} to come</span></td>
                  <td>{row?.amount_zar != null ? fmtZar(row.amount_zar / 100) : "–"}<span className="small"> excl. VAT</span></td>
                  <td><span className={`pill ${paid ? "ok" : "info"}`}>{paid ? `Paid${o.paid_at ? ` ${fmtDay(o.paid_at)}` : ""}` : "Being set up"}</span></td>
                </tr>
              );
            })}
          </tbody></table>
        ) : (
          <p className="muted">{loaded ? "Your order shows here once Lead Velocity has set it up." : "Loading…"}</p>
        )}
        <p className="hint" style={{ marginTop: 10 }}>See every lead on <Link to="/broker/orders">Orders</Link>.</p>
      </section>
    </>
  );
}

export default function Agreement() {
  return <PortalShell title="Agreement and order"><Body /></PortalShell>;
}
