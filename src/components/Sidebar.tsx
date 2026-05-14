import {
  LayoutDashboard,
  FileText,
  Package,
  Settings,
  Users,
  BarChart3,
  FolderOpen,
  HelpCircle,
} from "lucide-react";
import { useState, type ReactNode } from "react";

interface NavItem {
  id: string;
  label: string;
  icon: ReactNode;
  badge?: number;
}

const navItems: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={18} /> },
  {
    id: "projects",
    label: "Projects",
    icon: <FolderOpen size={18} />,
    badge: 3,
  },
  { id: "quotes", label: "Quotes", icon: <FileText size={18} />, badge: 12 },
  { id: "parts", label: "Parts Library", icon: <Package size={18} /> },
  { id: "customers", label: "Customers", icon: <Users size={18} /> },
  { id: "analytics", label: "Analytics", icon: <BarChart3 size={18} /> },
];

const bottomNavItems: NavItem[] = [
  { id: "settings", label: "Settings", icon: <Settings size={18} /> },
  { id: "help", label: "Help & Support", icon: <HelpCircle size={18} /> },
];

export function Sidebar() {
  const [activeItem, setActiveItem] = useState("dashboard");

  return (
    <aside
      className="flex flex-col border-r bg-[var(--color-bg-secondary)]"
      style={{
        width: "var(--spacing-sidebar)",
        minWidth: "var(--spacing-sidebar)",
        borderColor: "var(--color-border-secondary)",
      }}
    >
      {/* Logo Area */}
      <div
        className="flex items-center gap-3 border-b px-5"
        style={{
          height: "var(--spacing-header)",
          borderColor: "var(--color-border-secondary)",
        }}
      >
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg font-bold text-white"
          style={{
            background:
              "linear-gradient(135deg, var(--color-accent-primary), var(--color-accent-secondary))",
            boxShadow: "var(--shadow-glow)",
          }}
        >
          Q
        </div>
        <div>
          <h1
            className="text-sm font-semibold tracking-wide"
            style={{ color: "var(--color-text-primary)" }}
          >
            QUOTE
          </h1>
          <p
            className="text-[10px] tracking-widest uppercase"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            Industrial Suite
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-1">
          {navItems.map((item, index) => (
            <button
              key={item.id}
              onClick={() => setActiveItem(item.id)}
              className="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-200"
              style={{
                color:
                  activeItem === item.id
                    ? "var(--color-text-primary)"
                    : "var(--color-text-secondary)",
                backgroundColor:
                  activeItem === item.id
                    ? "var(--color-bg-active)"
                    : "transparent",
                animationDelay: `${index * 50}ms`,
              }}
              onMouseEnter={(e) => {
                if (activeItem !== item.id) {
                  e.currentTarget.style.backgroundColor =
                    "var(--color-bg-hover)";
                  e.currentTarget.style.color = "var(--color-text-primary)";
                }
              }}
              onMouseLeave={(e) => {
                if (activeItem !== item.id) {
                  e.currentTarget.style.backgroundColor = "transparent";
                  e.currentTarget.style.color = "var(--color-text-secondary)";
                }
              }}
            >
              <span
                className="transition-colors duration-200"
                style={{
                  color:
                    activeItem === item.id
                      ? "var(--color-accent-primary-hover)"
                      : "inherit",
                }}
              >
                {item.icon}
              </span>
              <span className="font-medium">{item.label}</span>
              {item.badge !== undefined && (
                <span
                  className="ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold"
                  style={{
                    backgroundColor:
                      activeItem === item.id
                        ? "var(--color-accent-primary)"
                        : "var(--color-bg-surface)",
                    color:
                      activeItem === item.id
                        ? "white"
                        : "var(--color-text-secondary)",
                  }}
                >
                  {item.badge}
                </span>
              )}
              {activeItem === item.id && (
                <div
                  className="absolute left-0 h-6 w-[3px] rounded-r-full"
                  style={{
                    backgroundColor: "var(--color-accent-primary)",
                  }}
                />
              )}
            </button>
          ))}
        </div>
      </nav>

      {/* Bottom Navigation */}
      <div
        className="border-t px-3 py-3"
        style={{ borderColor: "var(--color-border-secondary)" }}
      >
        {bottomNavItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveItem(item.id)}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-200"
            style={{
              color:
                activeItem === item.id
                  ? "var(--color-text-primary)"
                  : "var(--color-text-tertiary)",
              backgroundColor:
                activeItem === item.id
                  ? "var(--color-bg-active)"
                  : "transparent",
            }}
            onMouseEnter={(e) => {
              if (activeItem !== item.id) {
                e.currentTarget.style.backgroundColor = "var(--color-bg-hover)";
                e.currentTarget.style.color = "var(--color-text-secondary)";
              }
            }}
            onMouseLeave={(e) => {
              if (activeItem !== item.id) {
                e.currentTarget.style.backgroundColor = "transparent";
                e.currentTarget.style.color = "var(--color-text-tertiary)";
              }
            }}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      {/* User Section */}
      <div
        className="border-t px-4 py-3"
        style={{ borderColor: "var(--color-border-secondary)" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white"
            style={{
              background:
                "linear-gradient(135deg, var(--color-accent-secondary), var(--color-accent-primary))",
            }}
          >
            AD
          </div>
          <div className="flex-1 overflow-hidden">
            <p
              className="truncate text-sm font-medium"
              style={{ color: "var(--color-text-primary)" }}
            >
              Admin User
            </p>
            <p
              className="truncate text-[11px]"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              admin@quote.app
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
