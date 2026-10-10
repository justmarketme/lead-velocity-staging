import { Link } from "react-router-dom";
import { Seo } from "@/lib/head";
import { APEX, BOOK_LABEL, COST_LINE, FEE_LINE, NO_COMMISSION, company, site } from "@/lib/site";
import { organization, website } from "@/lib/jsonld";
import { FaqItem, Steps } from "@/components/Interactive";
import { Cta } from "@/components/PageFrame";
import { Inline } from "@/lib/inline";
import { HOME_FAQ, HOW_STEPS } from "@/content/shared";
import HeroVisual from "@/components/HeroVisual";

/* Spec D.1. No sticky bar on the home page, no rating, no counter. Disclosures carry data-disclosure and are never reveal targets. */
export default function Home() {
  return (
    <>
      <Seo
        title="Book a 30-minute adviser call | SortMyCover"
        description="SortMyCover introduces you to an adviser from an FSCA-authorised provider and books a 30-minute call. The call costs you nothing. SortMyCover gives no financial advice."
        canonical={APEX + "/"}
        jsonld={[organization(), website()]}
      />
      <section className="hero-band on-dark">
        <div className="wrap grid gap-8 py-10 md:grid-cols-[1.2fr_1fr] md:py-14 items-center">
          <div>
            <h1 className="text-[clamp(30px,6.5vw,48px)] leading-[1.08]">Book a 30-minute call with an adviser from an <em className="not-italic text-amber">FSCA-authorised provider.</em></h1>
            <p className="mt-4 text-[18px] text-[#d7d2c8] max-w-[44ch]">SortMyCover introduces you and books the time. The adviser, not us, talks to you about your cover.</p>
            <p className="mt-6"><Link to="/book/" className="btn">{BOOK_LABEL} <span aria-hidden="true">→</span></Link></p>
            <p className="mt-3 text-[15px] text-[#d7d2c8] max-w-[46ch]" data-disclosure>{COST_LINE} {FEE_LINE}</p>
            <p className="mt-5 text-[15px] text-[#d7d2c8] max-w-[52ch]" data-disclosure>SortMyCover is run by Lead Velocity (Pty) Ltd, registration {company.registration}. Not a financial services provider. We give no advice. <a className="underline text-offwhite" href={site.fsca_register_url} rel="noopener noreferrer">Check any adviser on the FSCA register</a>.</p>
            <p className="mt-3 text-[15px] text-[#d7d2c8] max-w-[52ch]">Questions? {site.whatsapp_number ? <>WhatsApp {site.whatsapp_number} or email</> : <>Email</>} <a className="underline text-offwhite" href={"mailto:" + company.email}>{company.email}</a>. We answer questions about how this works, not about cover.</p>
          </div>
          <HeroVisual />
        </div>
      </section>

      <section className="wrap py-12" aria-labelledby="h-how">
        <h2 id="h-how" className="text-[26px] mb-6">How it works</h2>
        <Steps items={HOW_STEPS} />
        <p className="mt-6 max-w-prose" data-disclosure>Before you speak, the adviser gives you their name, practice and FSP number, and on the call they tell you how they are paid. <Link to="/how-it-works/" className="underline">Read the full walk-through</Link>.</p>
      </section>

      <section className="bg-muted py-12" aria-labelledby="h-is">
        <div className="wrap grid gap-8 md:grid-cols-2" data-disclosure>
          <div>
            <h2 id="h-is" className="text-[26px] mb-3">What SortMyCover is, and is not</h2>
            <p><strong>Is:</strong> an introduction and booking service run by Lead Velocity (Pty) Ltd. It costs you nothing. Advisers pay it a fee that does not depend on what you buy.</p>
            <p><strong>Is not:</strong> an insurer, a financial services provider, an adviser or a comparison site. We do not quote, rank or recommend.</p>
          </div>
          <div>
            <h2 className="text-[26px] mb-3">How we make money</h2>
            <p>{FEE_LINE} {NO_COMMISSION} If you later choose a product, your adviser tells you how they are paid.</p>
            <p><Link className="underline" to="/how-we-make-money/">Read how we make money</Link>.</p>
          </div>
        </div>
      </section>

      <section className="wrap py-12 grid gap-8 md:grid-cols-2" aria-labelledby="h-adv">
        <div>
          <h2 id="h-adv" className="text-[26px] mb-3">Who your adviser is</h2>
          <p>You are introduced to one adviser from a financial services provider authorised by the FSCA. You can check them on the register before you speak. <Link className="underline" to="/advisers/">More about advisers</Link>.</p>
        </div>
        <div>
          <h2 className="text-[26px] mb-3">Read first</h2>
          <ul className="list-none p-0 m-0 grid gap-2">
            <li><Link className="underline" to="/learn/what-happens-on-a-30-minute-call/">What happens on the call</Link></li>
            <li><Link className="underline" to="/learn/how-to-check-an-adviser/">How to check an adviser</Link></li>
            <li><Link className="underline" to="/learn/what-happens-to-your-details/">What happens to your details</Link></li>
          </ul>
        </div>
      </section>

      <section className="wrap-narrow pb-4" aria-labelledby="h-faq">
        <h2 id="h-faq" className="text-[26px] mb-3">Questions people ask</h2>
        {HOME_FAQ.map((f) => <FaqItem key={f.id} q={f.q}><p><Inline text={f.a} /></p></FaqItem>)}
      </section>
      <div className="wrap-narrow"><Cta heading="Ready when you are" /></div>
    </>
  );
}
