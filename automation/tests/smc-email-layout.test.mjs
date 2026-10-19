// The n8n twin (automation/lib/smc-email-layout.mjs) must render exactly what the edge-function layout
// (supabase/functions/_shared/smc_layout.ts) renders, and the client emails built on it keep the site look and the copy rules.
// Run: node --test automation/tests/smc-email-layout.test.mjs   (Node 23.6+ loads the .ts by type stripping)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as JS from '../lib/smc-email-layout.mjs';
import { verifyEmailHtml, page } from '../lib/sub-email-verify.mjs';

const TS = await import('../../supabase/functions/_shared/smc_layout.ts');

test('the JS twin renders byte-for-byte what smc_layout.ts renders', () => {
  for (const k of ['SMC', 'SMC_SITE', 'WORDMARK_URL', 'WORDMARK_W', 'WORDMARK_H', 'FONT', 'P_STYLE', 'SMALL_STYLE', 'LINK_STYLE']) assert.deepEqual(JS[k], TS[k], k);
  const hostile = `<b>"x" & 'y'</b>`;
  const cases = [
    ['escHtml', [hostile]], ['smcP', [hostile]], ['smcHeading', ['Your call is booked', 'booked']], ['smcHeading', [hostile]],
    ['smcButtons', [[{ href: 'https://a.example/?x=1&y="2"', label: 'Go' }, { href: 'https://b.example', label: hostile, secondary: true }]]],
    ['smcPanel', [[['When', 'Tuesday'], ['How', hostile]]]],
    ['smcShell', [{ docTitle: hostile, preheader: hostile, eyebrow: hostile, headingHtml: '<h1>x</h1>', bodyHtml: '<p>b</p>', actionsHtml: '<a>c</a>', footerLines: ['one', 'two'] }]],
    ['smcShell', [{ docTitle: 't', eyebrow: 'e', headingHtml: 'h', bodyHtml: 'b', signoff: null, footerLines: ['f'] }]],
  ];
  for (const [fn, args] of cases) assert.equal(JS[fn](...args), TS[fn](...args), fn);
});

const SITE_LOOK = (html, label) => {
  assert.match(html, /https:\/\/sortmycover\.co\.za\/email\/wordmark-white\.png/, `${label}: site wordmark`);
  assert.match(html, /background-color:#1F2933/, `${label}: navy band`);
  assert.match(html, /background-color:#FFFFFF/, `${label}: white base`);
  assert.doesNotMatch(html, /#FBF8F2|#FFF4E0|#DCD6CB|#52606D/i, `${label}: cream / beige / old greys`);
  const allowed = new Set(Object.values(JS.SMC).map((c) => c.toLowerCase()));
  for (const c of html.match(/#[0-9a-f]{6}\b/gi) ?? []) assert.ok(allowed.has(c.toLowerCase()), `${label}: colour ${c} is not a site token`);
  assert.match(html, /max-width:600px/, `${label}: 600px`);
  assert.doesNotMatch(html, /\bfree\b|costs? (you )?nothing|no cost|\bAI\b|assistant|licensed|Lead Velocity/i, `${label}: copy rules`);
};

test('email-verify mail and its landing page use the site look', () => {
  const html = verifyEmailHtml({ firstName: 'Thandi', adviser: 'Mark', link: 'https://sortmycover.co.za/v/ev1.x.y.z' });
  SITE_LOOK(html, 'verify');
  assert.match(html, /href="https:\/\/sortmycover\.co\.za\/v\/ev1\.x\.y\.z"[^>]*>Confirm my email</);
  assert.match(html, /Mark can send you your meeting details/);
  assert.match(html, /Hi Thandi,/);
  assert.match(verifyEmailHtml({ firstName: '', adviser: 'Mark', link: 'https://x.example' }), /Hi there,/, 'no "Hi ," without a name');
  const p = page('Your email is confirmed', 'You can close this page.');
  SITE_LOOK(p, 'page');
  assert.match(p, /<meta name="robots" content="noindex">/);
});
