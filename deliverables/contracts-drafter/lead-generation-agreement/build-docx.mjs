// Builds lead-velocity-services-agreement.docx (reusable template) and
// lead-velocity-services-agreement-mark-weston.docx (filled copy) from the
// canonical markdown source in this folder.
//
// Usage:  node build-docx.mjs            (builds both)
//         node build-docx.mjs template   (template only)
//         node build-docx.mjs mark       (Mark Weston copy only)
//
// The `docx` package is loaded from DOCX_PATH (default: the lead-velocity-staging
// clone's node_modules) so nothing is installed here. Override with:
//   DOCX_PATH=C:/path/to/node_modules/docx/dist/index.mjs node build-docx.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DOCX_PATH =
  process.env.DOCX_PATH ||
  'C:/Users/Jono/lead-velocity-staging/node_modules/docx/dist/index.mjs';
const d = await import(pathToFileURL(DOCX_PATH).href);
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Header, Footer, PageNumber,
  Table, TableRow, TableCell, WidthType, ShadingType, AlignmentType, BorderStyle,
} = d;

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(HERE, 'lead-velocity-services-agreement.md');
// version label for the page footer, read from the "Version:" line of the source so it never goes stale
const VERSION = (readFileSync(SOURCE, 'utf8').match(/^Version:\s*([A-Za-z0-9.-]+)/m) || [])[1] || 'LGSA';

// Variants.
// - template: INTERNAL. Keeps every [PLACEHOLDER] and every [LAWYER REVIEW] margin note.
// - mark: CLIENT-FACING copy for Mark Weston. Strips all margin notes (internal legal-risk
//   notes must never reach a client), uses a "Draft for discussion" header, fills Lead
//   Velocity's own drafting defaults, turns blanks only Lead Velocity can fill into
//   "__________" lines, and leaves highlighted only the placeholders Mark must supply.
//   The build fails if any other bracket survives (see CLIENT_ALLOWED).
const CLIENT_DATE = '5 October 2026';
const BLANK = '__________';
const CLIENT_ALLOWED = [
  '[TRADING NAME TO CONFIRM: Oracle Private Wealth or Oracle Brokers]',
  '[CLIENT LEGAL FORM — natural person / company]',
  '[CLIENT ID OR REG NO]',
  '[FSP NUMBER]',
  '[CLIENT PHYSICAL ADDRESS]',
  '[CLIENT SIGNATORY ROLE]',
  '[CLIENT INFORMATION OFFICER NAME]',
  '[CLIENT STATUS — natural person / juristic person with asset value or turnover at or above R2,000,000 / juristic person below R2,000,000]',
];
const VARIANTS = {
  template: {
    out: 'lead-velocity-services-agreement.docx', subs: {},
    header: 'DRAFT — for attorney review. Not legal advice.', headerColor: 'C00000', stripNotes: false,
  },
  mark: {
    out: 'lead-velocity-services-agreement-mark-weston.docx',
    header: `Draft for discussion — ${CLIENT_DATE}`, headerColor: '595959', stripNotes: true,
    allowed: CLIENT_ALLOWED,
    subs: {
      '**DRAFT — for attorney review. Not legal advice.**': '',
      'Template for any authorised FSP client · Client-specific details appear only in the Parties block and Schedule 1.':
        'Prepared for Mark Weston · Bronze Plan',
      '[CLIENT FULL NAME]': 'MARK WESTON',
      '[PRACTICE NAME]':
        'Oracle Private Wealth [TRADING NAME TO CONFIRM: Oracle Private Wealth or Oracle Brokers]',
      '[CLIENT EMAIL]': 'markw@oraclebrokers.com',
      '[CLIENT SIGNATORY NAME]': 'Mark Weston',
      // Lead Velocity's drafting defaults, stated plainly
      '[3] Business Days': '3 Business Days',
      '[30] days': '30 days',
      '[24 hours]': '24 hours',
      '[30] minutes': '30 minutes',
      '[90] days': '90 days',
      '[12] months': '12 months',
      '[5] years': '5 years',
      '[OPTIONAL — CONFIRM] ': '',
      // blanks Lead Velocity completes before sending / at signing
      '[LV REG NO]': BLANK,
      '[DATE]': BLANK,
      '[PLACE]': BLANK,
    },
  },
};

