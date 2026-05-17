import {
  Box,
  Inbox,
  FileText,
  Package,
  Users,
  BarChart3,
  Gem,
  Settings2,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { NavLink } from "react-router-dom";

const PRIMARY_NAV = [
  { id: "viewer", to: "/viewer", label: "Viewer", icon: Box },
  { id: "rfqs",      to: "/rfqs",      label: "RFQs",      icon: Inbox,      badge: 8 },
  { id: "quotes",    to: "/quotes",    label: "Quotes",    icon: FileText,   badge: 12 },
  { id: "parts",     to: "/parts",     label: "Parts",     icon: Package },
  { id: "customers", to: "/customers", label: "Customers", icon: Users },
  { id: "bops",      to: "/bops",      label: "BOPs",      icon: Package },
  { id: "analytics", to: "/analytics", label: "Analytics", icon: BarChart3 },
];

const SECONDARY_NAV = [
  { id: "library",  to: "/materials", label: "Material library",  icon: Gem },
  { id: "machines", to: "/machines",  label: "Machines & rates",  icon: Settings2 },
];

interface SidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  return (
    <aside className="sidebar">
      <button
        className="sb-collapsor"
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        onClick={onToggle}
      >
        {collapsed ? <PanelLeftOpen size={13} /> : <PanelLeftClose size={13} />}
      </button>

      <div className="sb-section">
        <div className="sb-section-label">Workspace</div>
        <nav className="sb-nav">
          {PRIMARY_NAV.map((it) => {
            const Icon = it.icon;
            return (
              <NavLink key={it.id} className={({ isActive }) => `sb-item ${isActive ? "active" : ""}`} to={it.to} title={collapsed ? it.label : undefined}>
                <span className="ic"><Icon size={15} /></span>
                <span className="label">{it.label}</span>
                {it.badge !== undefined && <span className="badge">{it.badge}</span>}
              </NavLink>
            );
          })}
        </nav>
      </div>

      <div className="sb-section">
        <div className="sb-section-label">Configure</div>
        <nav className="sb-nav">
          {SECONDARY_NAV.map((it) => {
            const Icon = it.icon;
            return (
              <NavLink key={it.id} className={({ isActive }) => `sb-item ${isActive ? "active" : ""}`} to={it.to} title={collapsed ? it.label : undefined}>
                <span className="ic"><Icon size={15} /></span>
                <span className="label">{it.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>

      <div className="sb-spacer" />
    </aside>
  );
}
