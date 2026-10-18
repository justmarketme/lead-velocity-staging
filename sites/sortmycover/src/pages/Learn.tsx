import { Link } from "react-router-dom";
import PageFrame from "@/components/PageFrame";
import { ARTICLE_SCENES } from "@/content/imagery";
import { DIAGRAM_SLUGS } from "@/components/Visuals";
import { Reveal } from "@/components/Interactive";
import { articlesForHub, articlePath, hubPath, hubs, type Hub } from "@/content";

const CRUMB_ROOT = { name: "SortMyCover", path: "/" };

export function LearnHub() {
  return (
    <PageFrame title="Learn about cover and wills | SortMyCover" description="Short guides in plain words, with sources and dates: cover types, wills and estate, life events, the call, and a glossary. Information, not advice." path="/learn/" h1="Learn in plain words" accent="in plain words" lede="Short guides in plain words, with sources and dates. They are information, not advice." crumbs={[CRUMB_ROOT, { name: "Learn", path: "/learn/" }]}>
      <Reveal className="grid gap-3 mt-6">
        {hubs.map((h) => {
          // a topic card shows the photo of the first guide in that topic
          const sc = ARTICLE_SCENES[h.slug] ?? articlesForHub(h.n).map((x) => ARTICLE_SCENES[x.slug]).find(Boolean);
          return <Link key={h.slug} to={hubPath(h)} className={sc ? "card-link card-thumb" : "card-link"} data-reveal>{sc && <img src={sc.src} alt="" width={sc.w} height={sc.h} loading="lazy" />}<span className="card-text"><b>{h.title}</b><span>{h.intro}</span></span></Link>;
        })}
        <Link to="/learn/glossary/" className="card-link" data-reveal><b>Glossary</b><span>36 terms, defined objectively.</span></Link>
        <Link to="/learn/sources/" className="card-link" data-reveal><b>Our sources</b><span>Where the information in these guides comes from.</span></Link>
      </Reveal>
    </PageFrame>
  );
}

export function ArticleList({ items }: { items: { slug: string; title: string; description: string }[] }) {
  if (!items.length) return <p>More guides in this topic are on the way.</p>;
  return (
    <Reveal className="grid gap-3 mt-4">
      {items.map((a) => (
        <Link key={a.slug} to={articlePath(a.slug)} className={ARTICLE_SCENES[a.slug] || DIAGRAM_SLUGS.includes(a.slug) ? "card-link card-thumb" : "card-link"} data-reveal>{ARTICLE_SCENES[a.slug] ? <img src={ARTICLE_SCENES[a.slug].src} alt="" width={ARTICLE_SCENES[a.slug].w} height={ARTICLE_SCENES[a.slug].h} loading="lazy" /> : DIAGRAM_SLUGS.includes(a.slug) && <span className="card-tile" aria-hidden="true"><i /><i /><i /></span>}<span className="card-text"><b>{a.title}</b><span>{a.description}</span></span></Link>
      ))}
    </Reveal>
  );
}

/** Hub page for hubs 2 to 4 (hub 1 is rendered by ArticlePage with its introduction). */
export function HubPage({ hub }: { hub: Hub }) {
  const items = articlesForHub(hub.n);
  return (
    <PageFrame title={`${hub.title} | Learn | SortMyCover`} description={hub.description} path={hubPath(hub)} h1={hub.title} lede={hub.intro} crumbs={[CRUMB_ROOT, { name: "Learn", path: "/learn/" }, { name: hub.title, path: hubPath(hub) }]}>
      <ArticleList items={items} />
      {hub.n === 4 && <p className="mt-4"><Link to="/learn/glossary/">Open the glossary</Link></p>}
    </PageFrame>
  );
}
