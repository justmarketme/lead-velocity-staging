import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Seo } from "@/lib/head";
import { APEX, BOOK_COVER, BOOK_LABEL, BOOK_WILLS, COST_LINE, PROVIDER_COST_LINE, WILLS_BOOK_LABEL, provider } from "@/lib/site";
import { breadcrumbs } from "@/lib/jsonld";

export interface Crumb { name: string; path: string }

interface Props {
  title: string;
  description: string;
  path: string;
  /** Visible H1. Defaults to nothing: pass `h1` for standard pages. */
  h1?: string;
  lede?: string;
  robots?: string;
  crumbs?: Crumb[];
  jsonld?: object[];
  ogType?: "website" | "article";
  /** Show the quiet booking call to action under the content. */
  cta?: boolean;
  /** Which call the quiet CTA books: an adviser about cover (default) or the will provider's consultant. */
  ctaKind?: CtaKind;
  /** Heading of the quiet CTA (defaults per kind). */
  ctaHeading?: string;
  children?: ReactNode;
}

export function Crumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="breadcrumb">
      {items.map((c, i) => (
        <span key={c.path}>{i > 0 && " › "}{i < items.length - 1 ? <Link to={c.path}>{c.name}</Link> : <span aria-current="page">{c.name}</span>}</span>
      ))}
    </nav>
  );
}

export type CtaKind = "adviser" | "cover" | "wills";

/** Quiet call to action. "cover" and "wills" link into the quiz with the product already chosen (/book/?for=...). The wills
    version names the will provider and makes no fee statement (the provider's fee arrangement with SortMyCover is not settled). */
export function Cta({ heading, kind = "adviser" }: { heading?: string; kind?: CtaKind }) {
  if (kind === "wills") {
    return (
      <aside className="cta-quiet" aria-label="Book a will call">
        <h2>{heading ?? "Talk to a " + provider.name + " consultant"}</h2>
        <p data-disclosure>A call about your will, booked for a time that suits. {COST_LINE} {PROVIDER_COST_LINE}</p>
        <Link to={BOOK_WILLS} className="btn">{WILLS_BOOK_LABEL}</Link>
      </aside>
    );
  }
  return (
    <aside className="cta-quiet" aria-label="Book a call">
      <h2>{heading ?? "Talk to an adviser"}</h2>
      <p>A 30-minute call with an authorised adviser, booked for a time that suits. {COST_LINE}</p>
      <Link to={kind === "cover" ? BOOK_COVER : "/book/"} className="btn">{BOOK_LABEL}</Link>
    </aside>
  );
}

export default function PageFrame({ title, description, path, h1, lede, robots, crumbs, jsonld = [], ogType, cta = true, ctaKind, ctaHeading, children }: Props) {
  const ld = [...jsonld];
  if (crumbs && crumbs.length > 1) ld.push(breadcrumbs(crumbs));
  return (
    <>
      <Seo title={title} description={description} canonical={APEX + path} robots={robots} ogType={ogType} jsonld={ld} />
      <div className="wrap-narrow py-8 md:py-12">
        <div className="prose-sm">
          {crumbs && crumbs.length > 1 && <Crumbs items={crumbs} />}
          {h1 && <h1>{h1}</h1>}
          {lede && <p className="lede">{lede}</p>}
          {children}
          {cta && <Cta kind={ctaKind} heading={ctaHeading} />}
        </div>
      </div>
    </>
  );
}

export function DraftNote({ children }: { children?: ReactNode }) {
  return <p className="draftnote"><strong>DRAFT for practitioner review.</strong> {children ?? "This text is not approved yet."}</p>;
}
