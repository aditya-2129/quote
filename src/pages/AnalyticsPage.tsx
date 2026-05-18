import { useEffect, useState } from "react";
import { FileText, Users, CheckCircle2 } from "lucide-react";
import { getRootQuotes, getAllCustomers } from "../db/queries";
import { StatCard } from "../components/StatCard";

export function AnalyticsPage() {
  const [counts, setCounts] = useState({ drafts: 0, won: 0, customers: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    Promise.all([getRootQuotes(), getAllCustomers()])
      .then(([quotes, customers]) => {
        if (!active) return;
        setCounts({
          drafts: quotes.filter((q) => q.status === "draft").length,
          won: quotes.filter((q) => q.status === "won").length,
          customers: customers.length,
        });
        setError(null);
      })
      .catch(() => {
        if (!active) return;
        setError("Unable to load analytics.");
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">Analytics</h1>
      </div>

      {loading ? (
        <div className="empty">Loading analytics...</div>
      ) : error ? (
        <div className="quote-page-error">
          <span>{error}</span>
        </div>
      ) : (
        <div className="analytics-grid">
          <StatCard title="Quotes in Draft" value={counts.drafts.toString()} icon={<FileText size={20} />} />
          <StatCard
            title="Quotes Won"
            value={counts.won.toString()}
            icon={<CheckCircle2 size={20} />}
            change="Accepted"
            changeType="positive"
          />
          <StatCard title="Customers" value={counts.customers.toString()} icon={<Users size={20} />} />
        </div>
      )}
    </div>
  );
}
