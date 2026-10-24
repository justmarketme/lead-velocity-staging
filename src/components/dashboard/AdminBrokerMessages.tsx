/**
 * Admin: Broker messages (table broker_messages, migration 20261013220000). Lists what brokers wrote through the portal's
 * "Message Lead Velocity" form; open ones first. Opening a message marks it Seen (admin_mark_message_seen); "Send reply"
 * answers it (admin_reply_message), which the broker sees in his inbox. Admin-only by RLS + smc_is_admin() in the RPCs.
 */
import { useCallback, useEffect, useState } from "react";
import { Loader2, MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fmtDayTimeSast } from "@/lib/adConsent";
import { MSG_ITEM_LABEL, MSG_STATUS_LABEL, MSG_TOPIC_LABEL, type BrokerMessage } from "@/lib/brokerMessages";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
type Row = BrokerMessage & { brokers: { contact_person: string | null; firm_name: string | null } | null };

export default function AdminBrokerMessages() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await db.from("broker_messages").select("*, brokers(contact_person, firm_name)").order("created_at", { ascending: false }).limit(200);
    if (error) { setErr(error.message); setRows([]); return; }
    setRows((data as Row[]) || []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function seen(m: Row) {
    if (m.status !== "sent") return;
    await db.rpc("admin_mark_message_seen", { p_message_id: m.id });
    void load();
  }
  async function reply(m: Row) {
    const text = (draft[m.id] || "").trim();
    if (!text) return;
    setErr(null); setBusy(m.id);
    const { error } = await db.rpc("admin_reply_message", { p_message_id: m.id, p_reply: text });
    setBusy(null);
    if (error) { setErr(error.message || "Could not send the reply."); return; }
    setDraft((d) => ({ ...d, [m.id]: "" }));
    void load();
  }

  const list = (rows || []).filter((m) => filter === "all" || m.status !== "answered");
  const openCount = (rows || []).filter((m) => m.status !== "answered").length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-bold flex items-center gap-2"><MessageSquare className="h-5 w-5" aria-hidden="true" />Broker messages</h2>
        <span className="text-sm text-muted-foreground">{openCount} waiting for a reply</span>
        <div className="ml-auto flex gap-2">
          {(["open", "all"] as const).map((f) => (
            <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f}
              className={`rounded-md border px-3 py-1.5 text-sm ${filter === f ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}>{f === "open" ? "Waiting" : "Everything"}</button>
          ))}
        </div>
      </div>
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
      {rows === null ? <p className="text-muted-foreground">Loading…</p>
        : list.length === 0 ? <p className="text-muted-foreground">Nothing waiting.</p>
        : (
          <ul className="space-y-3">
            {list.map((m) => (
              <li key={m.id} className="rounded-xl border p-4 space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold">{m.brokers?.contact_person || "Broker"}</span>
                  <span className="text-muted-foreground">{m.brokers?.firm_name || ""}</span>
                  <span className="rounded-full border px-2 py-0.5 text-xs">{MSG_TOPIC_LABEL[m.topic]}</span>
                  {m.item_kind && <span className="text-xs text-muted-foreground">about {MSG_ITEM_LABEL[m.item_kind].toLowerCase()}</span>}
                  <span className="text-xs text-muted-foreground">{fmtDayTimeSast(m.created_at)}</span>
                  {m.status === "sent" && <button type="button" onClick={() => void seen(m)} className="ml-auto text-xs font-semibold text-primary hover:underline">Mark seen</button>}
                  <span className={`${m.status === "sent" ? "" : "ml-auto "}rounded-full border px-2 py-0.5 text-xs font-semibold`}>{MSG_STATUS_LABEL[m.status]}</span>
                </div>
                <p className="whitespace-pre-wrap break-words text-sm">{m.body}</p>
                {m.reply && <p className="rounded-lg bg-muted p-3 text-sm whitespace-pre-wrap break-words"><span className="block text-xs font-semibold text-muted-foreground">Replied {fmtDayTimeSast(m.replied_at)}</span>{m.reply}</p>}
                <div className="space-y-2">
                  <textarea aria-label="Reply" rows={2} maxLength={4000} value={draft[m.id] || ""} onFocus={() => void seen(m)}
                    onChange={(e) => setDraft((d) => ({ ...d, [m.id]: e.target.value }))}
                    placeholder={m.reply ? "Send another reply" : "Write a reply"} className="w-full rounded-md border bg-background p-2 text-sm" />
                  <button type="button" disabled={busy === m.id || !(draft[m.id] || "").trim()} onClick={() => reply(m)}
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                    {busy === m.id && <Loader2 className="h-4 w-4 animate-spin" />}Send reply (marks answered)
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}
