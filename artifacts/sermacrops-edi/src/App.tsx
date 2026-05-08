import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import NotFound from "@/pages/not-found";

import DashboardPage from "@/pages/dashboard";
import TransactionsPage from "@/pages/transactions";
import PurchaseOrdersPage from "@/pages/purchase-orders";
import InventoryPage from "@/pages/inventory";
import PartnersPage from "@/pages/partners";
import CsvUploadPage from "@/pages/csv-upload";
import { setBaseUrl } from "@workspace/api-client-react";

const queryClient = new QueryClient();

//base URL for the API client
setBaseUrl('http://localhost:8080');

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={DashboardPage} />
        <Route path="/transactions" component={TransactionsPage} />
        <Route path="/purchase-orders" component={PurchaseOrdersPage} />
        <Route path="/inventory" component={InventoryPage} />
        <Route path="/partners" component={PartnersPage} />
        <Route path="/csv-upload" component={CsvUploadPage} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
