import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { I18nProvider } from "@/i18n/useI18n";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { PropertyProvider } from "@/contexts/PropertyContext";
import { ClientProvider } from "@/contexts/ClientContext";
import { ChangeHistoryProvider } from "@/contexts/ChangeHistoryContext";
import { ProposalProvider } from "@/contexts/ProposalContext";
import { ContractProvider } from "@/contexts/ContractContext";
import { FinancialProvider } from "@/contexts/FinancialContext";
import { CRMProvider } from "@/contexts/CRMContext";
import AppLayout from "@/components/AppLayout";
import { CrmRealtimeBridge } from "@/components/CrmRealtimeBridge";
import { SentryConsentBanner } from "@/components/SentryConsentBanner";
import AuthPage from "@/pages/Auth";
import ResetPassword from "@/pages/ResetPassword";
import Dashboard from "@/pages/Dashboard";
import PropertiesList from "@/pages/PropertiesList";
import PropertyDetail from "@/pages/PropertyDetail";
import NewProperty from "@/pages/NewProperty";
import ClientsList from "@/pages/ClientsList";
import FinancialDashboard from "@/pages/FinancialDashboard";
import ProposalsList from "@/pages/ProposalsList";
import ProposalDetail from "@/pages/ProposalDetail";
import ContractsList from "@/pages/ContractsList";
import ContractDetail from "@/pages/ContractDetail";
import PaymentsList from "@/pages/PaymentsList";
import CRM from "@/pages/CRM";
import ErrorBacklog from "@/pages/ErrorBacklog";
import AdminLogs from "@/pages/AdminLogs";
import NotificationSettings from "@/pages/NotificationSettings";
import AdminEmails from "@/pages/AdminEmails";
import NotFound from "@/pages/NotFound";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

function ProtectedApp() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;

  return (
    <ChangeHistoryProvider>
      <PropertyProvider>
        <ClientProvider>
          <ProposalProvider>
            <ContractProvider>
              <FinancialProvider>
                <CRMProvider>
                  <CrmRealtimeBridge />
                  <Routes>
                    <Route element={<AppLayout />}>
                      <Route path="/" element={<Dashboard />} />
                      <Route path="/properties" element={<PropertiesList />} />
                      <Route path="/properties/new" element={<NewProperty />} />
                      <Route path="/properties/:id" element={<PropertyDetail />} />
                      <Route path="/clients" element={<ClientsList />} />
                      <Route path="/proposals" element={<ProposalsList />} />
                      <Route path="/proposals/:id" element={<ProposalDetail />} />
                      <Route path="/contracts" element={<ContractsList />} />
                      <Route path="/contracts/:id" element={<ContractDetail />} />
                      <Route path="/payments" element={<PaymentsList />} />
                      <Route path="/financial" element={<FinancialDashboard />} />
                      <Route path="/crm" element={<CRM />} />
                      <Route path="/admin/errors" element={<ErrorBacklog />} />
                      <Route path="/admin/logs" element={<AdminLogs />} />
                      <Route path="/settings/notifications" element={<NotificationSettings />} />
                      <Route path="/admin/emails" element={<AdminEmails />} />
                    </Route>
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </CRMProvider>
              </FinancialProvider>
            </ContractProvider>
          </ProposalProvider>
        </ClientProvider>
      </PropertyProvider>
    </ChangeHistoryProvider>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <I18nProvider>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/*" element={<ProtectedApp />} />
            </Routes>
            <SentryConsentBanner />
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </I18nProvider>
  </QueryClientProvider>
);

export default App;
