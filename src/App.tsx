import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from "react-router-dom";
import Home from "./pages/Home";
import About from "./pages/About";
import Services from "./pages/Services";
import SpecializedServices from "./pages/SpecializedServices";
import Contact from "./pages/Contact";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import AdminLogin from "./pages/AdminLogin";
import Dashboard from "./pages/Dashboard";
import BrokerPortal from "./pages/BrokerPortal";
import BrokerDashboard from "./pages/broker/BrokerDashboard";
import BrokerLeads from "./pages/broker/BrokerLeads";
import BrokerUpload from "./pages/broker/BrokerUpload";
import BrokerReports from "./pages/broker/BrokerReports";
import BrokerDocuments from "./pages/broker/BrokerDocuments";
import BrokerReferrals from "./pages/broker/BrokerReferrals";
import BrokerCalendar from "./pages/broker/BrokerCalendar";
import InviteSignup from "./pages/InviteSignup";
import BrokerSetup from "./pages/BrokerSetup";
import BrokerForgotPassword from "./pages/auth/BrokerForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import NotificationHistory from "./pages/NotificationHistory";
import BrokerOnboarding from "./pages/BrokerOnboarding";
import Pricing from "./pages/Pricing";
import PremiumBrokerPortalPage from "./pages/PremiumBrokerPortalPage";
import BrokerProfile from "./pages/broker/BrokerProfile";

import { HelmetProvider } from "react-helmet-async";
import { lazy, Suspense, type ReactNode } from "react";
import { SMC_ENABLED } from "./lib/smc";

import Setup from "./pages/Setup";
import { ChatBot } from "./components/ChatBot";

const queryClient = new QueryClient();

