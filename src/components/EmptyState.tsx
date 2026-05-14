import type { ReactNode } from "react";

export function EmptyState({ text, icon }: { text: string; icon?: ReactNode }) {
  return (
    <div className="empty" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "12px" }}>
      {icon && <div style={{ color: "var(--text-4)" }}>{icon}</div>}
      <div>{text}</div>
    </div>
  );
}
