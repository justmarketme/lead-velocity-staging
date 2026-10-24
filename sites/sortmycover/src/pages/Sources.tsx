/* /learn/sources/: one place that lists where the guides' information comes from (Jono, 18 Oct 2026). Built from the sources the
   guides actually cite, so it never drifts from them. */
import PageFrame from "@/components/PageFrame";
import { Link } from "react-router-dom";
import { articleMetas, WILLS_HUB } from "@/content";
import type { Source } from "@/content/types";

const month = (ym: string) => new Date(ym + "-01T00:00:00Z").toLocaleDateString("en-ZA", { month: "long", year: "numeric", timeZone: "UTC" });
function unique(list: Source[]) {
  const m = new Map<string, Source>();
  for (const s of list) if (!m.has(s.url)) m.set(s.url, s);
  return [...m.values()].sort((a, b) => a.publisher.localeCompare(b.publisher) || a.title.localeCompare(b.title));
}
const estate = (slug: string, hub: number) => hub === WILLS_HUB || slug === "estate-duty-south-africa";
const WILLS = unique(articleMetas.filter((m) => estate(m.slug, m.hub)).flatMap((m) => m.sources));
const COVER = unique(articleMetas.filter((m) => !estate(m.slug, m.hub)).flatMap((m) => m.sources)).filter((s) => !WILLS.some((w) => w.url === s.url) && s.publisher !== "SortMyCover");

function List({ items }: { items: Source[] }) {
  return <ul>{items.map((s) => <li key={s.url}><a href={s.url} rel="noopener noreferrer">{s.title}</a>, {s.publisher}. Page seen {month(s.accessed)}.</li>)}</ul>;
}

export default function Sources() {
  return (
    <PageFrame title="Where our information comes from | SortMyCover" description="The public sources behind the SortMyCover guides: the Master of the High Court, SARS, the Acts, the FSCA and other public bodies, in one list." path="/learn/sources/" h1="Where our information comes from" accent="comes from" lede="The guides on this site are built on public sources. This page lists them in one place." crumbs={[{ name: "SortMyCover", path: "/" }, { name: "Learn", path: "/learn/" }, { name: "Our sources", path: "/learn/sources/" }]}>
      <p>Every guide also lists its own sources, with the month each page was seen. Figures are only published when a source on file supports them. <Link to="/editorial-policy/">Our editorial policy</Link> explains how guides are written and checked.</p>
      <h2>Wills and estate</h2>
      <p>The wills and estate guides rest on South African law and government guidance: the Master of the High Court, SARS, and the Acts themselves. They do not use a will-drafting company as a source.</p>
      <List items={WILLS} />
      <h2>Cover, advice and the call</h2>
      <p>The cover guides use regulators, government and industry bodies, and the published terms of the organisations named in each guide.</p>
      <List items={COVER} />
    </PageFrame>
  );
}
