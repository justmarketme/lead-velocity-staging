/* Privacy, Terms and PAIA. The text is ported from landing/holding/*.html (files in src/content/legal) with the compliance edits listed in
   the README. All three are marked DRAFT and noindex until the compliance practitioner signs them off. */
import { Fragment, useEffect, useState } from "react";
import PageFrame, { DraftNote } from "@/components/PageFrame";
import privacyHtml from "@/content/legal/privacy.html?raw";
import termsHtml from "@/content/legal/terms.html?raw";
import { adsOff, adsOn, isOptedOut } from "@/lib/pixel";
import { company } from "@/lib/site";

const Raw = ({ html }: { html: string }) => <div dangerouslySetInnerHTML={{ __html: html }} />;

function OptOutControl() {
  const [off, setOff] = useState<boolean | null>(null);
  useEffect(() => { setOff(isOptedOut()); }, []);
  return (
    <div className="draftnote" id="opt-out-control">
      <p role="status" aria-live="polite">{off === null ? "Checking your setting…" : off ? "Ad measurement is OFF for this browser, on every SortMyCover page." : "Ad measurement is OFF unless you gave the optional consent on the booking form."}</p>
      {off !== true && <p><button type="button" className="btn btn-sm" onClick={() => { adsOff(); setOff(true); }}>Opt out of ad measurement</button></p>}
      {off === true && <p><button type="button" className="link-btn" onClick={() => { adsOn(); setOff(false); }}>Remove my opt-out</button></p>}
      <noscript><p>This control needs JavaScript. You can also block cookies in your browser settings, or email <a href="mailto:hello@sortmycover.co.za">hello@sortmycover.co.za</a>.</p></noscript>
    </div>
  );
}

export function Privacy() {
  const parts = privacyHtml.split("<!--OPTOUT-->");
  return (
    <PageFrame title="Privacy notice | SortMyCover" description="How SortMyCover uses your details under POPIA: what we collect, who gets it, how long we keep it and how to opt out." path="/privacy/" h1="Privacy notice" robots="noindex,follow" crumbs={[{ name: "SortMyCover", path: "/" }, { name: "Privacy", path: "/privacy/" }]}>
      {parts.map((p, i) => (<Fragment key={i}><Raw html={p} />{i < parts.length - 1 && <OptOutControl />}</Fragment>))}
    </PageFrame>
  );
}

export function Terms() {
  return (
    <PageFrame title="Terms of use | SortMyCover" description="What SortMyCover does, what it does not do, and what we ask of you." path="/terms/" h1="Terms of use" robots="noindex,follow" crumbs={[{ name: "SortMyCover", path: "/" }, { name: "Terms", path: "/terms/" }]}>
      <Raw html={termsHtml} />
    </PageFrame>
  );
}

export function Paia() {
  return (
    <PageFrame title="PAIA manual | SortMyCover" description="How to request records from Lead Velocity (Pty) Ltd under the Promotion of Access to Information Act." path="/paia/" h1="PAIA manual" robots="noindex,follow" crumbs={[{ name: "SortMyCover", path: "/" }, { name: "PAIA manual", path: "/paia/" }]}>
      <DraftNote>The PAIA manual for {company.legal_name} has not been published yet. This page is a placeholder and states only the contact route.</DraftNote>
      <h2>Requesting a record</h2>
      <p>To ask for access to a record held by {company.legal_name}, email the Information Officer, {company.information_officer}, at <a href={"mailto:" + company.email}>{company.email}</a>, or write to {company.address_lines.join(", ")}.</p>
      <h2>Regulator</h2>
      <p>The Information Regulator: <a href="https://inforegulator.org.za/" rel="noopener noreferrer">inforegulator.org.za</a>.</p>
    </PageFrame>
  );
}
