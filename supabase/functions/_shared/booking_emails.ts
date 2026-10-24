// book-appointment recipient split (Jono's decision A, 16 Oct 2026): the CLIENT gets a confirmation only; the BROKER / internal
// recipient gets the internal notes. Pure: returns the list of messages to send, so tests can assert who receives what.
import { esc, grad, lvEmail, lvText, para } from "./lv_email.ts";
import { appointmentBookedEmail, type BuiltEmail } from "./lv_emails.ts";
import { isSmcLead, SMC_FROM, SMC_REPLY_TO, smcBookingConfirmationEmail } from "./smc_email.ts";

export const LV_BOOKING_FROM = "Ayanda <appointments@leadvelocity.co.za>";

export interface BookingInput {
  lead: { first_name?: string | null; last_name?: string | null; email?: string | null; phone?: string | null; brand_id?: string | null } | null;
  broker: { contact_person?: string | null; firm_name?: string | null; calendar_email?: string | null } | null;
  /** True for a SortMyCover lead (leads.brand_id set). Falls back to lead.brand_id when omitted. */
  isSmc?: boolean;
  appointmentTime: string;
  notes?: string | null;
  /** Internal fallback address when the broker has no calendar email. */
  adminEmail: string;
}

export interface OutgoingEmail extends BuiltEmail { from: string; to: string[]; reply_to?: string; audience: "client" | "internal" }

export function formatBookingTime(appointmentTime: string): string {
  return new Date(appointmentTime).toLocaleString("en-ZA", {
    timeZone: "Africa/Johannesburg", weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

/** Lead Velocity (non-SortMyCover) client confirmation: same dark layout as every other Lead Velocity email, no internal fields. */
export function lvBookingConfirmationEmail(d: { firstName?: string | null; brokerName?: string | null; whenText: string }): BuiltEmail {
  const first = (d.firstName ?? "").trim() || "there";
  const who = (d.brokerName ?? "").trim();
  const line = who ? `${who} will meet you on ${d.whenText} (SAST).` : `Your appointment is on ${d.whenText} (SAST).`;
  const html = lvEmail({
    preheader: line, eyebrow: "Booking confirmed", title: `Your appointment is ${grad("booked")}`,
    body: [para(esc(`Hi ${first},`)), para(esc(line)), para("Need to change the time? Reply to this email and we will sort it out.")], signoff: null,
  });
  const text = lvText({ title: "Your appointment is booked", parts: [`Hi ${first},`, line, "Need to change the time? Reply to this email and we will sort it out."], signoff: null });
  return { subject: `Booked: your appointment on ${d.whenText}`, html, text };
}

export function planBookingEmails(i: BookingInput): OutgoingEmail[] {
  const whenText = formatBookingTime(i.appointmentTime);
  const leadName = i.lead ? `${i.lead.first_name ?? ""} ${i.lead.last_name ?? ""}`.trim() : "Unknown Lead";
  const brokerName = i.broker?.contact_person || "Your Broker";
  const firmName = i.broker?.firm_name || "Lead Velocity";
  const internalTo = i.broker?.calendar_email || i.adminEmail;
  const out: OutgoingEmail[] = [];

  // Internal: the broker only. Carries the phone number and call notes, so it is never addressed to the client.
  const internal = appointmentBookedEmail({ leadName: leadName || "Unknown Lead", phone: i.lead?.phone, brokerName, firmName, whenText, notes: i.notes });
  out.push({ ...internal, from: LV_BOOKING_FROM, to: [internalTo], audience: "internal" });

  // Client: confirmation only, and never to the internal address if the lead's email happens to match it.
  const clientEmail = (i.lead?.email ?? "").trim();
  if (clientEmail && clientEmail.toLowerCase() !== internalTo.toLowerCase()) {
    const args = { firstName: i.lead?.first_name, brokerName: i.broker?.contact_person, whenText };
    if (i.isSmc ?? isSmcLead(i.lead)) out.push({ ...smcBookingConfirmationEmail(args), from: SMC_FROM, reply_to: SMC_REPLY_TO, to: [clientEmail], audience: "client" });
    else out.push({ ...lvBookingConfirmationEmail(args), from: LV_BOOKING_FROM, to: [clientEmail], audience: "client" });
  }
  return out;
}
