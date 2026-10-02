/**
 * Console · Ask the data (6A2 item 4, analytics/ask-the-data.md). The browser sends only the question;
 * n8n drafts SQL (Haiku), guards it in code, runs it as facts_reader (5 s, LIMIT 200), explains it (Sonnet), logs to ops.ask_log.
 * Answer card: number · comparison · how computed (expandable) · caveat · next question. n < 20 → "not enough data yet".
 */
import { FormEvent, useState } from "react";
import ConsoleLayout from "./ConsoleLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { N8N_BASE, postWebhook } from "@/lib/smc";
import type { AskAnswer } from "@/integrations/supabase/smc-types";

const MIN_N = 20;
const EXAMPLES = [
  "What did a good-fit meeting cost us in the last 28 days?",
  "Which ad angle has the best adviser rating this cycle?",
  "How many booked calls actually happened last week?",
];

interface Asked { q: string; a: AskAnswer | null; error?: string }

export default function Ask() {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Asked[]>([]);

  async function submit(e?: FormEvent, text?: string) {
    e?.preventDefault();
    const question = (text ?? q).trim();
    if (question.length < 5) return;
    setBusy(true);
    const r = await postWebhook<AskAnswer>("ask", { question });
    setBusy(false);
    setHistory((h) => [{ q: question, a: r.ok ? r.data : null, error: r.ok ? undefined : r.error }, ...h].slice(0, 10));
    setQ("");
  }

  return (
    <ConsoleLayout>
      <h1 className="mb-1 text-lg font-bold">Ask the data</h1>
      <p className="mb-3 text-sm text-muted-foreground">Plain question in, a number you can trust out. Read-only, pseudonymised facts only; every query is logged.{!N8N_BASE && " Not connected yet (VITE_N8N_WEBHOOK_BASE)."}</p>
      <form onSubmit={submit} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3">
        <Textarea value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. What was our show rate last week compared with the target?"
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit(); }} />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={busy || q.trim().length < 5}>{busy ? "Working…" : "Ask"}</Button>
          <span className="text-xs text-muted-foreground">Ctrl/Cmd + Enter</span>
          <div className="ml-auto flex flex-wrap gap-1">
            {EXAMPLES.map((x) => <button key={x} type="button" className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground" onClick={() => setQ(x)}>{x}</button>)}
          </div>
        </div>
      </form>

      <div className="mt-4 flex flex-col gap-3">
        {history.map((h, i) => <AnswerCard key={i} item={h} onNext={(t) => void submit(undefined, t)} />)}
      </div>
    </ConsoleLayout>
  );
}

function AnswerCard({ item, onNext }: { item: Asked; onNext: (q: string) => void }) {
  const a = item.a;
  const thin = a && a.n_min !== null && a.n_min !== undefined && a.n_min < MIN_N;
  return (
    <article className="rounded-xl border border-border bg-card p-4">
      <p className="mb-2 text-sm text-muted-foreground">“{item.q}”</p>
      {item.error && <p className="text-sm text-destructive">Could not answer: {item.error}</p>}
      {a && !a.ok && <p className="text-sm">I could not compute that{a.refused_reason ? `: ${a.refused_reason}` : "."}</p>}
      {a && a.ok && (
        <>
          {thin ? (
            <p className="text-xl font-bold">Not enough data yet (n = {a.n_min}, need {MIN_N})</p>
          ) : (
            <p className="text-xl font-bold">{a.headline}</p>
          )}
          {a.comparison && <p className="mt-1 text-sm"><span className="text-muted-foreground">Compared with: </span>{a.comparison}</p>}
          {a.caveat && <p className="mt-1 text-sm"><span className="text-muted-foreground">Caveat: </span>{a.caveat}</p>}
          {thin && a.rows && a.rows.length > 0 && (
            <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 text-xs">{JSON.stringify(a.rows.slice(0, 10), null, 1)}</pre>
          )}
          {a.how && (
            <details className="mt-2 text-sm">
              <summary className="cursor-pointer text-muted-foreground">How this was computed</summary>
              {a.how.explanation && <p className="mt-1">{a.how.explanation}</p>}
              {a.how.sql && <pre className="mt-1 overflow-x-auto rounded bg-muted p-2 text-xs">{a.how.sql}</pre>}
            </details>
          )}
          {a.next_question && (
            <button className="mt-2 text-sm font-semibold text-primary hover:underline" onClick={() => onNext(a.next_question!)}>Next question: {a.next_question} →</button>
          )}
        </>
      )}
    </article>
  );
}
