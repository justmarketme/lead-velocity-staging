/**
 * SortMyCover broker portal data layer (ux-sprint-1, crm-ux-synthesis R5/R7/R8/R11/R16).
 * One react-query cache per resource (60 s stale), parallel fetches, optimistic marking with a 6-second Undo.
 * Every read is the broker's own rows by RLS (brokers.user_id = auth.uid(), smc_05).
 *
 * Feedback firewall (agreement clause 8.4): the only thing written about a meeting is outcomes.outcome
 * (attended / no_show / unreachable / rescheduled). Nothing else about the meeting is ever sent. A no-show and a lead
 * you couldn't reach can both come with a goodwill replacement REQUEST (proof, 10-30 min, one weekly counter of 3).
 */
import { useEffect } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { errText, MEDIA_BUCKET, portalEvent, smcDb } from "@/lib/smc";
import { TERMS } from "@/lib/pricing";
import { MARKS, markLabel, replacementKindOf, requestsThisWeek, weekStartSast, type MarkKind, type ReplacementKind } from "@/lib/smcRules";
import type { SmcBooking, SmcCycleProgress, SmcLead, SmcOutcome, SmcReplacement } from "@/integrations/supabase/smc-types";

const STALE = 60_000;
export const qk = {
  cycle: (b: string) => ["smc", "cycle", b] as const,
  meetings: (b: string) => ["smc", "meetings", b] as const,
  lead: (b: string, id: string) => ["smc", "lead", b, id] as const,
};

/** Lead columns the portal may show. Never health detail, ID numbers or anything about what happened in the meeting. */
const LEAD_COLS = "id, first_name, last_name, language, age_band, budget_band, bond, dependants, method_pref, best_time, call_number, health_flag, cycle_id, created_at";
export const fullName = (l?: Pick<SmcLead, "first_name" | "last_name"> | null) => [l?.first_name, l?.last_name].filter(Boolean).join(" ") || "Lead";
export const shortName = (l?: Pick<SmcLead, "first_name" | "last_name"> | null) => `${l?.first_name || "Lead"}${l?.last_name?.[0] ? ` ${l.last_name[0]}.` : ""}`;
export const endOf = (b: SmcBooking) => (b.ends_at ? Date.parse(b.ends_at) : Date.parse(b.starts_at) + 30 * 60e3);
export const CALL_METHODS = new Set(["phone", "whatsapp_call"]);
/** tel: for phone, wa.me for WhatsApp calls. Digits only; SA numbers kept in +27 form. */
export function callHref(method: string, num?: string | null): string | null {
  const d = String(num || "").replace(/[^\d+]/g, "");
  if (!d) return null;
  return method === "whatsapp_call" ? `https://wa.me/${d.replace(/^\+/, "")}` : `tel:${d}`;
}

// ---------------------------------------------------------------- cycle (R7)
export interface CycleView {
  prog: SmcCycleProgress | null;
  delivered: number;
  /** "view" = v_cycle_progress.delivered (migration smc_18); "computed" = same rule computed here until it is applied. */
  deliveredSource: "view" | "computed" | "none";
  committed: number;
  requestsThisWeek: number;
  weeklyMax: number;
}

/** Clause 5.1/5.2 + Schedule 2: consented, self-declared criteria, booked AND confirmed attendance. Replacement leads excluded (7.4). */
async function computeDelivered(cycleId: string, brokerId: string): Promise<number> {
  const { data: ls } = await smcDb.from("leads").select("id, consent_at, qualified_at").eq("cycle_id", cycleId);
  const ok = ((ls as { id: string; consent_at: string | null; qualified_at: string | null }[]) || []).filter((l) => l.consent_at && l.qualified_at).map((l) => l.id);
  if (!ok.length) return 0;
  const [{ data: bk }, { data: acts }, { data: reps }] = await Promise.all([
    smcDb.from("bookings").select("lead_id, confirmed_at").in("lead_id", ok).not("confirmed_at", "is", null),
    smcDb.from("lead_activities").select("lead_id").in("lead_id", ok).eq("activity_type", "booking_confirmed"),
    smcDb.from("replacements").select("replacement_lead_id, status").eq("broker_id", brokerId).not("replacement_lead_id", "is", null),
  ]);
  const confirmed = new Set([...((bk as { lead_id: string }[]) || []), ...((acts as { lead_id: string }[]) || [])].map((r) => r.lead_id));
  const repl = new Set(((reps as { replacement_lead_id: string; status: string }[]) || []).filter((r) => r.status !== "rejected").map((r) => r.replacement_lead_id));
  return ok.filter((id) => confirmed.has(id) && !repl.has(id)).length;
}

