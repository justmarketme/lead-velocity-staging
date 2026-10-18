// Sample data for every email in lv_emails.ts / appointment_alloc.ts. ONE source for the Deno tests (lv_emails.test.ts) and the
// admin-only email-preview function, so what we test is exactly what Jono sees in his inbox.
//
// buildSamples({ inject }) appends `inject` to every caller-supplied text field: the tests pass a hostile string to prove escaping.
import {
  adminInviteEmail, appointmentBookedEmail, brokerInviteEmail, bulkCommunicationEmail, communicationEmail, documentSharedEmail,
  messageNotificationEmail, onboardingConfirmationEmail, onboardingInternalEmail, scheduledReportEmail, slaAlertEmail, type BuiltEmail,
} from "./lv_emails.ts";
import { brokerInvite, clientConfirmation, type InviteContext } from "./appointment_alloc.ts";

export interface Sample {
  /** Stable id (preview "only" filter). */
  id: string;
  /** What it is and which function sends it. */
  label: string;
  /** false = deliberately NOT on the Lead Velocity layout (SortMyCover client email), so the layout tests skip it. */
  lv: boolean;
  build: () => BuiltEmail;
}

export function buildSamples(opts: { inject?: string } = {}): Sample[] {
  const x = opts.inject ?? "";
  const ctx: InviteContext = {
    appointmentId: "0b3f6a52-7a1e-4c55-9d7e-1a2b3c4d5e6f",
    start: "2026-10-15T08:00:00Z", end: "2026-10-15T08:30:00Z", method: "phone", sequence: 1,
    clientFirst: `Thandi${x}`, clientLast: "Mokoena", clientPhone: "+27821234567", clientEmail: "thandi@example.com",
    brokerName: `Sipho Dlamini${x}`, brokerEmail: "sipho@example.com", joinUrl: null,
    leadSummary: `age 35-44, budget R750-R1,499/month, interested in life cover, A-tier${x}`,
  };
  const start = new Date("2026-10-07T08:00:00Z"), end = new Date("2026-10-14T08:00:00Z"), generatedAt = new Date("2026-10-14T06:00:00Z");
  const link = "https://leadvelocity.co.za/broker/set-password?token=abc123&type=invite";
  return [
    { id: "admin-invite", label: "send-admin-invite", lv: true, build: () => adminInviteEmail({ inviteLink: link, expiresAt: "2026-10-21T10:00:00Z" }) },
    { id: "broker-invite-referral", label: "send-broker-invite (referral portal)", lv: true,
      build: () => brokerInviteEmail({ brokerName: `Sipho Dlamini${x}`, inviteLink: link, expiresAt: "2026-10-21T10:00:00Z", portalType: "referral" }) },
    { id: "broker-invite-marketing", label: "send-broker-invite (Elite Marketing Portal)", lv: true,
      build: () => brokerInviteEmail({ brokerName: `Naledi Khumalo${x}`, inviteLink: link, expiresAt: "2026-10-21T10:00:00Z", portalType: "marketing" }) },
    { id: "communication-text", label: "send-communication (message typed in the CRM)", lv: true,
      build: () => communicationEmail({ subject: `Following up on your quote${x}`, content: `Hi Thandi,\n\nThanks for your time today. Your quote is ready: https://leadvelocity.co.za/quotes/123.\n\nReply here with any questions.${x}` }) },
    { id: "communication-html", label: "send-communication (invoice with attachment, HTML body + text signature)", lv: true,
      build: () => communicationEmail({
        subject: `Invoice: INV-0042 from Lead Velocity${x}`,
        content: `<p>Hi Sipho${x},</p><p>Please find the invoice INV-0042 attached to this email.</p><p>Total Due: R12,500</p><p>Due Date: 2026-10-31</p><p>Thank you for your business.</p><br/>\n\n─────────────────────────────────────\n\nLead Velocity Accounts\nFinance Department | Lead Velocity\n\nT. +27 10 976 5618\n210 Amarand Avenue, Pegasus Building 1\nMenlyn Maine, Pretoria, 0184\n\nE. howzit@leadvelocity.co.za | leadvelocity.co.za\nf. LeadVelocitySA  x. @LeadVelocitySA  li. lead-velocity\n\n─────────────────────────────────────\n`,
      }) },
    { id: "bulk-communication", label: "send-bulk-communication", lv: true,
      build: () => bulkCommunicationEmail({ subject: `A quick update from Lead Velocity${x}`, message: `Hi Thandi,\n\nWe have new leads in your area this week.\nReply to this email if you would like them.${x}` }) },
    { id: "document-shared", label: "send-document-notification", lv: true,
      build: () => documentSharedEmail({ documentName: `Signed agreement.pdf${x}`, documentCategory: `contracts${x}`, recipientName: `Sipho${x}` }) },
    { id: "message-notification", label: "send-message-notification", lv: true,
      build: () => messageNotificationEmail({ leadName: `Thandi Mokoena${x}`, senderRole: "admin", recipientName: `Sipho${x}`, message: `Hi Sipho, the client asked for a call after 17:00 tomorrow.\nPlease confirm you can take it.${x}` }) },
    { id: "onboarding-confirmation", label: "send-onboarding-notification (to the broker)", lv: true,
      build: () => onboardingConfirmationEmail({ fullName: `Sipho Dlamini${x}`, preferredCallTime: `Weekdays after 16:00${x}` }) },
    { id: "onboarding-internal", label: "send-onboarding-notification (internal alert to howzit@)", lv: true,
      build: () => onboardingInternalEmail({
        full_name: `Sipho Dlamini${x}`, firm_name: `Dlamini Financial${x}`, email: "sipho@example.com", phone_number: "+27821234567", whatsapp_number: "+27821234567",
        preferred_call_time: `Weekdays after 16:00${x}`, product_focus: [`Life cover${x}`, "Funeral"], geographic_focus_clarity: `Gauteng, Pretoria East${x}`,
        timeline_to_start: "Within 2 weeks", monthly_lead_spend: "R5,000 - R10,000", desired_leads_weekly: "20", created_at: "2026-10-14T07:15:00Z",
      }) },
    { id: "sla-critical", label: "send-sla-alert (critical)", lv: true,
      build: () => slaAlertEmail({ channel: `whatsapp${x}`, severity: "critical", responseSeconds: 5400, thresholdSeconds: 3600, recipientType: `lead${x}`, recipientName: `Thandi Mokoena${x}` }) },
    { id: "sla-warning", label: "send-sla-alert (warning)", lv: true,
      build: () => slaAlertEmail({ channel: "email", severity: "warning", responseSeconds: 2000, thresholdSeconds: 1800, recipientType: "broker" }) },
    { id: "scheduled-report", label: "send-scheduled-report (all sections)", lv: true,
      build: () => scheduledReportEmail({
        name: `Weekly admin summary${x}`, frequency: "weekly", start, end, generatedAt,
        analytics: {
          summary: { total: 142, outbound: 96, inbound: 46, success_rate: 87 },
          channels: { email: { total: 60, successful: 55 }, whatsapp: { total: 50, successful: 38 }, sms: { total: 32, successful: 21 } },
          response_times: { count: 30, average: 2700, min: 120, max: 14400 },
        },
      }) },
    { id: "appointment-booked", label: "book-appointment (Ayanda)", lv: true,
      build: () => appointmentBookedEmail({
        leadName: `Thandi Mokoena${x}`, phone: "+27821234567", brokerName: `Sipho Dlamini${x}`, firmName: `Dlamini Financial${x}`,
        whenText: "Thursday, 15 October 2026 at 10:00", notes: `Wants life cover for two kids. Prefers WhatsApp.${x}`,
      }) },
    { id: "alloc-broker-invite", label: "appointment-allocation (invite to the broker)", lv: true,
      build: () => { const b = brokerInvite(ctx, { inviteClient: true }); return { subject: b.subject, html: b.html, text: b.text }; } },
    { id: "alloc-broker-cancel", label: "appointment-allocation (cancel to the broker)", lv: true,
      build: () => { const b = brokerInvite(ctx, { inviteClient: false, cancel: true }); return { subject: b.subject, html: b.html, text: b.text }; } },
    { id: "alloc-client-confirmation", label: "appointment-allocation (SortMyCover CLIENT confirmation: unchanged, flagged)", lv: false,
      build: () => { const c = clientConfirmation(ctx); return { subject: c.subject, html: c.html, text: c.text }; } },
  ];
}
