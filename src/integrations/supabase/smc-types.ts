/**
 * SortMyCover (SMC) hand-written row types for the objects the console and the broker portal read.
 *
 * Source of truth (the contract): supabase/migrations/20261002_smc_02_core.sql … 20261002_smc_07_pass2_rls.sql.
 * NOT generated: the migrations are not applied yet (NH-11 / NH-15), so `supabase gen types` cannot run.
 * When they are applied, regenerate src/integrations/supabase/types.ts and replace these by the generated ones.
 * Column names here are the physical names (writes) or the view names (reads); never invent a column.
 * Extends INV-T03 brokers, INV-T04 leads, INV-T12 admin_documents, INV-T21 report_history, INV-T24 appointments.
 */

export type Uuid = string;
export type Ts = string; // ISO timestamptz
export type DateStr = string; // YYYY-MM-DD

// ---------------------------------------------------------------- enums / unions
export type SmcBrokerStatus =
  | "Active" | "Inactive" // legacy values
  | "invited" | "prospect" | "onboarding" | "onboarded" | "ready_for_go_live"
  | "active" | "paused" | "not_renewed" | "ended";

export type SmcStepKey = "video" | "profile" | "calendar" | "availability" | "agreement" | "card" | "media";
export type SmcStepStatus = "todo" | "doing" | "done" | "skipped" | "defaulted" | "blocked";
export interface SmcStepState { status: SmcStepStatus; done_at?: Ts | null; by?: "broker" | "system" | "jonathan" }
export type SmcOnboardingProgress = Partial<Record<SmcStepKey, SmcStepState>>;

export type SmcMethod = "teams" | "zoom" | "meet" | "whatsapp_call" | "phone";
export type SmcMeetingHours = Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", [string, string][]>>;

/**
 * Agreement clause 8.4 (feedback firewall): the broker tells us only whether the consumer attended and could be
 * contacted. "unreachable" needs migration 20261006_smc_18 (outcomes CHECK). The retired outcome-label, rating and
 * ROI columns stay in the database for history but are deliberately not typed here, so nothing in src/ can write them.
 */
export type SmcOutcomeKind = "attended" | "no_show" | "unreachable" | "rescheduled" | "broker_no_show";

export interface SmcFspCheck {
  status?: "verified" | "blocked" | "pending_manual" | "checking" | string;
  checked_at?: Ts; register_name?: string | null; register_status?: string | null;
  categories?: string[]; name_score?: number; attempts?: number; source?: string; by?: string; reason?: string;
}

// ---------------------------------------------------------------- public tables
/** brokers (INV-T03 extended by smc_02 §2 + smc_06 §1). Only the columns the UI reads/writes. */
export interface SmcBroker {
  id: Uuid; user_id: Uuid;
  firm_name: string | null; contact_person: string | null; phone_number: string | null; email: string | null;
  whatsapp_number: string | null; status: SmcBrokerStatus | null;
  // smc_02
  brand_id: Uuid | null; tier_code: string | null; ref_code: string | null;
  fsp_number: string | null; fsp_verified_at: Ts | null; fsp_check: SmcFspCheck | null;
  calendar_provider: string; ms_tenant_id: string | null; calendar_email: string | null;
  methods_supported: SmcMethod[]; meeting_hours: SmcMeetingHours; timezone: string;
  slot_minutes: number; buffer_minutes: number; min_notice_hours: number; horizon_days: number;
  max_meetings_per_day: number; max_meetings_per_week: number; bookings_paused: boolean;
  routing_on: boolean; headshot_url: string | null; bio_short: string | null; languages: string[];
  years_advising: number | null; intro_card_url: string | null;
  intro_voice_url: Record<string, string> | null; intro_video_url: Record<string, string> | null;
  intro_media_pref: string | null; consent_mode: "named" | "generic";
  onboarding_step: SmcStepKey | null; onboarding_progress: SmcOnboardingProgress;
  explainer_watched_at: Ts | null; approved_live_at: Ts | null; status_changed_at: Ts | null;
  card_autorenew: boolean;
  current_cycle_id: Uuid | null; active: boolean;
  // smc_06 pass 2
  first_login_at: Ts | null; last_seen_at: Ts | null; onboarding_completed_at: Ts | null;
  onboarding_last_progress_at: Ts | null; practice_legal_name: string | null;
  signatory_name: string | null; signatory_role: string | null; fb_page_name: string | null; fb_page_id: string | null;
  calendar_mode: "oauth" | "shared_fallback" | null;
  calendar_status: "ok" | "needs_reconnect" | "blocked_admin_consent" | null;
  calendar_connected_at: Ts | null; next_free_slot_at: Ts | null; billing_ref: number | null; next_tier_code: string | null;
  // smc_13 pass 7 (W20 writes; admin_consent_url when Microsoft answered "admin approval needed")
  calendar_status_detail?: { admin_consent_url?: string; reported?: string; [k: string]: unknown } | null;
  calendar_status_at?: Ts | null; calendar_scopes?: string | null;
  // read-only 4.6 aliases (GENERATED)
  broker_id?: Uuid; adviser_name?: string | null; practice_name?: string | null; adviser_whatsapp?: string | null;
}

