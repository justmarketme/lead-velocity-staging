/* Code-drawn page visuals (Jono, 18 Oct 2026: premium and interactive, free tools only, so no generated assets).
   Every visual is plain pre-rendered markup built from the page's own facts: fully readable with no JavaScript, and never hidden.
   Motion (src/lib/pageMotion.ts, `vizMotion`) only moves things: bubbles settle in, lines draw, tokens travel, cards tilt. */
import { company, provider } from "@/lib/site";

/** An example WhatsApp chat with Lindi, laid out like a phone. Used on /book/. */
export function WaPreview({ wills = false }: { wills?: boolean }) {
  const who = wills ? `${provider.name} consultant` : "adviser";
  return (
    <figure className="viz viz-phone" data-viz="phone">
      <div className="wa-phone" aria-label="Example WhatsApp chat with Lindi">
        <div className="wa-bar">
          <span className="wa-avatar" aria-hidden="true">L</span>
          <span><strong>Lindi</strong><small>SortMyCover · AI assistant</small></span>
        </div>
        <ol className="wa-thread">
          <li className="wa-msg wa-me">Hi Lindi, I'd like to chat about {wills ? "a will" : "cover for my family"}.</li>
          <li className="wa-msg">Hi, I'm Lindi, SortMyCover's AI assistant. What would you like help with?
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
      <figcaption>An example of the chat. Lindi is an AI assistant, and you can ask for a person at any time.</figcaption>
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
    { from: "You", to: "Pay nothing", live: false },
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

/** The company's legal identity as a card. Used on /about/. */
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
          <div><dt>Information Officer reg.</dt><dd>{company.information_officer_registration}</dd></div>
          <div><dt>Address</dt><dd>{company.address_lines.join(", ")}</dd></div>
        </dl>
      </div>
    </figure>
  );
}
