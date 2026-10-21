/* Site footers (FOOTER-DISCLOSURE-SPEC-SMC-2026-10-21 section 4). The company's full details (name, registration, directors,
   addresses) live on /legal/, which every footer links to (ECT Act s43); each footer carries one disclosure line, FOOTER-v3.
   The identity sentence ("It is a trading name of ...") is off by Jono's decision (21 Oct 2026): config/site.json
   company.footer_identity turns it on everywhere. */
import { useEffect, useRef, type MouseEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { Wordmark } from "./Brand";
import { WhatsAppCta } from "./ChatWidget";
import { APEX, FEE_LINE, FOOTER_LINE, company } from "@/lib/site";
import { contextFor } from "@/lib/whatsapp";
import { NO_MOTION, footerGroupToggle } from "@/lib/motion";

const phoneHref = "tel:" + company.phone_tel;

/** Phone width: the three link groups fold into tap-to-open sections. 640px and up they are always open. */
export const FOOTER_NARROW = "(max-width: 639px)";

type Group = { id: string; title: string; links: [string, string][] };
const GROUPS: Group[] = [
  { id: "f-cover", title: "Cover & wills", links: [["Cover types", "/cover/"], ["Life cover", "/cover/life-cover/"], ["Disability cover", "/cover/disability-cover/"], ["Severe illness cover", "/cover/severe-illness-cover/"], ["Income protection", "/cover/income-protection/"], ["Wills & estate", "/wills/"]] },
  { id: "f-guides", title: "Guides", links: [["All guides", "/learn/"], ["Questions to ask an adviser", "/learn/questions-to-ask-a-financial-adviser/"], ["Life events", "/learn/life-events/"], ["Glossary", "/learn/glossary/"], ["FAQ", "/faq/"], ["Our sources", "/learn/sources/"]] },
  { id: "f-about", title: "About us", links: [["How it works", "/how-it-works/"], ["How we make money", "/how-we-make-money/"], ["Advisers", "/advisers/"], ["About", "/about/"], ["Contact", "/contact/"], ["Editorial policy", "/editorial-policy/"]] },
];

/** Legal row, the same on both footers (the campaign footer links to the apex). The opt-out is a plain <a>: the browser loads the
    pre-rendered /privacy/ page and scrolls to #opt-out itself (an in-app Link landed at a random position). */
const LEGAL: [string, string][] = [["Legal & disclosures", "/legal/"], ["Privacy", "/privacy/"], ["Terms", "/terms/"], ["PAIA manual", "/paia/"], ["Complaints", "/complaints/"], ["Accessibility", "/accessibility/"]];
const OPT_OUT: [string, string] = ["Opt out of ad measurement", "/privacy/#opt-out"];

const Chevron = () => (
  <svg className="f-chev" aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 16 16"><path d="M3.5 6l4.5 4.5L12.5 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

/** Open/closed behaviour for the groups (pre-rendered open, so no-JS visitors and crawlers see every link). Under 640px they close
    after mount, but only when the footer starts below the fold (no shift in view on short pages). From 640px they are held open:
    summaries leave the tab order and a capture listener stops any click (mouse, keyboard, screen reader) from collapsing them. */
export function useFooterGroups(ref: React.RefObject<HTMLElement>) {
  useEffect(() => {
    const footer = ref.current;
    if (!footer || !window.matchMedia) return;
    const mq = window.matchMedia(FOOTER_NARROW);
    const groups = () => Array.from(footer.querySelectorAll<HTMLDetailsElement>("details.f-group"));
    const hold = (e: Event) => { if ((e.target as Element | null)?.closest?.("details.f-group > summary")) e.preventDefault(); };
    let held = false;
    const apply = () => {
      if (mq.matches) {
        if (held) { footer.removeEventListener("click", hold, true); held = false; }
        const below = footer.getBoundingClientRect().top > window.innerHeight;
        for (const d of groups()) {
          if (below) d.open = false;
          d.querySelector("summary")!.tabIndex = 0;
        }
      } else {
        for (const d of groups()) { d.open = true; d.querySelector("summary")!.tabIndex = -1; }
        if (!held) { footer.addEventListener("click", hold, true); held = true; }
      }
    };
    apply();
    const onChange = () => apply();
    mq.addEventListener ? mq.addEventListener("change", onChange) : mq.addListener(onChange);
    return () => {
      mq.removeEventListener ? mq.removeEventListener("change", onChange) : mq.removeListener(onChange);
      if (held) footer.removeEventListener("click", hold, true);
    };
  }, [ref]);
}

export function Footer() {
  const { pathname } = useLocation();
  const ref = useRef<HTMLElement>(null);
  useFooterGroups(ref);
  /** Phone width with motion allowed: the group glides open or shut. Otherwise the native toggle runs (or is held open). */
  const toggle = (e: MouseEvent<HTMLElement>) => {
    if (!window.matchMedia || !window.matchMedia(FOOTER_NARROW).matches || NO_MOTION.test(pathname)) return;
    const d = e.currentTarget.parentElement as HTMLDetailsElement;
    const list = d.querySelector<HTMLElement>(".f-links");
    const chev = e.currentTarget.querySelector(".f-chev");
    if (list && chev) footerGroupToggle(d, list, chev, e);
  };
  return (
    <footer ref={ref} className="site-footer" data-footer>
      <span className="f-rule" aria-hidden="true" />
      <div className="wrap">
        <div className="f-top">
          <div className="f-brand" data-f-settle>
            <Wordmark />
            <p className="f-promise">Book a call with an authorised adviser or a will consultant, on WhatsApp.</p>
            <WhatsAppCta ctx={contextFor(pathname)} className="btn f-cta">Chat on WhatsApp</WhatsAppCta>
            <p className="f-contact"><a href={phoneHref}>{company.phone_display}</a><a href={"mailto:" + company.email}>{company.email}</a></p>
          </div>
          <nav className="f-nav" aria-label="Footer">
            {GROUPS.map((g) => (
              <details key={g.id} className="f-group" open data-f-settle>
                <summary onClick={toggle}><h2 id={g.id}>{g.title}</h2><Chevron /></summary>
                <ul className="f-links" aria-labelledby={g.id}>{g.links.map(([t, p]) => <li key={p}><Link to={p}>{t}</Link></li>)}</ul>
              </details>
            ))}
          </nav>
        </div>
        <div className="f-base">
          <p className="f-line" data-disclosure>{FOOTER_LINE}</p>
          <nav aria-label="Legal">
            <ul className="f-legal">
              {LEGAL.map(([t, p]) => <li key={p}><Link to={p}>{t}</Link></li>)}
              <li className="f-optout"><a href={OPT_OUT[1]}>{OPT_OUT[0]}</a></li>
            </ul>
          </nav>
        </div>
      </div>
    </footer>
  );
}

/** Campaign-host footer (_c landings, thanks pages, /start/): no groups, no CTA, no motion. Absolute links to the apex (each page
    lives on exactly one host). feeLine=false on the wills and estate pages: the will provider's fee arrangement with SortMyCover is
    not settled, so those pages make no fee statement. Ad landings collect leads, so the fee line stays here (CPA s41). */
export function CampaignFooter({ feeLine = true }: { feeLine?: boolean }) {
  const links: [string, string][] = [["Legal & disclosures", "/legal/"], ["Privacy", "/privacy/"], ["Terms", "/terms/"], ...(feeLine ? [["How we make money", "/how-we-make-money/"] as [string, string]] : []), ["Complaints", "/complaints/"], ["PAIA manual", "/paia/"], OPT_OUT];
  return (
    <footer className="site-footer site-footer-campaign" data-footer>
      <span className="f-rule" aria-hidden="true" />
      <div className="wrap grid gap-3">
        <Wordmark plain />
        <p className="f-line" data-disclosure>{FOOTER_LINE}</p>
        {feeLine && <p className="f-line" data-disclosure>{FEE_LINE}</p>}
        <p className="f-contact"><a href={phoneHref}>{company.phone_display}</a><a href={"mailto:" + company.email}>{company.email}</a></p>
        <nav aria-label="Legal"><ul className="f-legal">{links.map(([t, p]) => <li key={p} className={p === OPT_OUT[1] ? "f-optout" : undefined}><a href={APEX + p}>{t}</a></li>)}</ul></nav>
      </div>
    </footer>
  );
}
