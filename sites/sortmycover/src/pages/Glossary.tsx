import { useState } from "react";
import { Link } from "react-router-dom";
import PageFrame from "@/components/PageFrame";
import { glossary } from "@/content/glossary";
import { articlePath } from "@/content";

const id = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export default function Glossary() {
  const [q, setQ] = useState("");
  const f = q.trim().toLowerCase();
  return (
    <PageFrame title="Glossary of cover terms | SortMyCover" description="36 terms used on SortMyCover, defined in one to three plain sentences. No brand names, no advice." path="/learn/glossary/" h1="Glossary" lede="36 terms, defined objectively. Last reviewed 10 October 2026." crumbs={[{ name: "SortMyCover", path: "/" }, { name: "Learn", path: "/learn/" }, { name: "Glossary", path: "/learn/glossary/" }]}>
      <p><label className="font-extrabold" htmlFor="gl-filter">Filter the terms</label><br /><input id="gl-filter" className="filter-input" type="search" placeholder="e.g. nomination" value={q} onChange={(e) => setQ(e.target.value)} /></p>
      <p className="sr" role="status" aria-live="polite">{f ? glossary.filter((g) => (g.term + " " + g.definition).toLowerCase().includes(f)).length + " terms shown" : ""}</p>
      <dl>
        {glossary.map((g) => (
          <div key={g.term} className="mb-5" hidden={!!f && !(g.term + " " + g.definition).toLowerCase().includes(f)}>
            <dt id={id(g.term)} className="font-extrabold text-[18px]">{g.term}</dt>
            <dd className="m-0">{g.definition}{g.see && <> <Link to={articlePath(g.see)}>Read more</Link>.</>}</dd>
          </div>
        ))}
      </dl>
    </PageFrame>
  );
}
