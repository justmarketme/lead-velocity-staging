import { Seo } from "@/lib/head";
import { APEX, COST_LINE, provider } from "@/lib/site";
import Quiz from "@/components/Quiz";
import { Link } from "react-router-dom";

export default function Book() {
  return (
    <>
      <Seo title="Book a call | SortMyCover" description={`Book a 30-minute call with an authorised adviser about cover, or with a ${provider.name} consultant about your will. The call costs you nothing. No advice from SortMyCover.`} canonical={APEX + "/book/"} />
      <section className="hero-band on-dark">
        <div className="wrap-narrow py-8">
          <h1 className="text-[clamp(28px,6vw,40px)] leading-[1.08]">Book a call</h1>
          <p className="mt-3 text-[17px] text-[#d7d2c8]">With an authorised adviser about cover, or with a {provider.name} consultant about your will. About 30 minutes, at a time you pick. {COST_LINE}</p>
        </div>
      </section>
      <section className="wrap-narrow py-8">
        <Quiz angle="generic" metaCode="c00" />
        <p className="fine mt-4">Not sure yet? Read about <Link className="underline" to="/cover/">cover types</Link> or <Link className="underline" to="/wills/">wills and estate</Link>, <Link className="underline" to="/how-it-works/">see how it works</Link> or <Link className="underline" to="/how-we-make-money/">how we make money</Link>.</p>
      </section>
    </>
  );
}
