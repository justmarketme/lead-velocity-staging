// House-style HTML for the Lead Generation Services Agreement (the look of Lead Velocity's existing
// contracts: gradient top bar, logo, title + plan subtitle, THE CLIENT card, Parties card, pink
// accent-bar headings, coloured callout cards, COMMERCIAL TERMS box, dark Payment Details panel,
// signature block, then Schedules 1-4).
//
// Pure: (resolved agreement + fields) -> one standalone HTML string with all CSS inlined. No DOM,
// no Tailwind. Used by the CRM preview (iframe srcDoc), the CRM PDF and
// scripts/export-contract-pdf.mjs (headless Chrome -> vector PDF). Clause wording always comes from
// the canonical markdown via resolveAgreement(); this file only decides presentation.
import { AGREEMENT_TITLE, CONFIRM_PREFIX, type AgreementFields, type Block, type Inline, type ResolvedAgreement } from "./agreement";
import { TERMS, TOPUP, isPilot, zar } from "../pricing";

/** Shown in the Payment Details panel (Jonathan, 5 Oct 2026). The invoice carries the same details. */
export const PAYMENT_DETAILS = {
  bank: "First National Bank",
  holder: "Lead Velocity (Pty) Ltd",
  account: "63174286724",
  branch: "250655",
  reference: "Your invoice number",
};

export interface RenderOptions {
  /** URL or data: URI of the logo (src/assets/lead-velocity-logo-contract.png, 287x300 quantized PNG). */
  logoSrc: string;
}

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function runs(inl: Inline[]): string {
  return inl
    .map((i) => {
      let h: string;
      if (i.kind === "text") h = esc(i.text);
      else if (i.blank) h = `<span class="blank"></span>`;
      else if (i.confirm) h = `<mark class="ph">${esc(i.value || "")}</mark>`;
      else if (i.value) h = esc(i.value);
      else h = `<mark class="ph">${esc(i.token)}</mark>`;
      return i.bold ? `<b>${h}</b>` : h;
    })
    .join("");
}

const plain = (inl: Inline[]) => inl.map((i) => (i.kind === "text" ? i.text : i.value || "")).join("");

function block(b: Block): string {
  switch (b.type) {
    case "clause":
      return `<p class="cl l${Math.min(b.level, 3)}"><span class="n">${esc(b.num)}</span><span class="t">${runs(b.inl)}</span></p>`;
    case "item":
      return `<p class="it l${Math.min(Math.max(b.level, 1), 3)}"><span class="n">(${esc(b.letter)})</span><span class="t">${runs(b.inl)}</span></p>`;
    case "recital":
      return `<p class="cl l1"><span class="n">${esc(b.letter)}.</span><span class="t">${runs(b.inl)}</span></p>`;
    case "note":
      return `<div class="note"><span>Internal note</span>${runs(b.inl)}</div>`;
    case "h3":
      return `<h3>${runs(b.inl)}</h3>`;
    case "table":
      return `<table${b.rows.length <= 7 ? ' class="short"' : ""}>${b.rows
        .map((r, i) => `<tr>${r.map((c) => (i === 0 ? `<th>${runs(c)}</th>` : `<td>${runs(c)}</td>`)).join("")}</tr>`)
        .join("")}</table>`;
    case "para":
      return `<p>${runs(b.inl)}</p>`;
    default:
      return "";
  }
}

type Section = { title: Block & { type: "h2" }; body: Block[] };

// callout colour per clause number, mirroring the house contract's coloured cards
const CALLOUT: Record<string, string> = {
  "2": "green", // commencement, renewal and term
  "3": "slate", // nature of the relationship: the FAIS firewall
  "6": "red", // shortfall, rollover and refund
  "8": "slate", // fees: never success-based
  "11": "orange", // termination and notice
  "13": "blue", // POPIA
  "19": "purple", // non-solicitation
  "25": "slate", // general provisions
};

function heading(s: Section): string {
  return `<h2><i></i>${runs(s.title.inl)}</h2>`;
}