/** Columns a broker may write on his own row (smc_brokers_guard blocks the rest). */
export type SmcBrokerSelfUpdate = Partial<Pick<SmcBroker,
  | "firm_name" | "contact_person" | "whatsapp_number" | "email" | "fsp_number" | "headshot_url" | "bio_short"
  | "languages" | "years_advising" | "practice_legal_name" | "signatory_name" | "signatory_role" | "fb_page_name"
  | "fb_page_id" | "meeting_hours" | "methods_supported" | "max_meetings_per_day" | "max_meetings_per_week"
  | "slot_minutes" | "buffer_minutes" | "min_notice_hours" | "horizon_days" | "bookings_paused"
  | "intro_media_pref">>;

export interface SmcPricing {
  tier_code: string; brand_id: Uuid | null; name: string; price_zar: number; committed_leads: number;
  /** LEGACY (0.1 per-cycle cap): kept for history, drives nothing. Replacements are max 3 requests per Calendar Week (clause 7.2). */
  replacement_cap_cycle: number; media_share_zar: number; vat_rate: number | null; sort_order: number;
  active_from: DateStr; active_to: DateStr | null; ref_code?: string | null;
}

export interface SmcCycle {
  id: Uuid; broker_id: Uuid; brand_id: Uuid; tier_code: string; cycle_no: number; previous_cycle_id: Uuid | null;
  /** replacement_cap: LEGACY per-cycle cap, drives nothing (see SmcPricing.replacement_cap_cycle). */
  price_zar: number; committed_leads: number; replacement_cap: number; media_share_zar: number;
  starts_at: Ts | null; ends_at: Ts | null; extended_until: Ts | null;
  status: "scheduled" | "active" | "extended" | "closed" | "not_renewed";
  renewal_offer_sent_at: Ts | null; renewal_decision: string | null; shortfall_leads: number | null;
  shortfall_credit_zar: number | null; invoice_id?: Uuid | null;
}

/** leads (INV-T04 extended). Broker sees own rows via RLS; full names only inside the portal (portal rule 6). */
export interface SmcLead {
  id: Uuid; broker_id: Uuid | null; first_name: string | null; last_name: string | null; email: string | null; phone: string;
  brand_id: Uuid | null; cycle_id: Uuid | null; tier_code: string | null; origin: string | null;
  campaign_id: string | null; adset_id: string | null; ad_id: string | null;
  verified_at: Ts | null; qualified_at: Ts | null; age_band: "lt35" | "35_44" | "45_50" | "51plus" | null;
  budget_band: "lt750" | "750_1250" | "1250plus" | "1250_1499" | "1500_plus" | null; premium_1500?: boolean; bond: boolean | null; dependants: boolean | null;
  work_cover: boolean | null; method_pref: SmcMethod | null; call_number: string | null;
  call_number_line_type: string | null; best_time: string | null; language: string | null;
  stage: string | null; stage_entered_at: Ts | null; health_flag: boolean; created_at: Ts;
}

/** View public.bookings over appointments (smc_06 §7). */
export interface SmcBooking {
  id: Uuid; brand_id: Uuid; broker_id: Uuid; lead_id: Uuid; cycle_id: Uuid | null;
  starts_at: Ts; ends_at: Ts | null; method: SmcMethod; status: "booked" | "confirmed" | "rescheduled" | "cancelled" | "attended" | "no_show";
  calendar_provider: string | null; graph_event_id: string | null; join_url: string | null; ics_url: string | null;
  call_number: string | null; source: string | null; booked_at: Ts | null; confirmed_at: Ts | null;
  cancelled_at: Ts | null; reschedule_count: number; previous_booking_id?: Uuid | null; intro_arm: string | null; late_booking: boolean;
}

