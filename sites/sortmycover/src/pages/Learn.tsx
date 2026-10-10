import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { revealChildren } from "@/lib/motion";
import PageFrame from "@/components/PageFrame";
import { articlesForHub, articlePath, hubPath, hubs, type Hub } from "@/content";

const CRUMB_ROOT = { name: "SortMyCover", path: "/" };

export function LearnHub() {
  return (
    <PageFrame title="Learn about life cover | SortMyCover" description="Short guides in plain words, with sources and dates. Four topics and a glossary. Information, not advice." path="/learn/" h1="Learn" lede="Short guides in plain words, with sources and dates. They are information, not advice." crumbs={[CRUMB_ROOT, { name: "Learn", path: "/learn/" }]}>
      <Reveal className="grid gap-3 mt-6">
        {hubs.map((h) => (
          <Link key={h.slug} to={hubPath(h)} className="card-link" data-reveal><b>{h.title}</b><span>{h.intro}</span></Link>
        ))}
        <Link to="/learn/glossary/" className="card-link" data-reveal><b>Glossary</b><span>36 terms, defined objectively.</span></Link>
      </Reveal>
    </PageFrame>
  );
}

function Reveal({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => (ref.current ? revealChildren(ref.current, "[data-reveal]") : undefined), []);
  return <div ref={ref} className={className}>{children}</div>;
}

export function ArticleList({ items }: { items: { slug: string; title: string; description: string }[] }) {
  if (!items.length) return <p>More guides in this topic are on the way.</p>;
  return (
    <Reveal className="grid gap-3 mt-4">
      {items.map((a) => (
        <Link key={a.slug} to={articlePath(a.slug)} className="card-link" data-reveal><b>{a.title}</b><span>{a.description}</span></Link>
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
