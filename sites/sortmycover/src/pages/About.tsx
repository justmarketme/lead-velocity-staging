import PageFrame from "@/components/PageFrame";
import { Link } from "react-router-dom";
import { LEGAL_PAGE_LISTS, company } from "@/lib/site";

export default function About() {
  return (
    <PageFrame title="About SortMyCover | SortMyCover" description="What SortMyCover does, what it does not do, how it is paid and who runs it." path="/about/" h1="About SortMyCover" lede="What we do, what we do not do, and who runs SortMyCover." crumbs={[{ name: "SortMyCover", path: "/" }, { name: "About", path: "/about/" }]}>
      {/* the company card, registration, address and Information Officer moved to /legal/ (FOOTER-DISCLOSURE-SPEC-SMC-2026-10-21) */}
      <h2>Who runs SortMyCover</h2>
      <p>SortMyCover is a trading name of {company.legal_name}, a South African company. Its {LEGAL_PAGE_LISTS} are on <Link to="/legal/">Legal &amp; disclosures</Link>. Phone <a href={"tel:" + company.phone_tel}>{company.phone_display}</a>. Email <a href={"mailto:" + company.email}>{company.email}</a>.</p>
      <h2>What we do</h2>
      <p>When you ask for it, we introduce you to one adviser from an authorised financial services provider and help book a 30-minute call. The call is by video, WhatsApp or phone, at a time you pick.</p>
      <h2>What we do not do</h2>
      <p>SortMyCover is not a financial services provider and gives no financial advice. We do not compare products, rank insurers, quote premiums or recommend anything. Only the adviser can talk about products, and they give their name and FSP number before the call.</p>
      <h2>How we make money</h2>
      <p>Advisers pay SortMyCover a fee for the service. The fee does not depend on whether you buy anything. Read <Link to="/how-we-make-money/">how we make money</Link>.</p>
      <h2>How we write</h2>
      <p>Our guides follow an <Link to="/editorial-policy/">editorial policy</Link>: sources, dates and a named fact-checker on every article.</p>
    </PageFrame>
  );
}
