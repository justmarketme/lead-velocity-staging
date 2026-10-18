import { Link } from "react-router-dom";
import PageFrame from "@/components/PageFrame";
import { SectionNav, sectionId } from "@/components/Interactive";
import { Inline } from "@/lib/inline";
import { article as articleLd } from "@/lib/jsonld";
import { pageTitle } from "@/lib/head";
import { articlePath, articlesForHub, COVER_HUB, hubPath, hubs, HUB1_INTRO, metaFor, WILLS_HUB } from "@/content";
import { PROVIDER_ROLE_LINE, PROVIDER_SERVICE_LINE } from "@/lib/site";
import type { Article } from "@/content/types";
import { ArticleList } from "./Learn";
import { ARTICLE_SCENES } from "@/content/imagery";
import { ArticleDiagram } from "@/components/Visuals";

const fmtDate = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const fmtMonth = (ym: string) => new Date(ym + "-01T00:00:00Z").toLocaleDateString("en-ZA", { month: "long", year: "numeric", timeZone: "UTC" });

/** Article template (spec B.6): H1, byline + last reviewed, 40-60 word answer block, sections, sources, related, quiet CTA. */
export default function ArticlePage({ article }: { article: Article }) {
  const { meta, body } = article;
  const path = articlePath(meta.slug);
  const hub = hubs.find((h) => h.n === meta.hub)!;
  const isHub1 = meta.slug === HUB1_INTRO;
  const wills = meta.hub === WILLS_HUB;
  /** Wills and cover type pages live in their own top-level sections (/wills/, /cover/), not under /learn/. */
  const ownSection = wills || meta.hub === COVER_HUB;
  const crumbs = isHub1
    ? [{ name: "SortMyCover", path: "/" }, { name: "Learn", path: "/learn/" }, { name: hub.title, path }]
    : ownSection
      ? [{ name: "SortMyCover", path: "/" }, { name: hub.title, path: hubPath(hub) }, { name: meta.title, path }]
      : [{ name: "SortMyCover", path: "/" }, { name: "Learn", path: "/learn/" }, { name: hub.title, path: hubPath(hub) }, { name: meta.title, path }];
  const scene = ARTICLE_SCENES[meta.slug];
  const sections = body.filter((b) => b.type === "h2").map((b) => (b as { text: string }).text);
  const related = meta.related.map(metaFor).filter(Boolean) as NonNullable<ReturnType<typeof metaFor>>[];
  const head = (
    <>
      <p className="page-meta" data-byline>
        By {meta.author.name}. Last reviewed <time dateTime={meta.lastReviewed}>{fmtDate(meta.lastReviewed)}</time>. Fact-checked by {meta.fact_checked_by} on <time dateTime={meta.fact_checked_on}>{fmtDate(meta.fact_checked_on)}</time>. See our <Link to="/editorial-policy/">editorial policy</Link>.
      </p>
      {meta.reviewer && (
        <p className="page-meta">Reviewed by {meta.reviewer.name} on <time dateTime={meta.reviewer.verified_on}>{fmtDate(meta.reviewer.verified_on)}</time>. <a href={meta.reviewer.fsca_url} rel="noopener noreferrer">FSCA register entry</a>.</p>
      )}
      {wills && <p className="page-meta" data-disclosure data-provider>{PROVIDER_SERVICE_LINE.replace("on this page", "SortMyCover books")} {PROVIDER_ROLE_LINE}</p>}
    </>
  );
  return (
    <>
      <PageFrame title={pageTitle(meta.titleTag ?? meta.title)} description={meta.description} path={path} ogType="article" crumbs={crumbs} jsonld={[articleLd(meta, path, scene?.src)]} ctaKind={wills ? "wills" : ownSection ? "cover" : "adviser"} ctaHeading={meta.cta} h1={meta.title} meta={head}>
        {scene ? <figure className="hub-photo article-photo"><img src={scene.src} alt={scene.alt} width={scene.w} height={scene.h} loading="eager" fetchPriority="high" /></figure> : <ArticleDiagram slug={meta.slug} />}
        <div className="answer-block" data-answer><span className="ab-bar" aria-hidden="true" /><span className="label">Short answer</span><p>{meta.answer}</p></div>
        <SectionNav items={sections} />
        {body.map((b, i) => {
          if (b.type === "h2") return <h2 key={i} id={sectionId(b.text)}>{b.text}</h2>;
          if (b.type === "p") return <p key={i}><Inline text={b.text} /></p>;
          const L = b.type === "ul" ? "ul" : "ol";
          return <L key={i}>{b.items.map((t, j) => <li key={j}><Inline text={t} /></li>)}</L>;
        })}
        {isHub1 && (<><h2>Guides in this topic</h2><ArticleList items={articlesForHub(1)} /></>)}
        <h2>Sources</h2>
        <ul>
          {meta.sources.map((s) => (
            <li key={s.url}><a href={s.url} rel="noopener noreferrer">{s.title}</a>, {s.publisher}. Page seen {fmtMonth(s.accessed)}.{s.used_for ? ` Used for: ${s.used_for}.` : ""}</li>
          ))}
        </ul>
        <h2>Related</h2>
        <ul>
          {!isHub1 && <li><Link to={hubPath(hub)}>More in {hub.title}</Link></li>}
          {related.map((r) => <li key={r.slug}><Link to={articlePath(r.slug)}>{r.title}</Link></li>)}
          {/* wills pages make no statement about how SortMyCover is paid (provider fee arrangement not settled) */}
          {!wills && <li><Link to="/how-we-make-money/">How SortMyCover makes money</Link></li>}
          <li><Link to="/about/">About SortMyCover</Link></li>
        </ul>
      </PageFrame>
    </>
  );
}
