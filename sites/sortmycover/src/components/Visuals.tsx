/* Code-drawn page visuals (Jono, 18 Oct 2026: premium and interactive, free tools only, so no generated assets).
   Every visual is plain pre-rendered markup built from the page's own facts: fully readable with no JavaScript, and never hidden.
   Motion (src/lib/pageMotion.ts, `vizMotion`) only moves things: bubbles settle in, lines draw, tokens travel, cards tilt. */
import { company, provider } from "@/lib/site";

/** An example WhatsApp chat with Lindi, laid out like a phone. Used on /book/. */
export function WaPreview({ wills = false }: { wills?: boolean }) {
  const who = wills ? "will consultant" : "adviser";
  return (
    <figure className="viz viz-phone" data-viz="phone">
      <div className="wa-phone" aria-label="Example WhatsApp chat with Lindi">
        <div className="wa-bar">
          <span className="wa-avatar" aria-hidden="true">L</span>
          <span><strong>Lindi</strong><small>SortMyCover · automated assistant</small></span>
        </div>
        <ol className="wa-thread">
          <li className="wa-msg wa-me">Hi Lindi, I'd like to chat about {wills ? "a will" : "cover for my family"}.</li>
          <li className="wa-msg">Hi, I'm Lindi, SortMyCover's automated assistant. What would you like help with?
            <span className="wa-chips" aria-hidden="true"><span>Life cover</span><span>Disability</span><span>Income protection</span></span>
          </li>
          <li className="wa-msg wa-me">Life cover</li>
          <li className="wa-msg">Thanks. A few short questions first. Which age band are you in?</li>
          <li className="wa-msg wa-card">
            <span className="wa-card-title">Your {who}</span>
            <span className="wa-card-row"><span>Name</span><span>Firm</span><span>FSP number</span></span>
            <span className="wa-chips" aria-hidden="true"><span>Tue 10:00</span><span>Wed 14:00</span><span>Thu 17:30</span></span>
          </li>
          <li className="wa-typing" aria-hidden="true"><i /><i /><i /></li>
        </ol>
      </div>
      <figcaption>An example of the chat. Lindi is an automated assistant, and you can ask for a person at any time.</figcaption>
    </figure>
  );
}

/** Who does what: SortMyCover's part and the adviser's part, side by side. Used on /how-it-works/. */
export function SplitRoles() {
  return (
    <figure className="viz viz-split" data-viz="split">
      <div className="viz-card">
        <span className="viz-kicker">SortMyCover</span>
        <ul>
          <li>Introduces you to one adviser</li>
          <li>Helps book the 30-minute call</li>
          <li>Reminds you before the call</li>
        </ul>
      </div>
      <div className="viz-join" aria-hidden="true"><span className="viz-join-line" /><span className="viz-token" /></div>
      <div className="viz-card viz-card-dark">
        <span className="viz-kicker">Only the adviser</span>
        <ul>
          <li>Gives financial advice</li>
          <li>Talks about products and premiums</li>
          <li>Tells you how they are paid</li>
        </ul>
      </div>
      <figcaption>SortMyCover is not a financial services provider. The adviser is.</figcaption>
    </figure>
  );
}

/** Where SortMyCover's money comes from, and where it does not. Used on /how-we-make-money/. */
export function MoneyFlow() {
  const rows = [
    { from: "Adviser", to: "Pays a fee for introductions", live: true },
    { from: "Insurer", to: "No commission, no share of premium", live: false },
  ];
  return (
    <figure className="viz viz-money" data-viz="money">
      <span className="viz-kicker">Money into SortMyCover</span>
      <ul>
        {rows.map((r) => (
          <li key={r.from} className={r.live ? "mf-row mf-live" : "mf-row"}>
            <span className="mf-from">{r.from}</span>
            <span className="mf-link" aria-hidden="true">
              <span className="mf-line" />
              {r.live ? <><span className="viz-token" /><span className="viz-token viz-token-2" /></> : <span className="mf-x">×</span>}
            </span>
            <span className="mf-to">{r.to}</span>
          </li>
        ))}
      </ul>
      <figcaption>The fee does not depend on whether you buy anything.</figcaption>
    </figure>
  );
}

