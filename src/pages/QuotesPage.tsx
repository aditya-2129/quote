import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { getRootQuotes } from "../db/queries";
import type { Quote } from "../db/schema";
import { EmptyState } from "../components/EmptyState";

export function QuotesPage() {
  const [rows, setRows] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    getRootQuotes().then(r => { setRows(r); setLoading(false); });
  }, []);

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">Quotes</h1>
        <div className="page-sub">{rows.length} total</div>
        <div className="right" style={{ marginLeft: "auto" }}>
          <button className="btn primary sm"><Plus size={14}/> New Quote</button>
        </div>
      </div>
      <div className="panel">
        <div className="panel-head"><div className="title">All Quotes</div></div>
        {loading ? <EmptyState text="Loading…" /> : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Quote Number</th>
                  <th>Rev</th>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Asm Qty</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ cursor: "pointer" }} onClick={() => navigate("/quotes/demo")}>
                  <td>RFQ-2026-014</td>
                  <td>C</td>
                  <td>Pump Manifold v3</td>
                  <td><span className="status-pill" style={{ background: "var(--panel-3)", color: "var(--text-2)" }}>draft</span></td>
                  <td>25</td>
                  <td>₹51,919.73</td>
                </tr>
                {rows.map(r => {
                  let badgeClass = "var(--panel-3)";
                  let badgeText = "var(--text-2)";
                  switch (r.status) {
                    case "draft": badgeClass = "var(--panel-3)"; badgeText = "var(--text-2)"; break;
                    case "review": badgeClass = "var(--warning-soft)"; badgeText = "var(--warning)"; break;
                    case "sent": badgeClass = "var(--accent-soft)"; badgeText = "var(--accent-text)"; break;
                    case "won": badgeClass = "var(--success-soft)"; badgeText = "var(--success)"; break;
                    case "lost":
                    case "expired": badgeClass = "var(--danger-soft)"; badgeText = "var(--danger)"; break;
                  }
                  
                  // costSnapshot might be a stringified JSON if it's stored as JSON in sqlite, or an object. Let's safely extract it.
                  let totalDisplay = "—";
                  if (r.costSnapshot) {
                    try {
                      const costObj = typeof r.costSnapshot === "string" ? JSON.parse(r.costSnapshot) : r.costSnapshot;
                      if (costObj && costObj.total !== undefined) {
                        totalDisplay = `${r.currency} ${costObj.total.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                      }
                    } catch (e) {
                      // ignore parse errors
                    }
                  }

                  return (
                    <tr key={r.id} style={{ cursor: "pointer" }} onClick={() => navigate(`/quotes/${r.id}`)}>
                      <td>{r.quoteNumber}</td>
                      <td>{r.revision}</td>
                      <td>{r.title}</td>
                      <td><span className="status-pill" style={{ background: badgeClass, color: badgeText }}>{r.status}</span></td>
                      <td>{r.assemblyQuantity}</td>
                      <td>{totalDisplay}</td>
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
