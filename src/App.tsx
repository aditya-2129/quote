import { HashRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { Layout } from "@components/Layout";
import { CadProvider } from "@context/CadContext";
import {
  ViewerPage,
  RfqsPage,
  QuotesPage,
  QuoteDetailPage,
  QuoteViewerPage,
  PartsPage,
  CustomersPage,
  AnalyticsPage,
  MaterialsPage,
  MachinesPage,
} from "@pages/index";

function QuoteLayout() {
  return (
    <CadProvider>
      <Outlet />
    </CadProvider>
  );
}

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/quotes" replace />} />
          <Route path="/viewer" element={<ViewerPage />} />
          <Route path="/rfqs" element={<RfqsPage />} />
          <Route path="/quotes" element={<QuotesPage />} />
          <Route path="/quotes/:id" element={<QuoteLayout />}>
            <Route index element={<QuoteDetailPage />} />
            <Route path="viewer" element={<QuoteViewerPage />} />
          </Route>
          <Route path="/parts" element={<PartsPage />} />
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/materials" element={<MaterialsPage />} />
          <Route path="/machines" element={<MachinesPage />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}

export default App;