/** Checking an adviser in three moves, ending in a tick. Used on /advisers/. */
export function CheckSteps() {
  const steps = [
    { n: "1", t: "On WhatsApp", b: "You get the adviser's name, practice and FSP number." },
    { n: "2", t: "On the FSCA register", b: "Search the FSP number on the FSCA's own site." },
    { n: "3", t: "Compare", b: "The name and practice should match what you were sent." },
  ];
  return (
    <figure className="viz viz-check" data-viz="check">
      <div className="ck-track" aria-hidden="true"><span className="ck-line" /></div>
      <ol>
        {steps.map((s, i) => (
          <li key={s.n} className="viz-card ck-step">
            <span className="ck-n" aria-hidden="true">
              {i === steps.length - 1
                ? <svg viewBox="0 0 24 24" width="22" height="22"><path className="ck-tick" d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                : s.n}
            </span>
            <strong>{s.t}</strong>
            <span>{s.b}</span>
          </li>
        ))}
      </ol>
    </figure>
  );
}

/** The company's legal identity as a card. Used on /legal/ (moved from /about/, FOOTER-DISCLOSURE-SPEC-SMC-2026-10-21). No address
    row: the table under it gives the physical address and the address for service, so the card would make it three times in the
    first screen (reviewer finding, 21 Oct 2026). */
export function CompanyCard() {
  return (
    <figure className="viz viz-company" data-viz="company">
      <div className="co-card viz-card-dark">
        <span className="co-sheen" aria-hidden="true" />
        <span className="viz-kicker">Legally responsible</span>
        <strong className="co-name">{company.legal_name}</strong>
        <span className="co-sub">trading as {company.trading_as}</span>
        <dl>
          <div><dt>Registration</dt><dd>{company.registration}</dd></div>
          {company.directors.length > 0 && <div><dt>Directors</dt><dd>{company.directors.join(", ")}</dd></div>}
          <div><dt>Information Officer reg.</dt><dd>{company.information_officer_registration}</dd></div>
        </dl>
      </div>
    </figure>
  );
}

/* ---- topic diagrams for guides that have no photo (Jono, 18 Oct 2026: every post has its own image; the ad stills are all used,
   so these five wills guides get a code-drawn diagram of their own story instead). Same motion as CheckSteps (pageMotion).
   24 Oct 2026: the seven social-week-2 guides use the same route (bars, a 100-square claims grid, timelines and two-card forks),
   each drawn from figures already on its page and tied to the same evidence ids; no photo, no rand figure that is not in the text. ---- */
