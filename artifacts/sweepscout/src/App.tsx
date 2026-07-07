import { Redirect, Route, Router as WouterRouter, Switch } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import DashboardPage from "@/pages/dashboard";
import SweepstakesPage from "@/pages/sweepstakes";
import DiscoveryPage from "@/pages/discovery";
import QueuePage from "@/pages/queue";
import EntriesPage from "@/pages/entries";
import SpamSourcesPage from "@/pages/spam-sources";
import RoiPage from "@/pages/roi";
import EntryPrefillQueuePage from "@/pages/entries-queue";
import EntryReviewPage from "@/pages/entry-review";
import ScoringPage from "@/pages/scoring";
import ExtractionPage from "@/pages/extraction";
import SettingsPage from "@/pages/settings";
import AdminPage from "@/pages/admin";
import VaultPage from "@/pages/vault";
import NotFound from "@/pages/not-found";

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
      <Route path="/">{() => <Redirect to="/dashboard" />}</Route>

      <Route path="/dashboard" component={DashboardPage} />
      <Route path="/dashboard/sweepstakes" component={SweepstakesPage} />
      <Route path="/dashboard/discovery" component={DiscoveryPage} />
      <Route path="/dashboard/queue" component={QueuePage} />
      <Route path="/dashboard/entries/queue" component={EntryPrefillQueuePage} />
      <Route path="/dashboard/entries/:id/review" component={EntryReviewPage} />
      <Route path="/dashboard/entries" component={EntriesPage} />
      <Route path="/dashboard/spam-sources" component={SpamSourcesPage} />
      <Route path="/dashboard/roi" component={RoiPage} />
      <Route path="/dashboard/settings" component={SettingsPage} />
      <Route path="/dashboard/admin" component={AdminPage} />

      <Route path="/scoring" component={ScoringPage} />
      <Route path="/extraction" component={ExtractionPage} />
      <Route path="/vault" component={VaultPage} />

      <Route path="/sweepstakes">{() => <Redirect to="/dashboard/sweepstakes" />}</Route>
      <Route path="/discovery">{() => <Redirect to="/dashboard/discovery" />}</Route>
      <Route path="/queue">{() => <Redirect to="/dashboard/queue" />}</Route>
      <Route path="/entries">{() => <Redirect to="/dashboard/entries" />}</Route>
      <Route path="/spam-sources">{() => <Redirect to="/dashboard/spam-sources" />}</Route>
      <Route path="/roi">{() => <Redirect to="/dashboard/roi" />}</Route>
      <Route path="/settings">{() => <Redirect to="/dashboard/settings" />}</Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <Router />
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
