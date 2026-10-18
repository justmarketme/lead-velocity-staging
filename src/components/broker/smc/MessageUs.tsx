/**
 * "Message Lead Velocity": a plain form (no chat, no AI) plus a tidy inbox of what the broker sent, each with a status
 * (Sent / Seen / Answered) and our reply. Writes only through broker_send_message(); reads broker_messages, which RLS
 * limits to his own rows (migration 20261013220000). `MessageUsCard` is the dashboard entry that links to the page.
 */
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrokerPreview } from "@/lib/brokerPreview";
import { fmtDayTimeSast } from "@/lib/adConsent";
import { MSG_ITEM_LABEL, MSG_STATUS_LABEL, MSG_TOPICS, MSG_TOPIC_LABEL, type BrokerMessage, type MsgTopic } from "@/lib/brokerMessages";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const field = "w-full rounded-xl border border-white/15 bg-white/[0.04] p-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-pink-400/60";

interface ItemOpt { id: string; kind: "intro_card" | "ad"; label: string }

// eslint-disable-next-line react-refresh/only-export-components
export function useBrokerMessages(brokerId: string | null | undefined) {
  const [rows, setRows] = useState<BrokerMessage[] | null>(null);
  const reload = useCallback(async () => {
    if (!brokerId) return;
    const { data, error } = await db.from("broker_messages").select("*").eq("broker_id", brokerId).order("created_at", { ascending: false }).limit(100);
    setRows(error ? [] : (data as BrokerMessage[]) || []);
  }, [brokerId]);
  useEffect(() => { void reload(); }, [reload]);
  return { rows, reload };
}

