// Lead Velocity branded email layout. ONE shell for every email we send ourselves (Resend API), matching the live
// broker welcome email (deliverables/emails/create-password.html): page #120c1f, card #1b1330, panels #231a3d,
// pink>orange top bar, Inter, solid #b83df5 button, epiphany gradient text, Lead Velocity Team signature.
// Outlook iOS/Android repaint CSS colours in dark mode but never images, so every coloured cell also carries an HTML
// background="https://leadvelocity.co.za/email/bg/<hex>.png" tile (never inline CSS url(): Gmail web strips the style).
// Allowed tile colours (files in public/email/bg): 120c1f 1b1330 231a3d 3a1b57 b83df5 212a44 2a1838 + topbar.png.
//
// Usage:  import { lvEmail, grad, para, steps, panel } from "../_shared/lv_email.ts";
//         const html = lvEmail({ eyebrow: "POPIA", title: `Hi ${grad("KG")}`, intro: "...", body: [...], button: {...} });

const BASE = "https://leadvelocity.co.za";
const F = "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Gradient highlight word (solid #ff00cc where clients can't clip text). Pass already-safe text. */
export const grad = (text: string) => `<span class="grad" style="color:#ff00cc">${text}</span>`;

/** Body paragraph. Pass HTML you trust (escape user input with esc()). */
export const para = (html: string) =>
  `<p style="margin:0 0 14px;font-family:${F};font-size:15px;line-height:25px;color:#b9b0d6">${html}</p>`;

/** Section heading inside the card. */
export const heading = (text: string) =>
  `<h2 style="margin:26px 0 10px;font-family:${F};font-size:20px;line-height:26px;font-weight:700;letter-spacing:-0.3px;color:#ffffff">${text}</h2>`;

/** Strong white text inline. */
export const strong = (text: string) => `<strong style="color:#ffffff;font-weight:600">${text}</strong>`;

/** Numbered steps (primary-tinted circles, same as the broker welcome email). */
export function steps(items: { title: string; text?: string }[]): string {
  const rows = items.map((it, i) => {
    const last = i === items.length - 1;
    const bb = last ? "" : "border-bottom:1px solid #352a55;";
    return `<tr>
<td width="48" valign="top" style="padding:18px 0;${bb}"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="32" height="32" align="center" valign="middle" bgcolor="#3a1b57" background="${BASE}/email/bg/3a1b57.png" style="width:32px;height:32px;border-radius:16px;background-color:#3a1b57;background-image:linear-gradient(#3a1b57,#3a1b57);border:1px solid #4b2470;font-size:15px;line-height:32px;font-weight:700;color:#b83df5">${i + 1}</td></tr></table></td>
<td valign="top" style="padding:18px 0;${bb}"><p style="margin:0 0 4px;font-family:${F};font-size:17px;line-height:24px;font-weight:700;letter-spacing:-0.2px;color:#ffffff">${it.title}</p>${it.text ? `<p style="margin:0;font-family:${F};font-size:14px;line-height:23px;color:#b9b0d6">${it.text}</p>` : ""}</td>
</tr>`;
  }).join("\n");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>`;
}

/** Highlight panel (#231a3d) with an optional small cyan label. */
export function panel(html: string, label?: string): string {
  return `<table role="presentation" class="lv-panel" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#231a3d" background="${BASE}/email/bg/231a3d.png" style="background-color:#231a3d;background-image:linear-gradient(#231a3d,#231a3d);border:1px solid #352a55;border-radius:16px;margin:4px 0 14px"><tr><td style="padding:18px 22px">${label ? `<p style="margin:0 0 8px;font-family:${F};font-size:12px;line-height:16px;font-weight:500;letter-spacing:3px;text-transform:uppercase;color:#22d3ee">${label}</p>` : ""}<div style="font-family:${F};font-size:14px;line-height:23px;color:#e9e4f5">${html}</div></td></tr></table>`;
}

