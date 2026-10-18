// Run: deno test --allow-read supabase/functions/_shared/lv_emails.test.ts
// Renders every email we send (sample data from lv_emails.samples.ts) and checks the rules that keep them identical in every mail app:
//   - no CSS url() anywhere (Gmail web strips inline url(); backgrounds are HTML background="..." tiles instead)
//   - every coloured <table>/<td> has bgcolor AND background="https://leadvelocity.co.za/email/bg/<tile>.png", and that tile exists
//   - logo, images, links and backgrounds are absolute https (mailto:/tel: allowed for hrefs)
//   - a plain-text part exists, has no markup, and the subject is a single line
//   - user-supplied values are escaped (a hostile string injected into every field never produces markup)
import { buildSamples } from "./lv_emails.samples.ts";
import { cleanRichHtml, looksLikeHtml, splitTextSignature } from "./lv_emails.ts";
import { badge, href, htmlToText, kv, linkify, lvEmail, textBlocks } from "./lv_email.ts";

const TILE_DIR = new URL("../../../public/email/bg/", import.meta.url);
const TILES = new Set([...Deno.readDirSync(TILE_DIR)].map((e) => e.name));

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

/** Every coloured <table>/<td> must carry bgcolor + a background tile that exists and matches the colour. */
function colouredCellProblems(html: string): string[] {
  const problems: string[] = [];
  for (const m of html.matchAll(/<(table|td)\b([^>]*)>/gi)) {
    const attrs = m[2];
    const style = /style="([^"]*)"/i.exec(attrs)?.[1] ?? "";
    const css = /background-color:\s*(#[0-9a-f]{6})/i.exec(style)?.[1];
    const bgcolor = /\sbgcolor="(#[0-9a-f]{6})"/i.exec(attrs)?.[1];
    if (!css && !bgcolor && !/background-image:/i.test(style)) continue;
    const where = `<${m[1]}${attrs.slice(0, 90)}…`;
    const tile = /\sbackground="([^"]*)"/i.exec(attrs)?.[1];
    if (!bgcolor) problems.push(`no bgcolor: ${where}`);
    if (!tile) { problems.push(`no background tile: ${where}`); continue; }
    const t = /^https:\/\/leadvelocity\.co\.za\/email\/bg\/([a-z0-9]+)\.png$/.exec(tile);
    if (!t) { problems.push(`tile is not https://leadvelocity.co.za/email/bg/*.png: ${tile}`); continue; }
    if (!TILES.has(`${t[1]}.png`)) problems.push(`tile file missing in public/email/bg: ${t[1]}.png`);
    if (t[1] !== "topbar" && bgcolor && t[1] !== bgcolor.slice(1).toLowerCase()) problems.push(`tile ${t[1]} does not match bgcolor ${bgcolor}`);
    if (css && bgcolor && css.toLowerCase() !== bgcolor.toLowerCase() && t[1] !== "topbar") problems.push(`style colour ${css} != bgcolor ${bgcolor}`);
  }
  return problems;
}

function linkProblems(html: string): string[] {
  const problems: string[] = [];
  for (const m of html.matchAll(/\s(src|href|background)="([^"]*)"/gi)) {
    const [, attr, val] = m;
    const okScheme = attr.toLowerCase() === "href" ? /^(https:\/\/|mailto:|tel:)/i : /^https:\/\//i;
    if (!okScheme.test(val)) problems.push(`${attr}="${val}" is not absolute https`);
  }
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) if (!/\salt="/i.test(m[0])) problems.push(`img without alt: ${m[0].slice(0, 60)}`);
  return problems;
}

const lv = buildSamples().filter((s) => s.lv);

for (const s of buildSamples()) {
  Deno.test(`${s.id}: subject + plain-text part`, () => {
    const e = s.build();
    assert(e.subject.trim() && !/[\r\n]/.test(e.subject), "subject is empty or multi-line");
    assert(e.text.trim().length > 40, "plain-text part is missing or empty");
    assert(!/<\/?[a-z][^>]*>/i.test(e.text), "plain-text part contains markup");
    assert(!/&(amp|lt|gt|quot|nbsp|rsquo|mdash);/.test(e.text), "plain-text part contains HTML entities");
    assert(/<html[\s>]/i.test(e.html), "html is not a full document");
  });
}

