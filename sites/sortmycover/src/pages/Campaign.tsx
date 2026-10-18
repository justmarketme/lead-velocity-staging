/* One page, one goal: the campaign landing page for an ad angle (spec C.1). No navigation. Served on <label>.sortmycover.co.za. */
import { Fragment } from "react";
import { Seo } from "@/lib/head";
import { COST_LINE, FEE_LINE, NO_COMMISSION, PROVIDER_COST_LINE, PROVIDER_ROLE_LINE, PROVIDER_SERVICE_LINE, campaignOrigin, provider, site } from "@/lib/site";
import ChatWidget, { CalendarCta, WhatsAppCta } from "@/components/ChatWidget";
import { WA_EXPECT, campaignContext } from "@/lib/whatsapp";
import { CampaignFooter } from "@/components/Footer";
import { Wordmark } from "@/components/Brand";
import { FaqItem, Steps } from "@/components/Interactive";
import { Inline } from "@/lib/inline";
import { CAMPAIGN_FAQ, HOW_STEPS, WILLS_FAQ, WILLS_STEPS } from "@/content/shared";
import { h1Segments, hostLabel, type Angle } from "@/campaigns";
import { CAMPAIGN_SCENES } from "@/content/imagery";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** "2025-10" -> "October 2025" (the proof line always shows its source month, rule S15). */
const proofMonth = (ym: string) => { const [y, m] = ym.split("-"); return MONTHS[+m - 1] + " " + y; };

/** Theme B (wills and estate) pages name the will provider and say what SortMyCover does not do. */
const isWills = (a: Angle) => a.theme === "B";
const campaignImage = (a: Angle) => CAMPAIGN_SCENES[a.slug];

export function CampaignLanding({ angle }: { angle: Angle }) {
  const origin = campaignOrigin(hostLabel(angle));
  const wills = isWills(angle);
  return (
    <div className="smc-campaign">
      <Seo title={angle.title} description={angle.description} canonical={origin + "/"} robots="noindex,follow" />
      <a className="skip" href="#h-how">Skip to what happens next</a>
      <header className="site-header"><div className="wrap bar"><Wordmark plain /><small className="text-[12px] text-[#c3c8ce]">{COST_LINE}</small></div></header>
      <main id="main">
        <section className="hero-band on-dark">
          <div className="wrap campaign-hero-grid">
            <div className="campaign-hero-copy">
            <p className="eyebrow campaign-kicker">A conversation, not a quote.</p>
            <h1 className="text-[clamp(30px,8vw,44px)] leading-[1.05]">{h1Segments(angle.h1).map((s, i) => s.br ? <br key={i} /> : s.em ? <em key={i} className="not-italic text-amber">{s.text}</em> : <Fragment key={i}>{s.text}</Fragment>)}</h1>
            <p className="mt-4 text-[17px] text-[#d3d7dc] max-w-[40ch]">{angle.sub}</p>
            <div className="hx-actions" id="chat"><WhatsAppCta ctx={campaignContext(angle)} className="btn btn-lg" /><CalendarCta ctx={campaignContext(angle)} className="btn btn-lg btn-secondary">Pick a time</CalendarCta><a href="#h-how" className="hx-how-link">What happens next ↓</a></div>
            <p className="mt-3 text-[14px] text-[#56606a] max-w-[46ch]">{isWills(angle) ? WA_EXPECT.replace("your adviser", "your consultant") : WA_EXPECT}</p>
            {angle.note && <p className="mt-3 text-[15px] text-[#c3c8ce] max-w-[44ch]" data-disclosure>{angle.note}</p>}
            {wills && <p className="mt-3 text-[14px] text-[#c3c8ce] max-w-[46ch]" data-disclosure data-provider>{PROVIDER_SERVICE_LINE} {PROVIDER_ROLE_LINE}</p>}
            {angle.proof && (
              <p className="mt-4 text-[14px] text-[#c3c8ce] max-w-[46ch] border-l-2 border-amber pl-3" data-proof data-disclosure>
                {angle.proof.text} <span>Source: {angle.proof.source}, {proofMonth(angle.proof.month)}.</span>
              </p>
            )}
            </div>
            <figure className="campaign-hero-photo">
              <img src={campaignImage(angle).src} alt={campaignImage(angle).alt} width={campaignImage(angle).w} height={campaignImage(angle).h} fetchPriority="high" />
            </figure>
          </div>
        </section>
        <section className="wrap-narrow py-6" aria-labelledby="h-how"><h2 id="h-how" className="text-[24px] mb-4">What happens next</h2><Steps items={wills ? WILLS_STEPS : HOW_STEPS} /></section>
        <section className="wrap-narrow py-6" aria-labelledby="h-cost" data-disclosure>
          <h2 id="h-cost" className="text-[24px] mb-3">Cost, and who we are</h2>
          <p>{wills ? <>{COST_LINE}</> : <>{COST_LINE} {FEE_LINE} {NO_COMMISSION}</>} SortMyCover is not a financial services provider and gives no advice.</p>
        </section>
        <section className="wrap-narrow pb-8" aria-labelledby="h-faq">
          <h2 id="h-faq" className="text-[24px] mb-3">Questions people ask</h2>
          {(wills ? WILLS_FAQ : CAMPAIGN_FAQ).map((f) => <FaqItem key={f.id} q={f.q}><p><Inline text={f.a} /></p></FaqItem>)}
        </section>
      </main>
      <CampaignFooter feeLine={!wills} />
      <ChatWidget base={campaignContext(angle)} />
    </div>
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
        <p className="lede">{isWills(angle) ? <>The name of your will consultant is on its way</> : <>Your adviser’s name, practice and FSP number are on their way</>}{site.whatsapp_number ? <> from <strong>{site.whatsapp_number}</strong></> : <> from the SortMyCover WhatsApp number</>}. Save the number so the message does not get lost.</p>
        <ul><li>You pick a time that suits you, and get reminders before the call.</li><li>The call is about 30 minutes. {COST_LINE} You decide afterwards.</li><li>Reply STOP to any message to stop.</li></ul>
      </div></main>
      <CampaignFooter feeLine={!isWills(angle)} />
    </>
  );
}
