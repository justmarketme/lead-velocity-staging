// "Welcome to Lead Velocity — create your password" email.
// Table layout, inline CSS, 600px, dark navy/purple with pink→orange accents (site tokens), bgcolor
// attributes so Outlook keeps the dark background, VML button for Outlook desktop (solid fill), CSS
// gradient button everywhere else. deliverables/emails/create-password.html is the same markup rendered
// as a Supabase "Reset password" template (link = {{ .SiteURL }}/reset-password?token_hash=...).

export const SUBJECT = "Welcome to Lead Velocity — create your password";
export const LOGO_URL = "https://leadvelocity.co.za/email/lead-velocity-logo.png";

const BG = "#120c1f";
const CARD = "#1b1330";
const LINE = "#2e2347";
const PINK = "#e0457b";
const ORANGE = "#f3a64b";
const MUTED = "#a99fc0";
const MONO = "'SFMono-Regular',Menlo,Consolas,'Liberation Mono','Courier New',monospace";
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export interface CreatePasswordEmail {
  /** Greeting name; empty → "Hi there". Escaped here. */
  firstName: string;
  /** The one-time link. Must already be URL-safe (it is not escaped, so templates can pass {{ .TokenHash }} markup). */
  link: string;
  /** Login email shown to the broker; escaped here. Templates may pass {{ .Email }}. */
  email: string;
  /** Pass false for template placeholders that must not be escaped. */
  escapeEmail?: boolean;
}

export function renderCreatePasswordEmail({ firstName, link, email, escapeEmail = true }: CreatePasswordEmail) {
  const hi = firstName ? `Hi ${esc(firstName)},` : "Hi there,";
  const shownEmail = escapeEmail ? esc(email) : email;
  const preheader = "Your broker portal is ready. Create your password and you're straight in.";

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${SUBJECT}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>
  body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
  table,td{mso-table-lspace:0;mso-table-rspace:0}
  img{border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic}
  a{color:${ORANGE}}
  @media (max-width:620px){
    .container{width:100%!important}
    .px{padding-left:24px!important;padding-right:24px!important}
    .h1{font-size:26px!important;line-height:32px!important}
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${BG}" bgcolor="${BG}">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${BG};opacity:0">${preheader}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BG}" style="background-color:${BG}">
<tr><td align="center" style="padding:32px 12px">
  <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
  <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px">
    <tr><td align="center" style="padding:0 0 24px">
      <img src="${LOGO_URL}" width="88" height="96" alt="Lead Velocity" style="display:block;width:88px;height:96px">
    </td></tr>
    <tr><td bgcolor="${CARD}" style="background-color:${CARD};border:1px solid ${LINE};border-radius:20px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td height="4" bgcolor="${PINK}" style="height:4px;line-height:4px;font-size:4px;border-radius:20px 20px 0 0;background-color:${PINK};background-image:linear-gradient(90deg,${PINK},${ORANGE})">&nbsp;</td></tr>
        <tr><td class="px" style="padding:36px 48px 8px">
          <p style="margin:0 0 14px;font-family:${MONO};font-size:11px;line-height:16px;letter-spacing:3px;text-transform:uppercase;color:${PINK}">Lead Velocity <span style="color:${MUTED}">/</span> Broker onboarding</p>
          <h1 class="h1" style="margin:0 0 20px;font-family:${SANS};font-size:30px;line-height:36px;font-weight:700;color:#ffffff">Create your password</h1>
          <p style="margin:0 0 16px;font-family:${SANS};font-size:16px;line-height:26px;color:#e9e4f5">${hi}</p>
          <p style="margin:0 0 28px;font-family:${SANS};font-size:16px;line-height:26px;color:#e9e4f5">Welcome to Lead Velocity. Your broker portal is ready &mdash; choose your own password and you&rsquo;ll go straight in. It takes under a minute, and only you will know it.</p>
        </td></tr>
        <tr><td class="px" align="left" style="padding:0 48px 32px">
          <!--[if mso]>
          <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${link}" style="height:52px;v-text-anchor:middle;width:260px" arcsize="50%" stroke="f" fillcolor="${PINK}">
            <w:anchorlock/>
            <center style="color:#ffffff;font-family:Segoe UI,Arial,sans-serif;font-size:16px;font-weight:bold">Create your password</center>
          </v:roundrect>
          <![endif]-->
          <!--[if !mso]><!-->
          <a href="${link}" style="display:inline-block;padding:16px 36px;border-radius:999px;background-color:${PINK};background-image:linear-gradient(90deg,${PINK},${ORANGE});color:#ffffff;font-family:${SANS};font-size:16px;line-height:20px;font-weight:700;text-decoration:none;mso-hide:all">Create your password &rarr;</a>
          <!--<![endif]-->
        </td></tr>
        <tr><td class="px" style="padding:0 48px 36px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${LINE}">
            <tr><td style="padding:24px 0 0">
              <p style="margin:0 0 6px;font-family:${MONO};font-size:11px;line-height:16px;letter-spacing:2px;text-transform:uppercase;color:${MUTED}">Next time</p>
              <p style="margin:0 0 20px;font-family:${SANS};font-size:15px;line-height:24px;color:#e9e4f5">Sign in at <a href="https://leadvelocity.co.za/broker" style="color:${ORANGE};text-decoration:none">leadvelocity.co.za/broker</a> with <strong style="color:#ffffff">${shownEmail}</strong> and your new password.</p>
              <p style="margin:0 0 16px;font-family:${SANS};font-size:13px;line-height:21px;color:${MUTED}">For your security this link works once and expires after a short while. If it has expired, just reply to this email and we&rsquo;ll send a fresh one. Weren&rsquo;t expecting this? You can ignore it &mdash; nothing changes until the link is used.</p>
              <p style="margin:0;font-family:${SANS};font-size:12px;line-height:18px;color:${MUTED};word-break:break-all">Button not working? Paste this into your browser:<br><a href="${link}" style="color:${MUTED};text-decoration:underline">${link}</a></p>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </td></tr>
    <tr><td align="center" style="padding:24px 12px 0;font-family:${SANS};font-size:12px;line-height:18px;color:${MUTED}">
      Lead Velocity (Pty) Ltd &middot; <a href="mailto:howzit@leadvelocity.co.za" style="color:${MUTED};text-decoration:none">howzit@leadvelocity.co.za</a>
    </td></tr>
  </table>
  <!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;

  const text = [
    SUBJECT,
    "",
    hi.replace(/&#39;/g, "'").replace(/&amp;/g, "&"),
    "",
    "Welcome to Lead Velocity. Your broker portal is ready - choose your own password and you'll go straight in.",
    "",
    "Create your password:",
    link,
    "",
    `Next time, sign in at https://leadvelocity.co.za/broker with ${email} and your new password.`,
    "",
    "For your security this link works once and expires after a short while. If it has expired, reply to this email and we'll send a fresh one. Weren't expecting this? Ignore it - nothing changes until the link is used.",
    "",
    "Lead Velocity (Pty) Ltd · howzit@leadvelocity.co.za",
  ].join("\n");

  return { html, text, preheader };
}
