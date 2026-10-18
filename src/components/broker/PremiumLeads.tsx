/**
 * Broker portal "Leads" tab: the leads assigned to this broker (leads.broker_id), newest first. Read-only list.
 * Filters by broker id explicitly, so the admin "Preview as broker" view shows exactly the broker's own leads.
 */
import { useEffect, useState } from "react";
import { AnimatePresence } from "motion/react";
import { Database, Mail, Phone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { FadeIn, Skeleton, m, stagger, item } from "./motion";

interface LeadRow {
  id: string; first_name: string | null; last_name: string | null; phone: string; email: string | null;
  current_status: string | null; created_at: string | null;
}

export default function PremiumLeads({ brokerId }: { brokerId: string | null | undefined }) {
  const [rows, setRows] = useState<LeadRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!brokerId) return;
    let alive = true;
    void supabase.from("leads").select("id, first_name, last_name, phone, email, current_status, created_at")
      .eq("broker_id", brokerId).order("created_at", { ascending: false }).limit(500)
      .then(({ data, error: e }) => { if (!alive) return; setError(e?.message || null); setRows((data as LeadRow[]) || []); });
    return () => { alive = false; };
  }, [brokerId]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl sm:text-3xl font-bold text-white">Your leads</h2>
        <p className="text-slate-400 mt-1">Every lead delivered to you, newest first.</p>
      </div>
      <AnimatePresence mode="wait">
        {rows === null ? (
          <m.div key="sk" className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-[84px] w-full" />)}</m.div>
        ) : error ? (
          <FadeIn key="err"><p className="text-sm text-rose-300">We couldn't load your leads ({error}). Please try again or email howzit@leadvelocity.co.za.</p></FadeIn>
        ) : rows.length === 0 ? (
          <FadeIn key="empty" className="rounded-[28px] border border-white/10 bg-white/[0.02] p-8 sm:p-10 text-center">
            <Database className="w-10 h-10 text-slate-600 mx-auto" aria-hidden="true" />
            <p className="mt-3 text-lg font-semibold text-white">No leads yet</p>
            <p className="mt-1 text-sm text-slate-400 max-w-md mx-auto">Leads appear here as soon as they're delivered to you. Delivery starts once your plan's payment has cleared.</p>
          </FadeIn>
        ) : (
          <m.div key="list">
            <p className="text-xs text-slate-500 mb-3">{rows.length} lead{rows.length === 1 ? "" : "s"}</p>
            <m.ul className="space-y-3" variants={stagger} initial="hidden" animate="show">
              {rows.map((l) => (
                <m.li key={l.id} layout variants={item} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-white break-words">{[l.first_name, l.last_name].filter(Boolean).join(" ") || "Unnamed lead"}</p>
                    <div className="flex flex-wrap gap-x-5 text-sm text-slate-400">
                      <a href={`tel:${l.phone}`} className="inline-flex min-h-[44px] items-center gap-1.5 hover:text-white"><Phone className="h-4 w-4" />{l.phone}</a>
                      {l.email && <a href={`mailto:${l.email}`} className="inline-flex min-h-[44px] items-center gap-1.5 hover:text-white break-all"><Mail className="h-4 w-4" />{l.email}</a>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-sm">
                    {l.current_status && <span className="rounded-full border border-white/15 px-3 py-1 text-slate-300">{l.current_status}</span>}
                    {l.created_at && <span className="text-xs text-slate-500">{new Date(l.created_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}</span>}
                  </div>
                </m.li>
              ))}
            </m.ul>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
