import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { CompanyProvider } from "@/contexts/CompanyContext";
import Index from "./pages/Index";
import Campaigns from "./pages/Campaigns";
import Accounts from "./pages/Accounts";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import AIAnalysis from "./pages/AIAnalysis";
import UnifiedDashboard from "./pages/UnifiedDashboard";
import MediaAnalysis from "./pages/MediaAnalysis";
import Posts from "./pages/Posts";
import ClientDashboard from "./pages/ClientDashboard";
import AdminLogin from "./pages/AdminLogin";
import AdminSignup from "./pages/AdminSignup";
import ClientLogin from "./pages/ClientLogin";
import SuperAdminAgencies from "./pages/SuperAdminAgencies";
import AcceptInvite from "./pages/AcceptInvite";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* Auth pages */}
          <Route path="/login" element={<AdminLogin />} />
          <Route path="/signup" element={<AdminSignup />} />
          <Route path="/client-login" element={<ClientLogin />} />

          {/* Admin routes */}
          <Route path="/" element={<RequireAuth type="admin"><CompanyProvider><Index /></CompanyProvider></RequireAuth>} />
          <Route path="/campaigns" element={<RequireAuth type="admin"><CompanyProvider><Campaigns /></CompanyProvider></RequireAuth>} />
          <Route path="/accounts" element={<RequireAuth type="admin"><CompanyProvider><Accounts /></CompanyProvider></RequireAuth>} />
          <Route path="/reports" element={<RequireAuth type="admin"><Reports /></RequireAuth>} />
          <Route path="/settings" element={<RequireAuth type="admin"><CompanyProvider><Settings /></CompanyProvider></RequireAuth>} />
          <Route path="/posts" element={<RequireAuth type="admin"><CompanyProvider><Posts /></CompanyProvider></RequireAuth>} />
          <Route path="/ai-analysis" element={<RequireAuth type="admin"><AIAnalysis /></RequireAuth>} />
          <Route path="/unified" element={<RequireAuth type="admin"><CompanyProvider><UnifiedDashboard /></CompanyProvider></RequireAuth>} />
          <Route path="/media-analysis" element={<RequireAuth type="admin"><CompanyProvider><MediaAnalysis /></CompanyProvider></RequireAuth>} />

          {/* Super admin routes */}
          <Route path="/super-admin/agencies" element={<RequireAuth type="super_admin"><SuperAdminAgencies /></RequireAuth>} />

          {/* Invite acceptance (public) */}
          <Route path="/accept-invite/:token" element={<AcceptInvite />} />

          {/* Client route */}
          <Route path="/client/:accountId" element={<RequireAuth type="client"><ClientDashboard /></RequireAuth>} />

          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