async function fetchCycle(brokerId: string): Promise<CycleView> {
  const since = new Date(weekStartSast(Date.now()) - 86400e3).toISOString();
  const [{ data: p }, { data: rq }] = await Promise.all([
    smcDb.from("v_cycle_progress").select("*").eq("broker_id", brokerId).in("status", ["active", "extended"]).order("cycle_no", { ascending: false }).limit(1),
    smcDb.from("replacements").select("*").eq("broker_id", brokerId).gte("claimed_at", since),
  ]);
  const prog = ((p as SmcCycleProgress[]) || [])[0] || null;
  const reps = (rq as SmcReplacement[]) || [];
  const weeklyMax = prog?.replacement_weekly_max ?? TERMS.goodwill_replacements_per_week;
  const wk = prog?.replacement_requests_this_week ?? requestsThisWeek(reps, Date.now());
  if (!prog) return { prog, delivered: 0, deliveredSource: "none", committed: 0, requestsThisWeek: wk, weeklyMax };
  if (typeof prog.delivered === "number") return { prog, delivered: prog.delivered, deliveredSource: "view", committed: prog.committed, requestsThisWeek: wk, weeklyMax };
  return { prog, delivered: await computeDelivered(prog.cycle_id, brokerId), deliveredSource: "computed", committed: prog.committed, requestsThisWeek: wk, weeklyMax };
}
export const useCycle = (brokerId: string) => useQuery({ queryKey: qk.cycle(brokerId), queryFn: () => fetchCycle(brokerId), staleTime: STALE });

// ---------------------------------------------------------------- meetings (Today, Leads)
/** An outcome in the cache. _pending = inside the 6-second Undo window (not written yet); _prev = the row it replaces. */
export type CachedOutcome = SmcOutcome & { _pending?: boolean; _prev?: SmcOutcome };
export interface Meetings { bookings: SmcBooking[]; leads: Record<string, SmcLead>; outcomes: Record<string, CachedOutcome>; reps: SmcReplacement[] }

async function fetchMeetings(brokerId: string): Promise<Meetings> {
  const since = new Date(Date.now() - 35 * 86400e3).toISOString();
  const until = new Date(Date.now() + 15 * 86400e3).toISOString();
  const [{ data: bk, error: be }, { data: rp }] = await Promise.all([
    smcDb.from("bookings").select("*").eq("broker_id", brokerId).gte("starts_at", since).lte("starts_at", until).neq("status", "cancelled").order("starts_at"),
    smcDb.from("replacements").select("*").eq("broker_id", brokerId).gte("claimed_at", since).order("claimed_at"),
  ]);
  if (be) throw new Error(errText(be));
  const bookings = (bk as SmcBooking[]) || [];
  const leadIds = [...new Set(bookings.map((b) => b.lead_id))];
  let leads: Record<string, SmcLead> = {}, outcomes: Record<string, SmcOutcome> = {};
  if (leadIds.length) {
    const [{ data: ls }, { data: os }] = await Promise.all([
      smcDb.from("leads").select(LEAD_COLS).in("id", leadIds),
      smcDb.from("outcomes").select("id, booking_id, lead_id, broker_id, cycle_id, brand_id, outcome, lead_reach_check, marked_by, marked_via, marked_at, auto_marked, unconfirmed, dispute_status").eq("broker_id", brokerId).in("booking_id", bookings.map((b) => b.id)),
    ]);
    leads = Object.fromEntries(((ls as SmcLead[]) || []).map((l) => [l.id, l]));
    outcomes = Object.fromEntries(((os as SmcOutcome[]) || []).map((o) => [o.booking_id, o]));
  }
  return { bookings, leads, outcomes, reps: (rp as SmcReplacement[]) || [] };
}
export const useMeetings = (brokerId: string) => useQuery({ queryKey: qk.meetings(brokerId), queryFn: () => fetchMeetings(brokerId), staleTime: STALE });

