import PageFrame from "@/components/PageFrame";
import { company } from "@/lib/site";

export default function Accessibility() {
  return (
    <PageFrame title="Accessibility | SortMyCover" description="SortMyCover aims to meet WCAG 2.2 level AA. What we have checked, what we have not yet, and how to tell us about a problem." path="/accessibility/" h1="Accessibility" lede="We aim to meet WCAG 2.2 level AA on every page." crumbs={[{ name: "SortMyCover", path: "/" }, { name: "Accessibility", path: "/accessibility/" }]}>
      <h2>What we aim for</h2>
      <p>The whole site is meant to work with a keyboard, a screen reader and a phone: visible focus, labels on every field, errors that say what to do, text that scales, tap targets of at least 48 px for the main buttons, and no content that depends on motion. Animations stop when your device asks for reduced motion.</p>
      <h2>What has and has not been checked</h2>
      <p>Automated checks run on the pre-built pages (one heading level 1 per page, contrast of the brand colours, no inline styles). A hands-on test with a screen reader on a phone has not yet been done. Until it is, treat that part as unverified.</p>
      <h2>Tell us about a problem</h2>
      <p>Email <a href={"mailto:" + company.email}>{company.email}</a> or phone <a href={"tel:" + company.phone_tel}>{company.phone_display}</a>. A person will reply, and we will say how we will fix it or how else you can get the same help.</p>
    </PageFrame>
  );
}
