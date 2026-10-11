import { Link } from "react-router-dom";
import { Seo } from "@/lib/head";
import { APEX, BOOK_COVER, BOOK_LABEL, BOOK_WILLS, COST_LINE, FEE_LINE, NO_COMMISSION, PROVIDER_COST_LINE, PROVIDER_ROLE_LINE, WILLS_BOOK_LABEL, company, provider, site } from "@/lib/site";
import { organization, website } from "@/lib/jsonld";
import { FaqItem, Reveal, Steps } from "@/components/Interactive";
import { Inline } from "@/lib/inline";
import { HOME_FAQ, HOW_STEPS } from "@/content/shared";
import { articlePath, articlesForHub, COVER_HUB, WILLS_HUB } from "@/content";
import HeroVisual from "@/components/HeroVisual";

/* Spec D.1, extended 11 Oct 2026: the home page presents the two calls SortMyCover books, a cover adviser call (life, disability,
   severe illness, income protection; never funeral cover) and a will and estate call with the will provider (config/site.json ->
   will_provider). Each card links into the quiz with the product chosen. No sticky bar, no rating, no counter. Disclosures carry
   data-disclosure and are never reveal targets; the hero is never animated in (LCP), only the cards further down reveal. */

/** One line per cover type, each a statement from the evidence behind its page (config/evidence.json, sam-*). */
const COVER_LINES: Record<string, string> = {
  "life-cover": "Pays a benefit when the insured person dies.",
  "disability-cover": "Pays a lump sum or an income when illness or injury stops work.",
  "severe-illness-cover": "Pays a lump sum on the diagnosis of a listed serious illness.",
  "income-protection": "Pays a monthly income while a person cannot work.",
};
const COVER_ORDER = ["life-cover", "disability-cover", "severe-illness-cover", "income-protection"];
const WILL_ORDER = ["what-a-will-does", "guardians-and-childrens-trusts", "estate-costs-and-a-will", "where-to-keep-a-will", "the-will-appointment", "estate-administration"];
const ordered = <T extends { slug: string }>(items: T[], order: string[]) => [...items].sort((a, b) => order.indexOf(a.slug) - order.indexOf(b.slug));

