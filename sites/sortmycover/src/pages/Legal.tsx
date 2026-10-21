/* Privacy, Terms, PAIA and Legal & disclosures. The privacy and terms text is ported from landing/holding/*.html (files in
   src/content/legal) with the compliance edits listed in the README. The privacy notice and terms were signed off on 17 Oct 2026;
   the PAIA manual is still a noindex placeholder. /legal/ (FOOTER-DISCLOSURE-SPEC-SMC-2026-10-21 section 3) holds the full company
   details every footer links to (ECT Act s43), rendered from config/site.json and the shared constants, never retyped. */
import { Fragment, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PageFrame, { DraftNote } from "@/components/PageFrame";
import { CompanyCard } from "@/components/Visuals";
import privacyHtml from "@/content/legal/privacy.html?raw";
import termsHtml from "@/content/legal/terms.html?raw";
import { adsOff, adsOn, isOptedOut } from "@/lib/pixel";
import { DISCLOSURE_STATEMENT, FEE_LINE, NO_COMMISSION, PROVIDER_ROLE_LINE, company, site } from "@/lib/site";

const Raw = ({ html }: { html: string }) => <div dangerouslySetInnerHTML={{ __html: html }} />;

function OptOutControl() {
  const [off, setOff] = useState<boolean | null>(null);
  useEffect(() => { setOff(isOptedOut()); }, []);
  return (
    <div className="draftnote" id="opt-out-control">
      <p role="status" aria-live="polite">{off === null ? "Checking your setting…" : off ? "Ad measurement is OFF for this browser, on every SortMyCover page." : "Ad measurement is OFF unless you gave the optional consent in the WhatsApp chat panel."}</p>
      {off !== true && <p><button type="button" className="btn btn-sm" onClick={() => { adsOff(); setOff(true); }}>Opt out of ad measurement</button></p>}
      {off === true && <p><button type="button" className="link-btn" onClick={() => { adsOn(); setOff(false); }}>Remove my opt-out</button></p>}
      <noscript><p>This control needs JavaScript. You can also block cookies in your browser settings, or email <a href="mailto:hello@sortmycover.co.za">hello@sortmycover.co.za</a>.</p></noscript>
    </div>
  );
}

export function Privacy() {
  const parts = privacyHtml.split("<!--OPTOUT-->");
  return (
    <PageFrame title="Privacy notice | SortMyCover" description="How SortMyCover uses your details under POPIA: what we collect, who gets it, how long we keep it and how to opt out." path="/privacy/" h1="Privacy notice" crumbs={[{ name: "SortMyCover", path: "/" }, { name: "Privacy", path: "/privacy/" }]}>
      {parts.map((p, i) => (<Fragment key={i}><Raw html={p} />{i < parts.length - 1 && <OptOutControl />}</Fragment>))}
    </PageFrame>
  );
}

export function Terms() {
  return (
    <PageFrame title="Terms of use | SortMyCover" description="What SortMyCover does, what it does not do, and what we ask of you." path="/terms/" h1="Terms of use" crumbs={[{ name: "SortMyCover", path: "/" }, { name: "Terms", path: "/terms/" }]}>
      <Raw html={termsHtml} />
    </PageFrame>
  );
}

export function Paia() {
  return (
    <PageFrame title="PAIA manual | SortMyCover" description="How to request records from Lead Velocity (Pty) Ltd under the Promotion of Access to Information Act." path="/paia/" h1="PAIA manual" robots="noindex,follow" crumbs={[{ name: "SortMyCover", path: "/" }, { name: "PAIA manual", path: "/paia/" }]}>
      <DraftNote>The PAIA manual for {company.legal_name} has not been published yet. This page is a placeholder and states only the contact route.</DraftNote>
      <h2>Requesting a record</h2>
      <p>To ask for access to a record held by {company.legal_name}, email the Information Officer, {company.information_officer} (Information Regulator registration number {company.information_officer_registration}), at <a href={"mailto:" + company.email}>{company.email}</a>, or write to {company.address_lines.join(", ")}.</p>
      <h2>Regulator</h2>
      <p>The Information Regulator: <a href="https://inforegulator.org.za/" rel="noopener noreferrer">inforegulator.org.za</a>.</p>
    </PageFrame>
  );
}

/** Legal & disclosures (/legal/): who runs SortMyCover, how it is paid, and where every legal document is. Every section carries
    data-disclosure, so no motion or layout code may hide or move it. */
export function Disclosures() {
  const address = company.address_lines.join(", ");
  return (
    <PageFrame title="Legal & disclosures | SortMyCover" description="Company details for SortMyCover: legal name, registration, directors and addresses, how we are paid, and links to every legal document." path="/legal/" h1="Legal & disclosures" lede="Who runs SortMyCover, how it is paid, and where every legal document is." crumbs={[{ name: "SortMyCover", path: "/" }, { name: "Legal & disclosures", path: "/legal/" }]} cta={false}>
      <section data-disclosure aria-labelledby="company">
        <h2 id="company">Who runs SortMyCover</h2>
        <CompanyCard />
        <dl className="legal-dl">
          <div><dt>Legal name</dt><dd>{company.legal_name}</dd></div>
          <div><dt>Trading name</dt><dd>{company.trading_as}</dd></div>
          <div><dt>Status</dt><dd>{company.status}</dd></div>
          <div><dt>Registration number</dt><dd>{company.registration}</dd></div>
          {company.directors.length > 0 && <div><dt>Directors</dt><dd>{company.directors.join(", ")}</dd></div>}
          <div><dt>Physical address</dt><dd>{address}</dd></div>
          <div><dt>Address for service of legal documents</dt><dd>{company.service_address ?? address}</dd></div>
          <div><dt>Phone</dt><dd><a href={"tel:" + company.phone_tel}>{company.phone_display}</a></dd></div>
          <div><dt>Email</dt><dd><a href={"mailto:" + company.email}>{company.email}</a></dd></div>
          <div><dt>WhatsApp</dt><dd>{site.whatsapp_number}</dd></div>
          <div><dt>Website</dt><dd>{site.site_url.replace(/^https?:\/\//, "")}</dd></div>
        </dl>
      </section>
      <section data-disclosure aria-labelledby="role">
        <h2 id="role">What we do, and do not do</h2>
        <p>{DISCLOSURE_STATEMENT}</p>
        <p>The adviser gives you their name, firm and FSP number before the call. You can check them on the <a href={site.fsca_register_url} rel="noopener noreferrer">FSCA register</a>.</p>
        <p>{PROVIDER_ROLE_LINE}</p>
      </section>
      <section data-disclosure aria-labelledby="paid">
        <h2 id="paid">How we are paid</h2>
        <p>{FEE_LINE} {NO_COMMISSION} SortMyCover takes no fee from the person who asks for a call. <Link to="/how-we-make-money/">How we make money</Link></p>
      </section>
      <section data-disclosure aria-labelledby="information">
        <h2 id="information">Your information</h2>
        <p>{company.legal_name} is the responsible party for your details under POPIA. The Information Officer is {company.information_officer}, registered with the Information Regulator under number {company.information_officer_registration} ({company.information_officer_registered_on}).</p>
        <p><Link to="/privacy/">Privacy notice</Link> · {/* plain <a>: the browser loads the pre-rendered page and scrolls to #opt-out itself */}<a href="/privacy/#opt-out">Opt out of ad measurement</a> · <Link to="/paia/">PAIA manual</Link></p>
      </section>
      {company.codes_of_conduct.length > 0 && (
        <section data-disclosure aria-labelledby="codes">
          <h2 id="codes">Industry bodies and codes of conduct</h2>
          <ul>{company.codes_of_conduct.map((c) => <li key={c}>{c}</li>)}</ul>
        </section>
      )}
      <section data-disclosure aria-labelledby="complaints">
        <h2 id="complaints">Complaints</h2>
        <p>Email <a href={"mailto:" + company.email}>{company.email}</a>, or send the word COMPLAINT on WhatsApp in any SortMyCover chat. A person replies within 48 hours. <Link to="/complaints/">Complaints</Link> lists every route, in order.</p>
      </section>
      <section data-disclosure aria-labelledby="documents">
        <h2 id="documents">Documents</h2>
        <ul>
          <li><Link to="/terms/">Terms of use</Link></li>
          <li><Link to="/privacy/">Privacy notice</Link></li>
          <li><Link to="/paia/">PAIA manual</Link></li>
          <li><Link to="/complaints/">Complaints</Link></li>
          <li><Link to="/editorial-policy/">Editorial policy</Link></li>
          <li><Link to="/accessibility/">Accessibility</Link></li>
        </ul>
        <p className="text-sm">Last updated 21 October 2026.</p>
      </section>
    </PageFrame>
  );
}
