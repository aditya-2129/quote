import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "@components/Layout";
import {
  Dashboard,
  RfqsPage,
  QuotesPage,
  PartsPage,
  CustomersPage,
  AnalyticsPage,
  MaterialsPage,
  MachinesPage,
} from "@pages/index";

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/quotes" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/rfqs" element={<RfqsPage />} />
          <Route path="/quotes" element={<QuotesPage />} />
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
