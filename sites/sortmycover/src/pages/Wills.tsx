/* /wills/: the wills and estate section hub. The service is provided by the will provider in config/site.json -> will_provider
   (named only through `provider`); every fact on the guides is one of its verified statements (config/evidence.json, cl-*).
   No fee statement about SortMyCover here: the provider's fee arrangement with SortMyCover is not settled. */
import { Link } from "react-router-dom";
import PageFrame from "@/components/PageFrame";
import { FaqItem, Steps } from "@/components/Interactive";
import { Inline } from "@/lib/inline";
import { SCENES } from "@/content/imagery";
import { BOOK_WILLS, COST_LINE, PROVIDER_COST_LINE, PROVIDER_ROLE_LINE, PROVIDER_SERVICE_LINE, WILLS_BOOK_LABEL, provider, site } from "@/lib/site";
import { WILLS_FAQ, WILLS_STEPS } from "@/content/shared";
import { articlesForHub, hubFor, WILLS_HUB } from "@/content";
import { ArticleList } from "./Learn";

export default function Wills() {
  const hub = hubFor(WILLS_HUB);
  return (
    <PageFrame
      title="Wills and estate planning | SortMyCover"
      description={`Book a call with a ${provider.name} consultant to get your will drafted, and read plain guides to wills, guardians, estate costs and estate administration.`}
      path="/wills/"
      h1="Wills and estate planning"
      lede={`Get your will drafted by ${provider.name}, and read plain-words guides to what a will does and what happens to an estate.`}
      crumbs={[{ name: "SortMyCover", path: "/" }, { name: hub.title, path: "/wills/" }]}
      ctaKind="wills"
    >
      <figure className="hub-photo"><img src={SCENES.hubWills.src} alt={SCENES.hubWills.alt} width={SCENES.hubWills.w} height={SCENES.hubWills.h} loading="eager" /></figure>
      <p className="text-[15px] text-muted-foreground" data-disclosure data-provider>
        {PROVIDER_SERVICE_LINE} {PROVIDER_ROLE_LINE} <a href={site.fsca_register_url} rel="noopener noreferrer">Look the firm up on the FSCA register</a>.
      </p>
      <p className="mt-5"><Link to={BOOK_WILLS} className="btn">{WILLS_BOOK_LABEL} <span aria-hidden="true">→</span></Link></p>
      <p className="text-[15px]" data-disclosure>{COST_LINE} {PROVIDER_COST_LINE}</p>

      <h2>Guides</h2>
      <ArticleList items={articlesForHub(WILLS_HUB)} />

      <h2>What happens when you book</h2>
      <Steps items={WILLS_STEPS} />

      <h2>Questions people ask</h2>
      {WILLS_FAQ.map((f) => <FaqItem key={f.id} q={f.q}><p><Inline text={f.a} /></p></FaqItem>)}
    </PageFrame>
  );
}
