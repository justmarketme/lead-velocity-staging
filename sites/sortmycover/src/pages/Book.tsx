/* /book/ (Jono, 17 Oct 2026): there is no booking form. Every call is booked on WhatsApp by Lindi, SortMyCover's AI booking
   assistant. The URL stays because ads, the footer and old links point here. */
import { Seo } from "@/lib/head";
import { APEX, COST_LINE, provider, site } from "@/lib/site";
import { PageHead } from "@/components/PageFrame";
import { CalendarCta, WhatsAppCta } from "@/components/ChatWidget";
import { DEFAULT_CHAT, WA_STEPS } from "@/lib/whatsapp";
import { Link } from "react-router-dom";
import { WaPreview } from "@/components/Visuals";

export default function Book() {
  return (
    <>
      <Seo title="Book a call | SortMyCover" description={`Book a 30-minute call with an authorised adviser about cover, or with a ${provider.name} consultant about your will, on WhatsApp. ${COST_LINE}`} canonical={APEX + "/book/"} />
      <PageHead h1="Book your call on WhatsApp" accent="on WhatsApp" crumbs={[{ name: "SortMyCover", path: "/" }, { name: "Book a call", path: "/book/" }]} lede={<>Lindi, SortMyCover's booking assistant, books a 30-minute call with an authorised adviser about cover, or with a {provider.name} consultant about your will. {COST_LINE}</>} />
      <div className="wrap-narrow page-body"><div className="prose-sm">
        <p className="cta-row">
          <WhatsAppCta ctx={{ ...DEFAULT_CHAT, ref: "w-book" }} className="btn btn-lg">Chat about cover</WhatsAppCta>
          <WhatsAppCta ctx={{ topic: "a will", ref: "w-book-will", wills: true }} className="btn btn-secondary">Chat about a will</WhatsAppCta>
          <CalendarCta ctx={{ ...DEFAULT_CHAT, ref: "w-book" }} className="btn btn-lg btn-secondary">Pick a time in the calendar</CalendarCta>
        </p>
        <h2>What happens on WhatsApp</h2>
        <WaPreview />
        <ol>{WA_STEPS().map((s) => <li key={s}>{s}</li>)}</ol>
        <p>Lindi is an AI assistant. You can ask for a person at any time, and reply STOP to any message to stop. The number is <strong>{site.whatsapp_number}</strong>.</p>
        <p>Please do not send ID numbers, bank details or health details in a message.</p>
        <h2>Not sure yet?</h2>
        <p>Read about <Link to="/cover/">cover types</Link> or <Link to="/wills/">wills and estate</Link>, see <Link to="/how-it-works/">how it works</Link>, or <Link to="/how-we-make-money/">how we make money</Link>.</p>
      </div></div>
    </>
  );
}
