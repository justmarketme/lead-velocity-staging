import { Seo } from "@/lib/head";
import { APEX, site } from "@/lib/site";
import { Link } from "react-router-dom";

export default function BookThanks() {
  return (
    <>
      <Seo title="Thank you | SortMyCover" description="Thanks. Your adviser’s details are on their way on WhatsApp." canonical={APEX + "/book/thanks/"} robots="noindex,nofollow" />
      <div className="wrap-narrow py-12"><div className="prose-sm">
        <h1>Thanks. Check your WhatsApp.</h1>
        <p className="lede">Your adviser’s name, practice and FSP number are on their way{site.whatsapp_number ? <> from <strong>{site.whatsapp_number}</strong></> : <> from the SortMyCover WhatsApp number</>}. Save the number so the message does not get lost.</p>
        <h2>What happens next</h2>
        <ul><li>You pick a time that suits you.</li><li>You get reminders before the call.</li><li>The call is about 30 minutes, by video, WhatsApp or phone. The call costs you nothing, and you decide afterwards.</li></ul>
        <p>Reply STOP to any message to stop. <Link to="/how-it-works/">How it works</Link> · <Link to="/learn/how-to-check-an-adviser/">How to check an adviser</Link></p>
      </div></div>
    </>
  );
}