for (const s of lv) {
  Deno.test(`${s.id}: Lead Velocity layout rules`, () => {
    const { html } = s.build();
    assert(!/url\(/i.test(html), "html contains url()");
    const cells = colouredCellProblems(html);
    assert(cells.length === 0, cells.join("\n"));
    const links = linkProblems(html);
    assert(links.length === 0, links.join("\n"));
    assert(html.includes('src="https://leadvelocity.co.za/email/lead-velocity-logo.png"'), "logo missing");
    assert(html.includes('background="https://leadvelocity.co.za/email/bg/1b1330.png"'), "card tile missing");
    assert(html.includes("Lead Velocity Team") || html.includes("Lead Velocity Accounts"), "signature block missing");
    assert(!/#6366f1|#8b5cf6|#f9fafb/i.test(html), "old purple/grey design colours still present");
  });
}

const HOSTILE = `<img src=x onerror=alert(1)>"'&<script>alert(1)</script>`;
for (const s of buildSamples({ inject: HOSTILE }).filter((x) => x.lv)) {
  Deno.test(`${s.id}: user values are escaped`, () => {
    const { html } = s.build();
    assert(!html.includes("<img src=x"), "raw <img> from user input reached the html");
    assert(!/<script/i.test(html), "raw <script> from user input reached the html");
    assert(!html.includes('"\'&<'), "unescaped quote/ampersand/angle sequence reached the html");
    assert(colouredCellProblems(html).length === 0, "layout rules break with hostile input");
  });
}

Deno.test("send-communication: HTML body is sanitised into the dark layout", () => {
  const out = cleanRichHtml(
    `<p style="color:#000" onclick="x()">Hi <b>Sipho</b></p><script>alert(1)</script><a href="javascript:alert(1)">bad</a> <a href="https://ok.example/?a=1&b=2">good</a><img src="https://evil/x.png"><table><tr><td>cell</td></tr></table><ul><li>one</li></ul>`,
  );
  assert(!/onclick|javascript:|<script|alert\(1\)|<img|<table|<td|color:#000/i.test(out), `unsafe markup survived: ${out}`);
  assert(out.includes('href="https://ok.example/?a=1&amp;b=2"'), "good link lost or not escaped");
  assert(out.includes("<li") && out.includes("cell") && out.includes("bad"), "text content was dropped");
  assert(/color:#b9b0d6/.test(out), "base text colour wrapper missing");
});

Deno.test("send-communication: text vs html detection, signature lifted into the layout", () => {
  assert(looksLikeHtml("<p>Hi</p>") && looksLikeHtml("a<br/>b") && !looksLikeHtml("Hi there, 1 < 2 and 3 > 2"), "looksLikeHtml");
  const sig = splitTextSignature(`<p>Hi</p><br/>\n\n──────────────────\n\nLead Velocity Accounts\nFinance Department | Lead Velocity\n\nT. +27 10 976 5618\n`);
  assert(sig.body === "<p>Hi</p>" && sig.sender?.name === "Lead Velocity Accounts" && sig.sender?.title === "Finance Department", JSON.stringify(sig));
  assert(splitTextSignature("Plain message, no signature").sender === undefined, "false signature match");
});

Deno.test("helpers escape and restrict", () => {
  assert(href("javascript:alert(1)") === "https://leadvelocity.co.za", "javascript: href allowed");
  assert(href('https://x.co/?a="b"') === "https://leadvelocity.co.za", "quote in url allowed");
  assert(href("https://x.co/?a=1&b=2") === "https://x.co/?a=1&amp;b=2", "ampersand not escaped");
  assert(linkify("see https://a.co/x.").includes('>https://a.co/x</a>.'), "trailing dot swallowed into link");
  assert(textBlocks("a\n\nb\nc").split("<p").length === 3 && textBlocks("a\n\nb\nc").includes("b<br>c"), "paragraph/line-break split");
  assert(!kv([["<b>k</b>", "<i>v</i>"]]).includes("<i>v"), "kv value not escaped");
  assert(kv([["k", ""]]).includes("&mdash;"), "kv empty value placeholder");
  assert(badge("<x>", "critical").includes("&lt;x&gt;"), "badge not escaped");
  assert(htmlToText('<p>A &amp; B</p><a href="https://x.co">go</a>') === "A & B\n\ngo (https://x.co)", htmlToText('<p>A &amp; B</p><a href="https://x.co">go</a>'));
  const mail = lvEmail({ eyebrow: "e", title: "t", preheader: "<b>x</b>", button: { label: "Go", url: "javascript:alert(1)" } });
  assert(!mail.includes("javascript:") && !mail.includes("<b>x</b>"), "lvEmail let an unsafe button url or preheader through");
});
