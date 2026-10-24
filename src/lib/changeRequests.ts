/**
 * Approved items are locked; the broker asks Lead Velocity to change them (migration 20261013200000).
 *  - brokers.onboarding_progress.change_requests = [{id, item, message, status: 'open'|'resolved', at, resolved_at?, unlock?}]
 *    written only by broker_request_change(p_item, p_message) and admin_resolve_change_request(...).
 *  - Locks (enforced again on the server by the broker_approved_items_guard trigger):
 *      intro card approved (onboarding_progress.card.approved_at) -> headshot and bio locked, unless card.unlocked_at
 *      bio review accepted (onboarding_progress.bio_review.status = 'accepted') -> bio locked, unless bio_review.unlocked_at
 *    An admin resolving a request "and unlock" sets unlocked_at; approving a new card locks it again.
 * Pure helpers (no imports) so they run under `node --test src/lib/changeRequests.test.mjs`.
 */

export type ChangeItem = "bio" | "intro_card" | "ad";
export const CHANGE_ITEMS: ChangeItem[] = ["bio", "intro_card", "ad"];
export const CHANGE_ITEM_LABEL: Record<ChangeItem, string> = { bio: "Bio", intro_card: "Intro card", ad: "Ad featuring the broker" };

export interface ChangeRequest {
  id: string; item: ChangeItem; message: string; status: "open" | "resolved"; at: string | null;
  resolved_at: string | null; unlock: boolean; note: string | null;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** All change requests, newest first; malformed entries dropped. */
export function readChangeRequests(progress: unknown): ChangeRequest[] {
  const arr = obj(progress)?.change_requests;
  if (!Array.isArray(arr)) return [];
  const out: ChangeRequest[] = [];
  for (const raw of arr) {
    const r = obj(raw);
    if (!r) continue;
    const item = str(r.item) as ChangeItem;
    const status = str(r.status);
    if (!CHANGE_ITEMS.includes(item) || (status !== "open" && status !== "resolved") || !str(r.id)) continue;
    out.push({
      id: str(r.id), item, message: str(r.message), status, at: str(r.at) || null,
      resolved_at: str(r.resolved_at) || null, unlock: r.unlock === true, note: str(r.note) || null,
    });
  }
  return out.sort((a, b) => (b.at || "").localeCompare(a.at || ""));
}

export const openRequests = (progress: unknown, item?: ChangeItem) =>
  readChangeRequests(progress).filter((r) => r.status === "open" && (!item || r.item === item));

/** The approved intro card locks the headshot and bio. */
export function cardLocked(progress: unknown): boolean {
  const c = obj(obj(progress)?.card);
  return !!c && !!str(c.approved_at) && !str(c.unlocked_at);
}

/** The bio is locked once Lead Velocity's bio review is accepted, or while the approved card is locked. */
export function bioLocked(progress: unknown): boolean {
  if (cardLocked(progress)) return true;
  const r = obj(obj(progress)?.bio_review);
  return !!r && r.status === "accepted" && !str(r.unlocked_at);
}

/** Message sent to broker_request_change: what to change, plus an optional note. 3 to 1000 characters. */
export function changeMessage(what: string, note: string): string {
  const w = what.trim();
  const n = note.trim();
  return (n ? `${w}\n\nNote: ${n}` : w).slice(0, 1000);
}
