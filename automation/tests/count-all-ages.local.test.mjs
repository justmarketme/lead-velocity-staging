// Every age counts toward the broker's order (Jono, 18 Oct 2026), pinned on the REAL schema: the database's counting rule
// (smc_count_lead via smc_outcome_count_or_release / smc_count_on_email_verified) counts a routed lead whose meeting the broker
// marked attended and whose email is verified, whatever its age band and whether or not qualified_at is set. Throwaway
// Postgres from automation/tests/_localpg.mjs (Docker --network none, or native binaries; never the live project).
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { localPgBackend, startLocalPg, applyRepoMigrations, makeQuery } from './_localpg.mjs';

const BACKEND = localPgBackend();

test('an under-35 and an over-50 lead that book, attend and verify are COUNTED on the order, like a 35-50 lead (qualified_at or not)', { skip: !BACKEND && 'no local Postgres (Docker or native binaries)', timeout: 900000 }, async (t) => {
  const pg = startLocalPg(BACKEND);
  t.after(() => pg.stop());
  applyRepoMigrations(pg);
  const q = makeQuery(pg);
  const uuid = () => crypto.randomUUID();
  const brand = q("SELECT id FROM public.brands WHERE code = 'SMC'")[0][0];
  const user = uuid(); const broker = uuid(); const order = uuid();
  q(`INSERT INTO auth.users (id, email) VALUES ('${user}', 'synthetic-age-broker@example.test')`);
  q(`INSERT INTO public.brokers (id, user_id, firm_name, contact_person, email, status, brand_id, routing_on, fsp_number, intro_card_url)
     VALUES ('${broker}', '${user}', 'Synthetic FSP', 'Synthetic', 'synthetic-age-broker@example.test', 'active', '${brand}', true, '12345', 'https://media.sortmycover.co.za/intro/synthetic/card.png')`);
  q(`INSERT INTO public.lead_orders (id, broker_id, title, lead_count, status, paid_at, brand_id) VALUES ('${order}', '${broker}', 'synthetic SMC order', 20, 'paid', now(), '${brand}')`);
  let n = 0;
  const mkLead = (age, qualified) => {
    const id = uuid(); n += 1;
    q(`INSERT INTO public.leads (id, phone, first_name, source, brand_id, broker_id, routed_at, consent_text, consent_source, consent_at, age_band, budget_band, qualified_at, stage)
       VALUES ('${id}', '+27600008${String(n).padStart(3, '0')}', 'Synthetic', 'Campaign Lead', '${brand}', '${broker}', now(), 'consent', 'ctwa', now(), '${age}', '1500_plus', ${qualified ? 'now()' : 'NULL'}, 'qualified')`);
    return id;
  };
  const book = (lead) => { n += 1; q(`WITH a AS (INSERT INTO public.appointments (broker_id, client_id, appointment_date, ends_at, status, brand_id, method, confirmed_at)
       VALUES ('${broker}', '${lead}', '2026-09-01T06:00:00Z'::timestamptz + interval '${n} hours', '2026-09-01T06:30:00Z'::timestamptz + interval '${n} hours', 'confirmed', '${brand}', 'teams', now()) RETURNING id, client_id, broker_id, brand_id)
       INSERT INTO public.outcomes (booking_id, lead_id, broker_id, brand_id, outcome, marked_via) SELECT id, client_id, broker_id, brand_id, 'attended', 'portal' FROM a`); };
  const verify = (lead) => q(`UPDATE public.leads SET email = 'synthetic-${lead.slice(0, 8)}@example.test', email_verified = true, email_verified_at = now(), email_verified_via = 'link' WHERE id = '${lead}'`);
  const state = (lead) => q(`SELECT order_state, (SELECT count(*) FROM public.lead_order_items i WHERE i.lead_id = l.id) FROM public.leads l WHERE l.id = '${lead}'`)[0];

  const cases = [['lt35', true], ['51plus', true], ['lt35', false], ['51plus', false], ['35_44', true]];
  for (const [age, qualified] of cases) {
    const id = mkLead(age, qualified);
    assert.equal(state(id)[0], 'attached', `${age}: the place is reserved on the order at routing`);
    book(id); // attended, marked by the broker in the portal
    assert.equal(state(id)[0], 'attached', `${age}: not counted before the email is verified`);
    verify(id);
    assert.deepEqual(state(id), ['counted', '1'], `${age} (qualified_at ${qualified ? 'set' : 'null'}): counted, one lead_order_items row`);
  }
  const c = q(`SELECT counted FROM public.smc_order_capacity WHERE broker_id = '${broker}'`)[0];
  assert.equal(Number(c[0]), cases.length, 'every age counts toward the order');
});
