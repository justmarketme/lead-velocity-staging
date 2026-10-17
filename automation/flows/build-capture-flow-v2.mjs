#!/usr/bin/env node
// Generates automation/flows/capture-flow-v2.json (WhatsApp Flow JSON v7.0, data_api_version 3.0) from the copy in
// automation/ctwa/capture-v2.js, so the screens, the endpoint and the spec doc cannot drift. Run after any copy change:
//   node automation/flows/build-capture-flow-v2.mjs        (write)   |   --check   (exit 1 if the file is stale)
// Every footer is a data_exchange: the endpoint validates each screen and decides the next (tier, disqualify, slots).
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const C = require('../ctwa/capture-v2.js');
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'capture-flow-v2.json');

const opts = (rows) => rows.map(([id, title]) => ({ id, title }));
const s = (ex) => ({ type: 'string', __example__: ex });
const ERR = { show_error: { type: 'boolean', __example__: false }, error_message: s('') };
const errText = { type: 'TextBody', text: '${data.error_message}', visible: '${data.show_error}', 'font-weight': 'bold' };
const footer = (screen, payload, label = C.COPY.continue) => ({ type: 'Footer', label, 'on-click-action': { name: 'data_exchange', payload: { screen, ...payload } } });
const screen = (id, title, data, children, extra = {}) => ({ id, title, data, layout: { type: 'SingleColumnLayout', children: [{ type: 'Form', name: 'f', children }] }, ...extra });
const radio = (name, label, rows, required) => ({ type: 'RadioButtonsGroup', name, label, required, 'data-source': opts(rows) });