/** Groups for Today / Leads. "Needs you" = ended and unmarked (or auto-marked, unconfirmed) + leads who say they weren't reached. */
export function groupMeetings(m: Meetings | undefined, now = Date.now()) {
  const bookings = m?.bookings || [];
  const outcomes = m?.outcomes || {};
  const live = (b: SmcBooking) => ["booked", "confirmed"].includes(b.status);
  const toMark = bookings
    .filter((b) => Date.parse(b.starts_at) <= now && ["booked", "confirmed", "attended", "no_show"].includes(b.status) && (!outcomes[b.id] || outcomes[b.id].unconfirmed || outcomes[b.id]._pending))
    .filter((b) => endOf(b) < now || Date.parse(b.starts_at) + 10 * 60e3 <= now) // from start + 10 min a no-show / couldn't-reach can be marked
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  const upcoming = bookings.filter((b) => live(b) && endOf(b) >= now && !toMark.includes(b)).sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  const notReached = Object.values(outcomes).filter((o) => o.lead_reach_check === "no" && o.outcome !== "unreachable");
  const past = bookings.filter((b) => outcomes[b.id] && !outcomes[b.id].unconfirmed).sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at));
  // Rows inside their Undo window stay on screen (so Undo is reachable) but no longer count as needing the broker.
  const needsCount = toMark.filter((b) => !outcomes[b.id]?._pending).length;
  return { toMark, needsCount, upcoming, notReached, past, next: upcoming[0] || null };
}

// ---------------------------------------------------------------- one-tap marking with Undo (R8)
export const UNDO_MS = 6000;
interface Pending { timer: number; run: () => Promise<void> }
const pending = new Map<string, Pending>(); // booking id -> deferred write

/** Commit every deferred write now (tab hidden, page unload, component unmount). */
export function flushPendingMarks() {
  for (const [id, p] of pending) { window.clearTimeout(p.timer); pending.delete(id); void p.run(); }
}
/** Mount once in the shell: never lose a mark when the broker leaves inside the Undo window. */
export function useFlushMarksOnLeave() {
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === "hidden") flushPendingMarks(); };
    window.addEventListener("pagehide", flushPendingMarks);
    document.addEventListener("visibilitychange", onHide);
    return () => { window.removeEventListener("pagehide", flushPendingMarks); document.removeEventListener("visibilitychange", onHide); flushPendingMarks(); };
  }, []);
}

/** The one write path for a mark (clause 8.4: outcome only). Returns an error message or null. */
async function writeMark(b: SmcBooking, kind: MarkKind, ctx: { brokerId: string; userId: string; existing?: SmcOutcome }): Promise<string | null> {
  const row = { outcome: kind, marked_by: ctx.userId, marked_via: "portal", marked_at: new Date().toISOString(), unconfirmed: false, auto_marked: false };
  const res = ctx.existing
    ? await smcDb.from("outcomes").update(row).eq("id", ctx.existing.id)
    : await smcDb.from("outcomes").insert({ ...row, booking_id: b.id, lead_id: b.lead_id, broker_id: ctx.brokerId, cycle_id: b.cycle_id, brand_id: b.brand_id });
  if (res.error) {
    // 23514 = CHECK violation: "unreachable" needs migration 20261006_smc_18 on the server.
    if ((res.error as { code?: string }).code === "23514") return `"${markLabel(kind)}" can't be saved until our next server update. Please tell us on WhatsApp for now.`;
    return `Not saved: ${errText(res.error)}`;
  }
  await portalEvent("outcome.marked", null, { booking_id: b.id, outcome: kind });
  return null;
}

export type MarkStatus = { kind: MarkKind; state: "undo" | "saving" | "saved" | "failed"; msg?: string };

/**
 * markMeeting: optimistic (the cache shows the mark at once), Undo for 6 s, then one write. On failure the row
 * reverts and onStatus gets "failed" with a retry message. Only that meeting's cache entry changes; no reload.
 */