// SortMyCover console + broker portal (VITE_SMC_ENABLED, default off). Lazy chunks: nothing loads unless the flag is on.
const SmcToday = lazy(() => import("./pages/smc/Today"));
const SmcAds = lazy(() => import("./pages/smc/Ads"));
const SmcAsk = lazy(() => import("./pages/smc/Ask"));
const SmcPayments = lazy(() => import("./pages/smc/Payments"));
const SmcBrands = lazy(() => import("./pages/smc/Brands"));
const PortalStart = lazy(() => import("./pages/portal/Start"));
const PortalProfile = lazy(() => import("./pages/portal/Profile"));
const PortalIntroCard = lazy(() => import("./pages/portal/IntroCard"));
const PortalIntroMedia = lazy(() => import("./pages/portal/IntroMedia"));
const PortalCalendar = lazy(() => import("./pages/portal/Calendar"));
const PortalAgreement = lazy(() => import("./pages/portal/Agreement"));
const PortalLeads = lazy(() => import("./pages/portal/Leads"));
const PortalReports = lazy(() => import("./pages/portal/Reports"));
const PortalHelp = lazy(() => import("./pages/portal/Help"));
const PortalToday = lazy(() => import("./pages/portal/Today"));
const PortalLeadRecord = lazy(() => import("./pages/portal/LeadRecord"));
const PortalMore = lazy(() => import("./pages/portal/More"));
const SmcHome = lazy(() => import("./pages/portal/More").then((m) => ({ default: m.SmcHome })));
const SmcBrokerSwitch = lazy(() => import("./pages/portal/SmcBrokerSwitch"));
/** /s/* short links from WhatsApp template buttons: keep ?day=… etc. and land on the portal route (auth + broker switch apply there). */
function SmcShortLink({ to }: { to: string }) {
  const { search } = useLocation();
  return <Navigate to={`${to}${search}`} replace />;
}
/** broker_new_booking "Open in portal" button: app.leadvelocity.co.za/l/<lead_id> opens the lead record. */
function SmcLeadLink() {
  const { id } = useParams();
  const { search } = useLocation();
  return <Navigate to={`/broker/leads/${encodeURIComponent(id || "")}${search}`} replace />;
}
/** Report buttons (WhatsApp/email): r/<week key> opens the report, ask/<week key> goes to the ask's screen. */
function SmcReportLink({ ask }: { ask?: boolean }) {
  const { key } = useParams();
  return <Navigate to={`/broker/reports?wk=${encodeURIComponent(key || "")}${ask ? "&ask=1" : ""}`} replace />;
}
const smc = (el: ReactNode) => <Suspense fallback={<div className="min-h-screen bg-background" />}>{el}</Suspense>;
/** Legacy route that SMC brokers share: SMC page for brand brokers, the legacy page for everyone else (flag off = legacy only). */
const shared = (smcEl: ReactNode, legacyEl: ReactNode) => (SMC_ENABLED ? smc(<SmcBrokerSwitch smc={smcEl} legacy={legacyEl} />) : legacyEl);

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
    <HelmetProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <ChatBot />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/setup" element={<Setup />} />
            <Route path="/about" element={<About />} />
            <Route path="/services" element={<Services />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/promotions" element={<Navigate to="/pricing" replace />} />
            <Route path="/specialized-services" element={<SpecializedServices />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/broker" element={<BrokerPortal />} />
            <Route path="/login" element={<Login />} />
            <Route path="/admin" element={<AdminLogin />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/broker/dashboard" element={shared(<SmcHome />, <BrokerDashboard />)} />
            <Route path="/broker/leads" element={shared(<PortalLeads />, <BrokerLeads />)} />
            <Route path="/broker/upload" element={<BrokerUpload />} />
            <Route path="/broker/documents" element={<BrokerDocuments />} />
            <Route path="/broker/referrals" element={<BrokerReferrals />} />
            <Route path="/broker/calendar" element={shared(<PortalCalendar />, <BrokerCalendar />)} />
            <Route path="/broker/reports" element={shared(<PortalReports />, <BrokerReports />)} />
            <Route path="/broker/profile" element={shared(<PortalProfile />, <BrokerProfile />)} />
            <Route path="/invite/:token" element={<InviteSignup />} />
            <Route path="/broker-setup/:token" element={<BrokerSetup />} />
            <Route path="/broker/forgot-password" element={<BrokerForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/notifications" element={<NotificationHistory />} />
            <Route path="/onboarding" element={<BrokerOnboarding />} />
            <Route path="/broker-elite" element={<PremiumBrokerPortalPage />} />
            {SMC_ENABLED && (
              <>
                <Route path="/console" element={smc(<SmcToday />)} />
                <Route path="/console/ads" element={smc(<SmcAds />)} />
                <Route path="/console/ask" element={smc(<SmcAsk />)} />
                <Route path="/console/payments" element={smc(<SmcPayments />)} />
                <Route path="/console/settings/brands" element={smc(<SmcBrands />)} />
                <Route path="/broker/start" element={smc(<PortalStart />)} />
                <Route path="/broker/intro-card" element={smc(<PortalIntroCard />)} />
                <Route path="/broker/intro-media" element={smc(<PortalIntroMedia />)} />
                <Route path="/broker/agreement" element={smc(<PortalAgreement />)} />
                <Route path="/broker/billing" element={smc(<PortalAgreement />)} />
                <Route path="/broker/help" element={smc(<PortalHelp />)} />
                <Route path="/broker/today" element={smc(<PortalToday />)} />
                <Route path="/broker/more" element={smc(<PortalMore />)} />
                <Route path="/broker/leads/:id" element={smc(<PortalLeadRecord />)} />
                {/* WhatsApp buttons: broker_new_booking (l/<lead_id>), broker_onb_live (/leads), daily digest */}
                <Route path="/l/:id" element={<SmcLeadLink />} />
                <Route path="/leads" element={smc(<SmcHome />)} />
                <Route path="/s/today" element={<SmcShortLink to="/broker/today" />} />
                {/* WhatsApp template buttons (I-37c): short links on app.leadvelocity.co.za/s/* forward to the portal pages, query kept */}
                <Route path="/s/calendar" element={<SmcShortLink to="/broker/calendar" />} />
                <Route path="/s/billing" element={<SmcShortLink to="/broker/billing" />} />
                <Route path="/r/:key" element={<SmcReportLink />} />
                <Route path="/ask/:key" element={<SmcReportLink ask />} />
                <Route path="/s/leads" element={<SmcShortLink to="/broker/leads" />} />
              </>
            )}
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </HelmetProvider>
  </QueryClientProvider>
  );
};

export default App;
