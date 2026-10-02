'use strict';
/* One place for table names. The structured invoice table must not be called `invoices` in
 * `public` until the live schema dump lands (crm-gap NH-11), so it is `invoices_smc` here.
 * If platform-architect's smc_02_core migration picks another name, change it here only. */
module.exports = Object.freeze({
  PRICING: 'public.pricing',
  BROKERS: 'public.brokers',
  CYCLES: 'public.cycles',
  INVOICES: 'public.invoices_smc',
  BANK_CREDITS: 'public.bank_credits',
  WEBHOOK_EVENTS: 'public.webhook_events',
  AUDIT_LOG: 'public.audit_log',
});
