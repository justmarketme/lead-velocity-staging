/**
 * Broker portal "Leads" tab: the leads assigned to this broker (leads.broker_id), newest first. Read-only list.
 * Filters by broker id explicitly, so the admin "Preview as broker" view shows exactly the broker's own leads.
 */
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Database, Mail, Phone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

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
    <div className="space-y-6 animate-in fade-in duration-700">
      <div>
        <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">Your leads</h2>
        <p className="text-slate-400 mt-1">Every lead Lead Velocity has delivered to you, newest first.</p>
      </div>
      {rows === null ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : error ? (
        <p className="text-sm text-rose-400">We couldn't load your leads ({error}). Please try again or contact howzit@leadvelocity.co.za.</p>
      ) : rows.length === 0 ? (
        <Card className="bg-[#020617] border-white/5 rounded-[32px]">
          <CardContent className="p-10 text-center space-y-3">
            <Database className="w-12 h-12 text-slate-700 mx-auto" />
            <p className="text-lg font-bold text-white">No leads yet</p>
            <p className="text-sm text-slate-400 max-w-md mx-auto">Leads appear here as soon as they are delivered to you. Delivery starts once your plan's payment has cleared.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">{rows.length} lead{rows.length === 1 ? "" : "s"}</p>
          {rows.map((l) => (
            <Card key={l.id} className="bg-[#020617] border-white/5 rounded-[20px]">
              <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-white break-words">{[l.first_name, l.last_name].filter(Boolean).join(" ") || "Unnamed lead"}</p>
                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-400 mt-1">
                    <a href={`tel:${l.phone}`} className="inline-flex items-center gap-1.5 hover:text-white"><Phone className="h-3.5 w-3.5" />{l.phone}</a>
                    {l.email && <a href={`mailto:${l.email}`} className="inline-flex items-center gap-1.5 hover:text-white break-all"><Mail className="h-3.5 w-3.5" />{l.email}</a>}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {l.current_status && <Badge variant="outline" className="border-white/10 text-slate-300">{l.current_status}</Badge>}
                  {l.created_at && <span className="text-xs text-slate-500">{new Date(l.created_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}</span>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
