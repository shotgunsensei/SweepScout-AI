import { Redirect, Route, Router as WouterRouter, Switch } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import HomePage from "@/pages/home";
import DashboardPage from "@/pages/dashboard";
import SweepstakesPage from "@/pages/sweepstakes";
import SweepstakesDetailPage from "@/pages/sweepstakes-detail";
import DiscoveryPage from "@/pages/discovery";
import DailyWorkflowPage from "@/pages/daily-workflow";
import ImportsPage from "@/pages/imports";
import AssistantPage from "@/pages/assistant";
import EntriesPage from "@/pages/entries";
import HangarPage from "@/pages/hangar";
import SpamSourcesPage from "@/pages/spam-sources";
import RoiPage from "@/pages/roi";
import ReportsPage from "@/pages/reports";
import ScoringPage from "@/pages/scoring";
import ExtractionPage from "@/pages/extraction";
import SettingsPage from "@/pages/settings";
import AdminPage from "@/pages/admin";
import BillingPage from "@/pages/billing";
import PricingPage from "@/pages/pricing";
import AlertsPage from "@/pages/alerts";
import NotFound from "@/pages/not-found";
import OnboardingPage from "@/pages/onboarding";
import { AuthCallbackPage, ForgotPasswordPage, LoginPage, ResetPasswordPage, SignupPage } from "@/pages/auth";
import { AuthProvider, ProtectedRoute } from "@/lib/auth";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />

      <Route path="/login" component={LoginPage} />
      <Route path="/signup" component={SignupPage} />
      <Route path="/pricing" component={PricingPage} />
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      <Route path="/reset-password" component={ResetPasswordPage} />
      <Route path="/auth/callback" component={AuthCallbackPage} />
      <Route path="/onboarding">{() => <ProtectedRoute><OnboardingPage /></ProtectedRoute>}</Route>

      <Route path="/dashboard">{() => <ProtectedRoute><DashboardPage /></ProtectedRoute>}</Route>
      <Route path="/dashboard/sweepstakes/:id">{() => <ProtectedRoute><SweepstakesDetailPage /></ProtectedRoute>}</Route>
      <Route path="/dashboard/sweepstakes">{() => <ProtectedRoute><SweepstakesPage /></ProtectedRoute>}</Route>
      <Route path="/dashboard/hangar">{() => <ProtectedRoute><HangarPage /></ProtectedRoute>}</Route>
      <Route path="/dashboard/discovery">{() => <ProtectedRoute><DiscoveryPage /></ProtectedRoute>}</Route>
      <Route path="/dashboard/imports">{() => <ProtectedRoute><ImportsPage /></ProtectedRoute>}</Route>
      <Route path="/dashboard/assistant">{() => <ProtectedRoute><AssistantPage /></ProtectedRoute>}</Route>
      <Route path="/dashboard/daily">{() => <ProtectedRoute><DailyWorkflowPage /></ProtectedRoute>}</Route>
      <Route path="/dashboard/queue">{() => <Redirect to="/dashboard/entries" />}</Route>
      <Route path="/dashboard/mobile">{() => <Redirect to="/dashboard" />}</Route>
      <Route path="/dashboard/entries/queue">{() => <Redirect to="/dashboard/entries" />}</Route>
      <Route path="/dashboard/entries/:id/review">{() => <Redirect to="/dashboard/entries" />}</Route>
      <Route path="/dashboard/entries">{() => <ProtectedRoute><EntriesPage /></ProtectedRoute>}</Route>
      <Route path="/dashboard/spam-sources">{() => <ProtectedRoute><SpamSourcesPage /></ProtectedRoute>}</Route>
      <Route path="/dashboard/roi">{() => <ProtectedRoute><RoiPage /></ProtectedRoute>}</Route>
      <Route path="/dashboard/reports">{() => <ProtectedRoute><ReportsPage /></ProtectedRoute>}</Route>
      <Route path="/dashboard/settings">{() => <ProtectedRoute><SettingsPage /></ProtectedRoute>}</Route>
      <Route path="/dashboard/billing">{() => <ProtectedRoute><BillingPage /></ProtectedRoute>}</Route>
      <Route path="/dashboard/alerts">{() => <ProtectedRoute><AlertsPage /></ProtectedRoute>}</Route>
      <Route path="/dashboard/admin">{() => <ProtectedRoute><AdminPage /></ProtectedRoute>}</Route>

      <Route path="/scoring">{() => <ProtectedRoute><ScoringPage /></ProtectedRoute>}</Route>
      <Route path="/extraction">{() => <ProtectedRoute><ExtractionPage /></ProtectedRoute>}</Route>
      <Route path="/vault">{() => <Redirect to="/dashboard/settings" />}</Route>

      <Route path="/sweepstakes">{() => <Redirect to="/dashboard/sweepstakes" />}</Route>
      <Route path="/home">{() => <Redirect to="/" />}</Route>
      <Route path="/discovery">{() => <Redirect to="/dashboard/discovery" />}</Route>
      <Route path="/imports">{() => <Redirect to="/dashboard/imports" />}</Route>
      <Route path="/assistant">{() => <Redirect to="/dashboard/assistant" />}</Route>
      <Route path="/daily">{() => <Redirect to="/dashboard/daily" />}</Route>
      <Route path="/mobile">{() => <Redirect to="/dashboard" />}</Route>
      <Route path="/queue">{() => <Redirect to="/dashboard/queue" />}</Route>
      <Route path="/entries">{() => <Redirect to="/dashboard/entries" />}</Route>
      <Route path="/spam-sources">{() => <Redirect to="/dashboard/spam-sources" />}</Route>
      <Route path="/roi">{() => <Redirect to="/dashboard/roi" />}</Route>
      <Route path="/reports">{() => <Redirect to="/dashboard/reports" />}</Route>
      <Route path="/settings">{() => <Redirect to="/dashboard/settings" />}</Route>
      <Route path="/alerts">{() => <Redirect to="/dashboard/alerts" />}</Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
