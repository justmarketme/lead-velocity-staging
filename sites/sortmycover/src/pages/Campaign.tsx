/* One page, one goal: the campaign landing page for an ad angle. No navigation. Served on <slug>.sortmycover.co.za. */
import { Fragment } from "react";
import { Seo } from "@/lib/head";
import { BOOK_LABEL, COST_LINE, campaignOrigin, site } from "@/lib/site";
import Quiz from "@/components/Quiz";
import { CampaignFooter } from "@/components/Footer";
import { Wordmark } from "@/components/Brand";
import { FaqItem, Steps } from "@/components/Interactive";
import { Inline } from "@/lib/inline";
import { CAMPAIGN_FAQ, HOW_STEPS } from "@/content/shared";
import { h1Segments, type Angle } from "@/campaigns";

export function CampaignLanding({ angle }: { angle: Angle }) {
  const origin = campaignOrigin(angle.slug);
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
            <p className="mt-5"><a className="btn" href="#quiz">{BOOK_LABEL} <span aria-hidden="true">→</span></a></p>
            <ul className="mt-5 flex flex-wrap gap-2 list-none p-0 text-[13px]">
              {["Authorised adviser", "Video, WhatsApp or phone", "No obligation to buy"].map((c) => <li key={c} className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5">{c}</li>)}
            </ul>
          </div>
        </section>
        <section className="wrap-narrow py-8" id="quiz" aria-label="Book my adviser call">
          <Quiz angle={angle.slug} metaCode={angle.meta_code} />
        </section>
        <section className="wrap-narrow py-8" aria-labelledby="h-how"><h2 id="h-how" className="text-[24px] mb-4">How it works</h2><Steps items={HOW_STEPS} /></section>
        <section className="wrap-narrow pb-8" aria-labelledby="h-faq">
          <h2 id="h-faq" className="text-[24px] mb-3">Questions people ask</h2>
          {CAMPAIGN_FAQ.map((f) => <FaqItem key={f.id} q={f.q}><p><Inline text={f.a} /></p></FaqItem>)}
        </section>
      </main>
      <CampaignFooter />
    </>
  );
}

export function CampaignThanks({ angle }: { angle: Angle }) {
  const origin = campaignOrigin(angle.slug);
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
