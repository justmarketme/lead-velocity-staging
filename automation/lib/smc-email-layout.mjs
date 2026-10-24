// Twin of supabase/functions/_shared/smc_layout.ts for n8n (lv-automation loads only automation/, and n8n cannot load .ts).
// Edit the .ts and copy the change here; automation/tests/smc-email-layout.test.mjs fails if the two ever render differently.
// The SortMyCover client email layout, matched to the site (sortmycover.co.za, 19 Oct 2026, Jono: "to the T").
// Pure and import-free, so Deno (edge functions) and Node (`node --test`, type stripping) both load it. The n8n email-verify
// mail uses a JS twin, automation/lib/smc-email-layout.mjs; automation/tests/smc-email-layout.test.mjs proves the twin
// renders byte-for-byte the same HTML as this file.
//
// Site tokens (sites/sortmycover/src/styles/tokens.css + src/index.css): white base, navy #1F2933 text and header band (the
// site header is navy), logo yellow #F5A623 only as an accent (buttons, the tick, the headline marker), amber ink #2A1B02 on
// yellow, muted #5C6672, surface #F4F5F6, rules #E4E5E7, control border #8A94A0. DM Sans 500/800 (the site's own font files,
// with a web-safe fallback) and Instrument Serif italic for the one accented word in the headline, as on the site's page
// titles. Pill buttons (radius 999px), 20px card radius, 600px max width, tables and inline CSS only.
// Dark mode: the wordmark is white on the navy band, legible whether or not a client darkens the page.

export const SMC = {
  white: "#FFFFFF", navy: "#1F2933", amber: "#F5A623", ink: "#2A1B02", muted: "#5C6672", surface: "#F4F5F6", rule: "#E4E5E7", ctl: "#8A94A0",
};
export const SMC_SITE = "https://sortmycover.co.za";
/** sites/sortmycover/public/email/wordmark-white.png (scripts/email-wordmark.mjs renders it from the site font and tick). */
export const WORDMARK_URL = `${SMC_SITE}/email/wordmark-white.png`;
export const WORDMARK_W = 166, WORDMARK_H = 33;
export const FONT = "'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const SERIF = "'Instrument Serif',Georgia,'Times New Roman',serif";

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escHtml = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

export const P_STYLE = `margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:25px;font-weight:500;color:${SMC.navy}`;
export const SMALL_STYLE = `font-family:${FONT};font-size:12px;line-height:18px;font-weight:500;color:${SMC.muted}`;
export const LINK_STYLE = `color:${SMC.navy};text-decoration:underline`;

/** One body paragraph from plain text. */
export const smcP = (text) => `<p style="${P_STYLE}">${escHtml(text)}</p>`;

/** The headline, with `accent` (a word or phrase inside it) set in the site's italic serif over a yellow marker. */
export function smcHeading(text, accent) {
  const at = accent ? text.lastIndexOf(accent) : -1;
  const inner = at < 0 ? escHtml(text)
    : `${escHtml(text.slice(0, at))}<em style="font-family:${SERIF};font-style:italic;font-weight:400;font-size:1.08em;letter-spacing:-0.2px;color:${SMC.navy};background-image:linear-gradient(transparent 60%,${SMC.amber} 60%,${SMC.amber} 92%,transparent 92%)">${escHtml(accent)}</em>${escHtml(text.slice(at + accent.length))}`;
  return `<h1 class="smc-h1" style="margin:0 0 20px;font-family:${FONT};font-size:32px;line-height:38px;font-weight:800;letter-spacing:-0.5px;color:${SMC.navy}">${inner}</h1>`;
}

/** Site buttons: yellow pill with amber ink (primary), or white pill with a grey control border (secondary). */
export function smcButtons(list) {
  const cells = list.map((b, n) => {
    const bg = b.secondary ? SMC.white : SMC.amber, fg = b.secondary ? SMC.navy : SMC.ink;
    // the outline sits on the link (not the cell), so a full-width phone button stays inside the card
    const border = b.secondary ? `border:2px solid ${SMC.ctl};` : "", pad = b.secondary ? "12px 24px" : "14px 26px";
    const gap = n < list.length - 1 ? `<td class="smc-gap" width="10" style="width:10px;font-size:0;line-height:0">&nbsp;</td>` : "";
    return `<td class="smc-btn" bgcolor="${bg}" style="border-radius:999px;background-color:${bg}"><a href="${escHtml(b.href)}" style="display:inline-block;${border}padding:${pad};font-family:${FONT};font-size:17px;line-height:22px;font-weight:800;color:${fg};text-decoration:none;border-radius:999px">${escHtml(b.label)}</a></td>${gap}`;
  }).join("");
  return `<table class="smc-btns" role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;margin:4px 0 20px"><tr>${cells}</tr></table>`;
}

