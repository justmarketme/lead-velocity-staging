import PageFrame from "@/components/PageFrame";
import { Link } from "react-router-dom";
import { company } from "@/lib/site";

export default function About() {
  return (
    <PageFrame title="About SortMyCover | SortMyCover" description="SortMyCover is a trading name of Lead Velocity (Pty) Ltd, registration 2025/637858/07, Menlyn Maine, Pretoria. What we do and what we do not do." path="/about/" h1="About SortMyCover" lede="Who is legally responsible, what we do and what we do not do." crumbs={[{ name: "SortMyCover", path: "/" }, { name: "About", path: "/about/" }]}>
      <h2>Who we are</h2>
      <p><strong>{company.legal_name}</strong> trading as <strong>{company.trading_as}</strong>. Registration number {company.registration}. {company.address_lines.join(", ")}. Phone <a href={"tel:" + company.phone_tel}>{company.phone_display}</a>. Email <a href={"mailto:" + company.email}>{company.email}</a>.</p>
      <p>The Information Officer is {company.information_officer}. The Deputy Information Officer is {company.deputy_information_officer}.</p>
      <h2>What we do</h2>
      <p>When you ask for it, we introduce you to one adviser from an authorised financial services provider and help book a 30-minute call. The call is by video, WhatsApp or phone. The call costs you nothing.</p>
      <h2>What we do not do</h2>
      <p>SortMyCover is not a financial services provider and gives no financial advice. We do not compare products, rank insurers, quote premiums or recommend anything. Only the adviser can talk about products, and they give their name and FSP number before the call.</p>
      <h2>How we make money</h2>
      <p>Advisers pay SortMyCover a fee for the service. The fee does not depend on whether you buy anything. Read <Link to="/how-we-make-money/">how we make money</Link>.</p>
      <h2>How we write</h2>
      <p>Our guides follow an <Link to="/editorial-policy/">editorial policy</Link>: sources, dates and a named fact-checker on every article.</p>
    </PageFrame>
  );
}
