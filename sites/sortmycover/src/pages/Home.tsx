import { useRef } from "react";
import { Link } from "react-router-dom";
import { WhatsAppCta } from "@/components/ChatWidget";
import { WA_EXPECT, contextFor } from "@/lib/whatsapp";
import { Seo } from "@/lib/head";
import { APEX, BOOK_COVER, BOOK_LABEL, BOOK_WILLS, COST_LINE, FEE_LINE, NO_COMMISSION, PROVIDER_COST_LINE, PROVIDER_ROLE_LINE, WILLS_BOOK_LABEL, company, provider, site } from "@/lib/site";
import { organization, website } from "@/lib/jsonld";
import { FaqItem, Reveal } from "@/components/Interactive";
import { HeroMosaic, JourneyScroll, MomentPicker, Split, ValueStack, useHomeGestures } from "@/components/HomeMotion";
import { Inline } from "@/lib/inline";
import { HOME_FAQ } from "@/content/shared";
import { SCENES } from "@/content/imagery";
import { articlePath, articlesForHub, COVER_HUB, WILLS_HUB } from "@/content";

/* Spec D.1, redesigned 16 Oct 2026 around the funnel research (checklist/creative-intelligence/master-brief.md section 5):
   hook (a specific life moment, search-intent words in the H1) -> story (the moment picker and the four-step journey) -> offer
   (the two calls, with what to expect stated up front: who, how long, effort, cost). The two-call cards, disclosures and guide
   links are unchanged. No sticky bar, no rating, no counter. Disclosures carry data-disclosure and are never animation targets;
   the H1, hero copy and primary CTA are never animated in (LCP). People images are decorative scenes (src/content/imagery.ts). */

const COVER_LINES: Record<string, string> = {
  "life-cover": "Pays a benefit when the insured person dies.",
  "disability-cover": "Pays a lump sum or an income when illness or injury stops work.",
  "severe-illness-cover": "Pays a lump sum on the diagnosis of a listed serious illness.",
  "income-protection": "Pays a monthly income while a person cannot work.",
};
/** Short names for the cover links (the page titles are written for search). */
const COVER_NAMES: Record<string, string> = { "life-cover": "Life cover", "disability-cover": "Disability cover", "severe-illness-cover": "Severe illness cover", "income-protection": "Income protection" };
const COVER_ORDER = ["life-cover", "disability-cover", "severe-illness-cover", "income-protection"];
const WILL_ORDER = ["what-a-will-does", "guardians-and-childrens-trusts", "estate-costs-and-a-will", "where-to-keep-a-will", "the-will-appointment", "estate-administration"];
const ordered = <T extends { slug: string }>(items: T[], order: string[]) => [...items].sort((a, b) => order.indexOf(a.slug) - order.indexOf(b.slug));

const VALUES = [
  { k: "Who", v: "A licensed adviser", d: "Name, practice and FSP number arrive on WhatsApp before the call." },
  { k: "How long", v: "About 30 minutes", d: "At a time picked from the WhatsApp message. Video, WhatsApp or phone." },
  { k: "Effort", v: "About a minute", d: "Two quick questions, then a first name and mobile number." },
  { k: "Cost", v: "Nothing to pay", d: COST_LINE + " The decision comes afterwards." },
];

const JOURNEY = [
  { n: "01", title: "Two quick questions", body: "What the call is about, and an age band. Then a first name and mobile number. About a minute." },
  { n: "02", title: "The adviser’s details on WhatsApp", body: "Name, practice and FSP number, to check on the FSCA register, with times to choose from." },
  { n: "03", title: "A time that suits", body: "Pick a slot from the message. Move or cancel it the same way, at no cost." },
  { n: "04", title: "A 30-minute conversation", body: "By video, WhatsApp or phone. The adviser explains how they are paid. Nothing is decided on the call." },
];

