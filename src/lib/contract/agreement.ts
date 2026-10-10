// Lead Generation Services Agreement: the ONLY contract the CRM Contract Generator produces.
//
// Source of truth for the wording is the canonical markdown in
//   deliverables/contracts-drafter/lead-generation-agreement/lead-velocity-services-agreement.md
// imported raw at build time. Nothing in src/ re-types clause text. Plan prices and lead counts
// come from src/lib/pricing.ts (which reads automation/billing/pricing.seed.json).
//
// Pipeline: parse the markdown once -> apply the chosen Plan to Schedule 1 -> resolve [PLACEHOLDERS]
// from the form. The preview (AgreementPreview), the .docx (contractToDocx) and the PDF (preview DOM)
// all render the same resolved block list, so they cannot drift apart.
import agreementMd from "../../../deliverables/contracts-drafter/lead-generation-agreement/lead-velocity-services-agreement.md?raw";
import { ALL_PLANS, PILOT, PILOT_OFFERED, QUALIFIED, TERMS, TIERS, TOPUP, isPilot, perLead, planByName, topupMinimumZar, zar, type PricingTier } from "@/lib/pricing";

// ---------------------------------------------------------------- types

export type Inline =
  | { kind: "text"; text: string; bold?: boolean }
  | { kind: "ph"; token: string; value?: string; bold?: boolean; blank?: boolean; confirm?: boolean };

export type Block =
  | { type: "banner"; inl: Inline[] }
  | { type: "title"; inl: Inline[] }
  | { type: "h2"; inl: Inline[]; text: string; pageBreak: boolean }
  | { type: "h3"; inl: Inline[] }
  | { type: "clause"; num: string; level: number; inl: Inline[] }
  | { type: "item"; letter: string; level: number; inl: Inline[] }
  | { type: "recital"; letter: string; inl: Inline[] }
  | { type: "note"; level: number; inl: Inline[] }
  | { type: "table"; rows: Inline[][][] }
  | { type: "para"; inl: Inline[] };

type RawBlock =
  | { type: "banner" | "title" | "h3" | "para"; text: string }
  | { type: "h2"; text: string }
  | { type: "clause"; num: string; level: number; text: string }
  | { type: "item"; letter: string; level: number; text: string }
  | { type: "recital"; letter: string; text: string }
  | { type: "note"; level: number; text: string }
  | { type: "table"; rows: string[][]; context: string };

export interface AgreementFields {
  plan: string; // Pilot / Bronze / Silver / Gold (plan name from pricing.seed.json via ALL_PLANS)
  client_phone: string; // CRM only: the agreement's Parties block has no client telephone
  include_notes: boolean; // INTERNAL: [LAWYER REVIEW] side notes in preview / downloads; forced off for email + save
  placeholders: Record<string, string>; // keyed by the exact [TOKEN] in the markdown
}

export interface ResolvedAgreement {
  templateVersion: string;
  blocks: Block[];
  unfilled: string[]; // distinct placeholder tokens still empty, in document order
  warnings: string[]; // template / pricing mismatches; shown in the UI
  tier: PricingTier;
}

// ---------------------------------------------------------------- template constants

export const AGREEMENT_TITLE = "Lead Generation Services Agreement";
export const AGREEMENT_MD: string = agreementMd;
export const TEMPLATE_VERSION: string = (agreementMd.match(/Version:\s*([A-Za-z0-9.\-]+)/) || [])[1] || "unknown";

const GENERIC_VERSION_TAIL =
  "Template for any authorised FSP client · Client-specific details appear only in the Parties block and Schedule 1.";

export type PrimaryField = {
  token: string;
  label: string;
  hint?: string;
  options?: string[];
  date?: boolean;
  email?: boolean;
};

const CPA_TOKEN =
  "[CLIENT STATUS — natural person / juristic person with asset value or turnover at or above R2,000,000 / juristic person below R2,000,000]";

/**
 * The form's named fields. Each maps to one exact placeholder token in the markdown; a field whose
 * token the template no longer contains (e.g. jurisdiction, now fixed to Gauteng in 25.9) is hidden.
 */