export function buildFlow() {
  const K = C.COPY;
  const screens = [
    screen('REASONS', K.reasons_title, { reasons_options: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' } } }, __example__: opts(C.REASONS) }, ...ERR }, [
      { type: 'TextSubheading', text: K.reasons_heading },
      { type: 'CheckboxGroup', name: 'reasons', label: K.reasons_label, required: true, 'min-selected-items': 1, 'data-source': '${data.reasons_options}' },
      errText, footer('REASONS', { reasons: '${form.reasons}' }),
    ]),
    screen('SPEND', K.spend_title, { spend_heading: s(K.spend_heading_too_much), ...ERR }, [
      { type: 'TextSubheading', text: '${data.spend_heading}' },
      radio('spend', K.spend_label, C.SPEND, false), errText, footer('SPEND', { spend: '${form.spend}' }),
    ]),
    screen('NAME', K.name_title, ERR, [
      { type: 'TextSubheading', text: K.name_heading },
      { type: 'TextInput', name: 'first_name', label: K.first_name_label, 'input-type': 'text', required: true },
      { type: 'TextInput', name: 'last_name', label: K.last_name_label, 'input-type': 'text', required: true },
      errText, footer('NAME', { first_name: '${form.first_name}', last_name: '${form.last_name}' }),
    ]),
    screen('EMAIL', K.email_title, { init_email: s('lerato@example.co.za'), ...ERR }, [
      { type: 'TextSubheading', text: K.email_heading },
      { type: 'TextInput', name: 'email', label: K.email_label, 'input-type': 'email', required: true, 'init-value': '${data.init_email}' },
      { type: 'OptIn', name: 'alt_same', label: K.alt_same_label },
      { type: 'TextInput', name: 'alt_email', label: K.alt_email_label, 'input-type': 'email', required: false },
      errText, footer('EMAIL', { email: '${form.email}', alt_same: '${form.alt_same}', alt_email: '${form.alt_email}' }),
    ]),
    screen('NUMBER', K.number_title, { number_heading: s('Is 082 555 0101 the number to call you on?'), ...ERR }, [
      { type: 'TextSubheading', text: '${data.number_heading}' },
      radio('same_number', 'Contact number', C.NUMBER_CHOICE, true),
      { type: 'TextInput', name: 'other_number', label: K.other_number_label, 'input-type': 'phone', required: false },
      errText, footer('NUMBER', { same_number: '${form.same_number}', other_number: '${form.other_number}' }),
    ]),
    screen('AGE', K.age_title, ERR, [{ type: 'TextSubheading', text: K.age_heading }, radio('age_band', 'Age', C.AGE, true), errText, footer('AGE', { age_band: '${form.age_band}' })]),
    screen('BUDGET', K.budget_title, ERR, [{ type: 'TextSubheading', text: K.budget_heading }, radio('budget_band', 'Per month', C.BUDGET, true), errText, footer('BUDGET', { budget_band: '${form.budget_band}' })]),
    screen('SMOKER', K.smoker_title, { smoker_heading: s(C.fill(K.smoker_heading, { broker_first_name: 'Mark' })), ...ERR }, [
      { type: 'TextBody', text: '${data.smoker_heading}' }, radio('smoker', 'Smoker', C.SMOKER, false), errText, footer('SMOKER', { smoker: '${form.smoker}' }),
    ]),
    screen('INCOME', K.income_title, ERR, [{ type: 'TextSubheading', text: K.income_heading }, radio('income', 'Income', C.INCOME, false), errText, footer('INCOME', { income: '${form.income}' })]),
    screen('DATE', K.date_title, {
      date_heading: s(C.fill(K.date_heading, { adviser: 'Mark' })), min_date: s('2026-10-08'), max_date: s('2026-10-21'),
      include_days: { type: 'array', items: { type: 'string' }, __example__: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] },
      unavailable_dates: { type: 'array', items: { type: 'string' }, __example__: ['2026-10-09'] }, ...ERR,
    }, [
      { type: 'TextSubheading', text: '${data.date_heading}' },
      { type: 'CalendarPicker', name: 'date', label: K.date_label, mode: 'single', required: true, 'min-date': '${data.min_date}', 'max-date': '${data.max_date}', 'include-days': '${data.include_days}', 'unavailable-dates': '${data.unavailable_dates}' },
      errText, footer('DATE', { date: '${form.date}' }),
    ]),
    screen('SLOTS', K.slots_title, {
      date: s('2026-10-08'), date_label: s('Thu 8 Oct (South African time)'),
      slots: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' } } }, __example__: [{ id: '2026-10-08T10:00:00+02:00', title: '10:00' }] }, ...ERR,
    }, [{ type: 'TextSubheading', text: '${data.date_label}' }, { type: 'RadioButtonsGroup', name: 'slot', label: 'Time', required: true, 'data-source': '${data.slots}' }, errText, footer('SLOTS', { slot: '${form.slot}' })]),
    screen('CONFIRM', K.confirm_title, { summary_text: s('Thu 8 Oct at 10:00 (South African time), 30-minute Microsoft Teams call with Mark.'), ...ERR }, [
      { type: 'TextBody', text: '${data.summary_text}' }, errText, footer('CONFIRM', {}, K.confirm_button),
    ]),
    { id: 'END', title: 'SortMyCover', terminal: true, success: true, data: { heading: s(K.end_booked_heading), body: s('...') }, layout: { type: 'SingleColumnLayout', children: [
      { type: 'TextHeading', text: '${data.heading}' }, { type: 'TextBody', text: '${data.body}' },
      { type: 'Footer', label: K.done, 'on-click-action': { name: 'complete', payload: {} } },
    ] } },
  ];
  // every data_exchange may also end the Flow (disqualify, no slots, tier B matching) -> END is reachable from all.
  const routing_model = {
    REASONS: ['SPEND', 'END'], SPEND: ['NAME', 'END'], NAME: ['EMAIL', 'END'], EMAIL: ['NUMBER', 'END'], NUMBER: ['AGE', 'END'],
    AGE: ['BUDGET', 'END'], BUDGET: ['SMOKER', 'END'], SMOKER: ['INCOME', 'END'], INCOME: ['DATE', 'END'], DATE: ['SLOTS', 'END'],
    SLOTS: ['CONFIRM', 'END'], CONFIRM: ['END'], END: [],
  };
  return { version: '7.0', data_api_version: '3.0', routing_model, screens };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const txt = JSON.stringify(buildFlow(), null, 2) + '\n';
  if (process.argv.includes('--check')) {
    let cur = ''; try { cur = readFileSync(OUT, 'utf8'); } catch (e) {}
    if (cur !== txt) { console.error('capture-flow-v2.json is stale: run node automation/flows/build-capture-flow-v2.mjs'); process.exit(1); }
    console.log('capture-flow-v2.json up to date');
  } else { writeFileSync(OUT, txt); console.log(`wrote ${OUT}`); }
}