export default function Home() {
  const cover = ordered(articlesForHub(COVER_HUB), COVER_ORDER);
  const wills = ordered(articlesForHub(WILLS_HUB), WILL_ORDER);
  const root = useRef<HTMLDivElement>(null);
  useHomeGestures(root);
  return (
    <div className="smc-home" ref={root}>
      <Seo
        title="Cover adviser calls and wills | SortMyCover"
        description={`Book a 30-minute call with an adviser from an FSCA-authorised provider about life, disability, severe illness or income cover, or with ${provider.name} about your will.`}
        canonical={APEX + "/"}
        jsonld={[organization(), website()]}
      />
      <section className="hero-band hx-hero">
        <div className="wrap hx-hero-grid">
          <div className="hx-hero-copy">
            <p className="eyebrow mb-3">A conversation, not a quote.</p>
            <h1 className="hx-h1">New bond. New baby. New job. <em>One call about cover.</em></h1>
            <p className="hx-intro">A 30-minute call with an authorised adviser about life cover, disability, severe illness or income protection. Or a will, with {provider.name}.</p>
            <div className="hx-actions">
              <WhatsAppCta ctx={contextFor("/")} className="btn btn-lg" />
              <Link to={BOOK_COVER} className="hx-how-link">Or book a call on the website</Link>
            </div>
            <p className="hx-micro">{WA_EXPECT} {COST_LINE}</p>
          </div>
          <HeroMosaic />
        </div>
        <div className="wrap"><ValueStack items={VALUES} /></div>
      </section>

      <section className="hx-section" aria-labelledby="h-moments">
        <div className="wrap">
          <p className="eyebrow eyebrow-light">The questions behind the call</p>
          <h2 id="h-moments" className="hx-h2" data-split><Split text="Life changes." em="The questions change too." /></h2>
          <MomentPicker />
        </div>
      </section>

      <section className="hx-section hx-dark on-dark" aria-labelledby="h-how">
        <div className="wrap">
          <p className="eyebrow">A simple path</p>
          <h2 id="h-how" className="hx-h2" data-split><Split text="From a few questions" em="to a real conversation." /></h2>
          <JourneyScroll steps={JOURNEY} />
          <p className="hx-dark-fine" data-disclosure>Before the call, a cover adviser sends their name, practice and FSP number, and on the call they explain how they are paid. A will call works the same way with a {provider.name} consultant. <Link to="/how-it-works/" className="underline">Read the full walk-through</Link>.</p>
        </div>
      </section>

      <section className="hx-section" aria-labelledby="h-choose">
        <div className="wrap">
          <div className="home-choice-heading"><p className="eyebrow eyebrow-light">Choose a conversation</p><h2 id="h-choose" className="hx-h2" data-split><Split text="Two ways" em="to start." /></h2></div>
          <div className="grid gap-4 md:grid-cols-2 home-services" aria-label="Choose a call">
            <article className="svc-card" aria-labelledby="h-svc-cover">
              <img className="svc-photo" src={SCENES.svcCover.src} alt={SCENES.svcCover.alt} loading="lazy" width={SCENES.svcCover.w} height={SCENES.svcCover.h} />
              <p className="svc-kicker">Cover adviser call</p>
              <h2 id="h-svc-cover">Talk to a cover adviser</h2>
              <p className="svc-who">With an adviser from an FSCA-authorised financial services provider. You get their name, practice and FSP number before you speak.</p>
              <ul className="svc-list">
                {COVER_ORDER.map((slug) => { const m = cover.find((c) => c.slug === slug); return m ? <li key={slug}><Link to={articlePath(slug)}>{COVER_NAMES[slug]}</Link></li> : null; })}
              </ul>
              <p className="mt-auto pt-2"><Link to={BOOK_COVER} className="btn w-full sm:w-auto">{BOOK_LABEL} <span aria-hidden="true">→</span></Link></p>
              <p className="svc-fine" data-disclosure>{COST_LINE} {FEE_LINE}</p>
            </article>

            <article className="svc-card" aria-labelledby="h-svc-wills">
              <img className="svc-photo" src={SCENES.svcWills.src} alt={SCENES.svcWills.alt} loading="lazy" width={SCENES.svcWills.w} height={SCENES.svcWills.h} />
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
          <p className="mt-6 text-[15px] text-muted-foreground max-w-[70ch]" data-disclosure>SortMyCover is run by Lead Velocity (Pty) Ltd, registration {company.registration}. Not a financial services provider. We give no advice. <a className="underline" href={site.fsca_register_url} rel="noopener noreferrer">Check any adviser or provider on the FSCA register</a>.</p>
          <p className="mt-2 text-[15px] text-muted-foreground max-w-[70ch]">Questions? {site.whatsapp_number ? <>WhatsApp {site.whatsapp_number} or email</> : <>Email</>} <a className="underline" href={"mailto:" + company.email}>{company.email}</a>. We answer questions about how this works, not about cover or wills.</p>
        </div>
      </section>

      <section className="wrap py-12" aria-labelledby="h-cover">
        <div className="home-editorial">
          <img src={SCENES.edCover.src} alt={SCENES.edCover.alt} width={SCENES.edCover.w} height={SCENES.edCover.h} loading="lazy" />
          <div>
            <p className="eyebrow eyebrow-light">Cover types</p>
            <h2 id="h-cover">Cover is about the life around it.</h2>
            <p>From a monthly income to a family’s future, each type of cover does a different job. These guides explain the basics before the adviser call.</p>
            <Link className="home-text-link" to="/cover/">Explore all cover types →</Link>
          </div>
        </div>
        <Reveal className="home-guide-grid grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {cover.map((m) => (
            <Link key={m.slug} to={articlePath(m.slug)} className="card-link card-tall" data-reveal><b>{COVER_NAMES[m.slug] ?? m.title}</b><span>{COVER_LINES[m.slug] ?? m.description}</span><i aria-hidden="true">Read →</i></Link>
          ))}
        </Reveal>
        <p className="mt-4 max-w-prose text-[15px] text-muted-foreground">What each one is, what it is not, and questions to ask an adviser. Sourced from ASISA, the FSCA and the Policyholder Protection Rules. Information, not advice.</p>
      </section>

      <section className="bg-muted py-12" aria-labelledby="h-wills">
        <div className="wrap">
          <div className="home-editorial home-editorial-reverse">
            <img src={SCENES.edWills.src} alt={SCENES.edWills.alt} width={SCENES.edWills.w} height={SCENES.edWills.h} loading="lazy" />
            <div>
              <p className="eyebrow eyebrow-light">Wills and estate</p>
              <h2 id="h-wills">The conversations that help shape a will.</h2>
              <p>People, wishes and practical details all matter. Read what a will does and what happens during an estate appointment.</p>
              <Link className="home-text-link" to="/wills/">Explore wills and estate →</Link>
            </div>
          </div>
          <p className="mb-5 max-w-prose text-[15px] text-muted-foreground" data-disclosure>Every fact in these guides is a statement {provider.name} publishes, with the source and date on each page. {PROVIDER_ROLE_LINE}</p>
          <Reveal className="home-guide-grid grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {wills.map((m) => (
              <Link key={m.slug} to={articlePath(m.slug)} className="card-link" data-reveal><b>{m.title}</b><span>{m.description}</span></Link>
            ))}
          </Reveal>
        </div>
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
            <li><Link className="underline" to={articlePath("life-cover-and-a-home-loan")}>Life cover and a home loan: what the paperwork says</Link></li>
            <li><Link className="underline" to={articlePath("income-protection-vs-disability-cover")}>Income protection vs disability cover</Link></li>
            <li><Link className="underline" to={articlePath("questions-to-ask-a-financial-adviser")}>Questions to ask a financial adviser</Link></li>
            <li><Link className="underline" to={articlePath("what-is-credit-life-insurance")}>Credit life insurance on a bond, explained</Link></li>
            <li><Link className="underline" to={articlePath("estate-duty-south-africa")}>Estate duty in South Africa (and why there is no inheritance tax)</Link></li>
          </ul>
        </div>
      </section>

      <section className="wrap-narrow pb-4" aria-labelledby="h-faq">
        <h2 id="h-faq" className="text-[26px] mb-3">Questions people ask</h2>
        {HOME_FAQ.map((f) => <FaqItem key={f.id} q={f.q}><p><Inline text={f.a} /></p></FaqItem>)}
      </section>
      <div className="wrap">
        <aside className="hx-final on-dark" aria-label="Book a call">
          <h2 className="hx-h2" data-split><Split text="Ready" em="when you are." /></h2>
          <p>About 30 minutes, at a time you pick. {WA_EXPECT} {COST_LINE}</p>
          <div className="flex flex-wrap gap-3">
            <WhatsAppCta ctx={contextFor("/")} className="btn btn-lg" />
            <Link to={BOOK_COVER} className="btn btn-secondary">{BOOK_LABEL}</Link>
            <Link to={BOOK_WILLS} className="btn btn-secondary">{WILLS_BOOK_LABEL}</Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
