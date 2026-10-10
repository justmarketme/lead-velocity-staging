import PageFrame from "@/components/PageFrame";
import { Link } from "react-router-dom";
import { company } from "@/lib/site";

export default function Contact() {
  return (
    <PageFrame title="Contact SortMyCover | SortMyCover" description="Email, phone or Facebook Messenger. A person reads every message. For a complaint, see the complaints page." path="/contact/" h1="Contact" lede="A person reads every message." crumbs={[{ name: "SortMyCover", path: "/" }, { name: "Contact", path: "/contact/" }]}>
      <h2>Ways to reach us</h2>
      <ul>
        <li>Email: <a href={"mailto:" + company.email}>{company.email}</a></li>
        <li>Phone: <a href={"tel:" + company.phone_tel}>{company.phone_display}</a></li>
        <li>Facebook Messenger: <a href={company.messenger} rel="noopener noreferrer">m.me/sortmycover</a></li>
        <li>Post: {company.legal_name}, {company.address_lines.join(", ")}</li>
      </ul>
      <p>Please do not send ID numbers, bank details or health details by message.</p>
      <h2>To stop messages</h2>
      <p>Reply STOP to any WhatsApp, or email us with the word STOP.</p>
      <h2>To complain</h2>
      <p>See <Link to="/complaints/">complaints</Link>.</p>
    </PageFrame>
  );
}
