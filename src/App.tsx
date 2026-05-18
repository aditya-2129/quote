import { HashRouter, Routes, Route, Navigate, Outlet, useParams } from "react-router-dom";
import { Layout } from "@components/Layout";
import { CadProvider } from "@context/CadContext";
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
} from "@pages/index";

function QuoteLayout() {
  const { id } = useParams<{ id: string }>();
  return (
    <QuoteStateProvider key={id}>
      <Outlet />
    </QuoteStateProvider>
  );
}

function App() {
  return (
    <HashRouter>
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
        </Route>
      </Routes>
    </HashRouter>
  );
}

export default App;
