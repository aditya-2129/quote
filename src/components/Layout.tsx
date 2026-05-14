import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { useSidebarCollapsed } from "../hooks/useSidebarCollapsed";

export function Layout() {
  const [collapsed, toggle] = useSidebarCollapsed();

  return (
    <div className="app" data-sidebar={collapsed ? "collapsed" : "expanded"}>
      <Header />
      <Sidebar collapsed={collapsed} onToggle={toggle} />
      <div className="main">
        <Outlet />
      </div>
    </div>
  );
}