export function markMeeting(qc: QueryClient, brokerId: string, userId: string, b: SmcBooking, kind: MarkKind, onStatus: (s: MarkStatus | null) => void) {
  const key = qk.meetings(brokerId);
  const before = qc.getQueryData<Meetings>(key);
  const cached = before?.outcomes[b.id];
  const existing: SmcOutcome | undefined = cached?._pending ? cached._prev : cached;
  const optimistic: CachedOutcome = {
    ...(existing || { id: `pending-${b.id}`, booking_id: b.id, lead_id: b.lead_id, broker_id: brokerId, cycle_id: b.cycle_id, brand_id: b.brand_id, lead_reach_check: null, dispute_status: "none", replacement_eligible: false }),
    outcome: kind, marked_by: userId, marked_via: "portal", marked_at: new Date().toISOString(), auto_marked: false, unconfirmed: false,
    _pending: true, _prev: existing,
  } as CachedOutcome;
  const restore = () => qc.setQueryData<Meetings>(key, (m) => (m ? { ...m, outcomes: existing ? { ...m.outcomes, [b.id]: existing } : Object.fromEntries(Object.entries(m.outcomes).filter(([k]) => k !== b.id)) } : m));
  qc.setQueryData<Meetings>(key, (m) => (m ? { ...m, outcomes: { ...m.outcomes, [b.id]: optimistic } } : m));
  onStatus({ kind, state: "undo" });
  const run = async () => {
    onStatus({ kind, state: "saving" });
    const err = await writeMark(b, kind, { brokerId, userId, existing });
    if (err) { restore(); onStatus({ kind, state: "failed", msg: err }); return; }
    onStatus({ kind, state: "saved" });
    void qc.invalidateQueries({ queryKey: qk.meetings(brokerId) });
    void qc.invalidateQueries({ queryKey: qk.cycle(brokerId) });
    void qc.invalidateQueries({ queryKey: ["smc", "lead", brokerId, b.lead_id] });
  };
  const prev = pending.get(b.id); if (prev) window.clearTimeout(prev.timer);
  const timer = window.setTimeout(() => { pending.delete(b.id); void run(); }, UNDO_MS);
  pending.set(b.id, { timer, run });
  return {
    undo: () => { const p = pending.get(b.id); if (!p) return false; window.clearTimeout(p.timer); pending.delete(b.id); restore(); onStatus(null); return true; },
  };
}

// ---------------------------------------------------------------- replacement request with proof (R4, Schedule 3)
export type ProofResult = { ok: true; via: "rpc" | "event" } | { ok: false; reason: "too_early" | "too_late" | "weekly_max" | "already_requested" | "error"; msg: string };

/** PostgREST "function not found" (PGRST202) or Postgres undefined_function (42883): the migration is not applied yet. */
const fnMissing = (e: unknown) => { const c = (e as { code?: string } | null)?.code || ""; return c === "PGRST202" || c === "42883"; };

/**
 * Upload the photo/screenshot to the private broker-media bucket (<broker_id>/noshow-proof/…, smc_09 policy; the prefix
 * is the same for both kinds, the kind is in the file name) and ask for a goodwill replacement. A no-show and a lead
 * the broker couldn't reach are handled alike: the same 10–30 min window and ONE weekly maximum of 3 requests.
 *
 * Call order: RPC smc_request_replacement(p_booking_id, p_proof_path, p_kind) (migration smc_20), which also records the
 * answer (No-show / Couldn't reach them) and enforces the window and the weekly maximum server-side. If it is not
 * deployed yet: a no-show falls back to smc_request_noshow_replacement (migration smc_18); and if that is missing too
 * (or the kind is "unreachable"), the answer is written and the request is recorded as a portal event
 * (lead_activities) with the proof path, for Lead Velocity to decide.
 */
