import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Seo } from "@/lib/head";
import { APEX, BOOK_LABEL, COST_LINE } from "@/lib/site";
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

export function Cta({ heading = "Talk to an adviser" }: { heading?: string }) {
  return (
    <aside className="cta-quiet" aria-label="Book a call">
      <h2>{heading}</h2>
      <p>A 30-minute call with an authorised adviser, booked for a time that suits. {COST_LINE}</p>
      <Link to="/book/" className="btn">{BOOK_LABEL}</Link>
    </aside>
  );
}

export default function PageFrame({ title, description, path, h1, lede, robots, crumbs, jsonld = [], ogType, cta = true, children }: Props) {
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
          {cta && <Cta />}
        </div>
      </div>
    </>
  );
}

export function DraftNote({ children }: { children?: ReactNode }) {
  return <p className="draftnote"><strong>DRAFT for practitioner review.</strong> {children ?? "This text is not approved yet."}</p>;
}