/** The details panel (site surface tint, 14px radius): label / value rows. */
export function smcPanel(rows, strong = "When") {
  const tr = rows.map(([k, v]) =>
    `<tr><td valign="top" style="padding:7px 14px 7px 0;font-family:${FONT};font-size:12px;line-height:22px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:${SMC.muted};white-space:nowrap">${escHtml(k)}</td>` +
    `<td valign="top" style="padding:7px 0;font-family:${FONT};font-size:16px;line-height:22px;font-weight:${k === strong ? 800 : 500};color:${SMC.navy}">${escHtml(v)}</td></tr>`).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px;border-collapse:separate"><tr><td bgcolor="${SMC.surface}" style="background-color:${SMC.surface};border-radius:14px;padding:14px 20px"><table role="presentation" cellpadding="0" cellspacing="0" border="0">${tr}</table></td></tr></table>`;
}

 /** The whole document: white page, white card with the navy wordmark band, body, buttons, sign-off, small print. */
export function smcShell(o) {
  const pre = o.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${SMC.white};opacity:0">${escHtml(o.preheader)}</div>` : "";
  const sign = o.signoff === null ? "" : `<tr><td class="smc-pad" style="padding:4px 40px 34px"><p style="margin:0;font-family:${FONT};font-size:16px;line-height:25px;font-weight:500;color:${SMC.navy}">Kind regards,<br><strong style="font-weight:800">${escHtml(o.signoff ?? "The SortMyCover team")}</strong></p></td></tr>`;
  const actions = o.actionsHtml ? `<tr><td class="smc-pad" style="padding:0 40px 6px">${o.actionsHtml}</td></tr>` : "";
  const foot = o.footerLines.map((l, n) => `<p style="margin:0 0 ${n === o.footerLines.length - 1 ? 0 : 8}px;${SMALL_STYLE}">${l}</p>`).join("");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<title>${escHtml(o.docTitle)}</title>
<style>
@font-face{font-family:'DM Sans';font-style:normal;font-weight:500;src:url(${SMC_SITE}/fonts/dm-sans-latin-500-normal.woff2) format('woff2')}
@font-face{font-family:'DM Sans';font-style:normal;font-weight:800;src:url(${SMC_SITE}/fonts/dm-sans-latin-800-normal.woff2) format('woff2')}
@font-face{font-family:'Instrument Serif';font-style:italic;font-weight:400;src:url(${SMC_SITE}/fonts/instrument-serif-latin-400-italic.woff2) format('woff2')}
:root{color-scheme:light only}
@media (max-width:620px){.smc-pad{padding-left:22px!important;padding-right:22px!important}.smc-h1{font-size:28px!important;line-height:33px!important}.smc-outer{padding:12px 8px 28px!important}.smc-btns{width:100%!important}.smc-btn{display:block!important;width:100%!important}.smc-btn a{display:block!important;text-align:center!important}.smc-gap{display:block!important;height:10px!important;width:auto!important}}
</style>
</head>
<body style="margin:0;padding:0;background-color:${SMC.white}" bgcolor="${SMC.white}">
${pre}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${SMC.white}" style="background-color:${SMC.white}">
<tr><td class="smc-outer" align="center" style="padding:28px 12px 40px">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px">
    <tr><td bgcolor="${SMC.white}" style="background-color:${SMC.white};border:1px solid ${SMC.rule};border-radius:20px;box-shadow:0 10px 25px rgba(31,41,51,0.04)">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td class="smc-pad" bgcolor="${SMC.navy}" style="background-color:${SMC.navy};border-radius:19px 19px 0 0;padding:22px 40px"><a href="${SMC_SITE}" style="text-decoration:none"><img src="${WORDMARK_URL}" width="${WORDMARK_W}" height="${WORDMARK_H}" alt="SortMyCover" style="display:block;width:${WORDMARK_W}px;height:${WORDMARK_H}px;border:0;outline:none;font-family:${FONT};font-size:22px;line-height:33px;font-weight:800;color:${SMC.white}"></a></td></tr>
        <tr><td class="smc-pad" style="padding:34px 40px 0">
          <p style="margin:0 0 12px;font-family:${FONT};font-size:12px;line-height:16px;font-weight:800;letter-spacing:1.8px;text-transform:uppercase;color:${SMC.muted}">${escHtml(o.eyebrow)}</p>
          ${o.headingHtml}
        </td></tr>
        <tr><td class="smc-pad" style="padding:0 40px 4px">${o.bodyHtml}</td></tr>
${actions}
${sign}
      </table>
    </td></tr>
    <tr><td class="smc-pad" style="padding:22px 24px 0">${foot}</td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}
