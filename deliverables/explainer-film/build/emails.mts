// Renders the real SortMyCover client emails (supabase/functions/smc-client-email/render.ts) with sample data for the film.
// node build/emails.mts  -> scenes/assets/content/email-{booked,cancelled}.html
import { writeFileSync } from 'node:fs';
import { render, validate } from '../../../supabase/functions/smc-client-email/render.ts';

const base = { to: 'thabo.m@gmail.com', lead_first_name: 'Thabo', slot_start: '2026-10-20T10:00:00+02:00', slot_end: '2026-10-20T10:30:00+02:00',
  method: 'phone', adviser_name: 'Mark Weston', practice_name: 'Oracle Private Wealth', fsp_number: '28418', booking_id: 'bk-demo-0001', calendar_invite: 'attached' };
for (const [kind, file] of [['booking_confirmed', 'email-booked.html'], ['booking_cancelled', 'email-cancelled.html']] as const) {
  const v = validate({ ...base, kind, idempotency_key: `film:${kind}` });
  if (!v.ok) throw new Error(kind + ': ' + v.errors.join(', '));
  const r: any = render(v.input, Date.parse('2026-10-18T08:45:00+02:00'));
  writeFileSync(new URL(`../scenes/assets/content/${file}`, import.meta.url), r.html);
  console.log(kind, '->', file, '| subject:', r.subject);
}
