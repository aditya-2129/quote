import type { ReactNode } from "react";

interface StatCardProps {
  title: string;
  value: string;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon: ReactNode;
}

export function StatCard({
  title,
  value,
  change,
  changeType = "neutral",
  icon,
}: StatCardProps) {
  const changeColor = {
    positive: "var(--color-status-success)",
    negative: "var(--color-status-error)",
    neutral: "var(--color-text-tertiary)",
  }[changeType];

  return (
    <div
      className="group rounded-xl border p-5 transition-all duration-300"
      style={{
        backgroundColor: "var(--color-bg-secondary)",
        borderColor: "var(--color-border-secondary)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--color-border-accent)";
        e.currentTarget.style.boxShadow = "var(--shadow-md)";
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--color-border-secondary)";
        e.currentTarget.style.boxShadow = "none";
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      <div className="flex items-start justify-between">
        <div>
          <p
            className="text-xs font-medium tracking-wider uppercase"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            {title}
          </p>
          <p
            className="mt-2 text-2xl font-bold tracking-tight"
            style={{ color: "var(--color-text-primary)" }}
          >
            {value}
          </p>
          {change && (
            <p
              className="mt-1 text-xs font-medium"
              style={{ color: changeColor }}
            >
              {change}
            </p>
          )}
        </div>
        <div
          className="rounded-lg p-2.5 transition-colors duration-300"
          style={{
            backgroundColor: "var(--color-bg-tertiary)",
            color: "var(--color-accent-primary-hover)",
          }}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}
