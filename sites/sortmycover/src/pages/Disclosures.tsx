/* Legal & disclosures (/legal/), FOOTER-DISCLOSURE-SPEC-SMC-2026-10-21 section 3: the full company details every footer links to
   (ECT Act s43), rendered from config/site.json and the shared constants, never retyped. Its own page module (build.mjs PAGE map),
   so /privacy/, /terms/ and /paia/ do not download the company card's Visuals chunk. */
import { Link } from "react-router-dom";
import PageFrame from "@/components/PageFrame";
import { CompanyCard } from "@/components/Visuals";
import { DISCLOSURE_STATEMENT, FEE_LINE, LEGAL_PAGE_LISTS, NO_COMMISSION, PROVIDER_ROLE_LINE, company, site } from "@/lib/site";

/** Legal & disclosures (/legal/): who runs SortMyCover, how it is paid, and where every legal document is. Every section carries
    data-disclosure, so no motion or layout code may hide or move it. */
export default function Disclosures() {
  const address = company.address_lines.join(", ");
  return (
    <PageFrame title="Legal & disclosures | SortMyCover" description={`Company details for SortMyCover: legal name, ${LEGAL_PAGE_LISTS.replace("registration number", "registration")}, how we are paid, and links to every legal document.`} path="/legal/" h1="Legal & disclosures" lede="Who runs SortMyCover, how it is paid, and where every legal document is." crumbs={[{ name: "SortMyCover", path: "/" }, { name: "Legal & disclosures", path: "/legal/" }]} cta={false}>
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
        <p className="legal-updated">Last updated 21 October 2026.</p>
      </section>
    </PageFrame>
  );
}
