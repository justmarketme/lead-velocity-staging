import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import Home from "./pages/Home";
import About from "./pages/About";
import Services from "./pages/Services";
import SpecializedServices from "./pages/SpecializedServices";
import Contact from "./pages/Contact";
import NotFound from "./pages/NotFound";
import AdminLogin from "./pages/AdminLogin";
import Dashboard from "./pages/Dashboard";
import BrokerPortal from "./pages/BrokerPortal";
import BrokerDashboard from "./pages/broker/BrokerDashboard";
import BrokerLeads from "./pages/broker/BrokerLeads";
import BrokerOrders from "./pages/broker/BrokerOrders";
import BrokerUpload from "./pages/broker/BrokerUpload";
import BrokerReports from "./pages/broker/BrokerReports";
import BrokerDocuments from "./pages/broker/BrokerDocuments";
import BrokerReferrals from "./pages/broker/BrokerReferrals";
import BrokerCalendar from "./pages/broker/BrokerCalendar";
import MsReturnGate from "./components/broker/smc/MsReturnGate";
import InviteSignup from "./pages/InviteSignup";
import BrokerSetup from "./pages/BrokerSetup";
import BrokerForgotPassword from "./pages/auth/BrokerForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import NotificationHistory from "./pages/NotificationHistory";
import BrokerOnboarding from "./pages/BrokerOnboarding";
import Pricing from "./pages/Pricing";
import PremiumBrokerPortalPage from "./pages/PremiumBrokerPortalPage";
import AdminBrokerPreview from "./pages/AdminBrokerPreview";
import BrokerProfile from "./pages/broker/BrokerProfile";
import Explainer from "./pages/broker/Explainer";

import { HelmetProvider } from "react-helmet-async";
import { lazy, Suspense, type ReactNode } from "react";
import { SMC_ENABLED } from "./lib/smc";

import Setup from "./pages/Setup";
import { ChatBot } from "./components/ChatBot";

const queryClient = new QueryClient();

// SortMyCover console + broker portal (VITE_SMC_ENABLED, default off). Lazy chunks: nothing loads unless the flag is on.
const SmcBrands = lazy(() => import("./pages/smc/Brands"));
const PortalStart = lazy(() => import("./pages/portal/Start"));
const PortalProfile = lazy(() => import("./pages/portal/Profile"));
const PortalIntroCard = lazy(() => import("./pages/portal/IntroCard"));
const PortalIntroMedia = lazy(() => import("./pages/portal/IntroMedia"));
const PortalCalendar = lazy(() => import("./pages/portal/Calendar"));
const PortalAgreement = lazy(() => import("./pages/portal/Agreement"));
const PortalLeads = lazy(() => import("./pages/portal/Leads"));
const PortalHelp = lazy(() => import("./pages/portal/Help"));
const PortalMessages = lazy(() => import("./pages/portal/Messages"));
const BrokerMessages = lazy(() => import("./pages/BrokerMessages"));
const SmcBrokerSwitch = lazy(() => import("./pages/portal/SmcBrokerSwitch"));
/** /s/* short links from WhatsApp template buttons: keep ?day=… etc. and land on the portal route (auth + broker switch apply there). */
function SmcShortLink({ to }: { to: string }) {
  const { search } = useLocation();
  return <Navigate to={`${to}${search}`} replace />;
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
            <Route path="/login" element={<Navigate to="/admin" replace />} />
            <Route path="/admin" element={<AdminLogin />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/broker/dashboard" element={<BrokerDashboard />} />
            <Route path="/broker/leads" element={shared(<PortalLeads />, <Navigate to="/broker/orders" replace />)} />
            <Route path="/broker/orders" element={<BrokerOrders />} />
            <Route path="/broker/upload" element={<BrokerUpload />} />
            <Route path="/broker/documents" element={<BrokerDocuments />} />
            <Route path="/broker/referrals" element={<BrokerReferrals />} />
            <Route path="/broker/calendar" element={<MsReturnGate>{shared(<PortalCalendar />, <BrokerCalendar />)}</MsReturnGate>} />
            {/* SortMyCover has no weekly report (W14 and smc_reports retired 20 Oct 2026, D5): SMC brokers land on their order. */}
            <Route path="/broker/reports" element={shared(<Navigate to="/broker/orders" replace />, <BrokerReports />)} />
            <Route path="/broker/profile" element={shared(<PortalProfile />, <BrokerProfile />)} />
            <Route path="/broker/messages" element={shared(<PortalMessages />, smc(<BrokerMessages />))} />
            <Route path="/broker/explainer" element={<Explainer />} />
            <Route path="/invite/:token" element={<InviteSignup />} />
            <Route path="/broker-setup/:token" element={<BrokerSetup />} />
            <Route path="/broker/forgot-password" element={<BrokerForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/broker/set-password" element={<ResetPassword />} />
            <Route path="/notifications" element={<NotificationHistory />} />
            <Route path="/onboarding" element={<BrokerOnboarding />} />
            <Route path="/broker-elite" element={<PremiumBrokerPortalPage />} />
            <Route path="/admin/preview/broker/:brokerId" element={<AdminBrokerPreview />} />
            {SMC_ENABLED && (
              <>
                {/* Ops console parked (Jono, 19 Oct 2026): its back end (smc_console_* RPCs, ops/facts layers) was dropped when
                    SortMyCover moved into the CRM, so every /console page sends admins to the admin home until it is rebuilt.
                    Today / Ads / Ask / Payments were retired 20 Oct 2026 (D5); SmcBrands stays for when the console is rebuilt. */}
                <Route path="/console/*" element={<Navigate to="/dashboard" replace />} />
                <Route path="/broker/start" element={smc(<PortalStart />)} />
                <Route path="/broker/intro-card" element={smc(<PortalIntroCard />)} />
                <Route path="/broker/intro-media" element={smc(<PortalIntroMedia />)} />
                <Route path="/broker/agreement" element={smc(<PortalAgreement />)} />
                <Route path="/broker/billing" element={smc(<PortalAgreement />)} />
                <Route path="/broker/help" element={smc(<PortalHelp />)} />
                {/* WhatsApp template buttons (I-37c): short links on leadvelocity.co.za/s/* forward to the portal pages, query kept */}
                <Route path="/s/calendar" element={<SmcShortLink to="/broker/calendar" />} />
                <Route path="/s/billing" element={<SmcShortLink to="/broker/billing" />} />
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