const NAMED_FIELDS: PrimaryField[] = [
  { token: "[CLIENT FULL NAME]", label: "Client full name" },
  {
    token: "[CLIENT DESCRIPTION — e.g. a natural person contracting in his or her personal capacity / a company, registration number …, trading as …]",
    label: "Who the client is",
    hint: "e.g. a natural person contracting in his personal capacity / XYZ (Pty) Ltd, registration number …, trading as …",
  },
  { token: "[FSP NUMBER]", label: "FSP number", hint: "Check the FSCA register" },
  { token: "[CLIENT PHYSICAL ADDRESS]", label: "Physical address (domicilium)" },
  { token: "[CLIENT EMAIL]", label: "Email", email: true },
  { token: "[CLIENT SIGNATORY NAME]", label: "Signatory name" },
  { token: "[CLIENT SIGNATORY ROLE]", label: "Signatory role", hint: "e.g. Director" },
  {
    token: "[CLIENT SIGNING CAPACITY — e.g. who signs in his or her personal capacity / represented by NAME, ROLE, who is authorised to sign]",
    label: "Signing capacity",
    hint: "e.g. who signs in his personal capacity / represented by Jane Doe, Director, who is authorised to sign",
  },
  { token: "[FIRST PAYMENT DATE]", label: "Start / first payment date", date: true },
  {
    token: "[WESTERN CAPE / GAUTENG — CONFIRM]",
    label: "Jurisdiction (High Court division)",
    options: ["Gauteng", "Western Cape", "KwaZulu-Natal", "Eastern Cape", "Free State"],
  },
  {
    token: CPA_TOKEN,
    label: "CPA status (clause 23)",
    // options come straight from the placeholder's own wording
    options: CPA_TOKEN.slice(CPA_TOKEN.indexOf("—") + 1, -1).split(" / ").map((s) => s.trim()),
  },
];
export const PRIMARY_FIELDS: PrimaryField[] = NAMED_FIELDS.filter((f) => agreementMd.includes(f.token));

const PRIMARY_TOKENS = new Set(PRIMARY_FIELDS.map((f) => f.token));
const DATE_TOKENS = new Set(PRIMARY_FIELDS.filter((f) => f.date).map((f) => f.token));

/** Placeholder value that removes the placeholder from the text (e.g. "[OPTIONAL — CONFIRM]"). */
export const OMIT = "(omit)";
/** Placeholder value rendered as a blank line to complete by hand (e.g. dates at signing). */
export const BLANK = "(blank)";
/** Prefix for a value shown but still highlighted because it must be confirmed (e.g. "?Oracle Private Wealth"). */
export const CONFIRM_PREFIX = "?";

/** Short bracketed defaults like [3], [30], [24 hours] carry a suggested value: their own text. */
export const suggestedValue = (token: string): string | null => {
  const inner = token.slice(1, -1);
  return /^\d+( [a-z]+)?$/.test(inner) ? inner : null;
};

export const defaultFields = (): AgreementFields => ({
  plan: (planByName("Bronze") || TIERS[0])?.name || "Bronze", // default Bronze; never inferred from desired leads
  client_phone: "",
  include_notes: false, // INTERNAL ONLY: never on the email / save path
  placeholders: {},
});

// ---------------------------------------------------------------- parsing

const INLINE_RE = /(\*\*[^*]+\*\*|\[[^\]]+\])/g;

function parseInline(text: string, values: Record<string, string> | null, bold = false): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(INLINE_RE.source, "g");
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ kind: "text", text: text.slice(last, m.index), bold });
    const tok = m[0];
    if (tok.startsWith("**")) out.push(...parseInline(tok.slice(2, -2), values, true));
    else if (values === null) out.push({ kind: "text", text: tok, bold }); // notes: brackets are prose
    else {
      const v = (values[tok] || "").trim();
      if (v === OMIT) {
        last = m.index + tok.length;
        if (text[last] === " ") last++; // no double space where the token was
        continue;
      }
      if (v === BLANK) out.push({ kind: "ph", token: tok, value: "", blank: true, bold });
      else if (v.startsWith(CONFIRM_PREFIX) && v.length > 1) out.push({ kind: "ph", token: tok, value: v.slice(1).trim(), confirm: true, bold });
      else out.push({ kind: "ph", token: tok, value: v || undefined, bold });
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last), bold });
  return out;
}

