import PageFrame from "@/components/PageFrame";
import { Steps } from "@/components/Interactive";
import { HOW_STEPS } from "@/content/shared";
import { Link } from "react-router-dom";

export default function HowItWorks() {
  return (
    <PageFrame title="How it works | SortMyCover" description="Three steps: answer two quick questions, get your adviser’s details on WhatsApp, have a 30-minute call. The call costs you nothing." path="/how-it-works/" h1="How it works" lede="Three steps. No surprises." crumbs={[{ name: "SortMyCover", path: "/" }, { name: "How it works", path: "/how-it-works/" }]}>
      <div className="my-6"><Steps items={HOW_STEPS} /></div>
      <h2>What SortMyCover does</h2>
      <p>SortMyCover introduces you to one adviser from an authorised financial services provider and helps book the call. That is all.</p>
      <h2>What SortMyCover does not do</h2>
      <p>SortMyCover is not a financial services provider and gives no financial advice. It does not compare products, rank insurers or quote premiums. It does not help with applications, documents or debit orders. Only the adviser can talk about products.</p>
      <h2>What the adviser tells you</h2>
      <p>Before you speak, the adviser shares their name, practice and FSP number. On the call, they tell you how they are paid. You can check them on the FSCA register first: see <Link to="/learn/how-to-check-an-adviser/">how to check an adviser</Link>.</p>
      <h2>What it costs you</h2>
      <p>The call costs you nothing. For how SortMyCover is paid, see <Link to="/how-we-make-money/">how we make money</Link>.</p>
    </PageFrame>
  );
}