export interface SmcOutcome {
  id: Uuid; booking_id: Uuid; lead_id: Uuid; broker_id: Uuid; cycle_id: Uuid | null; brand_id: Uuid;
  outcome: SmcOutcomeKind; lead_reach_check: "yes" | "no" | "none" | null;
  marked_by: Uuid | null; marked_via: "whatsapp" | "portal" | "console" | "auto" | null; marked_at: Ts;
  auto_marked: boolean; unconfirmed: boolean; dispute_status: "none" | "open" | "upheld" | "rejected";
  replacement_eligible: boolean;
}
export type SmcOutcomeInsert = Pick<SmcOutcome, "booking_id" | "lead_id" | "broker_id" | "brand_id" | "outcome"> &
  Partial<Pick<SmcOutcome, "cycle_id" | "marked_by" | "marked_via" | "unconfirmed" | "auto_marked">>;

export interface SmcReplacement {
  id: Uuid; lead_id: Uuid; outcome_id: Uuid | null; cycle_id: Uuid; broker_id: Uuid;
  reason: "no_show" | "uncontactable" | "disqualified"; status: "due" | "disputed" | "approved" | "rejected" | "fulfilled";
  claimed_at: Ts; dispute_window_ends_at: Ts; cap_position: number | null; over_cap: boolean;
  decided_at?: Ts | null; replacement_lead_id?: Uuid | null;
  /**
   * Portal / WhatsApp requests (Schedule 3): reason 'no_show' + 'schedule3_proof' for a no-show, reason 'uncontactable'
   * + 'schedule3_proof_unreachable' for a lead the broker couldn't reach. cap_position / over_cap count the shared
   * Calendar Week (max 3, both kinds together), not the cycle.
   */
  reason_code?: string | null;
  /** migration 20261006_smc_18 (Schedule 3); undefined until applied. */
  booking_id?: Uuid | null; missed_start_at?: Ts | null; proof_path?: string | null; proof_sent_at?: Ts | null;
}

export interface SmcInvoice {
  id: Uuid; invoice_no: string; kind: "cycle" | "upgrade_prorata" | "credit_note" | "add_on"; broker_id: Uuid;
  cycle_id: Uuid | null; tier_code: string | null; period_start: DateStr | null; period_end: DateStr | null;
  amount_excl_vat: number; vat_zar: number | null; total_zar: number; credit_applied_zar: number; reference: string;
  method: "instant_eft" | "manual_eft" | "card" | null; status: "draft" | "issued" | "paid" | "void" | "credited";
  issued_at: Ts | null; due_at: Ts | null; paid_at: Ts | null; document_id: Uuid | null;
}

/** admin_documents (INV-T12) e-sign columns (smc_02 §12). */
export interface SmcAdminDocument {
  id: Uuid; name: string; description: string | null; file_path: string | null; file_type: string | null;
  category: string | null; content_data: Record<string, unknown> | null; created_at: Ts;
  brand_id: Uuid | null; broker_id: Uuid | null; kind: string | null; version: string | null;
  doc_sha256: string | null; signed_at: Ts | null; signed_by_name: string | null;
  /** smc_08 (I-30b/c): IP captured server-side from x-forwarded-for; acceptances ticked at signing. */
  signer_ip?: string | null; signer_ip_source?: "x-forwarded-for" | "x-real-ip" | "none" | null;
  acceptances?: SmcAgreementAcceptances | null;
}
/** admin_documents.acceptances (smc_08 I-30c). Keys are the agreement's tick-boxes; extra keys allowed. */
export interface SmcAgreementAcceptances { clause_11_2?: boolean; annex_1?: boolean; no_page?: boolean; version?: string; [k: string]: unknown }

export interface SmcBrokerMedia {
  id: Uuid; broker_id: Uuid; brand_id: Uuid | null; kind: "voice" | "video" | "card" | "headshot"; language: string;
  version: number; url: string | null; thumbnail_url: string | null; script_text: string | null;
  approved_at: Ts | null; is_current: boolean; created_at: Ts;
  state: "processing" | "ready" | "rejected" | "approved" | "superseded";
}