export default function Home() {
  const cover = ordered(articlesForHub(COVER_HUB), COVER_ORDER);
  const wills = ordered(articlesForHub(WILLS_HUB), WILL_ORDER);
  return (
    <>
      <Seo
        title="Cover adviser calls and wills | SortMyCover"
        description={`Book a 30-minute call with an adviser from an FSCA-authorised provider about life, disability, severe illness or income cover, or with ${provider.name} about your will.`}
        canonical={APEX + "/"}
        jsonld={[organization(), website()]}
      />
      <section className="hero-band on-dark">
        <div className="wrap py-10 md:py-14">
          <div className="grid gap-8 md:grid-cols-[1.3fr_1fr] items-center">
            <div>
              <p className="eyebrow mb-3">Cover · Wills and estate</p>
              <h1 className="text-[clamp(30px,6.5vw,50px)] leading-[1.06]">Talk to an adviser about your cover, <em className="not-italic text-amber">or get your will drafted.</em></h1>
              <p className="mt-4 text-[18px] text-[#d7d2c8] max-w-[48ch]">SortMyCover books the call, at a time you pick. The adviser or consultant, not us, talks to you about your cover or your will.</p>
            </div>
            <HeroVisual />
          </div>

          <div className="grid gap-4 md:grid-cols-2 mt-8 md:mt-10" aria-label="Choose a call">
            <article className="svc-card" aria-labelledby="h-svc-cover">
              <p className="svc-kicker">Cover adviser call</p>
              <h2 id="h-svc-cover">Talk to a cover adviser</h2>
              <p className="svc-who">With an adviser from an FSCA-authorised financial services provider. You get their name, practice and FSP number before you speak.</p>
              <ul className="svc-list">
                {COVER_ORDER.map((slug) => { const m = cover.find((c) => c.slug === slug); return m ? <li key={slug}><Link to={articlePath(slug)}>{m.title.replace(/, in plain words$/, "")}</Link></li> : null; })}
              </ul>
              <p className="mt-auto pt-2"><Link to={BOOK_COVER} className="btn w-full sm:w-auto">{BOOK_LABEL} <span aria-hidden="true">→</span></Link></p>
              <p className="svc-fine" data-disclosure>{COST_LINE} {FEE_LINE}</p>
            </article>

            <article className="svc-card" aria-labelledby="h-svc-wills">
              <p className="svc-kicker">Will and estate call</p>
              <h2 id="h-svc-wills">Get your will drafted</h2>
              <p className="svc-who" data-disclosure data-provider>With a consultant from {provider.legal_name}, {provider.status} (FSP {provider.fsp_number}). {PROVIDER_ROLE_LINE}</p>
              <ul className="svc-list">
                <li><Link to={articlePath("what-a-will-does")}>Who inherits, and who is executor</Link></li>
                <li><Link to={articlePath("guardians-and-childrens-trusts")}>A guardian and a trust for children</Link></li>
                <li><Link to={articlePath("where-to-keep-a-will")}>Where the signed will is kept</Link></li>
                <li><Link to={articlePath("estate-administration")}>What estate administration involves</Link></li>
              </ul>
              <p className="mt-auto pt-2"><Link to={BOOK_WILLS} className="btn w-full sm:w-auto">{WILLS_BOOK_LABEL} <span aria-hidden="true">→</span></Link></p>
              <p className="svc-fine" data-disclosure>{COST_LINE} {PROVIDER_COST_LINE}</p>
            </article>
          </div>

          <p className="mt-6 text-[15px] text-[#d7d2c8] max-w-[70ch]" data-disclosure>SortMyCover is run by Lead Velocity (Pty) Ltd, registration {company.registration}. Not a financial services provider. We give no advice. <a className="underline text-offwhite" href={site.fsca_register_url} rel="noopener noreferrer">Check any adviser or provider on the FSCA register</a>.</p>
          <p className="mt-2 text-[15px] text-[#d7d2c8] max-w-[70ch]">Questions? {site.whatsapp_number ? <>WhatsApp {site.whatsapp_number} or email</> : <>Email</>} <a className="underline text-offwhite" href={"mailto:" + company.email}>{company.email}</a>. We answer questions about how this works, not about cover or wills.</p>
        </div>
      </section>

      <section className="wrap py-12" aria-labelledby="h-cover">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
          <div>
            <p className="eyebrow eyebrow-light">Cover types</p>
            <h2 id="h-cover" className="text-[26px]">Four kinds of cover, in plain words</h2>
          </div>
          <Link className="underline" to="/cover/">All cover types</Link>
        </div>
        <Reveal className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {cover.map((m) => (
            <Link key={m.slug} to={articlePath(m.slug)} className="card-link card-tall" data-reveal><b>{m.title.replace(/, in plain words$/, "")}</b><span>{COVER_LINES[m.slug] ?? m.description}</span><i aria-hidden="true">Read →</i></Link>
          ))}
        </Reveal>
        <p className="mt-4 max-w-prose text-[15px] text-muted-foreground">What each one is, what it is not, and questions to ask an adviser. Sourced from ASISA, the FSCA and the Policyholder Protection Rules. Information, not advice.</p>
      </section>

      <section className="bg-muted py-12" aria-labelledby="h-wills">
        <div className="wrap">
          <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
            <div>
              <p className="eyebrow eyebrow-light">Wills and estate</p>
              <h2 id="h-wills" className="text-[26px]">What a will does, and what happens to an estate</h2>
            </div>
            <Link className="underline" to="/wills/">All wills and estate guides</Link>
          </div>
          <p className="mb-5 max-w-prose text-[15px] text-muted-foreground" data-disclosure>Every fact in these guides is a statement {provider.name} publishes, with the source and date on each page. {PROVIDER_ROLE_LINE}</p>
          <Reveal className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {wills.map((m) => (
              <Link key={m.slug} to={articlePath(m.slug)} className="card-link" data-reveal><b>{m.title}</b><span>{m.description}</span></Link>
            ))}
          </Reveal>
        </div>
      </section>

      <section className="wrap py-12" aria-labelledby="h-how">
        <h2 id="h-how" className="text-[26px] mb-6">How booking works</h2>
        <Steps items={HOW_STEPS} />
        <p className="mt-6 max-w-prose" data-disclosure>Before you speak, a cover adviser gives you their name, practice and FSP number, and on the call they tell you how they are paid. A will call works the same way with a {provider.name} consultant. <Link to="/how-it-works/" className="underline">Read the full walk-through</Link>.</p>
      </section>

      <section className="bg-muted py-12" aria-labelledby="h-is">
        <div className="wrap grid gap-8 md:grid-cols-2" data-disclosure>
          <div>
            <h2 id="h-is" className="text-[26px] mb-3">What SortMyCover is, and is not</h2>
            <p><strong>Is:</strong> an introduction and booking service run by Lead Velocity (Pty) Ltd. It costs you nothing. Advisers pay it a fee that does not depend on what you buy.</p>
            <p><strong>Is not:</strong> an insurer, a financial services provider, an adviser, a will drafter or a comparison site. We do not quote, rank or recommend.</p>
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
          <h2 id="h-adv" className="text-[26px] mb-3">Who you speak to</h2>
          <p>For cover, one adviser from a financial services provider authorised by the FSCA. You can check them on the register before you speak. <Link className="underline" to="/advisers/">More about advisers</Link>.</p>
          <p>For a will, a consultant from {provider.legal_name}. <Link className="underline" to={articlePath("the-will-appointment")}>What happens at the will appointment</Link>.</p>
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
      <div className="wrap-narrow">
        <aside className="cta-quiet" aria-label="Book a call">
          <h2>Ready when you are</h2>
          <p>About 30 minutes, at a time you pick. {COST_LINE}</p>
          <div className="flex flex-wrap gap-3">
            <Link to={BOOK_COVER} className="btn">{BOOK_LABEL}</Link>
            <Link to={BOOK_WILLS} className="btn btn-secondary">{WILLS_BOOK_LABEL}</Link>
          </div>
        </aside>
      </div>
    </>
  );
}
