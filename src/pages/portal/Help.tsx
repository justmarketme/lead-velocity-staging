/**
 * 09 Help (portal/spec/09-help.md; prototype help.html). Loom/Wistia: clips, not a manual. Intercom: a human a tap away.
 * Quick answers mirror knowledge/faq.md (6B.9). The form writes support_events through smc_portal_event('support.message') (topic = page).
 */
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import PortalShell from "./PortalShell";
import { CLIPS_BASE, SUPPORT_EMAIL, SUPPORT_WA, errText, portalEvent } from "@/lib/smc";

const CLIPS: [string, string, string][] = [
  ["Your details and FSP check", "0:35", "profile"], ["Connect your calendar", "0:40", "calendar"], ["Hours, methods, how many", "0:35", "availability"],
  ["Your intro card", "0:30", "intro-card"], ["Record your intro", "0:40", "intro-media"], ["Signing and paying", "0:35", "agreement"],
  ["Marking meetings", "0:35", "outcomes"], ["Your weekly report", "0:30", "reports"],
];
const FAQ: [string, string, string?][] = [
  ["When do leads start?", "When your steps are done and Jonathan taps Go live. We tell you on WhatsApp the moment it happens."],
  ["What do I tell you after a meeting?", "Only one thing, with one tap: Met them, No-show, Couldn't reach them, or Moved to another time. We never ask what was discussed, whether they bought, or anything about policies or premiums (agreement clause 8.4)."],
  ["What do I do when a lead does not show?", "Wait 10 minutes in the meeting. Then tap No-show. A sheet opens: add a photo or screenshot that shows the time (no people, no address), within 30 minutes of the start time, and tap Ask for a replacement. Late or no proof: no request, and the lead still counts as delivered."],
  ["What if I can't reach a lead?", "Try them at least twice, by call or WhatsApp, in the 30 minutes after the start time. From 10 minutes after the start, tap Couldn't reach them. A sheet opens: add a screenshot of your call log or WhatsApp chat with them and tap Ask for a replacement. It must show at least 2 attempts since the start time and no reply, or show that the number is wrong or invalid, with the time visible. Late or no proof: no request, and the lead still counts as delivered."],
  ["Will I get a replacement for a no-show or a lead I couldn't reach?", "Maybe. Replacements are goodwill, not a right. You can ask after a no-show or a lead you couldn't reach, up to 3 requests a week in total (Monday to Sunday, counted by the date of the missed appointment), each with proof. We check with the lead and tell you on WhatsApp what we decided. A replacement is free and does not count toward your number. The missed lead still counts as delivered. \"Did not buy\" is never a reason.", "replacements"],
  ["Can I change my hours or pause?", "Yes, any time, on the Calendar page. Meetings already booked stay booked."],
  ["Who owns the leads?", "You use delivered leads exclusively. We keep the campaign, pages, ad account and anonymous results."],
  ["Does the price change if I write more policies?", "No. One flat price per 30-day cycle. It never depends on policies."],
  ["I got a message that looks wrong.", "Tell us on WhatsApp or by email, and we fix it the same day."],
  ["How do I leave?", "No notice needed. Just don't renew. Leads already delivered stay yours to use."],
];
const TOPICS = ["start", "profile", "calendar", "agreement", "intro-card", "intro-media", "leads", "reports", "other"];

export default function Help() {
  const { state } = useLocation() as { state?: { from?: string } };
  const [topic, setTopic] = useState(state?.from || "other");
  const [note, setNote] = useState("");
  const [sent, setSent] = useState<string | null>(null);

  async function send() {
    const { error } = await portalEvent("support.message", topic, { topic, note: note.trim().slice(0, 1000) });
    setSent(error ? `Could not send: ${errText(error)}. Please email us instead.` : "Sent. We reply on WhatsApp or email.");
    if (!error) setNote("");
  }

  return (
    <PortalShell title="Help">
      <section className="card">
        <h2>Short videos, right where you need them</h2>
        <div className="clips">
          {CLIPS.map(([t, len, f]) => (
            <a key={f} className="clip" href={`${CLIPS_BASE}/${f}.mp4`} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
              <span className="t">{t}</span><div className="play" style={{ width: 34, height: 34 }} /><span className="len">{len}</span>
            </a>
          ))}
        </div>
        <p className="small">All have captions. Or watch the <Link to="/broker/start#explainer">full 3-minute video</Link>.</p>
      </section>

      <section className="card faq" aria-label="Questions brokers ask">
        <h2>Quick answers</h2>
        {FAQ.map(([q, a, id]) => <details key={q} id={id}><summary>{q}</summary><p className="muted">{a}</p></details>)}
      </section>

      <section className="card">
        <h2>Still stuck? Message us</h2>
        <p className="muted">We reply on WhatsApp or email. You do not need to book a call.</p>
        {SUPPORT_WA && <a className="btn" href={`https://wa.me/${SUPPORT_WA}?text=${encodeURIComponent("Hi SortMyCover, I need a hand with: ")}`}>Message us on WhatsApp</a>}
        <a className={SUPPORT_WA ? "btn ghost" : "btn"} href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Portal help")}`}>Email {SUPPORT_EMAIL}</a>
        <label htmlFor="tp">Or tell us here: which page?</label>
        <select id="tp" value={topic} onChange={(e) => setTopic(e.target.value)}>{TOPICS.map((t) => <option key={t} value={t}>{t.replace("-", " ")}</option>)}</select>
        <label htmlFor="nt">What do you need?</label>
        <textarea id="nt" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Please don't include a lead's details here." />
        <div style={{ height: 10 }} />
        <button className="btn ghost" type="button" disabled={note.trim().length < 3} onClick={send}>Send</button>
        {sent && <p className="small" role="status">{sent}</p>}
      </section>

      <section className="card">
        <h3>Your account</h3>
        <p style={{ margin: "6px 0" }}><Link to="/broker/profile">Your details and photo</Link></p>
        <p style={{ margin: "6px 0" }}><Link to="/broker/intro-card">Intro card</Link></p>
        <p style={{ margin: "6px 0" }}><Link to="/broker/intro-media">Voice note and video</Link></p>
        <p style={{ margin: "6px 0" }}><Link to="/broker/agreement">Agreement and billing</Link></p>
      </section>
    </PortalShell>
  );
}
