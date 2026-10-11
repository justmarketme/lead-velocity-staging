/**
 * "Connect my Outlook calendar" for the portals brokers actually use (/broker-elite Appointment Center, /broker/dashboard,
 * /broker/calendar). Same server contract as src/pages/portal/Calendar.tsx: ms-oauth {action:'start'} returns the Microsoft
 * sign-in URL, the callback stores the refresh token in Vault and sets brokers.calendar_status, {action:'disconnect'} forgets it.
 * ms-oauth only serves brokers with brokers.brand_id set (a SortMyCover order); everyone else sees why, not an error.
 */
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CalendarCheck, CheckCircle2, Circle, Loader2, Mail, Copy, Unplug, AlertTriangle, Info } from "lucide-react";
import { MS_ADMIN_CONSENT_URL, SUPPORT_EMAIL, fmtDayTime } from "@/lib/smc";
import { adminConsentNote, callbackNotice, grantedScopes, msUrl, outlookCardView, permissionRows, CALENDAR_PERMISSIONS } from "@/lib/smcMsConnect";
import { msCall, msStartError, rememberMsReturn } from "@/lib/smcMsClient";
import type { SmcBroker } from "@/integrations/supabase/smc-types";
import { Tone, toneClasses } from "./tone";

interface Props {
  broker: SmcBroker;
  reload: () => unknown;
  tone?: Tone;
  /** Portal path to come back to after Microsoft (ms-oauth always lands on /broker/calendar). */
  returnTo?: string;
}

