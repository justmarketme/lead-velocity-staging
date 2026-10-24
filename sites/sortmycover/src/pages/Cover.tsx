/* /cover/: the cover types hub. Four plain-words explainers (life, disability, severe illness, income protection), sourced from
   ASISA, the FSCA and the Policyholder Protection Rules. Information, not advice: no product, insurer, price or amount. */
import { Link } from "react-router-dom";
import { StartCta, WhatsAppCta } from "@/components/ChatWidget";
import { WA_EXPECT, contextFor } from "@/lib/whatsapp";
import PageFrame from "@/components/PageFrame";
import { Steps } from "@/components/Interactive";
import {FEE_LINE, NO_COMMISSION} from "@/lib/site";
import { HOW_STEPS } from "@/content/shared";
import { SCENES } from "@/content/imagery";
import { articlesForHub, COVER_HUB, hubFor } from "@/content";
import { ArticleList } from "./Learn";

export default function Cover() {
  const hub = hubFor(COVER_HUB);
  return (
    <PageFrame
      title="Cover types explained | SortMyCover"
      description="Life cover, disability cover, severe illness cover and income protection in plain words: what each is, what it is not, and questions to ask an adviser."
      path="/cover/"
      h1="Cover types, in plain words"
      accent="in plain words"
      lede="Four kinds of long-term insurance an adviser can talk to you about: what each one is, what it is not, and questions to ask an adviser. Information, not advice."
      crumbs={[{ name: "SortMyCover", path: "/" }, { name: hub.title, path: "/cover/" }]}
      ctaKind="cover"
    >
      <figure className="hub-photo"><img src={SCENES.hubCover.src} alt={SCENES.hubCover.alt} width={SCENES.hubCover.w} height={SCENES.hubCover.h} loading="eager" /></figure>
      <ArticleList items={articlesForHub(COVER_HUB)} />
      <p className="mt-4">The words used on these pages are defined in the <Link to="/learn/glossary/">glossary</Link>.</p>

      <h2>Talk it through with an adviser</h2>
      <p>SortMyCover does not sell cover, give advice or quote premiums. It books a 30-minute call with an adviser from an FSCA-authorised financial services provider, who can talk about cover for your situation.</p>
      <p className="mt-5 cta-row"><WhatsAppCta ctx={contextFor("/cover/")} /><StartCta ctx={contextFor("/cover/")} /></p>
      <p className="text-[15px] text-[#56606a]">{WA_EXPECT}</p>
      <p className="text-[15px]" data-disclosure>{FEE_LINE} {NO_COMMISSION}</p>

      <h2>What happens when you book</h2>
      <Steps items={HOW_STEPS} />
    </PageFrame>
  );
}
