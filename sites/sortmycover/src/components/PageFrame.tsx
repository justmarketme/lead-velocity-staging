import type { ReactNode } from "react";
import { PAGE_SCENES } from "@/content/imagery";
import { Link, useLocation } from "react-router-dom";
import { CalendarCta, WhatsAppCta } from "./ChatWidget";
import { WA_EXPECT, contextFor } from "@/lib/whatsapp";
import { Seo } from "@/lib/head";
import { APEX, COST_LINE, PROVIDER_COST_LINE, provider } from "@/lib/site";
import { breadcrumbs } from "@/lib/jsonld";

export interface Crumb { name: string; path: string }

interface Props {
  title: string;
  description: string;
  path: string;
  /** Visible H1, set in the shared page head. */
  h1?: string;
  /** Trailing words of the H1 set in the serif accent line, as on the home page. Defaults to the words after a colon. */
  accent?: string;
  lede?: ReactNode;
  /** Extra lines under the lede in the page head (article byline, reviewer, provider line). */
  meta?: ReactNode;
  robots?: string;
  crumbs?: Crumb[];
  jsonld?: object[];
  ogType?: "website" | "article";
  /** Show the booking call to action under the content. */
  cta?: boolean;
  /** Which call the CTA books: an adviser about cover (default) or the will provider's consultant. */
  ctaKind?: CtaKind;
  /** Heading of the CTA (defaults per kind). */
  ctaHeading?: string;
  children?: ReactNode;
}

/** Breadcrumb, set as the eyebrow line of the page head. The current page is kept for screen readers only (the H1 follows). */
export function Crumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="breadcrumb">
      <span className="crumb-rule" aria-hidden="true" />
      {items.map((c, i) => {
        const current = i === items.length - 1;
        return (
          <span key={c.path} className={current ? "sr" : undefined}>
            {i > 0 && <span aria-hidden="true" className="crumb-sep">›</span>}
            {current ? <span aria-current="page">{c.name}</span> : <Link to={c.path}>{c.name}</Link>}
          </span>
        );
      })}
    </nav>
  );
}

/** H1 text with its accent words in the serif line. The text content is unchanged (screen readers, tests, search). */
export function Display({ text, accent }: { text: string; accent?: string }) {
  const colon = text.indexOf(": ");
  const a = accent ?? (colon > 0 ? text.slice(colon + 2) : undefined);
  if (!a || a === text || !text.endsWith(a)) return <>{text}</>;
  return <>{text.slice(0, text.length - a.length).trimEnd()} <em>{a}</em></>;
}

/** The page head every inner page shares with the home page: eyebrow breadcrumb, display H1, lede, meta, warm top glow. */
export function PageHead({ crumbs, h1, accent, lede, meta }: { crumbs?: Crumb[]; h1: string; accent?: string; lede?: ReactNode; meta?: ReactNode }) {
  return (
    <div className="page-head">
      <div className="page-glow" aria-hidden="true" />
      <div className="wrap-narrow">
        {crumbs && crumbs.length > 1 && <Crumbs items={crumbs} />}
        <h1 className="page-h1"><Display text={h1} accent={accent} /></h1>
        {lede && <p className="page-lede">{lede}</p>}
        {meta}
      </div>
    </div>
  );
}

export type CtaKind = "adviser" | "cover" | "wills";

/** Booking call to action, set as the dark card that closes the home page. Booking is on WhatsApp only (Lindi books the call).
    The wills version names the will provider and makes no fee statement (the provider's fee arrangement is not settled). */
export function Cta({ heading, kind = "adviser" }: { heading?: string; kind?: CtaKind }) {
  const ctx = contextFor(useLocation().pathname);
  if (kind === "wills") {
    return (
      <aside className="cta-quiet" aria-label="Book a will call">
        <h2>{heading ?? "Talk to a will consultant"}</h2>
        <p data-disclosure>Lindi books a call about your will on WhatsApp, at a time that suits. {COST_LINE}</p>
        <div className="cta-actions">
          <WhatsAppCta ctx={{ ...ctx, wills: true }} />
          <CalendarCta ctx={{ ...ctx, wills: true }} className="btn btn-ghost">Pick a time</CalendarCta>
        </div>
        <p className="cta-expect">{WA_EXPECT.replace("your adviser", "your consultant")}</p>
      </aside>
    );
  }
  return (
    <aside className="cta-quiet" aria-label="Book a call">
      <h2>{heading ?? "Talk to an adviser"}</h2>
      <p>Lindi books a 30-minute call with an authorised adviser on WhatsApp, at a time that suits. {COST_LINE}</p>
      <div className="cta-actions">
        <WhatsAppCta ctx={ctx} />
        <CalendarCta ctx={ctx} className="btn btn-ghost">Pick a time</CalendarCta>
      </div>
      <p className="cta-expect">{WA_EXPECT}</p>
    </aside>
  );
}

export default function PageFrame({ title, description, path, h1, accent, lede, meta, robots, crumbs, jsonld = [], ogType, cta = true, ctaKind, ctaHeading, children }: Props) {
  const ld = [...jsonld];
  if (crumbs && crumbs.length > 1) ld.push(breadcrumbs(crumbs));
  return (
    <>
      <Seo title={title} description={description} canonical={APEX + path} robots={robots} ogType={ogType} jsonld={ld} />
      {h1 ? <PageHead crumbs={crumbs} h1={h1} accent={accent} lede={lede} meta={meta} /> : crumbs && crumbs.length > 1 && <div className="wrap-narrow pt-8"><Crumbs items={crumbs} /></div>}
      <div className="wrap-narrow page-body">
        <div className="prose-sm">
          {PAGE_SCENES[path] && <figure className="hub-photo page-photo"><img src={PAGE_SCENES[path].src} alt={PAGE_SCENES[path].alt} width={PAGE_SCENES[path].w} height={PAGE_SCENES[path].h} loading="eager" fetchPriority="high" /></figure>}
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
