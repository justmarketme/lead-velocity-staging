import { Link } from "react-router-dom";
import { Wordmark } from "./Brand";
import { APEX, NOT_FSP_LINE, company } from "@/lib/site";

const phoneHref = "tel:" + company.phone_tel;

/** Identity block (rule S31): on every page, including campaign hosts, which link to the apex for legal pages. */
function IdentityBlock() {
  return (
    <address>
      <p><strong>{company.legal_name}</strong> trading as <strong>{company.trading_as}</strong></p>
      <p>Registration number {company.registration}</p>
      <p>{company.address_lines.join(", ")}</p>
      <p><a href={phoneHref}>{company.phone_display}</a> · <a href={"mailto:" + company.email}>{company.email}</a></p>
    </address>
  );
}

export function Footer() {
  return (
    <footer className="site-footer py-8 mt-12" data-footer>
      <div className="wrap grid gap-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="grid gap-3 content-start">
          <Wordmark plain />
          <IdentityBlock />
          <p>{NOT_FSP_LINE}</p>
          <p>Advisers pay Lead Velocity a flat fee that never depends on whether anyone buys a policy. <Link to="/how-we-make-money/">How we make money</Link>.</p>
        </div>
        <nav aria-labelledby="f-understand"><h2 id="f-understand">Understand</h2>
          <ul>
            <li><Link to="/how-it-works/">How it works</Link></li><li><Link to="/how-we-make-money/">How we make money</Link></li>
            <li><Link to="/advisers/">Advisers</Link></li><li><Link to="/learn/">Learn</Link></li>
            <li><Link to="/learn/glossary/">Glossary</Link></li><li><Link to="/faq/">FAQ</Link></li>
          </ul>
        </nav>
        <nav aria-labelledby="f-trust"><h2 id="f-trust">Trust</h2>
          <ul>
            <li><Link to="/about/">About</Link></li><li><Link to="/contact/">Contact</Link></li>
            <li><Link to="/complaints/">Complaints</Link></li><li><Link to="/editorial-policy/">Editorial policy</Link></li>
          </ul>
        </nav>
        <nav aria-labelledby="f-legal"><h2 id="f-legal">Legal</h2>
          <ul>
            <li><Link to="/privacy/">Privacy</Link></li><li><Link to="/terms/">Terms</Link></li>
            <li><Link to="/paia/">PAIA manual</Link></li><li><Link to="/privacy/#opt-out">Opt out of ad measurement</Link></li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}

/** Campaign-host footer: same identity block, absolute links to the apex (each page lives on exactly one host). */
export function CampaignFooter() {
  const links: [string, string][] = [["Privacy", "/privacy/"], ["Terms", "/terms/"], ["How we make money", "/how-we-make-money/"], ["Complaints", "/complaints/"], ["PAIA manual", "/paia/"], ["Opt out of ad measurement", "/privacy/#opt-out"]];
  return (
    <footer className="site-footer py-8" data-footer>
      <div className="wrap grid gap-4">
        <Wordmark plain />
        <IdentityBlock />
        <p>{NOT_FSP_LINE}</p>
        <p>Advisers pay Lead Velocity a flat fee that never depends on whether anyone buys a policy.</p>
        <nav aria-label="Legal"><ul className="flex flex-wrap gap-x-5">{links.map(([t, p]) => <li key={p}><a href={APEX + p}>{t}</a></li>)}</ul></nav>
      </div>
    </footer>
  );
}
