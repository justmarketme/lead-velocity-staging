import PageFrame from "@/components/PageFrame";
import { Link } from "react-router-dom";

export default function Complaints() {
  return (
    <PageFrame title="Complaints | SortMyCover" description="How to complain about SortMyCover, and which regulator to contact if it is not solved. We reply within 48 hours." path="/complaints/" h1="Complaints" lede="If something went wrong, tell us. A person will reply within 48 hours." crumbs={[{ name: "SortMyCover", path: "/" }, { name: "Complaints", path: "/complaints/" }]}>
      <h2>1. Tell SortMyCover</h2>
      <p>Email <a href="mailto:hello@sortmycover.co.za">hello@sortmycover.co.za</a>, message us on <a href="https://m.me/sortmycover" rel="noopener noreferrer">Facebook Messenger</a>, or send the word COMPLAINT on WhatsApp in any SortMyCover chat. Include your name, the number you used and a short note on what happened. We log every complaint, reply within 48 hours and tell you what we will do.</p>
      <h2>2. If it is not solved</h2>
      <ul>
        <li>About SortMyCover and consumer protection: the <a href="https://thencc.org.za/" rel="noopener noreferrer">National Consumer Commission</a>.</li>
        <li>About your personal information: the <a href="https://inforegulator.org.za/" rel="noopener noreferrer">Information Regulator</a>, complaints.IR@inforegulator.org.za.</li>
        <li>About an advertisement: the <a href="https://www.arb.org.za/" rel="noopener noreferrer">Advertising Regulatory Board</a>.</li>
      </ul>
      <h2>Complaints about the adviser</h2>
      <p>A complaint about an adviser’s advice or product goes to the adviser’s own firm first, then to the <a href="https://www.faisombud.co.za/" rel="noopener noreferrer">FAIS Ombud</a>. The FAIS Ombud is the route for the adviser, not for SortMyCover. See <Link to="/learn/how-to-complain/">how to complain</Link> for the full order.</p>
    </PageFrame>
  );
}