/** ad_metrics (smc_03 §1). One row per ad per day per placement. Admin only. */
export interface SmcAdMetric {
  id: Uuid; date: DateStr; brand_id: Uuid; campaign_id: string | null; campaign_name: string | null;
  adset_id: string | null; adset_name: string | null; ad_id: string; ad_name: string | null;
  concept: string | null; angle: string | null; format: string | null; placement: string;
  spend_zar: number; impressions: number; reach: number | null; clicks: number; link_clicks: number | null;
  frequency: number | null; hook_rate: number | null; hold_rate: number | null;
  leads_raw: number; qualified: number; verified: number; booked: number; attended: number; good_fit: number;
  quality_index: number | null; quality_n: number; nofit_rate: number | null;
  cpl: number | null; cost_per_qualified: number | null; cost_per_attended: number | null; cost_per_good_fit: number | null;
  synced_at: Ts;
}

/** ad_objects cache (smc_06 §14). Status/budget shown next to metrics; written only by W21. */
export interface SmcAdObject {
  id: string; level: "campaign" | "adset" | "ad"; brand_id: Uuid; campaign_id: string | null; adset_id: string | null;
  name: string; status: string | null; effective_status: string | null; daily_budget_zar: number | null;
  last_budget_change_at: Ts | null; fetched_at: Ts;
}

/** View public.reports over report_history (smc_06 §9). payload_json = broker_report/1 (automation/W14-broker.md). */
export interface SmcReport {
  id: Uuid; brand_id: Uuid; broker_id: Uuid; cycle_id: Uuid | null; week: DateStr | null;
  report_kind: "broker_weekly" | "midcycle" | "cycle_end" | "lv_weekly" | null;
  payload_json: SmcReportPayload | null; pdf_url: string | null; sent_wa_at: Ts | null; sent_email_at: Ts | null;
  opened_portal_at: Ts | null; opened_wa_at: Ts | null; ask: string | null; ask_done_at: Ts | null;
  judge_passed: boolean | null; status: string; created_at: Ts; edition: "weekly" | "midcycle" | "cycle_end" | null;
}

export interface SmcFig { v: number | null; target?: number | null; last?: number | null; [k: string]: unknown }
export interface SmcReportPayload {
  schema?: string; edition?: string; week?: string; week_of_cycle?: number; weeks_in_cycle?: number;
  broker?: { id: Uuid; first_name: string; practice: string; fsp: string };
  cycle?: { id: Uuid; label: string; tier: string; day: number; days_total: number; starts: DateStr; ends: DateStr;
    renewal_offer_on: DateStr; extension?: { active: boolean; until: DateStr | null } };
  s1_one_line?: string;
  s2_progress?: { delivered: SmcFig & { committed?: number }; verified?: SmcFig; booked: SmcFig & { rate?: number };
    attended: SmcFig; show_rate: SmcFig & { light?: string };
    replacements: { used: number; cap: number; last_used?: number; light?: string }; days_left: number };
  s3_meetings?: {
    last_week: { lead_ref?: string; first_name: string; initial: string; full_name?: string; when: Ts; method: string;
      outcome: string | null; unconfirmed?: boolean; booking_id?: Uuid }[];
    next_week: { first_name: string; initial: string; when: Ts; method: string }[];
    todos: { unmarked: { booking_id: Uuid; first_name: string; initial: string }[];
      not_reached: { first_name: string; initial: string }[] };
  };
  /** Only the lead-side parts are read (themes, lead_pulse). Rating / outcome-mix keys are retired (clause 8.4). */
  s4_quality?: { themes?: { text: string; count: number; of: number }[];
    /** I-43c: per cycle, steps of 5 answers, no week-on-week; shown=false under 5 answers. */
    lead_pulse?: { shown: boolean; n: number | null; up: number | null; text: string } };
  s5_notice?: string[];
  s7_ask?: { code: string; text: string; button: string; deep_link: string } | null;
  s8_cycle?: { line: string };
}

/** View public.v_cycle_progress (smc_02 §15). */
export interface SmcCycleProgress {
  cycle_id: Uuid; broker_id: Uuid; brand_id: Uuid; tier_code: string; cycle_no: number; status: SmcCycle["status"];
  starts_at: Ts | null; ends_at: Ts | null; extended_until: Ts | null; committed: number; verified: number;
  /** replacements_used / replacement_cap are the LEGACY per-cycle count and cap: history only, the portal does not show them. */
  booked: number; attended: number; replacements_used: number; replacement_cap: number; days_left: number;
  /** migration 20261006_smc_18: clause 5.2 delivered + weekly replacement requests. Undefined until applied. */
  delivered?: number; replacement_requests_this_week?: number; replacement_weekly_max?: number;
}

