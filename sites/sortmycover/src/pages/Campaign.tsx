/* One page, one goal: the campaign landing page for an ad angle (spec C.1). No navigation. Served on <label>.sortmycover.co.za. */
import { Fragment, useEffect, useRef, useState } from "react";
import { Seo } from "@/lib/head";
import { BOOK_LABEL, COST_LINE, FEE_LINE, NO_COMMISSION, campaignOrigin, site } from "@/lib/site";
import Quiz from "@/components/Quiz";
import { CampaignFooter } from "@/components/Footer";
import { Wordmark } from "@/components/Brand";
import { FaqItem, Steps } from "@/components/Interactive";
import { Inline } from "@/lib/inline";
import { CAMPAIGN_FAQ, HOW_STEPS } from "@/content/shared";
import { h1Segments, hostLabel, type Angle } from "@/campaigns";
import { slideIn, watchInView } from "@/lib/motion";

/** Sticky CTA (spec C.1): shown only after the quiz card has left the viewport upwards, hidden while the card is on screen and at the footer. */
function CampaignSticky() {
  const [show, setShow] = useState(false);
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const card = document.getElementById("quiz");
    const foot = document.querySelector("[data-footer]");
    if (!card) return;
    let cardVisible = true, footVisible = false;
    const update = () => setShow(!cardVisible && !footVisible && card.getBoundingClientRect().bottom < 0);
    const a = watchInView(card, (v) => { cardVisible = v; update(); });
    const b = foot ? watchInView(foot, (v) => { footVisible = v; update(); }) : () => {};
    cardVisible = card.getBoundingClientRect().bottom > 0; // first paint: the card is normally already on screen
    return () => { a(); b(); };
  }, []);
  useEffect(() => { if (show && bar.current) slideIn(bar.current); }, [show]);
  if (!show) return null;
  return (
    <div ref={bar} className="sticky-bar" role="region" aria-label="Book a call">
      <div className="wrap flex items-center justify-between gap-3">
        <small className="hidden sm:block">{COST_LINE}</small>
        <a className="btn btn-sm" href="#quiz">{BOOK_LABEL}</a>
      </div>
    </div>
  );
}

export function CampaignLanding({ angle }: { angle: Angle }) {
  const origin = campaignOrigin(hostLabel(angle));
  return (
    <>
      <Seo title={angle.title} description={angle.description} canonical={origin + "/"} robots="noindex,follow" />
      <a className="skip" href="#quiz">Skip to the booking</a>
      <header className="site-header"><div className="wrap bar"><Wordmark plain /><small className="text-[12px] text-[#c9c3b8]">{COST_LINE}</small></div></header>
      <main id="main">
        <section className="hero-band on-dark">
          <div className="wrap-narrow py-8">
            <h1 className="text-[clamp(30px,8vw,44px)] leading-[1.05]">{h1Segments(angle.h1).map((s, i) => s.br ? <br key={i} /> : s.em ? <em key={i} className="not-italic text-amber">{s.text}</em> : <Fragment key={i}>{s.text}</Fragment>)}</h1>
            <p className="mt-4 text-[17px] text-[#d7d2c8] max-w-[40ch]">{angle.sub}</p>
          </div>
        </section>
        <section className="wrap-narrow py-6" id="quiz" aria-label="Book my adviser call">
          <Quiz angle={angle.slug} metaCode={angle.meta_code} />
          <p className="fine mt-3" data-disclosure>Run by Lead Velocity (Pty) Ltd. Not a financial services provider. {COST_LINE}</p>
        </section>
        <section className="wrap-narrow py-6" aria-labelledby="h-how"><h2 id="h-how" className="text-[24px] mb-4">What happens next</h2><Steps items={HOW_STEPS} /></section>
        <section className="wrap-narrow py-6" aria-labelledby="h-cost" data-disclosure>
          <h2 id="h-cost" className="text-[24px] mb-3">Cost, and who we are</h2>
          <p>{COST_LINE} {FEE_LINE} {NO_COMMISSION} SortMyCover is not a financial services provider and gives no advice.</p>
        </section>
        <section className="wrap-narrow pb-8" aria-labelledby="h-faq">
          <h2 id="h-faq" className="text-[24px] mb-3">Questions people ask</h2>
          {CAMPAIGN_FAQ.map((f) => <FaqItem key={f.id} q={f.q}><p><Inline text={f.a} /></p></FaqItem>)}
        </section>
      </main>
      <CampaignFooter />
      <CampaignSticky />
    </>
  );
}

export function CampaignThanks({ angle }: { angle: Angle }) {
  const origin = campaignOrigin(hostLabel(angle));
  return (
    <>
      <Seo title="Thank you | SortMyCover" description="Thanks. Your adviser’s details are on their way on WhatsApp." canonical={origin + "/thanks/"} robots="noindex,nofollow" />
      <header className="site-header"><div className="wrap bar"><Wordmark plain /></div></header>
      <main id="main" className="wrap-narrow py-12"><div className="prose-sm">
        <h1>Thanks. Check your WhatsApp.</h1>
        <p className="lede">Your adviser’s name, practice and FSP number are on their way{site.whatsapp_number ? <> from <strong>{site.whatsapp_number}</strong></> : <> from the SortMyCover WhatsApp number</>}. Save the number so the message does not get lost.</p>
        <ul><li>You pick a time that suits you, and get reminders before the call.</li><li>The call is about 30 minutes. {COST_LINE} You decide afterwards.</li><li>Reply STOP to any message to stop.</li></ul>
      </div></main>
      <CampaignFooter />
    </>
  );
}
