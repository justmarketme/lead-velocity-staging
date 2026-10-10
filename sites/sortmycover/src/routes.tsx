/* The route table: the single source for the router, the pre-renderer, the sitemap and the tests.
   Each page is code-split (lazy). `lazyRoute` renders synchronously once its chunk has loaded, so the browser can preload the
   current route's chunk BEFORE hydrating (no Suspense fallback, no hydration mismatch). */
import { type ComponentType } from "react";
import { articleLoaders, articleMetas, articlePath, hubs, HUB1_INTRO, hubPath } from "@/content";
import NotFound from "./pages/NotFound";
import { ANGLES, campaignPath, type Angle } from "@/campaigns";

export type LazyPage = ((props: any) => JSX.Element) & { preload: () => Promise<void> };

export function lazyRoute(load: () => Promise<{ default: ComponentType<any> }>): LazyPage {
  let C: ComponentType<any> | undefined;
  let p: Promise<void> | undefined;
  const preload = () => (p ??= load().then((m) => { C = m.default; }));
  const L = ((props: any) => {
    if (!C) throw preload();
    return <C {...props} />;
  }) as unknown as LazyPage;
  L.preload = preload;
  return L;
}

export interface RouteDef {
  /** Public path on the apex ("/about/"), or "/_c/<slug>/" for campaign output files. */
  path: string;
  Component: LazyPage;
  kind: "apex" | "campaign";
  indexable: boolean;
  lastmod: string;
  campaign?: { slug: string; view: "landing" | "thanks" };
  /** Output file relative to dist (defaults to <path>/index.html). */
  file?: string;
}

const BUILT = "2026-10-10"; // last content change for static pages; article lastmod comes from each article's lastReviewed
const page = (path: string, load: () => Promise<{ default: ComponentType<any> }>, extra: Partial<RouteDef> = {}): RouteDef => ({
  path, Component: lazyRoute(load), kind: "apex", indexable: true, lastmod: BUILT, ...extra,
});

const articleRoute = (slug: string): RouteDef => {
  const meta = articleMetas.find((a) => a.slug === slug)!;
  return page(articlePath(slug), () => Promise.all([articleLoaders[slug](), import("./pages/ArticlePage")]).then(([a, m]) => ({ default: () => <m.default article={a} /> })), { lastmod: meta.lastReviewed });
};

const campaignRoutes = (a: Angle): RouteDef[] => [
  page(campaignPath(a.slug, "landing"), () => import("./pages/Campaign").then((m) => ({ default: () => <m.CampaignLanding angle={a} /> })), { kind: "campaign", indexable: false, campaign: { slug: a.slug, view: "landing" } }),
  page(campaignPath(a.slug, "thanks"), () => import("./pages/Campaign").then((m) => ({ default: () => <m.CampaignThanks angle={a} /> })), { kind: "campaign", indexable: false, campaign: { slug: a.slug, view: "thanks" } }),
];

export const apexRoutes: RouteDef[] = [
  page("/", () => import("./pages/Home")),
  page("/book/", () => import("./pages/Book")),
  page("/book/thanks/", () => import("./pages/BookThanks"), { indexable: false }),
  page("/how-it-works/", () => import("./pages/HowItWorks")),
  page("/how-we-make-money/", () => import("./pages/HowWeMakeMoney")),
  page("/advisers/", () => import("./pages/Advisers")),
  page("/about/", () => import("./pages/About")),
  page("/contact/", () => import("./pages/Contact")),
  page("/complaints/", () => import("./pages/Complaints")),
  page("/faq/", () => import("./pages/Faq")),
  page("/learn/", () => import("./pages/Learn").then((m) => ({ default: m.LearnHub }))),
  ...hubs.filter((h) => h.n !== 1).map((h) => page(hubPath(h), () => import("./pages/Learn").then((m) => ({ default: () => <m.HubPage hub={h} /> })))),
  articleRoute(HUB1_INTRO),
  page("/learn/glossary/", () => import("./pages/Glossary")),
  ...articleMetas.filter((a) => a.slug !== HUB1_INTRO).map((a) => articleRoute(a.slug)),
  page("/editorial-policy/", () => import("./pages/EditorialPolicy")),
  page("/accessibility/", () => import("./pages/Accessibility")),
  // DRAFT legal pages: noindex until the compliance practitioner signs them off and the DRAFT marks are removed.
  page("/privacy/", () => import("./pages/Legal").then((m) => ({ default: m.Privacy })), { indexable: false }),
  page("/terms/", () => import("./pages/Legal").then((m) => ({ default: m.Terms })), { indexable: false }),
  page("/paia/", () => import("./pages/Legal").then((m) => ({ default: m.Paia })), { indexable: false }),
];

export const notFoundRoute: RouteDef = page("/404.html", () => Promise.resolve({ default: NotFound }), { indexable: false, file: "404.html" });

export const campaignRouteDefs: RouteDef[] = ANGLES.filter((a) => a.host).flatMap(campaignRoutes);

export const allRoutes: RouteDef[] = [...apexRoutes, notFoundRoute, ...campaignRouteDefs];
export const fileFor = (r: RouteDef) => r.file ?? (r.path === "/" ? "index.html" : r.path.replace(/^\//, "") + "index.html");
