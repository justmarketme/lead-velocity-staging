/* Checkout behaviour. No price is typed here: tiers come from body[data-pricing-json] (W25 fills it
 * from the `pricing` table). The reference comes from ?ref= (issued by W16/W19/console).
 * Paying by Instant EFT or card calls the billing API (n8n W16 "checkout" webhook), which starts a
 * Paystack transaction for the invoice and returns Paystack's hosted page URL. Card data never touches this page. */
(function () {
  'use strict';
  var body = document.body;
  var qs = new URLSearchParams(window.location.search);
  var placeholder = function (v) { return !v || /^\{\{.*\}\}$/.test(v); };
  var $ = function (id) { return document.getElementById(id); };

  var tiers = [];
  try { var raw = body.getAttribute('data-pricing-json'); if (!placeholder(raw)) tiers = JSON.parse(raw); } catch (e) { tiers = []; }
  var apiBase = placeholder(body.getAttribute('data-api-base')) ? '' : body.getAttribute('data-api-base');
  var reference = (qs.get('ref') || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 30);
  var selected = null;

  function zar(cents) {
    var r = Math.floor(Math.abs(cents) / 100), c = Math.abs(cents) % 100;
    return 'R' + String(r).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (c ? '.' + String(c).padStart(2, '0') : '');
  }
  function text(id, v) { var el = $(id); if (el) el.textContent = v; }

  function renderTiers() {
    var box = $('tiers');
    if (!tiers.length) { $('pricing-error').hidden = false; return; }
    var want = qs.get('tier');
    selected = tiers.filter(function (t) { return t.tier_code === want; })[0] || tiers[0];
    box.innerHTML = '';
    tiers.forEach(function (t) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'tier'; b.setAttribute('role', 'radio'); b.dataset.tier = t.tier_code;
      var name = document.createElement('span'); name.className = 'tier-name'; name.textContent = t.name;
      var price = document.createElement('p'); price.className = 'tier-price'; price.textContent = zar(t.price_cents) + ' ';
      var small = document.createElement('small'); small.textContent = '/ 30-day cycle, ' + t.vat_line; price.appendChild(small);
      var ul = document.createElement('ul');
      [t.committed_leads + ' pre-qualified leads per cycle', 'AI WhatsApp follow-up, booking & reminders included',
       'Up to ' + t.replacement_cap_cycle + ' replacements per cycle', 'Media spend included'].forEach(function (s) {
        var li = document.createElement('li'); li.textContent = s; ul.appendChild(li);
      });
      b.appendChild(name); b.appendChild(price); b.appendChild(ul);
      b.addEventListener('click', function () { selected = t; sync(); });
      box.appendChild(b);
    });
    sync();
  }

  function tierChanged() {
    // The reference carries the tier token (LV-0007-B-202610). A different tier needs a re-issued invoice.
    var m = /^LV-\d{1,6}-([A-Z]{1,3})-\d{6}$/.exec(reference);
    return Boolean(m && selected && m[1] !== selected.tier_code.replace(/^SMC_/, '').charAt(0));
  }

  function sync() {
    Array.prototype.forEach.call(document.querySelectorAll('.tier'), function (b) {
      var on = selected && b.dataset.tier === selected.tier_code;
      b.setAttribute('aria-checked', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1;
    });
    if (!selected) return;
    text('vat-line', 'Prices exclude VAT. ' + (selected.vat_line === 'excl. VAT' ? 'No VAT is charged until Lead Velocity is VAT-registered.' : 'VAT: ' + selected.vat_line + '.'));
    text('total', 'Total for one 30-day cycle: ' + zar(selected.total_cents));
    text('manual-amount', zar(selected.total_cents));
    var changed = tierChanged();
    text('reference', reference && !changed ? reference : (changed ? 'Press Continue to get the reference for ' + selected.name : 'Reference on your invoice'));
    $('copy-ref').hidden = !reference || changed;
    var method = document.querySelector('input[name="method"]:checked').value;
    $('manual-details').hidden = method !== 'manual_eft';
    $('card-details').hidden = method !== 'card';
    if (method !== 'card') $('autorenew').checked = false; // auto-renew is card-only and never on by default
    $('pay-btn').textContent = method === 'manual_eft' ? (changed ? 'Get my new reference' : 'I will pay by EFT') : 'Continue to secure payment';
  }

  [['bank-name', 'data-bank-name'], ['bank-account-name', 'data-bank-account-name'], ['bank-account-number', 'data-bank-account-number'],
   ['bank-branch-code', 'data-bank-branch-code'], ['bank-account-type', 'data-bank-account-type']].forEach(function (p) {
    var v = body.getAttribute(p[1]); text(p[0], placeholder(v) ? 'On your invoice' : v);
  });

  $('copy-ref').addEventListener('click', function () {
    var done = function () { text('copy-status', 'Reference copied. Paste it in the reference field of your payment.'); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(reference).then(done, function () { text('copy-status', 'Copy failed. Please type it exactly: ' + reference); });
    else { var r = document.createRange(); r.selectNodeContents($('reference')); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); text('copy-status', 'Reference selected. Copy it with your device menu.'); }
  });

  Array.prototype.forEach.call(document.querySelectorAll('input[name="method"]'), function (r) { r.addEventListener('change', sync); });

  $('pay').addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (!selected) return;
    var method = document.querySelector('input[name="method"]:checked').value;
    if (method === 'manual_eft' && !tierChanged()) { text('pay-status', 'Thank you. We match your EFT automatically when the bank tells us, and send your next steps on WhatsApp.'); return; }
    if (!apiBase || !reference) { text('pay-status', 'Online payment is not switched on for this link yet. Please pay by manual EFT, or WhatsApp us for a new link.'); return; }
    var btn = $('pay-btn'); btn.disabled = true; text('pay-status', 'One moment...');
    fetch(apiBase.replace(/\/$/, '') + '/billing/checkout', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoice_reference: reference, tier_code: selected.tier_code, method: method, autorenew_opt_in: method === 'card' && $('autorenew').checked === true }),
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); }).then(function (res) {
      if (!res.ok) throw new Error((res.j && res.j.message) || 'failed');
      if (res.j.reference) { reference = res.j.reference; history.replaceState(null, '', '?tier=' + encodeURIComponent(selected.tier_code) + '&ref=' + encodeURIComponent(reference)); sync(); }
      if (res.j.authorization_url && /^https:\/\/checkout\.paystack\.com\//.test(res.j.authorization_url)) { window.location.assign(res.j.authorization_url); return; }
      btn.disabled = false; text('pay-status', method === 'manual_eft' ? 'Here is your new reference. Please use it exactly.' : 'Something went wrong starting the payment. Please try again or pay by manual EFT.');
    }).catch(function () { btn.disabled = false; text('pay-status', 'We could not start the payment. Please try again, or pay by manual EFT.'); });
  });

  renderTiers();
})();
