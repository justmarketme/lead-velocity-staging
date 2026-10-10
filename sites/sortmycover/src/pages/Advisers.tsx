import PageFrame from "@/components/PageFrame";
import { Link } from "react-router-dom";

export default function Advisers() {
  return (
    <PageFrame title="Your adviser: how to check them | SortMyCover" description="Who your adviser is, how to check them on the FSCA register, and what an adviser must tell you." path="/advisers/" h1="Your adviser" lede="You are introduced to one adviser. Here is how to check them and what they must tell you." crumbs={[{ name: "SortMyCover", path: "/" }, { name: "Advisers", path: "/advisers/" }]}>
      <h2>Who the adviser is</h2>
      <p>The adviser works for, or is, a financial services provider authorised by the Financial Sector Conduct Authority (FSCA). SortMyCover is not that provider. The adviser runs their own business and is responsible for the advice they give.</p>
      <h2>How to check them</h2>
      <p>You get the adviser’s name, practice and FSP number on WhatsApp before you speak. Put the FSP number into the <a href="https://www.fsca.co.za/FSB-Search/" rel="noopener noreferrer">FSCA register search</a> and compare the details. Step by step: <Link to="/learn/how-to-check-an-adviser/">how to check an adviser</Link>.</p>
      <h2>What an adviser must tell you</h2>
      <p>Under the FAIS General Code of Conduct an adviser must disclose who they are, what they are authorised to do, and how they are paid. They tell you on the call. Ask if they do not.</p>
      <h2>If something goes wrong</h2>
      <p>See <Link to="/complaints/">complaints</Link> for the order of routes, including the adviser’s own firm and the FAIS Ombud.</p>
    </PageFrame>
  );
}
