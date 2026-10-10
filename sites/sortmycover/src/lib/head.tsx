/* Head management without a library. <Seo/> registers a page's head data during render; the pre-render script reads it and
   writes the tags into the HTML (so crawlers that do not run JS see title, canonical, Open Graph and JSON-LD). In the browser
   <Seo/> updates the same tags on client-side navigation. */
import { createContext, useContext, useEffect } from "react";
import { APEX, site } from "./site";

export interface HeadData {
  title: string;
  description: string;
  /** Absolute canonical URL. */
  canonical: string;
  /** "index,follow" (default) or e.g. "noindex,follow". */
  robots?: string;
  ogType?: "website" | "article";
  ogImage?: string;
  jsonld?: object[];
}

export const HeadCtx = createContext<{ collect?: (d: HeadData) => void }>({});

export function Seo(props: HeadData) {
  const ctx = useContext(HeadCtx);
  if (ctx.collect) ctx.collect(props); // server render only
  useEffect(() => { applyHead(props); }, [props.title, props.canonical, props.description, props.robots]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

const esc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** HTML for the <head> content that varies per page. Pure: unit tested. */
export function renderHead(h: HeadData): string {
  const robots = h.robots || "index,follow";
  const img = h.ogImage || `${APEX}/og-image.png`;
  const out = [
    `<title>${esc(h.title)}</title>`,
    `<meta name="description" content="${esc(h.description)}">`,
    `<meta name="robots" content="${esc(robots)}">`,
    `<link rel="canonical" href="${esc(h.canonical)}">`,
    `<meta property="og:type" content="${h.ogType || "website"}">`,
    `<meta property="og:site_name" content="SortMyCover">`,
    `<meta property="og:locale" content="en_ZA">`,
    `<meta property="og:title" content="${esc(h.title)}">`,
    `<meta property="og:description" content="${esc(h.description)}">`,
    `<meta property="og:url" content="${esc(h.canonical)}">`,
    `<meta property="og:image" content="${esc(img)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
  ];
  if (site.pixel_id) out.push(`<meta name="smc-pixel-id" content="${esc(site.pixel_id)}">`);
  if (site.domain_verification) out.push(`<meta name="facebook-domain-verification" content="${esc(site.domain_verification)}">`);
  for (const ld of h.jsonld || []) out.push(`<script type="application/ld+json" data-ld>${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>`);
  return out.join("\n");
}

function setMeta(sel: string, attr: string, key: string, val: string) {
  let el = document.head.querySelector<HTMLMetaElement>(sel);
  if (!el) { el = document.createElement("meta"); el.setAttribute(attr, key); document.head.appendChild(el); }
  el.setAttribute("content", val);
}
function applyHead(h: HeadData) {
  if (typeof document === "undefined") return;
  document.title = h.title;
  setMeta('meta[name="description"]', "name", "description", h.description);
  setMeta('meta[name="robots"]', "name", "robots", h.robots || "index,follow");
  setMeta('meta[property="og:title"]', "property", "og:title", h.title);
  setMeta('meta[property="og:description"]', "property", "og:description", h.description);
  setMeta('meta[property="og:url"]', "property", "og:url", h.canonical);
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) { link = document.createElement("link"); link.rel = "canonical"; document.head.appendChild(link); }
  link.href = h.canonical;
  document.head.querySelectorAll("script[data-ld]").forEach((n) => n.remove());
  for (const ld of h.jsonld || []) {
    const s = document.createElement("script");
    s.type = "application/ld+json"; s.setAttribute("data-ld", ""); s.textContent = JSON.stringify(ld);
    document.head.appendChild(s);
  }
}

/** "<title> | SortMyCover", at most 60 characters. The title is shortened at a word boundary if needed; the brand is always last. */
export function pageTitle(t: string): string {
  const suffix = " | SortMyCover";
  if (t.length + suffix.length <= 60) return t + suffix;
  const room = 60 - suffix.length - 1;
  return t.slice(0, room).replace(/\s+\S*$/, "").replace(/[,:;?\s]+$/, "") + "…" + suffix;
}