const FONT = 'Arial';
const PAGE_W = 11906; // A4 in twips
const PAGE_H = 16838;
const MARGIN = 1304; // ~2.3 cm
const CONTENT_W = PAGE_W - 2 * MARGIN;
const GREY = '595959';

// ---------- inline formatting: **bold** and [PLACEHOLDER] highlighting ----------
function runs(text, base = {}) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|\[[^\]]+\])/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), ...base }));
    const tok = m[0];
    if (tok.startsWith('**')) {
      // a bold span may itself contain a placeholder
      for (const r of runs(tok.slice(2, -2), { ...base, bold: true })) out.push(r);
    } else {
      out.push(new TextRun({ text: tok, ...base, highlight: base.noHighlight ? undefined : 'yellow' }));
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), ...base }));
  return out;
}

const para = (text, opts = {}, runOpts = {}) =>
  new Paragraph({ spacing: { after: 120 }, ...opts, children: runs(text, runOpts) });

// literal multi-level numbering with hanging indents
const INDENT = { 1: 720, 2: 1440, 3: 2160 };
function numbered(num, text, level) {
  const left = INDENT[level] || 2160;
  return new Paragraph({
    spacing: { after: 120 },
    indent: { left, hanging: 720 },
    tabStops: [{ type: 'left', position: left }],
    children: [new TextRun({ text: num + '\t' }), ...runs(text)],
  });
}
function listItem(letter, text, parentLeft) {
  const left = parentLeft + 567;
  return new Paragraph({
    spacing: { after: 80 },
    indent: { left, hanging: 567 },
    tabStops: [{ type: 'left', position: left }],
    children: [new TextRun({ text: `(${letter})\t` }), ...runs(text)],
  });
}
function marginNote(text, parentLeft) {
  return new Paragraph({
    spacing: { before: 60, after: 160 },
    indent: { left: parentLeft, right: 0 },
    shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F2F2F2' },
    border: { left: { style: BorderStyle.SINGLE, size: 18, color: 'A6A6A6', space: 6 } },
    children: runs(text, { italics: true, color: GREY, size: 18, noHighlight: true }),
  });
}

function table(rows) {
  const cells = rows.map((r) =>
    r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim()),
  );
  const cols = cells[0].length;
  const colW = Math.floor(CONTENT_W / cols);
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: Array(cols).fill(colW),
    rows: cells.map((row, i) =>
      new TableRow({
        tableHeader: i === 0,
        cantSplit: true,
        children: row.map((c) =>
          new TableCell({
            width: { size: colW, type: WidthType.DXA },
            margins: { top: 60, bottom: 60, left: 100, right: 100 },
            shading: i === 0 ? { type: ShadingType.CLEAR, color: 'auto', fill: 'D9E2F3' } : undefined,
            children: [new Paragraph({ children: runs(c, i === 0 ? { bold: true } : {}) })],
          }),
        ),
      }),
    ),
  });
}