type Step = { t: string; b: string };
function StepFlow({ steps, caption, label }: { steps: Step[]; caption: string; label: string }) {
  return (
    <figure className={`viz viz-check viz-flow viz-n${steps.length}`} data-viz="flow" aria-label={label}>
      <div className="ck-track" aria-hidden="true"><span className="ck-line" /></div>
      <ol>
        {steps.map((s, i) => (
          <li key={s.t} className="viz-card ck-step">
            <span className="ck-n" aria-hidden="true">{i + 1}</span>
            <strong>{s.t}</strong>
            <span>{s.b}</span>
          </li>
        ))}
      </ol>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}
type Card = { k: string; items: string[] };
/** Two cards with the joining line between them: "either/or" and "side by side" diagrams. */
function TwoCards({ label, a, b, caption }: { label: string; a: Card; b: Card; caption: string }) {
  return (
    <figure className="viz viz-split" data-viz="fork" aria-label={label}>
      <div className="viz-card">
        <span className="viz-kicker">{a.k}</span>
        <ul>{a.items.map((t) => <li key={t}>{t}</li>)}</ul>
      </div>
      <div className="viz-join" aria-hidden="true"><span className="viz-join-line" /><span className="viz-token" /></div>
      <div className="viz-card viz-card-dark">
        <span className="viz-kicker">{b.k}</span>
        <ul>{b.items.map((t) => <li key={t}>{t}</li>)}</ul>
      </div>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}
function Fork() {
  return (
    <TwoCards label="Which letters the Master issues" caption="Source: the Master of the High Court. Information, not advice."
      a={{ k: "Estate of R250 000 or less", items: ["Letters of authority", "A Master's representative winds it up", "Usually no full account, unless there are minor heirs"] }}
      b={{ k: "Estate of more than R250 000", items: ["Letters of executorship", "An executor winds it up", "Liquidation and distribution account within six months"] }} />
  );
}

/** Horizontal bars drawn to scale. Widths are classes (vb-w<pct>, see visuals.css), never inline styles; every number is also text. */
type BarRow = { t: string; v: string; pct: number; amber?: boolean };
function Bars({ label, rows, caption, total, pick }: { label: string; rows: BarRow[]; caption: string; total?: { t: string; v: string }; pick?: { t: string; b: string } }) {
  return (
    <figure className="viz viz-bars" data-viz="bars" aria-label={label}>
      <ul>
        {rows.map((r) => (
          <li key={r.t} className="vb-row">
            <span className="vb-t">{r.t}</span>
            <span className="vb-track" aria-hidden="true"><span className={`vb-fill vb-w${r.pct}${r.amber ? " vb-amber" : ""}`} /></span>
            <span className="vb-v">{r.v}</span>
          </li>
        ))}
        {total && <li className="vb-row vb-total"><span className="vb-t">{total.t}</span><span className="vb-v">{total.v}</span></li>}
      </ul>
      {pick && <div className="vb-pick"><strong>{pick.t}</strong> {pick.b}</div>}
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

/** One hundred claims as one hundred squares: how many were paid, and the reasons given for the rest. */
function ClaimsGrid() {
  return (
    <figure className="viz viz-claims" data-viz="claims" aria-label="Of every 100 claims on life policies, 96 were paid in 2025, and why the rest were declined">
      <div className="viz-card">
        <span className="viz-kicker">Of every 100 claims on life policies, 2025</span>
        <div className="cw-grid" aria-hidden="true">
          {Array.from({ length: 96 }, (_, i) => <i key={`p${i}`} className="cw-y" />)}
          {Array.from({ length: 4 }, (_, i) => <i key={`n${i}`} className="cw-n" />)}
        </div>
        <div className="cw-key"><span><i className="cw-y" aria-hidden="true" />96 paid</span><span><i className="cw-n" aria-hidden="true" />4 not paid</span></div>
      </div>
      <div className="viz-card viz-card-dark">
        <span className="viz-kicker">Why a claim is declined</span>
        <ul>
          <li>Most often: material non-disclosure, a fact the insurer asked about that was left out</li>
          <li>Fraud</li>
          <li>A contract exclusion, such as suicide within the first two years</li>
          <li>Premiums that stopped, so the cover lapsed</li>
        </ul>
      </div>
      <figcaption>Source: ASISA, media release of 10 June 2026, for claims paid in 2025. Information, not advice.</figcaption>
    </figure>
  );
}
const DIAGRAMS: Record<string, () => JSX.Element> = {
  "intestate-succession": () => <StepFlow label="The order of heirs without a will" caption="The order of heirs under the Intestate Succession Act, as the Master describes it." steps={[
    { t: "Spouse and children", b: "The spouse receives a child's share or R250 000, whichever is more" },
    { t: "Parents", b: "If there is no spouse or child" },
    { t: "Brothers and sisters", b: "If there are no parents" },
    { t: "Other relatives", b: "Nearest blood relatives first" },
    { t: "The state", b: "Only if there are no relatives at all" },
  ]} />,
  "reporting-a-deceased-estate": () => <StepFlow label="Reporting a deceased estate, step by step" caption="The Master's timeline for reporting and winding up an estate." steps={[
    { t: "A death", b: "The family or the holder of the will acts" },
    { t: "Within 14 days", b: "Report the estate to the Master" },
    { t: "Letters issued", b: "To the executor, or a Master's representative" },
    { t: "Within six months", b: "The liquidation and distribution account" },
    { t: "Then", b: "The heirs are paid" },
  ]} />,
  "what-makes-a-will-valid": () => <StepFlow label="What makes a will valid" caption="The formalities in the Wills Act, with the Master's guidance on age." steps={[
    { t: "16 or older", b: "And mentally capable of making a will" },
    { t: "Signed at the end", b: "Each page but the last is signed too" },
    { t: "Two witnesses", b: "Aged 14 or older, signing together" },
    { t: "No benefit to witnesses", b: "So heirs are not used as witnesses" },
  ]} />,
  "small-estates-letters-of-authority": Fork,
  /* social week 2 (24 Oct 2026) */
  "how-much-life-cover-is-enough": () => <Bars label="Life and disability cover held, against the income families would need" caption="Source: ASISA gap study, media release of 28 October 2025: 16.1 million formally employed earners, data to December 2024. A national average, not a figure for any household. Information, not advice." rows={[
    { t: "Income a family would need", v: "100%", pct: 100 },
    { t: "Cover the average earner holds", v: "39%", pct: 39, amber: true },
  ]} />,
  "why-life-insurance-claims-get-declined": ClaimsGrid,
  "when-sick-leave-runs-out": () => <StepFlow label="Sick leave, UIF and income protection on a long illness" caption="Sources: the Basic Conditions of Employment Act, the UIF's guide, ASISA. A sequence for a five-day worker, not a prediction about anyone. Information, not advice." steps={[
    { t: "Day 1 to 30", b: "Paid sick leave under the BCEA: 30 days in three years on a five-day week" },
    { t: "Day 31 onwards", b: "The Act's paid days are used up. Pay depends on the contract. UIF illness benefits run while credits last" },
    { t: "Month 4 and after", b: "Income protection once its waiting period ends, a group benefit, or savings" },
  ]} />,
  "severe-illness-cover-vs-medical-aid": () => <TwoCards label="Medical aid and severe illness cover side by side" caption="Sources: the Council for Medical Schemes and ASISA. Information, not advice."
    a={{ k: "Medical aid", items: ["Pays the hospital, doctors and pharmacy", "Pays when treatment is given under its rules", "Does not replace income or pay the bond"] }}
    b={{ k: "Severe illness cover", items: ["Pays the insured person", "Pays on diagnosis of a listed condition", "A lump sum, to use for anything"] }} />,
  "the-real-cost-of-a-home-loan": () => <Bars label="The once-off costs on a R1.5 million home bought with a 100% bond" caption="Sources: SARS, the Law Society of South Africa's guideline of 1 August 2025, the Deeds Office schedule and the National Credit Act. Bars are drawn to scale. Information, not advice." rows={[
    { t: "Transfer duty", v: "R8 700", pct: 24 },
    { t: "Transfer attorney", v: "about R36 250", pct: 100 },
    { t: "Bond registration attorney", v: "about R36 250", pct: 100 },
    { t: "Deeds Office fees", v: "R1 646 + R1 646", pct: 9 },
    { t: "Bank initiation fee", v: "R6 037.50", pct: 17 },
    { t: "Post, petties and lodgement", v: "about R3 500 each", pct: 19 },
  ]} total={{ t: "Before the first instalment", v: "roughly R97 500" }}
    pick={{ t: "The one line the household decides.", b: "Credit life insurance: the borrower can decline the lender's policy and substitute their own (National Credit Act, section 106)." }} />,
  "life-insurance-and-your-estate": () => <TwoCards label="Where a life policy pays out, with and without a valid beneficiary nomination" caption="Either way, a policy on the deceased's life counts towards estate duty. Sources: the National Financial Ombud, the Master of the High Court and SARS. Information, not advice."
    a={{ k: "A valid beneficiary nomination", items: ["The insurer pays the named person directly", "The payout stays out of the estate's administration", "Saves time and executor's fees"] }}
    b={{ k: "No valid nomination", items: ["The payout goes into the estate", "Debts, costs and the executor's fee are paid first", "Heirs receive what is left"] }} />,
  "how-to-stop-insurance-sales-calls": () => <StepFlow label="The National Opt-Out Registry timeline" caption="Sources: the National Consumer Commission's notice of 7 October 2026 and ITWeb's report of 8 October 2026. Information, not advice." steps={[
    { t: "15 Sep to Dec 2026", b: "Direct marketers register on the National Opt-Out Registry" },
    { t: "Dec 2026 to Apr 2027", b: "Marketers clean their lists against the registry, then every month before a campaign" },
    { t: "15 April 2027", b: "The Commission says it will enforce the regulations in full" },
    { t: "From May 2027", b: "Consumers who have registered can block direct marketers" },
  ]} />,
  "guardians-fund": () => <StepFlow label="How the Guardian's Fund works" caption="How the Master's Guardian's Fund holds a child's inheritance." steps={[
    { t: "A minor inherits", b: "The will makes no other arrangement" },
    { t: "Guardian's Fund", b: "Interest is compounded monthly" },
    { t: "Maintenance", b: "School fees and more, on application" },
    { t: "Claim at 18", b: "Or at an age the will sets" },
    { t: "30 years", b: "Unclaimed money is forfeited" },
  ]} />,
};
export const DIAGRAM_SLUGS = Object.keys(DIAGRAMS);
/** The guide's own diagram, used as its header where it has no photo. */
export function ArticleDiagram({ slug }: { slug: string }) {
  const D = DIAGRAMS[slug];
  return D ? <D /> : null;
}
