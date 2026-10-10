import PageFrame from "@/components/PageFrame";
import { Link } from "react-router-dom";

export default function HowWeMakeMoney() {
  return (
    <PageFrame title="How SortMyCover makes money | SortMyCover" description="Advisers pay Lead Velocity a flat fee. It does not depend on whether you buy anything. SortMyCover takes no commission and no share of any premium." path="/how-we-make-money/" h1="How SortMyCover makes money" lede="Short answer: advisers pay a flat fee. The call costs you nothing." crumbs={[{ name: "SortMyCover", path: "/" }, { name: "How we make money", path: "/how-we-make-money/" }]}>
      <h2>What advisers pay</h2>
      <p>A participating adviser pays Lead Velocity (Pty) Ltd, which trades as SortMyCover, a flat fee for each 30-day cycle. In return, the adviser is introduced to people who asked for a call and agreed to be contacted. The fee is the same whether or not anyone buys a product.</p>
      <h2>What SortMyCover does not take</h2>
      <ul>
        <li>SortMyCover takes no commission and no share of any premium.</li>
        <li>SortMyCover takes no fee from the person who asks for a call.</li>
      </ul>
      <p>That describes SortMyCover only. If you later choose a product, your adviser tells you how they are paid. Advisers may earn commission or fees from their own clients, and they must disclose it.</p>
      <h2>Why this matters</h2>
      <p>Because the fee is flat, SortMyCover has no financial interest in which product you choose. SortMyCover also does not give advice, compare products or quote premiums. That is the adviser’s job.</p>
      <h2>Who to ask</h2>
      <p>Read <Link to="/about/">about SortMyCover</Link> for the company details, or email <a href="mailto:hello@sortmycover.co.za">hello@sortmycover.co.za</a>.</p>
    </PageFrame>
  );
}
