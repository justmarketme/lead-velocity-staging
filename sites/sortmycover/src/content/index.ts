/* Content registry. Each article is two small files with the same name:
     content/meta/<slug>.ts      exports `meta`  (title, answer block, dates, sources...)  -> always in the bundle (hubs, sitemap)
     content/articles/<slug>.ts  exports `body`  (the sections)                            -> its own chunk, loaded by the article route
   Adding an article = adding both files (see README). */
import type { Article, ArticleMeta, Block } from "./types";

const metaModules = import.meta.glob<ArticleMeta>("./meta/*.ts", { eager: true, import: "meta" });
const bodyLoaders = import.meta.glob<Block[]>("./articles/*.ts", { import: "body" });

const slugOf = (p: string) => p.replace(/^\.\/(meta|articles)\//, "").replace(/\.ts$/, "");

export const articleMetas: ArticleMeta[] = Object.entries(metaModules)
  .map(([p, m]) => ({ ...m, slug: slugOf(p) }))
  .sort((a, b) => a.hub - b.hub || a.title.localeCompare(b.title));

export const articleLoaders: Record<string, () => Promise<Article>> = Object.fromEntries(
  Object.entries(bodyLoaders).map(([p, load]) => {
    const slug = slugOf(p);
    return [slug, () => load().then((body) => ({ meta: articleMetas.find((a) => a.slug === slug)!, body }))];
  }),
);

/** The Hub 1 introduction article lives at the hub URL, not at /learn/life-events/life-events/. */
export const HUB1_INTRO = "life-events";

export interface Hub { n: 1 | 2 | 3 | 4 | 5 | 6; slug: string; title: string; description: string; intro: string; /** Own section outside /learn/. */ path?: string }
export const hubs: Hub[] = [
  { n: 1, slug: "life-events", title: "Life events", description: "Plain-words guides to what usually changes for cover when life changes: a new home loan, a new baby, a new job. Information, not advice.", intro: "Guides to what usually changes, in process terms, when life changes." },
  { n: 2, slug: "reading-your-cover", title: "Reading your cover", description: "How to read the cover line on a payslip, what a cover gap is, and where to find your documents. Information, not advice.", intro: "How to read the documents you already have." },
  { n: 3, slug: "the-call-and-trust", title: "The call and trust", description: "What happens on the call, how to check an adviser, how SortMyCover makes money, and how to complain.", intro: "What to expect, how to check us, and what to do if something goes wrong." },
  { n: 4, slug: "myths-and-definitions", title: "Myths and definitions", description: "Plain answers to common worries about cover and advice, and a glossary of the terms used on this site.", intro: "Common worries and the words people use." },
  { n: 5, slug: "wills", path: "/wills/", title: "Wills and estate", description: "What a will does and does not do, guardians and children's trusts, estate costs, keeping a will safe and estate administration, in plain words.", intro: "What a will does, what it does not do, and what happens to an estate." },
  { n: 6, slug: "cover", path: "/cover/", title: "Cover types", description: "Life cover, disability cover, severe illness cover and income protection in plain words: what each is, what it is not, and questions to ask an adviser.", intro: "Life, disability, severe illness and income cover: what each one is and is not." },
];

/** The two sections with their own top-level URL (not under /learn/). */
export const WILLS_HUB = 5;
export const COVER_HUB = 6;
export const hubPath = (h: Hub) => h.path ?? `/learn/${h.slug}/`;
export const hubFor = (n: number) => hubs.find((h) => h.n === n)!;
export const articlePath = (slug: string) => {
  if (slug === HUB1_INTRO) return "/learn/life-events/";
  const hub = articleMetas.find((a) => a.slug === slug)?.hub;
  return hub === WILLS_HUB ? `/wills/${slug}/` : hub === COVER_HUB ? `/cover/${slug}/` : `/learn/${slug}/`;
};
/** Articles listed under a hub (the Hub 1 intro is the hub page itself). */
export const articlesForHub = (n: number) => articleMetas.filter((a) => a.hub === n && a.slug !== HUB1_INTRO);
export const metaFor = (slug: string) => articleMetas.find((a) => a.slug === slug);
