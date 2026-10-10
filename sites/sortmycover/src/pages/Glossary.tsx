import { Link } from "react-router-dom";
import PageFrame from "@/components/PageFrame";
import { glossary } from "@/content/glossary";
import { articlePath } from "@/content";

const id = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export default function Glossary() {
  return (
    <PageFrame title="Glossary of cover terms | SortMyCover" description="36 terms used on SortMyCover, defined in one to three plain sentences. No brand names, no advice." path="/learn/glossary/" h1="Glossary" lede="36 terms, defined objectively. Last reviewed 10 October 2026." crumbs={[{ name: "SortMyCover", path: "/" }, { name: "Learn", path: "/learn/" }, { name: "Glossary", path: "/learn/glossary/" }]}>
      <dl>
        {glossary.map((g) => (
          <div key={g.term} className="mb-5">
            <dt id={id(g.term)} className="font-extrabold text-[18px]">{g.term}</dt>
            <dd className="m-0">{g.definition}{g.see && <> <Link to={articlePath(g.see)}>Read more</Link>.</>}</dd>
          </div>
        ))}
      </dl>
    </PageFrame>
  );
}
