import PageFrame from "@/components/PageFrame";
import { FaqItem } from "@/components/Interactive";
import { Inline } from "@/lib/inline";
import { SITE_FAQ } from "@/content/shared";

/* No FAQPage JSON-LD (spec DEC-9). Every answer is always in the HTML: native <details>, Motion only animates the height. */
export default function Faq() {
  return (
    <PageFrame title="Questions people ask | SortMyCover" description="Straight answers: what the call costs, who the adviser is, how SortMyCover makes money, what happens to your details, and how to stop messages." path="/faq/" h1="Questions people ask" crumbs={[{ name: "SortMyCover", path: "/" }, { name: "FAQ", path: "/faq/" }]}>
      <div className="mt-4">
        {SITE_FAQ.map((f) => <FaqItem key={f.id} q={f.q}><p><Inline text={f.a} /></p></FaqItem>)}
      </div>
    </PageFrame>
  );
}