// ---------- markdown -> docx blocks ----------
function build(md, stripNotes = false) {
  const lines = md.split(/\r?\n/);
  const children = [];
  let tableBuf = [];
  let lastLeft = 0; // indent of the most recent clause, for (a) items and notes
  const stats = { h1: 0, schedules: [], notes: 0, clauses: 0 };

  const flushTable = () => {
    if (!tableBuf.length) return;
    children.push(table(tableBuf.filter((r) => !/^\|\s*-/.test(r))));
    children.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
    tableBuf = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith('|')) { tableBuf.push(line); continue; }
    flushTable();
    if (!line.trim()) continue;

    let m;
    if (/^\*\*DRAFT/.test(line)) continue; // carried in the page header instead
    if ((m = line.match(/^# (.*)/))) {
      children.push(new Paragraph({ heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, children: runs(m[1]) }));
    } else if ((m = line.match(/^## (.*)/))) {
      const isSchedule = /^Schedule \d/.test(m[1]);
      if (isSchedule) stats.schedules.push(m[1]);
      stats.h1++;
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: isSchedule || m[1] === 'Signatures', keepNext: true, children: runs(m[1]) }));
      lastLeft = 0;
    } else if ((m = line.match(/^### (.*)/))) {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, keepNext: true, children: runs(m[1]) }));
    } else if ((m = line.match(/^> (.*)/))) {
      if (stripNotes) continue;
      stats.notes++;
      children.push(marginNote(m[1], lastLeft || 720));
    } else if ((m = line.match(/^(\d+(?:\.\d+)+[A-Z]?) (.*)/))) {
      const level = m[1].split('.').length - 1;
      stats.clauses++;
      lastLeft = INDENT[level] || 2160;
      children.push(numbered(m[1], m[2], level));
    } else if ((m = line.match(/^(S\d+\.\d+[A-Z]?) (.*)/))) {
      stats.clauses++;
      lastLeft = INDENT[1];
      children.push(numbered(m[1], m[2], 1));
    } else if ((m = line.match(/^\(([a-z]{1,3})\) (.*)/))) {
      children.push(listItem(m[1], m[2], lastLeft || 720));
    } else if ((m = line.match(/^([A-Z])\. (.*)/))) {
      children.push(numbered(m[1] + '.', m[2], 1));
    } else {
      children.push(para(line));
    }
  }
  flushTable();
  return { children, stats };
}

function makeDoc(children, v) {
  const heading = (id, name, size, extra = {}) => ({
    id, name, basedOn: 'Normal', next: 'Normal', quickFormat: true,
    run: { font: FONT, size, bold: true, color: '1F3864' },
    paragraph: { spacing: { before: 240, after: 120 }, ...extra },
  });
  return new Document({
    creator: 'Lead Velocity (Pty) Ltd',
    title: 'Lead Generation Services Agreement',
    description: v.header,
    styles: {
      default: { document: { run: { font: FONT, size: 22 }, paragraph: { spacing: { line: 264 } } } },
      paragraphStyles: [
        heading('Title', 'Title', 32, { alignment: AlignmentType.CENTER, spacing: { before: 120, after: 240 } }),
        heading('Heading1', 'Heading 1', 24, { outlineLevel: 0 }),
        heading('Heading2', 'Heading 2', 22, { outlineLevel: 1 }),
      ],
    },
    sections: [{
      properties: {
        page: { size: { width: PAGE_W, height: PAGE_H }, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN, header: 600, footer: 600 } },
      },
      headers: {
        default: new Header({ children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: v.header, bold: true, color: v.headerColor, size: 18 })],
        })] }),
      },
      footers: {
        default: new Footer({ children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ size: 16, color: GREY, children: [`Lead Velocity — Lead Generation Services Agreement ${VERSION}   ·   Page `, PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES] })],
        })] }),
      },
      children,
    }],
  });
}

// ---------- main ----------
const want = process.argv[2] ? [process.argv[2]] : Object.keys(VARIANTS);
const src = readFileSync(SOURCE, 'utf8');
for (const key of want) {
  const v = VARIANTS[key];
  if (!v) throw new Error(`Unknown variant "${key}". Use: ${Object.keys(VARIANTS).join(', ')}`);
  let md = src;
  for (const [from, to] of Object.entries(v.subs)) md = md.split(from).join(to);
  if (v.stripNotes) md = md.split(/\r?\n/).filter((l) => !l.startsWith('> ')).join('\n');
  if (v.allowed) {
    const left = [...new Set(md.match(/\[[^\]]+\]/g) || [])].filter((p) => !v.allowed.includes(p));
    const leaks = ['LAWYER REVIEW', 'research-memo', 'MASTER-PROMPT', 'attorney review'].filter((w) => md.includes(w));
    if (left.length || leaks.length) throw new Error(`${v.out}: internal text left: ${[...left, ...leaks].join(' | ')}`);
  }
  const { children, stats } = build(md, v.stripNotes);
  const buf = await Packer.toBuffer(makeDoc(children, v));
  writeFileSync(join(HERE, v.out), buf);
  console.log(`${v.out}: ${buf.length} bytes · ${stats.h1} Heading 1 · ${stats.clauses} numbered paragraphs · ${stats.notes} margin notes · schedules: ${stats.schedules.length}`);
}