// ---------------------------------------------------------------- ops schema (admin only; NH-22 exposes `ops`)
export interface OpsPulse {
  id: Uuid; date: DateStr; status: "green" | "amber" | "red"; working: string | null; not_working: string | null;
  business_line: string | null; actions: { id?: Uuid; title?: string }[]; compliance: Record<string, unknown>;
  build: Record<string, unknown>; quiet: boolean | null; card_markdown: string | null; created_at: Ts;
}

export type OpsFaculty = "media" | "page_flow" | "conversation" | "nurture_show" | "comments_dms" | "broker"
  | "billing" | "compliance" | "infra_cost" | "brand_search" | "build";

export interface OpsProposal {
  id: Uuid; source: "advisor" | "manual" | "kill_rule" | "pricing" | "routing" | "judge"; faculty: OpsFaculty;
  title: string; metric: string | null; number_at_decision: number | null; forecast: string | null; cost_zar: number | null;
  grade: string | null; test: string | null; owner_agent: string | null; pulse_id: Uuid | null; task_id: string | null;
  status: "proposed" | "approved" | "snoozed" | "declined" | "done" | "checked";
  decided_by: Uuid | null; decided_at: Ts | null; decline_reason: string | null; snooze_until: DateStr | null;
  check_date: DateStr | null; pulse_date: DateStr | null; mechanism: string | null; kill_rule: string | null;
  evidence: string | null; verdict: string | null; created_at: Ts;
}

export interface OpsSignal {
  id: Uuid; faculty: OpsFaculty | null; metric: string; value: number | null; limit_value: number | null; run: string | null;
  cause: string | null; owner: string | null; broker_id: Uuid | null; detected_at: Ts; resolved_at: Ts | null;
  signal_key: string | null; rule: string | null; side: string | null; burning: boolean | null;
}

export interface OpsNotificationInsert {
  kind: "approval" | "confirm" | "action" | "ads_audit" | "go_live" | "portal" | string;
  recipient: string; channel?: "whatsapp" | "email" | "console" | "voice"; ref_table?: string; ref_id?: string;
  dedupe_key?: string; payload?: Record<string, unknown>; severity?: "red" | "amber" | "green" | "info";
  status?: string; source?: string; what?: string; proposal_id?: Uuid;
}

export interface OpsQualityGrade {
  id: Uuid; graded_at: Ts; sample_ref: string; faculty: string | null; rule: string;
  severity: "info" | "minor" | "major" | "critical" | "high" | "medium" | "low"; passed: boolean; note: string | null;
  exact_text: string | null; owner_agent: string | null;
}

export interface OpsJudgeRun { id: Uuid; date: DateStr; rubric: string; sampled: number | null; passed: number | null;
  failed: number | null; critical: number | null; status: string | null }

/** View ops.build_state_latest (smc_06 §17). */
export interface OpsBuildStateLatest {
  commits_24h: number; tests_failing: number; tests_failed_twice: number; gates_oldest_hours: number | null;
  gates_waiting: number; tasks_total: number | null; tasks_by_status: Record<string, number>; captured_at: Ts; source: string;
}

// ---------------------------------------------------------------- facts (read through RPCs only; facts is not exposed)
/** Row of public.smc_watchlist_tiles() — wraps facts.v_watchlist_1..7 (analytics/watchlist.sql) or facts.v_watchlist. */
export interface WatchlistTile {
  metric_no: number; plain_name: string; value: number | null; value_label: string | null; target: number | null;
  unit: string | null; n: number | null; value_prev: number | null; status: "green" | "amber" | "red" | "grey" | null;
  trend: { d: DateStr; v: number | null }[] | null; look_out: string | null;
}

// ---------------------------------------------------------------- n8n webhook contracts (console)
/** Ask the data (analytics/ask-the-data.md). Answer shape the n8n `ask` webhook returns. */
export interface AskAnswer {
  ok: boolean; headline?: string; comparison?: string; how?: { sql?: string; explanation?: string };
  caveat?: string; next_question?: string; n_min?: number | null; rows?: Record<string, unknown>[];
  refused_reason?: string | null;
}

/** POST /ads-confirm response (automation/ads/CONSOLE-ADS-API.md §2). */
export interface AdsConfirmResponse {
  ok: boolean; confirm_token?: string; expires_at?: Ts;
  preview?: Record<string, unknown>; code?: string; message?: string; retry_after_ms?: number;
}

