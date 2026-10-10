/**
 * SortMyCover broker portal: pure contract rules (no imports, no I/O) so they can be unit-tested with plain
 * `node --test src/lib/smcRules.test.mjs` (Node strips the types). Source of every rule:
 * deliverables/contracts-drafter/lead-generation-agreement/lead-velocity-services-agreement.md
 *   clause 8.4  feedback firewall: the broker tells us only whether the consumer attended and could be contacted.
 *   clause 7 + Schedule 3  replacements: goodwill, never a right. A REQUEST can follow a no-show or a lead the broker
 *                          couldn't reach (the same proof window and ONE shared counter): max 3 per Calendar Week, proof 10-30 min.
 *   clause 1.1.6  Calendar Week = Monday 00:00 to Sunday 23:59 SAST.
 *   clause 6  shortfall rollover; clause 9  top-ups (numbers come from src/lib/pricing.ts, passed in).
 */

/** The four answers a broker can give (clause 8.4). Same words as the WhatsApp quick replies. */
export type MarkKind = "attended" | "no_show" | "unreachable" | "rescheduled";
export const MARKS: { kind: MarkKind; label: string; done: string }[] = [
  { kind: "attended", label: "Met them", done: "Met them" },
  { kind: "no_show", label: "No-show", done: "No-show" },
  { kind: "unreachable", label: "Couldn't reach them", done: "Couldn't reach them" },
  { kind: "rescheduled", label: "Moved to another time", done: "Moved" },
];
/** Display label for any stored outcome kind (older rows can hold broker_no_show). */
export function markLabel(kind: string | null | undefined): string {
  if (kind === "broker_no_show") return "Lead says they weren't called";
  return MARKS.find((m) => m.kind === kind)?.done || "";
}

// ---------------------------------------------------------------- which answers can earn a replacement REQUEST
/**
 * Clause 7 + Schedule 3: a goodwill replacement request can follow a no-show or a lead the broker couldn't reach.
 * Never a right, never because the consumer didn't buy. Both kinds share one proof window and ONE weekly counter.
 */
export type ReplacementKind = Extract<MarkKind, "no_show" | "unreachable">;
export const REPLACEMENT_MARKS: readonly ReplacementKind[] = ["no_show", "unreachable"];
export function canAskReplacement(kind: string | null | undefined): kind is ReplacementKind {
  return kind === "no_show" || kind === "unreachable";
}
/** replacements.reason for each kind (the existing CHECK: 'no_show' | 'uncontactable' | 'disqualified'). */
export const REPLACEMENT_REASON: Record<ReplacementKind, "no_show" | "uncontactable"> = { no_show: "no_show", unreachable: "uncontactable" };
/** replacements.reason_code for a request that came with portal proof (Schedule 3). */
export const REPLACEMENT_REASON_CODE: Record<ReplacementKind, string> = { no_show: "schedule3_proof", unreachable: "schedule3_proof_unreachable" };
/** lead_activities.activity_type written when the proof is sent. */
export const PROOF_ACTIVITY: Record<ReplacementKind, string> = { no_show: "noshow_proof_sent", unreachable: "unreachable_proof_sent" };
/** Which kind a stored replacements row is, or null for any other reason (disqualified). */
export function replacementKindOf(r: { reason?: string | null; reason_code?: string | null }): ReplacementKind | null {
  if (r.reason === "uncontactable" || r.reason_code === REPLACEMENT_REASON_CODE.unreachable) return "unreachable";
  if (r.reason === "no_show") return "no_show";
  return null;
}

// ---------------------------------------------------------------- Schedule 3 proof window
export const PROOF_OPENS_MIN = 10; // S3.2 wait at least 10 minutes past the start (no-show and couldn't-reach alike)
export const PROOF_CLOSES_MIN = 30; // S3.3 proof no later than 30 minutes after the start (same for both)
const MIN = 60_000;

export type ProofState = "not_started" | "waiting" | "open" | "closed";
/** Where a meeting is in the proof window (no-show and couldn't-reach share it). minutes are whole minutes, rounded up. */
export function proofWindow(startMs: number, nowMs: number): { state: ProofState; minsToOpen: number; minsLeft: number } {
  const open = startMs + PROOF_OPENS_MIN * MIN;
  const close = startMs + PROOF_CLOSES_MIN * MIN;
  if (nowMs < startMs) return { state: "not_started", minsToOpen: Math.ceil((open - nowMs) / MIN), minsLeft: 0 };
  if (nowMs < open) return { state: "waiting", minsToOpen: Math.ceil((open - nowMs) / MIN), minsLeft: 0 };
  if (nowMs <= close) return { state: "open", minsToOpen: 0, minsLeft: Math.max(0, Math.ceil((close - nowMs) / MIN)) };
  return { state: "closed", minsToOpen: 0, minsLeft: 0 };
}

