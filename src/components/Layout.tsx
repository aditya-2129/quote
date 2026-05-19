import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { useSidebarCollapsed } from "../hooks/useSidebarCollapsed";

export function Layout() {
  const [collapsed, toggle] = useSidebarCollapsed();
  const location = useLocation();
  const settingsMode = location.pathname === "/settings";

  return (
    <div
      className="app"
      data-sidebar={settingsMode ? "hidden" : collapsed ? "collapsed" : "expanded"}
    >
      <Header />
      {!settingsMode && <Sidebar collapsed={collapsed} onToggle={toggle} />}
      <div className="main">
        <Outlet />
      </div>
    </div>
  );
}