// ---------------------------------------------------------------- smc_08 (pass 3) RPCs
/** Args of public.smc_sign_document — 6-arg form (smc_08). The 5-arg form still works; p_signer_ip is ignored (IP is server-side). */
export interface SmcSignDocumentArgs {
  p_document_id: Uuid; p_signed_by_name: string; p_doc_sha256: string; p_signer_ip: null; p_user_agent: string;
  p_acceptances?: SmcAgreementAcceptances | null;
}

/** Row of public.smc_faculty_tiles(p_days = 28, p_include_synthetic = false) — admin only, over facts.pulse_daily. */
export interface FacultyTile {
  faculty: OpsFaculty | string; metric: string; date: DateStr; value: number | null; value_7d: number | null;
  numerator_7d: number | null; denominator_7d: number | null; n: number | null; value_prev: number | null;
  trend: { d: DateStr; v: number | null }[] | null;
}

/** ops.watchlist_targets (smc_08 §4) via smc_console_watchlist_targets() / smc_console_set_watchlist_target(). */
export interface OpsWatchlistTarget {
  metric_no: number; metric_code: string; target: number | null; stretch_target: number | null; floor: number | null;
  target_rule: "<=" | ">="; unit: string; source: string; updated_by: Uuid | null; created_at: Ts; updated_at: Ts;
}

/**
 * NH-22 default: admin RPCs over ops.* (smc_08 §10) so `ops` need not be an exposed API schema.
 * Each checks has_role('admin') inside and returns the ops row types above.
 */
export interface SmcConsoleRpcs {
  smc_console_pulses: { args: { p_limit?: number }; returns: OpsPulse[] };
  smc_console_signals_open: { args: { p_limit?: number }; returns: OpsSignal[] };
  smc_console_quality_grades: { args: { p_hours?: number; p_limit?: number }; returns: OpsQualityGrade[] };
  smc_console_judge_runs: { args: { p_limit?: number }; returns: OpsJudgeRun[] };
  smc_console_build_state: { args: Record<string, never>; returns: OpsBuildStateLatest[] };
  smc_console_proposals: { args: { p_pulse_date?: DateStr | null }; returns: OpsProposal[] };
  smc_console_decide_proposal: { args: { p_proposal_id: Uuid; p_decision: "approve" | "snooze" | "decline"; p_reason?: string | null }; returns: OpsProposal };
  smc_console_proposal_from_grade: { args: { p_grade_id: Uuid }; returns: OpsProposal };
  smc_console_watchlist_targets: { args: Record<string, never>; returns: OpsWatchlistTarget[] };
  smc_console_set_watchlist_target: { args: { p_metric_no: number; p_target: number | null; p_stretch_target?: number | null; p_floor?: number | null; p_reason?: string | null }; returns: OpsWatchlistTarget };
  smc_faculty_tiles: { args: { p_days?: number; p_include_synthetic?: boolean }; returns: FacultyTile[] };
}

/** public.brands (smc_02 §1 + smc_06 §11). One row per consumer brand (SMC, CK); *_ref columns hold secret NAMES only. */
export interface SmcBrandHandles { fb?: string; ig?: string; tiktok?: string; yt?: string; li?: string; x?: string; fb_standby_page_id?: string; [k: string]: unknown }
export interface SmcBrand {
  id: Uuid; code: string; name: string; language: string; domain: string | null; staging_url: string | null;
  business_id: string | null; page_id: string | null; ig_user_id: string | null; waba_id: string | null;
  phone_number_id: string | null; standby_phone_number_id: string | null; ad_account_id: string | null; standby_ad_account_id: string | null;
  pixel_id: string | null; dataset_id: string | null; app_id: string | null; system_user_token_ref: string | null;
  booking_flow_id: string | null; flow_public_key_ref: string | null; handles: SmcBrandHandles; verification_status: string | null;
  disclosure_text: string | null; brand_kit_url: string | null; booking_ui: "list" | "flow";
  /** W27 health (read-only in the console) */
  page_status: string | null; ig_status: string | null; bv_status: string | null; ad_account_status: string | null; waba_quality: string | null;
  template_status: Record<string, unknown>; emq: number | null; health_checked_at: Ts | null; health_alerts: unknown[]; insights_last_fetched_at: Ts | null;
  is_active: boolean; status: "active" | "held"; created_at: Ts; updated_at: Ts;
}