function splitRow(line: string): string[] {
  return line.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
}

function parseRaw(md: string): RawBlock[] {
  const blocks: RawBlock[] = [];
  let table: string[] = [];
  let level = 1; // indent level of the latest clause, for (a) items and notes
  let context = ""; // latest clause number, so tables know which clause they belong to

  const flush = () => {
    if (!table.length) return;
    blocks.push({ type: "table", rows: table.filter((r) => !/^\|\s*-/.test(r)).map(splitRow), context });
    table = [];
  };

  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (line.startsWith("|")) { table.push(line); continue; }
    flush();
    if (!line.trim()) continue;
    let m: RegExpMatchArray | null;
    if (/^\*\*DRAFT/.test(line)) blocks.push({ type: "banner", text: line.replace(/^\*\*|\*\*$/g, "") });
    else if ((m = line.match(/^# (.*)/))) blocks.push({ type: "title", text: m[1] });
    else if ((m = line.match(/^## (.*)/))) { blocks.push({ type: "h2", text: m[1] }); level = 1; context = m[1]; }
    else if ((m = line.match(/^### (.*)/))) blocks.push({ type: "h3", text: m[1] });
    else if ((m = line.match(/^> (.*)/))) blocks.push({ type: "note", level, text: m[1] });
    else if ((m = line.match(/^(\d+(?:\.\d+)+) (.*)/))) {
      level = m[1].split(".").length - 1;
      context = m[1];
      blocks.push({ type: "clause", num: m[1], level, text: m[2] });
    } else if ((m = line.match(/^(S\d+\.\d+) (.*)/))) {
      level = 1;
      context = m[1];
      blocks.push({ type: "clause", num: m[1], level, text: m[2] });
    } else if ((m = line.match(/^\(([a-z]{1,3})\) (.*)/))) blocks.push({ type: "item", letter: m[1], level, text: m[2] });
    else if ((m = line.match(/^([A-Z])\. (.*)/))) blocks.push({ type: "recital", letter: m[1], text: m[2] });
    else blocks.push({ type: "para", text: line });
  }
  flush();
  return blocks;
}

const RAW = parseRaw(agreementMd);

// ---------------------------------------------------------------- plan + pricing (Schedule 1)

const TIER_TARGET = (QUALIFIED as { campaign_target_budget_zar?: number | null }).campaign_target_budget_zar ?? null;

const planRows = (t: PricingTier): Record<string, string> => ({
  Plan: t.name,
  "Fee per Billing Cycle": `${zar(t.price_zar)} excl. VAT, ${isPilot(t) ? "once-off, " : ""}paid in advance`,
  // with budget tiers in the pricing source, accepted B-tier leads count towards the commitment (clauses 5.6, 5.7)
  "Committed Leads per Billing Cycle": `${t.committed_leads} Qualified Leads${TIER_TARGET ? " (A-tier, plus any B-tier the Client accepts)" : ""}`,
  "Effective Lead Price": `${zar(perLead(t))} per Qualified Lead (${zar(t.price_zar)} ÷ ${t.committed_leads})`,
});

const topupRows = (): Record<string, string> => ({
  "Top-Up Price": `${zar(TOPUP.price_per_lead_zar)} per Qualified Lead excl. VAT`,
  "Minimum Top-Up": `${TOPUP.min_leads} Qualified Leads (${zar(topupMinimumZar())} excl. VAT)`,
  Notice: `At least ${TOPUP.notice_days} days' written notice`,
});

function overrideRows(rows: string[][], values: Record<string, string>, where: string, warnings: string[], checkAgainstTemplate: boolean): string[][] {
  const seen = new Set<string>();
  const next = rows.map((r, i) => {
    if (i === 0 || !(r[0] in values)) return r;
    seen.add(r[0]);
    if (checkAgainstTemplate && r[1] !== values[r[0]])
      warnings.push(`${where} "${r[0]}": template says "${r[1]}", pricing source says "${values[r[0]]}".`);
    return [r[0], values[r[0]], ...r.slice(2)];
  });
  for (const k of Object.keys(values)) if (!seen.has(k)) warnings.push(`${where}: row "${k}" not found in the agreement template.`);
  return next;
}

function applyPlan(raw: RawBlock[], tier: PricingTier, clientName: string, warnings: string[]): RawBlock[] {
  // S1.3 lists every Plan except the Client's own; its "X are available" sentence names the monthly ladder only
  const others = ALL_PLANS.filter((t) => t.name !== tier.name);
  const othersText = others.filter((t) => !isPilot(t)).map((t) => t.name).join(", ").replace(/, ([^,]*)$/, " and $1");
  let s13Text = false;
  const out = raw.map((b): RawBlock => {
    if (b.type === "para" && b.text.startsWith("Version:") && clientName)
      return { ...b, text: b.text.replace(GENERIC_VERSION_TAIL, `Prepared for ${clientName} · ${tier.name} Plan`) };
    if (b.type === "clause" && b.num === "S1.3" && b.text.includes("Silver and Gold are available")) {
      s13Text = true;
      return { ...b, text: b.text.replace("Silver and Gold are available", `${othersText} are available`) };
    }
    if (b.type !== "table") return b;
    if (b.context === "S1.1") {
      // the template is written for Bronze; when Bronze is chosen the two must agree exactly
      const templatePlan = b.rows.find((r) => r[0] === "Plan")?.[1];
      const check = templatePlan === tier.name;
      return { ...b, rows: overrideRows(b.rows, planRows(tier), "Schedule 1 S1.1", warnings, check) };
    }
    if (b.context === "S1.2") return { ...b, rows: overrideRows(b.rows, topupRows(), "Schedule 1 S1.2", warnings, true) };
    if (b.context === "S1.3") {
      // the template's row for each Plan (the Pilot's label is kept as written) is checked against the pricing source;
      // the rows printed are always the pricing source's, so a stale template can never reach a signed copy
      const templateRow = (t: PricingTier) => b.rows.find((r, i) => i > 0 && new RegExp(`^${t.name}\\b`).test(r[0]));
      const rowFor = (t: PricingTier): string[] => {
        const pilot = isPilot(t);
        const tpl = templateRow(t);
        const row = pilot
          ? [tpl?.[0] || t.name, `${zar(t.price_zar)} excl. VAT, once-off`, `${t.committed_leads} Qualified Leads (${zar(perLead(t))} each)`]
          : [t.name, `${zar(t.price_zar)} excl. VAT`, `${t.committed_leads} Qualified Leads, about ${zar(perLead(t))} each`];
        if (!tpl && pilot) warnings.push("Schedule 1 S1.3: no Pilot row in the agreement template.");
        else if (tpl && (tpl[1] !== row[1] || tpl[2] !== row[2]))
          warnings.push(`Schedule 1 S1.3 ${t.name}: template says "${tpl[1]} | ${tpl[2]}", pricing source says "${row[1]} | ${row[2]}".`);
        return row;
      };
      if (templateRow(tier)) rowFor(tier); // the Client's own Plan is not printed here, but a listed row is still compared
      return { ...b, rows: [b.rows[0], ...others.map(rowFor)] };
    }
    return b;
  });
  if (!s13Text) warnings.push('Schedule 1 S1.3: "Silver and Gold are available" not found; other-plan wording left as written.');
  return out;
}

/** Numbers typed in the agreement's prose that must equal the pricing source. */
function consistencyWarnings(md: string): string[] {
  const q = QUALIFIED as { budget_max_zar?: number | null; campaign_target_budget_zar?: number | null };
  const maxBudget = q.budget_max_zar ?? null;
  const targetBudget = q.campaign_target_budget_zar ?? null;
  const checks: [string, RegExp, string][] = [
    ["Billing Cycle length (1.1.4)", /"\*\*Billing Cycle\*\*" means the period of (\d+) days/, String(TERMS.cycle_days)],
    ["Rollover Period (1.1.29)", /"\*\*Rollover Period\*\*" means the period of up to (\d+) days/, String(TERMS.shortfall_rollover_days)],
    ["Rollover end day (1.1.29)", /\(ending on day (\d+) counted from the start/, String(TERMS.cycle_days + TERMS.shortfall_rollover_days)],
    ["Cancellation notice (11.1)", /11\.1 \*\*Cancellation on notice\.\*\* .*?at least (\d+) days'/, String(TERMS.cancel_notice_days)],
    ["Replacements per Calendar Week (7.2)", /no more than (\d+) replacement requests per Calendar Week/, String(TERMS.goodwill_replacements_per_week)],
    ["Replacements per Calendar Week (1.1.28)", /within the maximum of (\d+) replacement requests per Calendar Week in clause 7\.2/, String(TERMS.goodwill_replacements_per_week)],
    ["Replacements per Calendar Week (Schedule 1)", /Replacements \(clause 7\)[^|\n]*\| Goodwill, not a right: no more than (\d+) replacement requests per Calendar Week/, String(TERMS.goodwill_replacements_per_week)],
    // 1.1.14 quotes every Plan's Effective Lead Price (Fee / Committed Leads, rounded to the rand): they must equal the pricing source
    ["Effective Lead Price, Pilot (1.1.14)", /(R[\d,]+) for the Pilot Plan/, zar(perLead(PILOT))],
    ...TIERS.map((t): [string, RegExp, string] => [`Effective Lead Price, ${t.name} (1.1.14)`, new RegExp(`(R[\\d,]+) for ${t.name}\\b`), zar(perLead(t))]),
    ["Top-Up minimum (9.1)", /\((\d+) Qualified Leads, being R[\d,]+ at/, String(TOPUP.min_leads)],
    ["Top-Up minimum value (9.1)", /\(\d+ Qualified Leads, being (R[\d,]+) at/, zar(topupMinimumZar())],
    ["Top-Up notice (9.2)", /9\.2 \*\*Notice\.\*\* The Client must give at least (\d+) days'/, String(TOPUP.notice_days)],
    ["Qualifying age (5.1(c))", /namely age (\d+ to \d+)/, `${QUALIFIED.age_min} to ${QUALIFIED.age_max}`],
    [
      "Qualifying budget (5.1(c))",
      /monthly premium budget of (R[\d,]+(?: or more| to R[\d,]+))/,
      // no maximum in the pricing source means "R750 or more"
      maxBudget ? `${zar(QUALIFIED.budget_min_zar)} to ${zar(maxBudget)}` : `${zar(QUALIFIED.budget_min_zar)} or more`,
    ],
  ];
  // clause 9.7 carries the Pilot terms only while the Pilot is offered (withdrawn 7 Oct 2026)
  if (PILOT_OFFERED) {
    checks.push(["Pilot rollover (9.7)", /the Rollover Period ending on day (\d+)/, String(TERMS.cycle_days + TERMS.shortfall_rollover_days)]);
    checks.push(["Pilot replacements (9.7)", /replacements of up to (\d+) per Calendar Week/, String(TERMS.goodwill_replacements_per_week)]);
  } else {
    checks.push(["Pilot withdrawn (9.7)", /9\.7 \*\*Pilot Plan\.\*\*[^\n]*?(no longer offers)/, "no longer offers"]);
  }
  if (targetBudget) {
    checks.push(["A-tier threshold (1.1.3A)", /"\*\*A-Tier Lead\*\*" means a Qualified Lead whose self-declared monthly premium budget is (R[\d,]+) or more/, zar(targetBudget)]);
    checks.push(["B-tier band (1.1.3A)", /"\*\*B-Tier Lead\*\*" means a Qualified Lead whose self-declared monthly premium budget is (R[\d,]+ to R[\d,]+)/, `${zar(QUALIFIED.budget_min_zar)} to ${zar(targetBudget - 1)}`]);
    checks.push(["Campaign target (5.6(a))", /\*\*A-tier: (R[\d,]+) or more a month\.\*\*/, zar(targetBudget)]);
  }
  const out: string[] = [];
  for (const [label, re, expected] of checks) {
    const found = md.match(re)?.[1];
    if (found === undefined) out.push(`${label}: wording not found in the agreement template.`);
    else if (found !== expected) out.push(`${label}: agreement says ${found}, pricing source says ${expected}.`);
  }
  return out;
}

const TEMPLATE_WARNINGS: string[] = consistencyWarnings(agreementMd);

// ---------------------------------------------------------------- resolve

const fmtDate = (iso: string): string => {
  const d = new Date(iso + "T00:00:00");
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" });
};

/** `sourceMd` renders a different text of the agreement (e.g. a client copy with changes marked) through the same pipeline; defaults to the canonical template. */
export function resolveAgreement(fields: AgreementFields, sourceMd?: string): ResolvedAgreement {
  const tier = planByName(fields.plan) || planByName("Bronze") || TIERS[0];
  const warnings = sourceMd ? consistencyWarnings(sourceMd) : [...TEMPLATE_WARNINGS];
  const values: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields.placeholders || {})) values[k] = DATE_TOKENS.has(k) && v ? fmtDate(v) : v;
  const rawName = (values["[CLIENT FULL NAME]"] || "").trim();
  const clientName = rawName.startsWith("(") ? "" : rawName.replace(/^\?\s*/, "");

  const raw = applyPlan(sourceMd ? parseRaw(sourceMd) : RAW, tier, clientName, warnings);
  const blocks: Block[] = [];
  for (const b of raw) {
    if (b.type === "note") { if (fields.include_notes) blocks.push({ type: "note", level: b.level, inl: parseInline(b.text, null) }); continue; }
    if (b.type === "table") { blocks.push({ type: "table", rows: b.rows.map((r) => r.map((c) => parseInline(c, values))) }); continue; }
    if (b.type === "h2") { blocks.push({ type: "h2", text: b.text, inl: parseInline(b.text, values), pageBreak: /^Schedule \d/.test(b.text) || b.text === "Signatures" }); continue; }
    const inl = parseInline(b.text, values);
    if (b.type === "clause") blocks.push({ type: "clause", num: b.num, level: b.level, inl });
    else if (b.type === "item") blocks.push({ type: "item", letter: b.letter, level: b.level, inl });
    else if (b.type === "recital") blocks.push({ type: "recital", letter: b.letter, inl });
    else blocks.push({ type: b.type, inl });
  }

  const unfilled: string[] = [];
  const visit = (inl: Inline[]) => inl.forEach((i) => { if (i.kind === "ph" && (i.confirm || (!i.value && !i.blank)) && !unfilled.includes(i.token)) unfilled.push(i.token); });
  for (const b of blocks) {
    if (b.type === "table") b.rows.forEach((r) => r.forEach(visit));
    else visit(b.inl);
  }
  return { templateVersion: TEMPLATE_VERSION, blocks, unfilled, warnings, tier };
}

/** Every placeholder token in the template (outside notes) that is not a named form field. */
export function otherPlaceholderTokens(): string[] {
  const all = resolveAgreement({ ...defaultFields(), include_notes: false }).unfilled;
  return all.filter((t) => !PRIMARY_TOKENS.has(t));
}

/** Numbering facts the broker portal quotes in its acceptance checkboxes, read from the template. */
export const AGREEMENT_STRUCTURE = {
  lastClause: Math.max(0, ...RAW.filter((b) => b.type === "h2").map((b) => parseInt((b as { text: string }).text, 10)).filter((n) => !isNaN(n))),
  schedules: RAW.filter((b) => b.type === "h2" && /^Schedule \d/.test((b as { text: string }).text)).length,
  clientMaterialsClause:
    (RAW.find((b) => b.type === "clause" && b.text.startsWith("**Client Materials.**")) as { num: string } | undefined)?.num || "",
};

/** Plain text of an inline run, with unfilled placeholders shown as their token. */
export const inlineText = (inl: Inline[]): string =>
  inl.map((i) => (i.kind === "text" ? i.text : i.blank ? "________________" : i.value || i.token)).join("");
