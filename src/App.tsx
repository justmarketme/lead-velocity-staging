import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import About from "./pages/About";
import Services from "./pages/Services";
import SpecializedServices from "./pages/SpecializedServices";
import Contact from "./pages/Contact";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import AdminLogin from "./pages/AdminLogin";
import Signup from "./pages/auth/Signup";
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
import ResetPassword from "./pages/ResetPassword";
import NotificationHistory from "./pages/NotificationHistory";
import BrokerOnboarding from "./pages/BrokerOnboarding";
import Pricing from "./pages/Pricing";
import Promotions from "./pages/Promotions";

import { HelmetProvider } from "react-helmet-async";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <HelmetProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/about" element={<About />} />
            <Route path="/services" element={<Services />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/promotions" element={<Promotions />} />
            <Route path="/specialized-services" element={<SpecializedServices />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/broker" element={<BrokerPortal />} />
            <Route path="/login" element={<Login />} />
            <Route path="/admin" element={<AdminLogin />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/broker/dashboard" element={<BrokerDashboard />} />
            <Route path="/broker/leads" element={<BrokerLeads />} />
            <Route path="/broker/upload" element={<BrokerUpload />} />
            <Route path="/broker/documents" element={<BrokerDocuments />} />
            <Route path="/broker/referrals" element={<BrokerReferrals />} />
            <Route path="/broker/calendar" element={<BrokerCalendar />} />
            <Route path="/broker/reports" element={<BrokerReports />} />
            <Route path="/invite/:token" element={<InviteSignup />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/notifications" element={<NotificationHistory />} />
            <Route path="/onboarding" element={<BrokerOnboarding />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </HelmetProvider>
  </QueryClientProvider>
);

export default App;
