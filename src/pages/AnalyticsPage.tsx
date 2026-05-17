import { useState, useEffect } from "react";
import { Inbox, FileText, Users, CheckCircle2 } from "lucide-react";
import { getAllRfqs, getRootQuotes, getAllCustomers } from "../db/queries";
import { StatCard } from "../components/StatCard";

export function AnalyticsPage() {
  const [counts, setCounts] = useState({ rfqs: 0, drafts: 0, won: 0, customers: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getAllRfqs(), getRootQuotes(), getAllCustomers()]).then(([rfqs, quotes, customers]) => {
      setCounts({
        rfqs: rfqs.filter(r => r.status === "new" || r.status === "reviewing").length,
        drafts: quotes.filter(q => q.status === "draft").length,
        won: quotes.filter(q => q.status === "won").length,
        customers: customers.length
      });
      setLoading(false);
    });
  }, []);

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">Analytics</h1>
      </div>
      <div className="panel" style={{ padding: "20px", border: "none", background: "transparent" }}>
        {loading ? (
          <div className="empty" style={{ padding: "40px 20px", textAlign: "center" }}>Loading metrics...</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px" }}>
            <StatCard 
              title="Open Inquiries"
              value={counts.rfqs.toString()} 
              icon={<Inbox size={20} />} 
              change="Needs review"
            />
            <StatCard 
              title="Quotes in Draft" 
              value={counts.drafts.toString()} 
              icon={<FileText size={20} />} 
            />
            <StatCard 
              title="Quotes Won" 
              value={counts.won.toString()} 
              icon={<CheckCircle2 size={20} />} 
              changeType="positive"
              change="Accepted"
            />
            <StatCard 
              title="Customers" 
              value={counts.customers.toString()} 
              icon={<Users size={20} />} 
            />
          </div>
        )}
      </div>
    </div>
  );
}
