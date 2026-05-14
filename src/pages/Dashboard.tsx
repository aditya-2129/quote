import {
  FileText,
  Package,
  Users,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowUpRight,
} from "lucide-react";
import { StatCard } from "@components/StatCard";

const recentActivity = [
  {
    id: 1,
    action: "Quote #1247 submitted",
    project: "CNC Housing Assembly",
    time: "2 min ago",
    status: "pending" as const,
  },
  {
    id: 2,
    action: "Part revision approved",
    project: "Hydraulic Manifold Block",
    time: "15 min ago",
    status: "success" as const,
  },
  {
    id: 3,
    action: "Material cost updated",
    project: "Precision Gear Set",
    time: "1 hr ago",
    status: "info" as const,
  },
  {
    id: 4,
    action: "Quote #1245 expired",
    project: "Steel Bracket Assembly",
    time: "3 hr ago",
    status: "warning" as const,
  },
  {
    id: 5,
    action: "New RFQ received",
    project: "Aluminum Enclosure",
    time: "5 hr ago",
    status: "pending" as const,
  },
];

const statusColors = {
  pending: "var(--color-status-info)",
  success: "var(--color-status-success)",
  warning: "var(--color-status-warning)",
  info: "var(--color-accent-primary)",
};

export function Dashboard() {
  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-xl font-bold tracking-tight"
            style={{ color: "var(--color-text-primary)" }}
          >
            Dashboard
          </h1>
          <p
            className="mt-1 text-sm"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Overview of your quoting workspace
          </p>
        </div>
        <button
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-all duration-200"
          style={{
            background:
              "linear-gradient(135deg, var(--color-accent-primary), var(--color-accent-secondary))",
            boxShadow: "var(--shadow-glow)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translateY(-1px)";
            e.currentTarget.style.boxShadow =
              "0 0 30px var(--color-accent-glow)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "var(--shadow-glow)";
          }}
        >
          New Quote
          <ArrowUpRight size={14} />
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Active Quotes"
          value="24"
          change="+12% from last month"
          changeType="positive"
          icon={<FileText size={20} />}
        />
        <StatCard
          title="Parts in Library"
          value="1,847"
          change="+48 this week"
          changeType="positive"
          icon={<Package size={20} />}
        />
        <StatCard
          title="Customers"
          value="156"
          change="+3 new this month"
          changeType="positive"
          icon={<Users size={20} />}
        />
        <StatCard
          title="Win Rate"
          value="68%"
          change="-2% from last month"
          changeType="negative"
          icon={<TrendingUp size={20} />}
        />
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Recent Activity */}
        <div
          className="col-span-2 rounded-xl border p-5"
          style={{
            backgroundColor: "var(--color-bg-secondary)",
            borderColor: "var(--color-border-secondary)",
          }}
        >
          <div className="mb-4 flex items-center justify-between">
            <h2
              className="text-sm font-semibold tracking-wider uppercase"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Recent Activity
            </h2>
            <button
              className="text-xs font-medium transition-colors duration-200"
              style={{ color: "var(--color-accent-primary-hover)" }}
            >
              View All
            </button>
          </div>
          <div className="space-y-1">
            {recentActivity.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-4 rounded-lg px-3 py-3 transition-colors duration-200"
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor =
                    "var(--color-bg-tertiary)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                  style={{
                    backgroundColor: "var(--color-bg-tertiary)",
                  }}
                >
                  {item.status === "success" ? (
                    <CheckCircle2
                      size={14}
                      style={{ color: statusColors[item.status] }}
                    />
                  ) : item.status === "warning" ? (
                    <AlertCircle
                      size={14}
                      style={{ color: statusColors[item.status] }}
                    />
                  ) : (
                    <Clock
                      size={14}
                      style={{ color: statusColors[item.status] }}
                    />
                  )}
                </div>
                <div className="flex-1 overflow-hidden">
                  <p
                    className="truncate text-sm font-medium"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    {item.action}
                  </p>
                  <p
                    className="truncate text-xs"
                    style={{ color: "var(--color-text-tertiary)" }}
                  >
                    {item.project}
                  </p>
                </div>
                <span
                  className="shrink-0 text-xs"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {item.time}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div
          className="rounded-xl border p-5"
          style={{
            backgroundColor: "var(--color-bg-secondary)",
            borderColor: "var(--color-border-secondary)",
          }}
        >
          <h2
            className="mb-4 text-sm font-semibold tracking-wider uppercase"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Quick Actions
          </h2>
          <div className="space-y-2">
            {[
              { label: "Create New Quote", desc: "Start a new quotation" },
              { label: "Import STEP File", desc: "Upload a 3D model" },
              { label: "Add Customer", desc: "Register a new client" },
              { label: "Generate Report", desc: "Export analytics data" },
            ].map((action) => (
              <button
                key={action.label}
                className="flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-all duration-200"
                style={{
                  backgroundColor: "var(--color-bg-tertiary)",
                  borderColor: "var(--color-border-secondary)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor =
                    "var(--color-border-accent)";
                  e.currentTarget.style.backgroundColor =
                    "var(--color-bg-hover)";
                  e.currentTarget.style.transform = "translateX(4px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor =
                    "var(--color-border-secondary)";
                  e.currentTarget.style.backgroundColor =
                    "var(--color-bg-tertiary)";
                  e.currentTarget.style.transform = "translateX(0)";
                }}
              >
                <div>
                  <p
                    className="text-sm font-medium"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    {action.label}
                  </p>
                  <p
                    className="text-xs"
                    style={{ color: "var(--color-text-tertiary)" }}
                  >
                    {action.desc}
                  </p>
                </div>
                <ArrowUpRight
                  size={14}
                  className="ml-auto"
                  style={{ color: "var(--color-text-muted)" }}
                />
              </button>
            ))}
          </div>

          {/* System Status */}
          <div
            className="mt-5 rounded-lg border p-4"
            style={{
              borderColor: "var(--color-border-secondary)",
              backgroundColor: "var(--color-bg-primary)",
            }}
          >
            <h3
              className="mb-3 text-xs font-semibold tracking-wider uppercase"
              style={{ color: "var(--color-text-muted)" }}
            >
              System Status
            </h3>
            <div className="space-y-2">
              {[
                { label: "API", status: "Operational" },
                { label: "Database", status: "Operational" },
                { label: "File Storage", status: "Operational" },
              ].map((service) => (
                <div
                  key={service.label}
                  className="flex items-center justify-between"
                >
                  <span
                    className="text-xs"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    {service.label}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <div
                      className="h-1.5 w-1.5 rounded-full"
                      style={{
                        backgroundColor: "var(--color-status-success)",
                        boxShadow: "0 0 4px var(--color-status-success)",
                      }}
                    />
                    <span
                      className="text-[10px] font-medium"
                      style={{ color: "var(--color-status-success)" }}
                    >
                      {service.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