export default function OutlookConnectCard({ broker, reload, tone = "theme", returnTo }: Props) {
  const c = toneClasses(tone);
  const view = outlookCardView(broker);
  const [busy, setBusy] = useState<"" | "connect" | "disconnect">("");
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [startedConsent, setStartedConsent] = useState("");
  const notice = callbackNotice(typeof window === "undefined" ? "" : window.location.search);
  const inApp = typeof navigator !== "undefined" && /FBAN|FBAV|Instagram|WhatsApp/i.test(navigator.userAgent);

  const detailConsent = msUrl(broker.calendar_status_detail?.admin_consent_url);
  const consentUrl = detailConsent || startedConsent
    || (MS_ADMIN_CONSENT_URL ? `${MS_ADMIN_CONSENT_URL}${broker.ms_tenant_id ? `${MS_ADMIN_CONSENT_URL.includes("?") ? "&" : "?"}tenant=${encodeURIComponent(broker.ms_tenant_id)}` : ""}` : "");

  // The admin-approval panel needs a link before the broker has ever tapped Connect.
  useEffect(() => {
    if (view.state !== "admin_blocked" || detailConsent || startedConsent) return;
    void msCall("start").then((r) => setStartedConsent(msUrl(r.data?.admin_consent_url)));
  }, [view.state, detailConsent, startedConsent]);

  async function connect() {
    setErr(null); setBusy("connect");
    const r = await msCall("start");
    const go = msUrl(r.data?.authorize_url);
    if (r.ok && go) {
      if (returnTo) rememberMsReturn(returnTo);
      window.location.assign(go);
      return;
    }
    setBusy("");
    setErr(msStartError(r));
  }

  async function disconnect() {
    if (!window.confirm("Disconnect your Outlook calendar? Clients can't book new times with you until you reconnect.")) return;
    setErr(null); setBusy("disconnect");
    const r = await msCall("disconnect");
    setBusy("");
    if (!r.ok) { setErr(`We couldn't disconnect (${r.data?.error || `HTTP ${r.status}`}). Try again.`); return; }
    void reload();
  }

  const scopes = grantedScopes(broker);
  const rows = view.state === "connected" ? permissionRows(scopes) : CALENDAR_PERMISSIONS.map((p) => ({ key: p.key, label: p.label, granted: false }));
  const missingGrant = view.state === "connected" && rows.some((r) => !r.granted) && scopes.length > 0;
  const mailIt = `mailto:?cc=${SUPPORT_EMAIL}&subject=${encodeURIComponent("Please approve the SortMyCover calendar app")}&body=${encodeURIComponent(adminConsentNote({ brokerName: broker.contact_person, consentUrl }))}`;

  const status = (() => {
    switch (view.state) {
      case "connected": return { cls: c.ok, icon: CheckCircle2, text: "Connected" };
      case "shared": return { cls: c.ok, icon: CheckCircle2, text: "Using the shared SortMyCover calendar" };
      case "needs_reconnect": return { cls: c.warn, icon: AlertTriangle, text: "Needs reconnecting" };
      case "admin_blocked": return { cls: c.warn, icon: AlertTriangle, text: "Waiting for your IT admin" };
      case "no_smc": return { cls: c.info, icon: Info, text: "Not available yet" };
      default: return { cls: c.info, icon: Circle, text: "Not connected" };
    }
  })();
  const StatusIcon = status.icon;
  const showConnect = view.state === "not_connected" || view.state === "needs_reconnect" || view.state === "admin_blocked";

  return (
    <Card className={`min-w-0 ${c.card}`} aria-labelledby="ms-cal-title">
      <CardHeader className={tone === "elite" ? "p-6 pb-3" : undefined}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="ms-logo-mini grid grid-cols-2 gap-0.5 shrink-0" aria-hidden="true">
              <i className="block h-2.5 w-2.5 bg-[#f25022]" /><i className="block h-2.5 w-2.5 bg-[#7fba00]" /><i className="block h-2.5 w-2.5 bg-[#00a4ef]" /><i className="block h-2.5 w-2.5 bg-[#ffb900]" />
            </span>
            <div className="min-w-0">
              <CardTitle id="ms-cal-title" className={`text-lg ${c.title}`}>Connect my Outlook calendar</CardTitle>
              <CardDescription className={c.muted}>So SortMyCover clients can book a Teams call in your real free time.</CardDescription>
            </div>
          </div>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${status.cls}`} role="status">
            <StatusIcon className="h-3.5 w-3.5" />{status.text}
          </span>
        </div>
      </CardHeader>
      <CardContent className={`space-y-4 ${tone === "elite" ? "p-6 pt-0" : ""}`}>
        {notice && view.state !== "no_smc" && (
          <p className={`rounded-lg px-3 py-2 text-sm ${notice.tone === "error" ? c.bad : notice.tone === "ok" ? c.ok : c.info}`} role={notice.tone === "error" ? "alert" : "status"}>{notice.text}</p>
        )}

        {view.state === "no_smc" && (
          <div className={`p-4 text-sm space-y-1 ${c.box}`}>
            <p className="font-semibold">This opens with a SortMyCover order.</p>
            <p className={c.muted}>Calendar booking is part of SortMyCover nurtured leads: clients chat on WhatsApp, then book straight into your Outlook with a Teams link. You don't have a SortMyCover order yet. Ask Lead Velocity ({SUPPORT_EMAIL}) to set one up, and this button switches on.</p>
          </div>
        )}

        {view.state === "connected" && (
          <div className={`p-4 text-sm ${c.box}`}>
            <p>Connected as <b className="break-all">{view.account || "your Microsoft account"}</b></p>
            {broker.calendar_connected_at && <p className={`text-xs mt-1 ${c.muted}`}>Since {fmtDayTime(broker.calendar_connected_at)}</p>}
            {broker.next_free_slot_at && <p className={`text-xs mt-1 ${c.muted}`}>Next free slot we can offer: {fmtDayTime(broker.next_free_slot_at)}</p>}
          </div>
        )}
        {view.state === "shared" && (
          <p className={`text-sm ${c.muted}`}>Meetings go into the shared calendar "SortMyCover - {broker.contact_person}". Subscribe to it in Outlook from the invite we emailed. Connect your own calendar any time to replace it.</p>
        )}
        {view.state === "needs_reconnect" && (
          <p className={`rounded-lg px-3 py-2 text-sm ${c.warn}`} role="alert">Microsoft stopped accepting our connection (a password change or a disconnect). Reconnect so clients can keep booking.</p>
        )}

        {view.state !== "no_smc" && (
          <div>
            <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${c.muted}`}>{view.state === "connected" ? "Permissions granted" : "What we will ask Microsoft for"}</p>
            <ul className="space-y-1.5 text-sm">
              {rows.map((r) => (
                <li key={r.key} className="flex items-start gap-2">
                  {view.state === "connected"
                    ? (r.granted ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-emerald-500" aria-label="granted" /> : <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" aria-label="not granted" />)
                    : <CalendarCheck className={`h-4 w-4 mt-0.5 shrink-0 ${c.muted}`} aria-hidden="true" />}
                  <span>{r.label}</span>
                </li>
              ))}
            </ul>
            <p className={`text-xs mt-2 ${c.muted}`}>We never read your emails, other people's calendars or what your own meetings are about.</p>
            {missingGrant && <p className={`rounded-lg px-3 py-2 text-xs mt-2 ${c.warn}`}>Microsoft didn't grant everything. Disconnect, then connect again and keep every box ticked.</p>}
          </div>
        )}

        {view.state === "admin_blocked" && (
          <div className={`p-4 text-sm space-y-3 ${c.box}`}>
            <p className="font-semibold">Microsoft says your organisation needs admin approval.</p>
            <p className={c.muted}>Your IT admin has switched off new apps for staff. They approve SortMyCover once (about 2 minutes), then you tap Connect again. Email them this note:</p>
            <p className={`text-xs whitespace-pre-wrap [overflow-wrap:anywhere] ${c.muted}`}>{adminConsentNote({ brokerName: broker.contact_person, consentUrl: consentUrl || "(approval link loading)" })}</p>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" className={c.primary}><a href={mailIt}><Mail className="mr-1.5 h-4 w-4" />Email my IT admin</a></Button>
              <Button type="button" size="sm" variant="outline" disabled={!consentUrl} onClick={async () => { try { await navigator.clipboard.writeText(consentUrl); setCopied(true); } catch { setCopied(false); } }}>
                <Copy className="mr-1.5 h-4 w-4" />{copied ? "Link copied" : "Copy the approval link"}
              </Button>
            </div>
          </div>
        )}

        {showConnect && (
          <div className="space-y-2">
            {inApp && <p className={`rounded-lg px-3 py-2 text-sm ${c.warn}`}>Open this page in Safari or Chrome to sign in with Microsoft.</p>}
            <Button type="button" onClick={connect} disabled={busy !== ""} aria-busy={busy === "connect"} className={`w-full sm:w-auto ${c.primary}`}>
              {busy === "connect" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarCheck className="mr-2 h-4 w-4" />}
              {busy === "connect" ? "Opening Microsoft…" : view.state === "not_connected" ? "Connect my Outlook calendar" : "Reconnect my Outlook calendar"}
            </Button>
            <p className={`text-xs ${c.muted}`}>One tap: sign in with your work Microsoft account and choose Accept.</p>
          </div>
        )}

        {view.state === "connected" && (
          <Button type="button" variant="outline" size="sm" onClick={disconnect} disabled={busy !== ""} aria-busy={busy === "disconnect"}>
            {busy === "disconnect" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Unplug className="mr-1.5 h-4 w-4" />}
            {busy === "disconnect" ? "Disconnecting…" : "Disconnect"}
          </Button>
        )}
        {err && <p className={`rounded-lg px-3 py-2 text-sm ${c.bad}`} role="alert">{err}</p>}
      </CardContent>
    </Card>
  );
}
