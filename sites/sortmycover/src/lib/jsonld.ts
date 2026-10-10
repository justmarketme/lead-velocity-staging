/* JSON-LD builders. Only Organization, WebSite, Article and BreadcrumbList are used (spec B.6, DEC-9):
   no FAQPage, HowTo, Product, Offer or AggregateRating. */
import { APEX, company } from "./site";
import type { ArticleMeta } from "@/content/types";

const ORG_ID = `${APEX}/#org`;

export function organization() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORG_ID,
    name: "SortMyCover",
    legalName: company.legal_name,
    url: APEX + "/",
    logo: { "@type": "ImageObject", url: `${APEX}/icon-512.png` },
    email: company.email,
    telephone: company.phone_tel,
    sameAs: [] as string[], // real profiles only, once they exist (spec G.3); none are invented
    identifier: company.registration,
    address: {
      "@type": "PostalAddress",
      streetAddress: "210 Amarand Avenue, Pegasus Building 1",
      addressLocality: "Menlyn Maine, Pretoria",
      postalCode: "0184",
      addressCountry: "ZA",
    },
  };
}

export function website() {
  return { "@context": "https://schema.org", "@type": "WebSite", "@id": `${APEX}/#website`, url: APEX + "/", name: "SortMyCover", inLanguage: "en-ZA", publisher: { "@id": ORG_ID } };
}

export function breadcrumbs(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: APEX + it.path })),
  };
}

export function article(m: ArticleMeta, path: string) {
  const url = APEX + path;
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": url + "#article",
    headline: m.title,
    description: m.description,
    inLanguage: "en-ZA",
    url,
    mainEntityOfPage: url,
    datePublished: m.datePublished,
    dateModified: m.lastReviewed,
    author: m.author.kind === "person" ? { "@type": "Person", name: m.author.name } : { "@type": "Organization", name: m.author.name, url: `${APEX}/about/` },
    publisher: { "@id": ORG_ID },
    image: `${APEX}/og-image.png`,
  };
}