/** Heading and first block share a keep-together wrapper so a heading never ends a page. */
function sectionBody(s: Section): string {
  const [first, ...rest] = s.body;
  const out: string[] = [];
  for (let k = 0; k < rest.length; k++) {
    const b = rest[k];
    const next = rest[k + 1];
    // a clause that introduces a short table stays on the same page as it
    if (next?.type === "table" && b.type !== "table" && next.rows.length <= 7) {
      out.push(`<div class="keep document-section">${block(b)}${block(next)}</div>`);
      k++;
    } else out.push(block(b));
  }
  return `<div class="keep document-section">${heading(s)}${first ? block(first) : ""}</div>${out.join("")}`;
}

const isLong = (s: Section) => s.body.length > 9 || s.body.reduce((n, b) => n + (b.type === "table" ? 400 : "inl" in b ? plain(b.inl).length : 0), 0) > 1800;

function partyCard(label: string, cls: string, p: Block | undefined, alias: string, extra = ""): string {
  if (!p || !("inl" in p)) return "";
  // card title = the party's bold name (first bold run); body = the rest of the canonical paragraph
  const inl = p.inl;
  const firstBold = inl.findIndex((i) => i.bold);
  const titleEnd = firstBold < 0 ? 0 : inl.findIndex((i, k) => k > firstBold && !i.bold);
  const title = firstBold < 0 ? [] : inl.slice(firstBold, titleEnd < 0 ? inl.length : titleEnd).map((i) => ({ ...i, bold: false }));
  const rest = inl.slice(titleEnd < 0 ? inl.length : titleEnd);
  if (rest[0]?.kind === "text") rest[0] = { ...rest[0], text: rest[0].text.replace(/^,\s*/, "") };
  return `<div class="party ${cls}"><div class="lbl">${label}</div><div class="pname">${runs(title)}</div><p>${runs(rest)}</p>${extra}<p class="alias">(hereinafter referred to as ${esc(alias)})</p></div>`;
}

