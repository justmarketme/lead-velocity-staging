// SortMyCover voice calls (Lindi, smc-voice edge function) as shown on the CRM lead view.
// Reads communications rows written by supabase/functions/smc-voice: calls (metadata.kind 'smc_voice_call')
// and automatic callbacks for missed calls (metadata.kind 'smc_voice_callback').

export type SmcVoiceOutcome =
  | "booked" | "whatsapp_handoff" | "callback_requested" | "out_of_criteria" | "no_answer" | "missed" | "info_only";

export const SMC_VOICE_OUTCOME_LABELS: Record<SmcVoiceOutcome, string> = {
  booked: "Booked",
  whatsapp_handoff: "Moved to WhatsApp",
  callback_requested: "Asked for a call-back",
  out_of_criteria: "Outside criteria",
  no_answer: "No answer",
  missed: "Missed call",
  info_only: "Questions only",
};

export type SmcCallbackStatus = "pending" | "answered" | "no_answer" | "cancelled" | "dial_failed";

export const SMC_CALLBACK_STATUS_LABELS: Record<SmcCallbackStatus, string> = {
  pending: "Pending",
  answered: "Answered",
  no_answer: "No answer",
  cancelled: "Cancelled",
  dial_failed: "Dial failed",
};

export type SmcVoiceView =
  | { kind: "call"; outcome: SmcVoiceOutcome | null; outcomeLabel: string | null; summary: string; callNotes: string; transcript: string }
  | { kind: "callback"; status: SmcCallbackStatus; statusLabel: string; dueSast: string | null; reason: string | null };

type Row = { channel?: string | null; workflow?: string | null; content?: string | null; metadata?: unknown };

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Callback lifecycle from smc-voice: scheduled -> dialing -> dialed -> done (outcome) | cancelled | dial_failed. */
export function callbackStatus(meta: Record<string, unknown>): SmcCallbackStatus {
  if (meta.state === "cancelled") return "cancelled";
  if (meta.outcome === "answered") return "answered";
  if (meta.outcome === "no_answer") return "no_answer";
  if (meta.state === "dial_failed") return "dial_failed";
  return "pending";
}

/** Null for anything that is not an SMC voice call or callback. */
export function smcVoiceView(row: Row): SmcVoiceView | null {
  const meta = (row.metadata && typeof row.metadata === "object" ? row.metadata : {}) as Record<string, unknown>;
  if (meta.kind === "smc_voice_callback") {
    const s = callbackStatus(meta);
    return { kind: "callback", status: s, statusLabel: SMC_CALLBACK_STATUS_LABELS[s], dueSast: str(meta.scheduled_for_sast) || null, reason: str(meta.reason) || null };
  }
  // smc-voice also writes WhatsApp handoff rows (workflow 'smc-voice', channel 'whatsapp'): calls only here.
  if (meta.kind !== "smc_voice_call" && !(row.workflow === "smc-voice" && row.channel === "call")) return null;
  const raw = str(meta.outcome);
  const outcome = Object.prototype.hasOwnProperty.call(SMC_VOICE_OUTCOME_LABELS, raw) ? (raw as SmcVoiceOutcome) : null;
  return {
    kind: "call",
    outcome,
    outcomeLabel: outcome ? SMC_VOICE_OUTCOME_LABELS[outcome] : null,
    summary: str(meta.summary),
    callNotes: str(meta.call_notes),
    transcript: str(row.content),
  };
}
