import { HashRouter, Routes, Route, Navigate, Outlet, useParams } from "react-router-dom";
import { useEffect } from "react";
import { Layout } from "@components/Layout";
import { AppUpdaterPrompt } from "@components/AppUpdaterPrompt";
import { ErrorBoundary } from "@components/ErrorBoundary";
import { CadProvider } from "@context/CadContext";
import { CatalogProvider } from "@context/CatalogContext";
import { QuoteStateProvider } from "@context/QuoteStateContext";
import {
  ViewerPage,
  QuotesPage,
  QuoteDetailPage,
  CustomersPage,
  BopsPage,
  AnalyticsPage,
  MaterialsPage,
  MachinesPage,
  SettingsPage,
} from "@pages/index";
import { installGlobalCrashReportListeners } from "@utils/crashReports";

function CrashReportListeners() {
  useEffect(() => installGlobalCrashReportListeners(), []);
  return null;
}

function QuoteLayout() {
  const { id } = useParams<{ id: string }>();
  return (
    <CatalogProvider>
      <QuoteStateProvider key={id}>
        <Outlet />
      </QuoteStateProvider>
    </CatalogProvider>
  );
}

function TriggerErrorPage(): never {
  throw new Error("Manual test: TriggerErrorPage triggered a route render error");
}

function App() {
  return (
    <ErrorBoundary>
      <HashRouter>
        <AppUpdaterPrompt />
        <CrashReportListeners />
        <Routes>
          <Route element={<CadProvider><Layout /></CadProvider>}>
            <Route index element={<Navigate to="/quotes" replace />} />
            <Route path="/viewer" element={<ViewerPage />} />
            <Route path="/quotes" element={<QuotesPage />} />
            <Route path="/quotes/:id" element={<QuoteLayout />}>
              <Route index element={<QuoteDetailPage />} />
              <Route path="viewer" element={<Navigate to="/viewer" replace />} />
            </Route>
            <Route path="/customers" element={<CustomersPage />} />
            <Route path="/bops" element={<BopsPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/materials" element={<MaterialsPage />} />
            <Route path="/machines" element={<MachinesPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            {import.meta.env.DEV && (
              <Route path="/trigger-error" element={<TriggerErrorPage />} />
            )}
          </Route>
        </Routes>
      </HashRouter>
    </ErrorBoundary>
  );
}

export default App;

