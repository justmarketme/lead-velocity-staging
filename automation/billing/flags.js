'use strict';
/* NH-61 (confirmed 2026-10-03): cycle 1 is paid by EFT in advance, marked paid by Jonathan with one tap.
 * Paystack, the inContact parser (W17) and the statement import (W18) stay built and tested but are OFF by
 * default. Each switch is an env var that is true only when set to exactly "true" (or "1"). Unset = off.
 * No account details are stored or rendered anywhere: the invoice carries them (Jonathan adds them). */
const NAMES = Object.freeze({ paystack: 'PAYSTACK_ENABLED', incontact: 'INCONTACT_ENABLED', statement: 'STATEMENT_IMPORT_ENABLED' });

function isOn(env, name) {
  const v = String((env && env[name]) === undefined || (env && env[name]) === null ? '' : env[name]).trim().toLowerCase();
  return v === 'true' || v === '1';
}
const paystackEnabled = (env) => isOn(env, NAMES.paystack);
const incontactEnabled = (env) => isOn(env, NAMES.incontact);
const statementImportEnabled = (env) => isOn(env, NAMES.statement);

/** Checkout methods offered. Flag off -> manual EFT only. */
function allowedMethods(env) { return paystackEnabled(env) ? ['instant_eft', 'manual_eft', 'card'] : ['manual_eft']; }
/** The method a checkout request is served with: with Paystack off, every request is manual EFT. */
function resolveCheckoutMethod(requested, env) {
  const ok = allowedMethods(env);
  if (ok.includes(requested)) return requested;
  return paystackEnabled(env) ? 'instant_eft' : 'manual_eft';
}

module.exports = { NAMES, paystackEnabled, incontactEnabled, statementImportEnabled, allowedMethods, resolveCheckoutMethod };
