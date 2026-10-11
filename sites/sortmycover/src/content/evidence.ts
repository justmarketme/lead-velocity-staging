/* Sources built from config/evidence.json, so a page's "Sources" list, its `evidence` ids and the ledger can never drift apart:
   the title, publisher, URL and month all come from the evidence entry (the will provider's name is never typed in content). */
import ledger from "../../config/evidence.json";
import type { Source } from "./types";

export interface EvidenceEntry { id: string; claim: string; title?: string; publisher: string; url: string; month: string; checked?: string; status: string; note?: string }
export const EVIDENCE = ledger as EvidenceEntry[];

export function evidenceById(id: string): EvidenceEntry {
  const e = EVIDENCE.find((x) => x.id === id);
  if (!e) throw new Error(`unknown evidence id ${id}`);
  return e;
}

/** Sources for a list of [evidence id, what the page takes from it]. Entries that share a URL become one source line. */
export function sourcesFrom(items: [string, string][]): Source[] {
  const out: Source[] = [];
  for (const [id, used] of items) {
    const e = evidenceById(id);
    const prev = out.find((s) => s.url === e.url);
    if (prev) { prev.used_for = prev.used_for ? `${prev.used_for}; ${used}` : used; continue; }
    out.push({ title: e.title ?? e.publisher, publisher: e.publisher, url: e.url, accessed: (e.checked ?? e.month).slice(0, 7), used_for: used });
  }
  return out;
}