const STATUS_STYLE = { sent: "border-slate-400/30 bg-slate-400/10 text-slate-200", seen: "border-sky-400/30 bg-sky-400/10 text-sky-200", answered: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" } as const;

export default function MessageUs({ brokerId }: { brokerId: string }) {
  const preview = !!useBrokerPreview();
  const { rows, reload } = useBrokerMessages(brokerId);
  const [topic, setTopic] = useState<MsgTopic>("question");
  const [text, setText] = useState("");
  const [item, setItem] = useState("");
  const [items, setItems] = useState<ItemOpt[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    let alive = true;
    void db.from("broker_media").select("id, kind, version, state").eq("broker_id", brokerId).in("kind", ["card", "ad"])
      .not("state", "in", "(superseded,rejected)").order("created_at", { ascending: false }).limit(30)
      .then(({ data }: { data: { id: string; kind: string; version: number }[] | null }) => {
        if (!alive) return;
        let card = false;
        const out: ItemOpt[] = [];
        for (const r of data || []) {
          if (r.kind === "card") { if (!card) { card = true; out.push({ id: r.id, kind: "intro_card", label: "My intro card" }); } }
          else out.push({ id: r.id, kind: "ad", label: `Ad, version ${r.version}` });
        }
        setItems(out);
      });
    return () => { alive = false; };
  }, [brokerId]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setOk(false);
    if (text.trim().length < 3) { setErr("Write your message first."); return; }
    if (preview) { setErr("Preview only: nothing is saved."); return; }
    const picked = items.find((i) => i.id === item);
    setBusy(true);
    const { error } = await db.rpc("broker_send_message", { p_topic: topic, p_message: text.trim(), p_item_kind: picked?.kind ?? null, p_item_id: picked?.id ?? null });
    setBusy(false);
    if (error) { setErr((error as { message?: string }).message || "Could not send. Please try again."); return; }
    setText(""); setItem(""); setOk(true);
    void reload();
  }

  return (
    <div className="space-y-6 text-slate-200">
      <form onSubmit={send} className="rounded-3xl border border-white/10 bg-slate-900/60 p-5 space-y-3">
        <h2 className="text-base font-bold text-white">Message Lead Velocity</h2>
        <p className="text-sm text-slate-400">Ask a question, leave a note or tell us something's not right. A real person reads it and replies here.</p>
        <fieldset className="flex flex-wrap gap-2">
          <legend className="sr-only">Topic</legend>
          {MSG_TOPICS.map((t) => (
            <label key={t.id} className={`cursor-pointer rounded-full border px-3 py-2 text-sm font-semibold min-h-[44px] flex items-center ${topic === t.id ? "border-pink-400 bg-pink-500/20 text-white" : "border-white/15 text-slate-300 hover:bg-white/10"}`}>
              <input type="radio" name="msg-topic" className="sr-only" checked={topic === t.id} onChange={() => setTopic(t.id)} />{t.label}
            </label>
          ))}
        </fieldset>
        <label className="block text-sm font-semibold text-white" htmlFor="msg-body">Your message</label>
        <textarea id="msg-body" rows={4} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} className={field} />
        {items.length > 0 && (
          <>
            <label className="block text-xs font-medium text-slate-400" htmlFor="msg-item">About something specific? (optional)</label>
            <select id="msg-item" value={item} onChange={(e) => setItem(e.target.value)} className={field}>
              <option value="">Nothing in particular</option>
              {items.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
            </select>
          </>
        )}
        {err && <p role="alert" className="text-sm text-rose-300">{err}</p>}
        {ok && <p role="status" className="text-sm text-emerald-300">Sent. We'll reply here.</p>}
        <button type="submit" disabled={busy}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}Send message
        </button>
      </form>

      <section aria-labelledby="msg-hist" className="rounded-3xl border border-white/10 bg-slate-900/60 p-5 space-y-3">
        <h3 id="msg-hist" className="text-base font-bold text-white">What you've sent</h3>
        {rows === null ? <p className="text-sm text-slate-400">Loading…</p>
          : rows.length === 0 ? <p className="text-sm text-slate-400">Nothing yet. Your messages and our replies show up here.</p>
          : (
            <ul className="space-y-3">
              {rows.map((m) => (
                <li key={m.id} className="rounded-2xl border border-white/10 bg-white/[0.02] p-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-semibold text-white">{MSG_TOPIC_LABEL[m.topic]}</span>
                    {m.item_kind && <span className="text-slate-400">· about {MSG_ITEM_LABEL[m.item_kind].toLowerCase()}</span>}
                    <span className="text-slate-500">{fmtDayTimeSast(m.created_at)}</span>
                    <span className={`ml-auto rounded-full border px-2 py-0.5 font-semibold ${STATUS_STYLE[m.status]}`}>{MSG_STATUS_LABEL[m.status]}</span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>
                  {m.reply && (
                    <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/[0.06] p-3">
                      <p className="text-xs font-semibold text-emerald-300">Lead Velocity replied {fmtDayTimeSast(m.replied_at)}</p>
                      <p className="mt-1 text-sm whitespace-pre-wrap break-words">{m.reply}</p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
      </section>
    </div>
  );
}

/** Dashboard card: where the broker finds the box. Shows how many replies he has. */
export function MessageUsCard({ brokerId, className = "" }: { brokerId: string | null | undefined; className?: string }) {
  const { rows } = useBrokerMessages(brokerId);
  if (!brokerId) return null;
  const answered = (rows || []).filter((m) => m.status === "answered").length;
  return (
    <section aria-labelledby="msg-card-h" className={`rounded-[28px] border border-white/10 bg-white/[0.02] p-5 sm:p-7 flex flex-wrap items-center gap-4 ${className}`}>
      <MessageSquare className="h-6 w-6 text-pink-400 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <h3 id="msg-card-h" className="text-base font-semibold text-white">Message Lead Velocity</h3>
        <p className="text-sm text-slate-400">Questions, notes or something not right? Write to us here. {rows && rows.length > 0 ? `${answered} of ${rows.length} answered.` : ""}</p>
      </div>
      <Link to="/broker/messages" className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90">Write to us</Link>
    </section>
  );
}