export interface LvEmailOptions {
  /** Hidden inbox preview text. */
  preheader?: string;
  /** Small tracked eyebrow above the title, e.g. "POPIA · one step for you". */
  eyebrow: string;
  /** Big title HTML. Wrap highlight words with grad(). */
  title: string;
  /** Intro paragraph (HTML). */
  intro: string;
  /** Extra content blocks (HTML strings built with para/heading/steps/panel). */
  body?: string[];
  /** Optional primary button. */
  button?: { label: string; url: string };
  /** Sign-off name above the signature. Default "Jono". Use null to omit the sign-off lines. */
  signoff?: string | null;
  /** Small print under the card content. */
  finePrint?: string;
}

export function lvEmail(o: LvEmailOptions): string {
  const pre = o.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#120c1f;opacity:0">${o.preheader}</div>`
    : "";
  const button = o.button
    ? `<tr><td class="px" align="left" style="padding:6px 40px 34px">
<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${o.button.url}" style="height:54px;v-text-anchor:middle;width:260px" arcsize="22%" stroke="f" fillcolor="#b83df5"><w:anchorlock/><center style="color:#ffffff;font-family:Segoe UI,Arial,sans-serif;font-size:16px;font-weight:600">${o.button.label} &rarr;</center></v:roundrect><![endif]-->
<!--[if !mso]><!--><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"><tr><td class="lv-btn" bgcolor="#b83df5" background="${BASE}/email/bg/b83df5.png" style="border-radius:12px;background-color:#b83df5;background-image:linear-gradient(#b83df5,#b83df5);box-shadow:0 10px 15px -3px rgba(184,61,245,0.2)"><a href="${o.button.url}" style="display:inline-block;padding:16px 30px;font-family:${F};font-size:16px;line-height:22px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:12px">${o.button.label} &rarr;</a></td></tr></table><!--<![endif]-->
</td></tr>`
    : "";
  const signoff = o.signoff === null ? "" : `<p style="margin:0 0 26px;font-family:${F};font-size:15px;line-height:24px;color:#b9b0d6">Kind regards,<br><strong style="color:#ffffff;font-weight:600">${o.signoff ?? "Jono"}</strong></p>`;
  const fine = o.finePrint
    ? `<tr><td class="px" style="padding:0 40px 34px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #352a55"><tr><td style="padding:20px 0 0;font-family:${F};font-size:12px;line-height:19px;color:#8a80a6">${o.finePrint}</td></tr></table></td></tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>Lead Velocity</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<!--[if !mso]><!--><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"><!--<![endif]-->
<style>
  body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
  table,td{mso-table-lspace:0;mso-table-rspace:0}
  img{border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic}
  a{color:#b83df5}
  @media (max-width:620px){
    .container{width:100%!important}
    .px{padding-left:22px!important;padding-right:22px!important}
    .h1{font-size:30px!important;line-height:36px!important}
    .stack{display:block!important;width:100%!important}
    .sig-logo{padding:0 0 14px!important}
    .sig-rule{display:none!important}
    .sig-text{padding-left:0!important}
  }
</style>
<style>
  @supports (-webkit-background-clip:text){
    .grad{background-image:linear-gradient(90deg,#e600ff,#ff00cc,#ff7f50 70%,#ff8c00);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent}
  }
</style>
<style>
  [data-ogsb] .lv-page,[data-ogsb] body{background-color:#120c1f!important}
  [data-ogsb] .lv-card{background-color:#1b1330!important}
  [data-ogsb] .lv-panel{background-color:#231a3d!important}
  [data-ogsb] .lv-btn{background-color:#b83df5!important}
  [data-ogsc] .lv-btn{color:#ffffff!important}
</style>
</head>
<body style="margin:0;padding:0;background-color:#120c1f;background-image:linear-gradient(#120c1f,#120c1f)" bgcolor="#120c1f">
${pre}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="lv-page" bgcolor="#120c1f" background="${BASE}/email/bg/120c1f.png" style="background-color:#120c1f;background-image:linear-gradient(#120c1f,#120c1f)">
<tr><td align="center" style="padding:36px 12px 44px">
  <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
  <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;font-family:${F}">

    <tr><td align="center" style="padding:0 0 26px">
      <a href="${BASE}" style="text-decoration:none"><img src="${BASE}/email/lead-velocity-logo.png" width="84" height="92" alt="Lead Velocity" style="display:block;width:84px;height:92px"></a>
    </td></tr>

    <tr><td class="lv-card" bgcolor="#1b1330" background="${BASE}/email/bg/1b1330.png" style="background-color:#1b1330;background-image:linear-gradient(#1b1330,#1b1330);border:1px solid #2e2347;border-radius:24px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td height="4" bgcolor="#e0457b" background="${BASE}/email/bg/topbar.png" style="height:4px;line-height:4px;font-size:4px;border-radius:24px 24px 0 0;background-color:#e0457b;background-image:linear-gradient(90deg,#e0457b,#f3a64b)">&nbsp;</td></tr>

        <tr><td class="px" style="padding:40px 40px 4px">
          <p style="margin:0 0 18px;font-family:${F};font-size:12px;line-height:16px;font-weight:500;letter-spacing:3px;text-transform:uppercase;color:#b83df5">${o.eyebrow}</p>
          <h1 class="h1" style="margin:0 0 16px;font-family:${F};font-size:36px;line-height:42px;font-weight:700;letter-spacing:-0.9px;color:#ffffff">${o.title}</h1>
          <p style="margin:0 0 24px;font-family:${F};font-size:17px;line-height:28px;color:#b9b0d6">${o.intro}</p>
        </td></tr>

${(o.body ?? []).map((b) => `        <tr><td class="px" style="padding:0 40px 8px">${b}</td></tr>`).join("\n")}
${button}

        <tr><td class="px" style="padding:12px 40px 36px">
          ${signoff}
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="font-family:${F}">
            <tr>
              <td class="stack sig-logo" valign="middle" style="padding:0 20px 0 0"><a href="${BASE}" style="text-decoration:none"><img src="${BASE}/email/lead-velocity-logo.png" width="92" height="100" alt="Lead Velocity" style="display:block;width:92px;height:100px"></a></td>
              <td class="sig-rule" width="3" bgcolor="#D946EF" style="width:3px;background-color:#D946EF;background-image:linear-gradient(#D946EF,#D946EF);border-radius:3px;font-size:0;line-height:0">&nbsp;</td>
              <td class="stack sig-text" valign="middle" style="padding:2px 0 2px 20px">
                <p style="margin:0 0 2px;font-size:17px;line-height:23px;font-weight:700;color:#ffffff">Lead Velocity Team</p>
                <p style="margin:0 0 12px;font-size:14px;line-height:20px;color:#b9b0d6">Client Services | Lead Velocity</p>
                <p style="margin:0 0 6px;font-size:14px;line-height:20px;color:#d9d2ea"><strong style="color:#ffffff">T.</strong> <a href="tel:+27109765618" style="color:#D946EF;text-decoration:none">+27 10 976 5618</a></p>
                <p style="margin:0 0 6px;font-size:13px;line-height:19px;color:#b9b0d6">210 Amarand Avenue, Pegasus Building 1<br>Menlyn Maine, Pretoria, 0184</p>
                <p style="margin:0;font-size:14px;line-height:20px;color:#d9d2ea"><strong style="color:#ffffff">E.</strong> <a href="mailto:howzit@leadvelocity.co.za" style="color:#D946EF;text-decoration:none">howzit@leadvelocity.co.za</a> <span style="color:#6f6590">|</span> <a href="${BASE}" style="color:#D946EF;text-decoration:none">leadvelocity.co.za</a></p>
              </td>
            </tr>
          </table>
        </td></tr>
${fine}
      </table>
    </td></tr>

    <tr><td align="center" style="padding:24px 12px 0;font-family:${F};font-size:12px;line-height:18px;color:#8a80a6">
      Lead Velocity (Pty) Ltd &middot; <a href="${BASE}" style="color:#8a80a6;text-decoration:none">leadvelocity.co.za</a>
    </td></tr>
  </table>
  <!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
}