export async function sendReplacementProof(qc: QueryClient, brokerId: string, userId: string, b: SmcBooking, file: File, kind: ReplacementKind): Promise<ProofResult> {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${brokerId}/noshow-proof/${b.id}-${kind === "unreachable" ? "unreachable" : "noshow"}-${Date.now()}.${ext}`;
  const up = await smcDb.storage.from(MEDIA_BUCKET).upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
  if (up.error) return { ok: false, reason: "error", msg: `The photo didn't upload: ${errText(up.error)}. Try again.` };
  let res = await smcDb.rpc("smc_request_replacement", { p_booking_id: b.id, p_proof_path: path, p_kind: kind });
  if (res.error && fnMissing(res.error) && kind === "no_show") res = await smcDb.rpc("smc_request_noshow_replacement", { p_booking_id: b.id, p_proof_path: path });
  const { data, error } = res;
  let via: "rpc" | "event" = "rpc";
  if (error) {
    if (!fnMissing(error)) return { ok: false, reason: "error", msg: `Not sent: ${errText(error)}` };
    // No request function deployed yet: write the answer and record the request with its proof for Lead Velocity to decide.
    const existing = qc.getQueryData<Meetings>(qk.meetings(brokerId))?.outcomes[b.id];
    const err = await writeMark(b, kind, { brokerId, userId, existing: existing && !existing.id.startsWith("pending-") ? existing : undefined });
    if (err) return { ok: false, reason: "error", msg: err };
    await portalEvent("outcome.marked", null, { booking_id: b.id, outcome: kind, kind, replacement_request: true, proof_path: path, proof_sent_at: new Date().toISOString() });
    via = "event";
  } else {
    const r = data as { ok?: boolean; reason?: string; used?: number; max?: number } | null;
    if (r && r.ok === false) {
      const reason = (r.reason || "error") as "too_early" | "too_late" | "weekly_max" | "already_requested";
      const msg = reason === "too_late" ? "Too late for a replacement request. It still counts as delivered."
        : reason === "too_early" ? "Please wait 10 minutes after the start time first."
        : reason === "weekly_max" ? `${r.used ?? 3} of ${r.max ?? 3} requests used this week.`
        : "You already asked about this meeting.";
      return { ok: false, reason, msg };
    }
  }
  void qc.invalidateQueries({ queryKey: qk.meetings(brokerId) });
  void qc.invalidateQueries({ queryKey: qk.cycle(brokerId) });
  void qc.invalidateQueries({ queryKey: ["smc", "lead", brokerId, b.lead_id] });
  return { ok: true, via };
}
/** The no-show request, as it was before couldn't-reach could ask too. Prefer sendReplacementProof. */
export const sendNoShowProof = (qc: QueryClient, brokerId: string, userId: string, b: SmcBooking, file: File) => sendReplacementProof(qc, brokerId, userId, b, file, "no_show");

// ---------------------------------------------------------------- lead record (R11)
export interface TimelineEvent { at: string; text: string; strong?: boolean; tone?: "ok" | "warn" }
export interface LeadRecord { lead: (SmcLead & { consent_at?: string | null }) | null; bookings: SmcBooking[]; outcomes: SmcOutcome[]; reps: SmcReplacement[]; acts: { activity_type: string; occurred_at: string; payload: Record<string, unknown> | null }[] }

/** Timeline events the broker may see. Anything else in lead_activities (themes, retired feedback) is never read. */
const ACTS = ["booking_confirmed", "reminder_done", "precall_brief_sent", "missed_you", "reschedule_requested", "opted_out", "noshow_proof_sent", "unreachable_proof_sent", "replacement_approved", "rebooked_after_no_show"];

async function fetchLead(brokerId: string, id: string): Promise<LeadRecord> {
  const [{ data: l }, { data: bk }, { data: os }, { data: rp }, { data: ac }] = await Promise.all([
    smcDb.from("leads").select(`${LEAD_COLS}, consent_at, qualified_at`).eq("id", id).maybeSingle(),
    smcDb.from("bookings").select("*").eq("lead_id", id).eq("broker_id", brokerId).order("starts_at"),
    smcDb.from("outcomes").select("id, booking_id, lead_id, outcome, marked_via, marked_at, auto_marked, unconfirmed, lead_reach_check, dispute_status").eq("lead_id", id).eq("broker_id", brokerId),
    smcDb.from("replacements").select("*").eq("lead_id", id).eq("broker_id", brokerId),
    smcDb.from("lead_activities").select("activity_type, occurred_at, payload").eq("lead_id", id).in("activity_type", ACTS).order("occurred_at"),
  ]);
  return { lead: (l as LeadRecord["lead"]) || null, bookings: (bk as SmcBooking[]) || [], outcomes: (os as SmcOutcome[]) || [], reps: (rp as SmcReplacement[]) || [], acts: (ac as LeadRecord["acts"]) || [] };
}
export const useLeadRecord = (brokerId: string, id: string) => useQuery({ queryKey: qk.lead(brokerId, id), queryFn: () => fetchLead(brokerId, id), staleTime: STALE, enabled: !!id });

