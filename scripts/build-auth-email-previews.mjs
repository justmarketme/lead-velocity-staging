// Local-only deliverables. Never updates hosted Auth configuration or sends mail.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
const root = path.resolve(import.meta.dirname, '..');
const source = await fs.readFile(path.join(root, 'supabase/functions/_shared/lv_email.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { lvEmail, grad, panel, para } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const definitions = [
  { key: 'invite', title: 'Welcome to ' + grad('Lead Velocity'), subject: 'Your Lead Velocity invitation', intro: 'You have been invited to join Lead Velocity. Follow the link below to accept your invitation.', label: 'Accept invitation' },
  { key: 'confirmation', title: 'Confirm your ' + grad('email address'), subject: 'Confirm your Lead Velocity email address', intro: 'Confirm your email address to continue setting up your Lead Velocity account.', label: 'Confirm email address' },
  { key: 'magic_link', title: 'Your secure ' + grad('sign-in link'), subject: 'Your Lead Velocity sign-in link', intro: 'Use the link below to sign in to your Lead Velocity account.', label: 'Sign in' },
  { key: 'email_change', title: 'Confirm your ' + grad('email change'), subject: 'Confirm your Lead Velocity email change', intro: 'A change to your Lead Velocity account email address was requested. Use the link below to confirm it.', label: 'Confirm email change' },
  { key: 'reauthentication', title: 'Verify it is ' + grad('you'), subject: 'Your Lead Velocity verification code', intro: 'Enter this verification code in the screen where you requested it. Keep this code private.' },
];
const out = path.join(root, 'deliverables/emails/auth');
await fs.mkdir(out, { recursive: true });
const manifest = {};
for (const item of definitions) {
  let html = lvEmail({ eyebrow: 'ACCOUNT SECURITY', title: item.title, preheader: item.subject,
    intro: item.intro, signoff: null,
    body: item.key === 'reauthentication' ? [panel('<strong style="font-size:30px;letter-spacing:8px;color:#ffffff">{{ .Token }}</strong>', 'Verification code')] : [],
    button: item.label ? { label: item.label, url: 'https://example.invalid/AUTH_CONFIRMATION_PLACEHOLDER' } : undefined,
    finePrint: 'If you did not request this, do not use the link or code. Contact <a href="mailto:howzit@leadvelocity.co.za" style="color:#b83df5">howzit@leadvelocity.co.za</a> if you need help.'
  }).replaceAll('https://example.invalid/AUTH_CONFIRMATION_PLACEHOLDER', '{{ .ConfirmationURL }}');
  assert(!/style="[^"]*url\(/i.test(html), 'No inline CSS URL');
  assert(!html.includes('AUTH_CONFIRMATION_PLACEHOLDER'));
  assert(html.includes(item.label ? '{{ .ConfirmationURL }}' : '{{ .Token }}'));
  assert(!html.includes('.Data'), 'User-editable metadata is not used');
  for (const tag of html.matchAll(/<(?:table|td)\b[^>]*>/gi)) {
    if (/background-color:/i.test(tag[0])) {
      assert(/bgcolor="#[0-9a-f]{6}"/i.test(tag[0]), 'Background colour fallback');
      assert(/background="https:\/\/leadvelocity.co.za\/email\/bg\//i.test(tag[0]), 'Outlook background tile');
    }
  }
  await fs.writeFile(path.join(out, item.key + '.html'), html);
  const preview = html.replaceAll('{{ .ConfirmationURL }}', 'https://example.invalid/preview-only').replaceAll('{{ .Token }}', '123456');
  await fs.writeFile(path.join(out, item.key + '.preview.html'), preview);
  manifest[item.key] = { subject: item.subject, file: item.key + '.html', status: 'local_preview_only' };
}
await fs.writeFile(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
await fs.writeFile(path.join(out, 'index.html'), '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Auth email previews</title><body style="background:#120c1f;color:#e9e4f5;font:16px system-ui;padding:28px"><h1>Lead Velocity Auth email previews</h1><p>Local previews only. No email sent; no hosted settings changed. Sample links are intentionally inactive.</p>' + definitions.map(d => '<p><a style="color:#e8a6ff" href="' + d.key + '.preview.html">' + d.subject + '</a></p>').join('') + '</body></html>');
console.log('PASS: five local templates generated; action placeholders, escaping boundary and Outlook fallback checks pass. Hosted Auth token redemption and real email-client rendering remain untested.');
