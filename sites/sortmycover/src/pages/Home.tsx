import { Link } from "react-router-dom";
import { Seo } from "@/lib/head";
import { APEX, BOOK_LABEL, COST_LINE } from "@/lib/site";
import { organization, website } from "@/lib/jsonld";
import { Steps } from "@/components/Interactive";
import { Cta } from "@/components/PageFrame";
import { HOW_STEPS } from "@/content/shared";
import HeroVisual from "@/components/HeroVisual";

export default function Home() {
  return (
    <>
      <Seo
        title="SortMyCover | A 30-minute call with an authorised adviser"
        description="SortMyCover introduces you to one authorised financial services provider for a 30-minute call, by video, WhatsApp or phone. The call costs you nothing. SortMyCover gives no financial advice."
        canonical={APEX + "/"}
        jsonld={[organization(), website()]}
      />
      <section className="hero-band on-dark">
        <div className="wrap grid gap-8 py-10 md:grid-cols-[1.2fr_1fr] md:py-16 items-center">
          <div>
            <p className="eyebrow">Introductions to authorised advisers</p>
            <h1 className="text-[clamp(32px,7vw,52px)] leading-[1.05] mt-2">A 30-minute call with an <em className="not-italic text-amber">authorised adviser.</em></h1>
            <p className="mt-4 text-[18px] text-[#d7d2c8] max-w-[40ch]">{COST_LINE} You pick the time. SortMyCover gives no financial advice. The adviser does the talking.</p>
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <Link to="/book/" className="btn" data-press>{BOOK_LABEL} <span aria-hidden="true">→</span></Link>
              <Link to="/how-it-works/" className="underline text-offwhite">How it works</Link>
            </div>
            <ul className="mt-6 flex flex-wrap gap-2 list-none p-0 text-[13px]">
              {["Authorised adviser", "Video, WhatsApp or phone", "No obligation to buy"].map((c) => <li key={c} className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5">{c}</li>)}
            </ul>
          </div>
          <HeroVisual />
        </div>
      </section>

      <section className="wrap py-12" aria-labelledby="h-how">
        <h2 id="h-how" className="text-[26px] mb-6">Three steps</h2>
        <Steps items={HOW_STEPS} />
        <p className="mt-6"><Link to="/how-it-works/" className="underline">Read the full walk-through</Link></p>
      </section>

      <section className="bg-muted py-12" aria-labelledby="h-who">
        <div className="wrap grid gap-6 md:grid-cols-2">
          <div>
            <h2 id="h-who" className="text-[26px] mb-3">Who is behind SortMyCover</h2>
            <p>SortMyCover is a trading name of <strong>Lead Velocity (Pty) Ltd</strong>, registration 2025/637858/07, in Menlyn Maine, Pretoria. The address, phone number and email are in the footer of every page. <Link className="underline" to="/about/">About us</Link>.</p>
            <p>SortMyCover is not a financial services provider. It does not give advice, compare products, quote premiums or recommend insurers.</p>
          </div>
          <div>
            <h2 className="text-[26px] mb-3">What is the catch?</h2>
            <p>There is none for you. Advisers pay Lead Velocity a flat fee that never depends on whether anyone buys a policy. SortMyCover takes no commission and no share of any premium. If you later choose a product, your adviser tells you how they are paid.</p>
            <p><Link className="underline" to="/how-we-make-money/">Read how we make money</Link>.</p>
          </div>
        </div>
      </section>

      <section className="wrap py-12" aria-labelledby="h-learn">
        <h2 id="h-learn" className="text-[26px] mb-3">Learn first, if you prefer</h2>
        <p className="max-w-prose">Short guides in plain words, with sources and dates. They are information, not advice.</p>
        <p className="mt-3 flex flex-wrap gap-x-6 gap-y-1"><Link className="underline" to="/learn/">Learn hub</Link><Link className="underline" to="/learn/how-to-check-an-adviser/">How to check an adviser</Link><Link className="underline" to="/learn/what-happens-on-a-30-minute-call/">What happens on the call</Link><Link className="underline" to="/faq/">Questions people ask</Link></p>
      </section>
      <div className="wrap-narrow"><Cta heading="Ready when you are" /></div>
    </>
  );
}