const TOUCH: Record<string, string> = { t24h: "24-hour", "24h": "24-hour", t2h: "2-hour", "2h": "2-hour", t10m: "10-minute", "10m": "10-minute", t48h: "48-hour", intro: "intro video" };
/** Newest first. Plain words, each with a time. The delivery moment (clause 5.2) is marked strong. */
export function buildTimeline(r: LeadRecord, fmt: (ts: string) => string, method: (m: string) => string, committed: number | null): TimelineEvent[] {
  const ev: TimelineEvent[] = [];
  const l = r.lead;
  if (!l) return ev;
  if (l.created_at) ev.push({ at: l.created_at, text: "Asked to hear from an adviser (SortMyCover)" });
  if (l.consent_at) ev.push({ at: l.consent_at, text: "Agreed to be contacted and introduced to you" });
  for (const b of r.bookings) {
    ev.push({ at: b.booked_at || b.starts_at, text: `${b.previous_booking_id ? "Moved to" : "Booked"} ${fmt(b.starts_at)}, ${method(b.method)}` });
    if (b.status === "cancelled" && b.cancelled_at) ev.push({ at: b.cancelled_at, text: "Cancelled that time", tone: "warn" });
  }
  const confirms = [
    ...r.bookings.filter((b) => b.confirmed_at).map((b) => b.confirmed_at as string),
    ...r.acts.filter((a) => a.activity_type === "booking_confirmed").map((a) => a.occurred_at),
  ].sort();
  if (confirms[0]) ev.push({ at: confirms[0], strong: true, tone: "ok", text: `Confirmed they'll attend: counts as delivered${committed ? ` (toward your ${committed})` : ""}` });
  const repLead = r.reps.some((x) => x.replacement_lead_id === l.id);
  if (repLead && confirms[0]) ev[ev.length - 1] = { ...ev[ev.length - 1], strong: false, text: "Confirmed they'll attend (a free replacement: does not count toward your number)" };
  for (const a of r.acts) {
    const p = a.payload || {};
    if (a.activity_type === "reminder_done" && p.status === "sent") ev.push({ at: a.occurred_at, text: `${TOUCH[String(p.touch)] ? `${TOUCH[String(p.touch)]} reminder` : "Reminder"} sent to them` });
    if (a.activity_type === "precall_brief_sent") ev.push({ at: a.occurred_at, text: "Pre-call brief sent to you" });
    if (a.activity_type === "missed_you") ev.push({ at: a.occurred_at, text: "We offered them a new time" });
    if (a.activity_type === "reschedule_requested") ev.push({ at: a.occurred_at, text: "They asked to move the meeting" });
    if (a.activity_type === "rebooked_after_no_show") ev.push({ at: a.occurred_at, text: "They booked a new time" });
    if (a.activity_type === "opted_out") ev.push({ at: a.occurred_at, text: "They asked us to stop messaging them", tone: "warn" });
  }
  for (const o of r.outcomes) {
    if (!MARKS.some((m) => m.kind === o.outcome) && o.outcome !== "broker_no_show") continue;
    const who = o.auto_marked ? "Not marked in 24 hours: counted as met them" : `You marked: ${markLabel(o.outcome).toLowerCase()}${o.marked_via === "whatsapp" ? " (on WhatsApp)" : ""}`;
    ev.push({ at: o.marked_at, text: o.outcome === "broker_no_show" ? markLabel(o.outcome) : who, tone: o.outcome === "attended" ? "ok" : undefined });
  }
  for (const x of r.reps.filter((x) => x.lead_id === l.id)) {
    // The wording follows what the request was for: replacements.reason ('no_show' | 'uncontactable').
    const what = replacementKindOf(x) === "unreachable" ? "couldn't reach them" : "no-show";
    ev.push({ at: x.proof_sent_at || x.claimed_at, text: x.proof_path ? `Proof sent (${what}): replacement requested` : "Replacement requested" });
    if (x.status === "approved" || x.status === "fulfilled") ev.push({ at: x.decided_at || x.claimed_at, text: "Replacement request approved (goodwill)", tone: "ok" });
    if (x.status === "rejected") ev.push({ at: x.decided_at || x.claimed_at, text: "Replacement request declined: the lead counts as delivered", tone: "warn" });
  }
  return ev.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

export function useQc() { return useQueryClient(); }
