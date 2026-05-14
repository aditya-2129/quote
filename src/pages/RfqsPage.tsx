import { useState, useEffect } from "react";
import { Inbox, Plus } from "lucide-react";
import { getAllRfqs } from "../db/queries";
import type { Rfq } from "../db/schema";
import { EmptyState } from "../components/EmptyState";

export function RfqsPage() {
  const [rows, setRows] = useState<Rfq[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAllRfqs().then(r => { setRows(r); setLoading(false); });
  }, []);

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">RFQs</h1>
        <div className="page-sub">{rows.length} total</div>
        <div className="right" style={{ marginLeft: "auto" }}>
          <button className="btn primary sm"><Plus size={14}/> New RFQ</button>
        </div>
      </div>
      <div className="panel">
        <div className="panel-head"><div className="title">All RFQs</div></div>
        {loading ? <EmptyState text="Loading…" />
          : rows.length === 0 ? <EmptyState text="No RFQs yet." icon={<Inbox size={24}/>} />
          : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ref</th>
                  <th>Title</th>
                  <th>Customer ID</th>
                  <th>Status</th>
                  <th>Received</th>
                  <th>Due</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  let badgeClass = "var(--panel-3)";
                  let badgeText = "var(--text-2)";
                  switch (r.status) {
                    case "new":
                    case "reviewing": badgeClass = "var(--warning-soft)"; badgeText = "var(--warning)"; break;
                    case "quoted": badgeClass = "var(--accent-soft)"; badgeText = "var(--accent-text)"; break;
                    case "accepted": badgeClass = "var(--success-soft)"; badgeText = "var(--success)"; break;
                    case "rejected":
                    case "closed": badgeClass = "var(--danger-soft)"; badgeText = "var(--danger)"; break;
                  }
                  return (
                    <tr key={r.id}>
                      <td>{r.referenceNumber}</td>
                      <td>{r.title}</td>
                      <td>{r.customerId}</td>
                      <td><span className="status-pill" style={{ background: badgeClass, color: badgeText }}>{r.status}</span></td>
                      <td>{r.receivedAt ? new Date(r.receivedAt).toLocaleDateString() : "—"}</td>
                      <td>{r.dueDate ? new Date(r.dueDate).toLocaleDateString() : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
      </div>
    </div>
  );
}
