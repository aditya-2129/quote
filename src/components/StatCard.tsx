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
  return (
    <article className="stat-card">
      <div className="stat-card__body">
        <div>
          <p className="stat-card__title">{title}</p>
          <p className="stat-card__value">{value}</p>
          {change ? <p className={`stat-card__change stat-card__change--${changeType}`}>{change}</p> : null}
        </div>
        <div className="stat-card__icon">{icon}</div>
      </div>
    </article>
  );
}