export function renderAgreementHtml(doc: ResolvedAgreement, fields: AgreementFields, opts: RenderOptions): string {
  // header card: filled value, or the yellow token / yellow to-confirm value
  const headerValue = (t: string) => {
    const v = (fields.placeholders?.[t] || "").trim();
    if (!v || v.startsWith("(")) return `<mark class="ph">${esc(t)}</mark>`;
    return v.startsWith(CONFIRM_PREFIX) ? `<mark class="ph">${esc(v.slice(1).trim())}</mark>` : esc(v);
  };
  const tier = doc.tier;
  const pilot = isPilot(tier);

  // split into preamble + sections at each "## " heading
  const pre: Block[] = [];
  const sections: Section[] = [];
  for (const b of doc.blocks) {
    if (b.type === "h2") sections.push({ title: b, body: [] });
    else if (sections.length) sections[sections.length - 1].body.push(b);
    else pre.push(b);
  }
  const ref = pre.find((b) => b.type === "para");

  const clientName = (fields.placeholders?.["[CLIENT FULL NAME]"] || "").replace(CONFIRM_PREFIX, "").trim();
  const subtitle = pilot
    ? `${tier.name}: ${tier.committed_leads} Qualified Leads, one introductory ${TERMS.cycle_days}-day cycle`
    : `${tier.name}: ${tier.committed_leads} Qualified Leads per ${TERMS.cycle_days}-day cycle`;

  const out: string[] = [];
  out.push(`<div class="top"></div><header class="hd">
    <div><img class="logo" src="${esc(opts.logoSrc)}" alt="Lead Velocity"><h1>${esc(AGREEMENT_TITLE)}</h1><div class="sub">${esc(subtitle)}</div>${
      ref && "inl" in ref ? `<div class="ref">${runs(ref.inl)}</div>` : ""
    }</div>
    <div class="clientcard"><div class="lbl">The Client</div><div class="cn">${headerValue("[CLIENT FULL NAME]")}</div><div class="cc">${headerValue("[PRACTICE NAME]")}</div></div></header>`);

  const commercial = `<section class="terms"><div class="lbl">Commercial terms</div><div class="grid">
    <div><div class="k">Service fee</div><div class="fee">${esc(zar(tier.price_zar))}</div><div class="v2">${pilot ? "once-off" : `per ${TERMS.cycle_days}-day cycle`}, excl. VAT, paid in advance. Ad spend included</div></div>
    <div><div class="k">Lead target</div><div class="v">${tier.committed_leads} Qualified Leads per cycle</div></div>
    <div><div class="k">Duration</div><div class="v">${pilot ? `One introductory ${TERMS.cycle_days}-day cycle` : `Month-to-month (${TERMS.cycle_days}-day cycles)`}</div></div>
    <div><div class="k">Top-ups</div><div class="v">${esc(zar(TOPUP.price_per_lead_zar))} per lead, minimum ${TOPUP.min_leads}</div></div>
  </div></section>`;

  const payment = `<section class="pay"><div class="pt">Payment Details</div><div class="pg">
    <div>Bank: <b>${PAYMENT_DETAILS.bank}</b></div><div>Account Holder: <b>${PAYMENT_DETAILS.holder}</b></div>
    <div>Account #: <b>${PAYMENT_DETAILS.account}</b></div><div>Branch Code: <b>${PAYMENT_DETAILS.branch}</b></div>
    <div>Reference: <b>${PAYMENT_DETAILS.reference}</b></div></div></section>`;

  for (const s of sections) {
    const title = s.title.text;
    const num = (title.match(/^(\d+)\./) || [])[1];

    if (title === "Parties") {
      const paras = s.body.filter((b) => b.type === "para");
      const parties = paras.filter((b) => "inl" in b && b.inl[0]?.bold);
      const lead = paras.find((b) => !parties.includes(b));
      const phone = (fields.client_phone || "").trim();
      out.push(`<section class="card parties"><h2><i></i>Parties to this Agreement</h2>${lead ? block(lead) : ""}<div class="two">${partyCard(
        "The Service Provider",
        "sp",
        parties[0],
        '"Lead Velocity" or "the Service Provider"'
      )}${partyCard("The Client", "cp", parties[1], '"the Client"', phone ? `<p>Tel: ${esc(phone)}</p>` : "")}</div></section>`);
      continue;
    }
    if (title === "Background") {
      out.push(`<section class="card recitals">${sectionBody(s)}</section>`);
      out.push(commercial);
      continue;
    }
    if (num === "1") {
      out.push(`<section class="card defs long">${sectionBody(s)}</section>`);
      continue;
    }
    if (title === "Signatures") {
      out.push(payment);
      const table = s.body.find((b) => b.type === "table") as (Block & { type: "table" }) | undefined;
      const before = s.body.slice(0, table ? s.body.indexOf(table) : s.body.length);
      const after = table ? s.body.slice(s.body.indexOf(table) + 1) : [];
      let sig = "";
      if (table) {
        const cols = table.rows[0].map((_, c) => {
          const head = plain(table.rows[0][c]).replace(/^For\s+/i, "").replace(/\s*\(PTY\) LTD/i, "");
          const lines = table.rows
            .slice(1)
            .filter((r) => !/^Signature:/.test(plain(r[c])))
            .map((r) => `<div class="sl">${runs(r[c])}</div>`)
            .join("");
          return `<div class="sc"><div class="lbl">For ${esc(head)}</div><div class="line"></div>${lines}</div>`;
        });
        sig = `<div class="sigs">${cols.join("")}</div>`;
      }
      out.push(`<section class="sig"><div class="keep document-section"><h2><i></i>Signatures</h2>${before.map(block).join("")}</div>${sig}${after.map(block).join("")}</section>`);
      continue;
    }
    if (/^Schedule \d/.test(title)) {
      out.push(`<section class="sched">${sectionBody(s)}</section>`);
      continue;
    }
    const colour = num ? CALLOUT[num] : undefined;
    if (colour) out.push(`<section class="callout ${colour}${isLong(s) ? " long" : ""}">${sectionBody(s)}</section>`);
    else out.push(`<section class="plain">${sectionBody(s)}</section>`);
  }

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(AGREEMENT_TITLE)}${
    clientName ? ` · ${esc(clientName)}` : ""
  }</title><style>${CSS}</style></head><body><div class="page">${out.join("\n")}</div></body></html>`;
}

const CSS = `
@page { size: A4; margin: 14mm 0 16mm 0; @bottom-center { content: "Lead Generation Services Agreement \\00B7  Page " counter(page) " of " counter(pages); font: 8pt "Segoe UI", Arial, sans-serif; color: #94a3b8; } }
@page :first { margin-top: 0; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html, body { margin: 0; padding: 0; background: #fff; }
body { font-family: "Segoe UI", Inter, Arial, sans-serif; font-size: 9.6pt; line-height: 1.55; color: #475569; }
.page { width: 210mm; margin: 0 auto; padding: 0 17mm 10mm; background: #fff; }
.top { height: 7px; margin: 0 -17mm 0; background: linear-gradient(90deg, #db2777, #9333ea, #db2777); }
b { color: #0f172a; font-weight: 700; }
p { margin: 0 0 6px; orphans: 3; widows: 3; }
mark.ph { background: #fde047; color: #0f172a; padding: 0 2px; border-radius: 2px; box-shadow: 0 0 0 1px #f59e0b inset; }
.blank { display: inline-block; min-width: 34mm; border-bottom: 1px solid #64748b; height: 1em; vertical-align: baseline; }
.hd { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding: 26px 0 16px; border-bottom: 2px solid #f1f5f9; margin-bottom: 18px; }
.logo { height: 58px; width: auto; display: block; margin-bottom: 14px; }
h1 { font-size: 22pt; line-height: 1.15; color: #0f172a; font-weight: 800; margin: 0; letter-spacing: -0.01em; }
.sub { color: #64748b; font-weight: 600; font-size: 10.5pt; margin-top: 4px; }
.ref { color: #94a3b8; font-size: 7.5pt; margin-top: 6px; }
.lbl { text-transform: uppercase; letter-spacing: .12em; font-size: 6.8pt; font-weight: 800; color: #94a3b8; margin-bottom: 4px; }
.clientcard { min-width: 58mm; text-align: right; border: 1.5px solid #475569; border-radius: 10px; padding: 9px 14px; margin-top: 30px; }
.clientcard .cn { font-weight: 800; color: #0f172a; font-size: 11.5pt; }
.clientcard .cc { color: #64748b; font-size: 8.8pt; }
h2 { display: flex; align-items: center; gap: 10px; font-size: 12pt; color: #0f172a; font-weight: 800; margin: 0 0 8px; break-after: avoid; page-break-after: avoid; }
h2 i { display: inline-block; width: 3px; height: 17px; border-radius: 2px; background: #db2777; flex: none; }
h3 { font-size: 10.5pt; color: #0f172a; margin: 10px 0 4px; break-after: avoid; }
.keep { break-inside: avoid; page-break-inside: avoid; }
section { margin: 0 0 16px; }
section.plain { padding: 2px 0; }
.card, .callout, .terms, .pay { border-radius: 12px; padding: 14px 18px 10px; break-inside: avoid; page-break-inside: avoid; }
.long { break-inside: auto !important; page-break-inside: auto !important; -webkit-box-decoration-break: clone; box-decoration-break: clone; }
.card.parties { border: 1.5px solid #475569; background: #f8fafc; }
.card.recitals { border: 1px solid #e2e8f0; background: #f8fafc; font-style: italic; }
.card.recitals h2 { font-style: normal; }
.card.defs { border: 1.5px solid #fbcfe8; background: #fff; }
.two { display: flex; gap: 14px; margin-top: 10px; }
.party { flex: 1; border-radius: 10px; padding: 12px 14px; background: #fff; font-size: 8.8pt; }
.party.sp { border: 1px solid #fbcfe8; }
.party.sp .lbl { color: #db2777; }
.party.cp { border: 1px solid #e2e8f0; }
.party.cp .lbl { color: #475569; }
.pname { font-weight: 800; color: #0f172a; font-size: 11.5pt; margin-bottom: 6px; line-height: 1.3; }
.alias { font-style: italic; color: #94a3b8; font-size: 7.8pt; margin-top: 8px; }
.terms { border: 1.5px solid #475569; background: #f8fafc; }
.terms .lbl { color: #64748b; margin-bottom: 10px; }
.terms .grid { display: grid; grid-template-columns: 1.3fr 1fr 1fr 1fr; gap: 14px; }
.terms .k { font-size: 6.8pt; text-transform: uppercase; letter-spacing: .1em; color: #94a3b8; font-weight: 700; margin-bottom: 3px; }
.terms .fee { color: #db2777; font-weight: 800; font-size: 16pt; line-height: 1.1; }
.terms .v { color: #0f172a; font-weight: 700; font-size: 9.6pt; }
.terms .v2 { color: #64748b; font-size: 7.8pt; margin-top: 2px; }
.callout.slate { background: #f8fafc; border: 1.5px solid #64748b; }
.callout.slate h2 i { background: #475569; }
.callout.red { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; }
.callout.red h2, .callout.red b { color: #7f1d1d; } .callout.red h2 i { background: #dc2626; }
.callout.green { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; }
.callout.green h2, .callout.green b { color: #14532d; } .callout.green h2 i { background: #059669; }
.callout.orange { background: #fff7ed; border: 1px solid #fed7aa; color: #9a3412; }
.callout.orange h2, .callout.orange b { color: #7c2d12; } .callout.orange h2 i { background: #ea580c; }
.callout.blue { background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; }
.callout.blue h2, .callout.blue b { color: #1e3a8a; } .callout.blue h2 i { background: #2563eb; }
.callout.purple { background: #f5f3ff; border: 1px solid #ddd6fe; color: #5b21b6; }
.callout.purple h2, .callout.purple b { color: #4c1d95; } .callout.purple h2 i { background: #7c3aed; }
.cl, .it { display: grid; grid-template-columns: 9.5mm 1fr; column-gap: 2mm; break-inside: avoid; }
.cl.l2 { margin-left: 11.5mm; } .cl.l3 { margin-left: 23mm; }
.it { grid-template-columns: 7mm 1fr; margin-left: 11.5mm; } .it.l2 { margin-left: 23mm; } .it.l3 { margin-left: 34.5mm; }
.n { color: #94a3b8; font-variant-numeric: tabular-nums; }
.callout .n { color: inherit; opacity: .7; }
.note { margin: 2px 0 10px 11.5mm; padding: 6px 10px; border-left: 3px solid #cbd5e1; background: #f1f5f9; font-style: italic; font-size: 7.8pt; color: #64748b; break-inside: avoid; }
.note span { display: block; font-style: normal; font-weight: 800; text-transform: uppercase; letter-spacing: .1em; font-size: 6.5pt; color: #94a3b8; }
table { width: 100%; border-collapse: separate; border-spacing: 0; margin: 8px 0 12px; font-size: 8.8pt; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
th { background: #f1f5f9; color: #0f172a; text-align: left; font-weight: 700; padding: 6px 9px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
td { padding: 6px 9px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
tr:last-child td { border-bottom: 0; }
tr { break-inside: avoid; page-break-inside: avoid; }
tr:first-child, tr:nth-child(2) { break-after: avoid; page-break-after: avoid; }
table.short { break-inside: avoid; page-break-inside: avoid; }
.pay { background: #0f172a; color: #cbd5e1; margin-top: 22px; }
.pay .pt { color: #fff; font-weight: 800; font-size: 10pt; margin-bottom: 8px; }
.pay .pg { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; font-size: 9pt; }
.pay b { color: #fff; }
.sig { border-top: 2px solid #475569; padding-top: 16px; margin-top: 18px; break-inside: avoid; }
.sigs { display: flex; gap: 36px; margin: 14px 0 12px; }
.sc { flex: 1; }
.sc .line { height: 46px; border-bottom: 1px solid #cbd5e1; margin: 6px 0 8px; }
.sl { font-size: 8.8pt; color: #64748b; line-height: 1.8; }
section.sched { break-before: page; page-break-before: always; padding-top: 6px; }
@media screen { body { background: #fff; } .page { min-height: 297mm; } section.sched { margin-top: 28px; padding-top: 22px; border-top: 2px dashed #e2e8f0; } }
`;