/**
 * What tapping one of the four answers does, from the proof window and this week's shared counter.
 *   record  : attended / moved: one tap, written after the Undo
 *   wait    : no-show / couldn't reach, before start + 10 min: the button is disabled ("wait N min")
 *   ask     : start + 10 .. start + 30 min with requests left: opens the proof sheet ("Ask for a replacement")
 *   capped  : in the window but the week's requests are used: just records the answer, still delivered
 *   late    : after start + 30 min: just records the answer, no request, still delivered
 */
export type MarkPlan =
  | { mode: "record" }
  | { mode: "wait"; minsToOpen: number }
  | { mode: "ask" }
  | { mode: "capped"; used: number; max: number }
  | { mode: "late" };
export function markPlan(kind: MarkKind, w: { state: ProofState; minsToOpen: number }, used: number, max: number): MarkPlan {
  if (!canAskReplacement(kind)) return { mode: "record" };
  if (w.state === "not_started" || w.state === "waiting") return { mode: "wait", minsToOpen: w.minsToOpen };
  if (w.state === "closed") return { mode: "late" };
  return used < max ? { mode: "ask" } : { mode: "capped", used, max };
}

// ---------------------------------------------------------------- Calendar Week (SAST, UTC+2, no daylight saving)
const SAST_OFFSET = 2 * 60 * MIN;
/** Monday 00:00 SAST of the week containing `ms`, as epoch ms. */
export function weekStartSast(ms: number): number {
  const local = new Date(ms + SAST_OFFSET); // shift so UTC getters read SAST wall time
  const dow = (local.getUTCDay() + 6) % 7; // Monday = 0
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - dow * 24 * 60 * MIN;
  return midnight - SAST_OFFSET;
}
/**
 * Replacement requests that fall in the same Calendar Week as `nowMs` (by missed appointment, else claim time).
 * ONE counter: a no-show request and a couldn't-reach request count the same, and every row counts, decided or not
 * (so it ignores `reason` and `status` on purpose). Clause 7.2: at most 3 a week; there is no per-cycle cap.
 */
export function requestsThisWeek(reqs: { missed_start_at?: string | null; claimed_at?: string | null }[], nowMs: number): number {
  const wk = weekStartSast(nowMs);
  return reqs.filter((r) => {
    const t = Date.parse(r.missed_start_at || r.claimed_at || "");
    return Number.isFinite(t) && weekStartSast(t) === wk;
  }).length;
}

// ---------------------------------------------------------------- cycle pace (Linear cycle graph target line)
export type CycleStatus = "complete" | "on_pace" | "behind" | "ending_short" | "rollover";
export interface CyclePace { day: number; daysTotal: number; expected: number; pacePct: number; deliveredPct: number; status: CycleStatus }
/**
 * day = day of the cycle (1..daysTotal). expected = committed × day / daysTotal, rounded down (the pace tick).
 * status: complete at delivered ≥ committed; rollover when past the end (clause 6.1, 14 days); ending_short in the
 * last 3 days below committed; behind when below the pace tick; else on_pace.
 */
export function cyclePace(p: { delivered: number; committed: number; startsAtMs: number | null; endsAtMs: number | null; nowMs: number; cycleDays: number }): CyclePace {
  const daysTotal = p.cycleDays;
  const committed = Math.max(1, p.committed);
  const elapsed = p.startsAtMs === null ? 0 : (p.nowMs - p.startsAtMs) / (24 * 60 * MIN);
  const day = Math.min(daysTotal, Math.max(1, Math.ceil(elapsed)));
  const expected = Math.floor((committed * day) / daysTotal);
  const pacePct = Math.min(100, Math.round((expected / committed) * 100));
  const deliveredPct = Math.min(100, Math.round((p.delivered / committed) * 100));
  let status: CycleStatus = "on_pace";
  const daysLeft = p.endsAtMs === null ? daysTotal - day : (p.endsAtMs - p.nowMs) / (24 * 60 * MIN);
  if (p.delivered >= committed) status = "complete";
  else if (daysLeft < 0) status = "rollover";
  else if (daysLeft <= 3) status = "ending_short";
  else if (p.delivered < expected) status = "behind";
  return { day, daysTotal, expected, pacePct, deliveredPct, status };
}

// ---------------------------------------------------------------- top-up (clause 9.2/9.3)
/** Earliest start: notice ends after `noticeDays`; delivery starts at the later of that and payment clearing. */
export function topupEarliestStart(nowMs: number, noticeDays: number): number {
  return nowMs + noticeDays * 24 * 60 * MIN;
}
export function clampTopup(n: number, min: number, step = 5): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.round(n / step) * step || min);
}
