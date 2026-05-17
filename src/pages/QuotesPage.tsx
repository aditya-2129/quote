import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ExternalLink, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { getRootQuotes } from "../db/queries";
import { cleanupDuplicateDraftQuotes, createBlankQuoteWorkflow, deleteQuoteWorkflow } from "../db/quoteWorkflowService";
import type { Quote } from "../db/schema";
import { EmptyState } from "../components/EmptyState";

export function QuotesPage() {
  const [rows, setRows] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  async function refresh() {
    setLoading(true);
    try {
      setRows(await getRootQuotes());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let alive = true;
    getRootQuotes()
      .then(result => {
        if (alive) setRows(result);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, []);

  const filteredRows = rows.filter(row => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return [
      row.quoteNumber,
      row.title,
      row.status,
      row.revision,
      row.currency,
      row.id,
    ].filter(Boolean).some(value => String(value).toLowerCase().includes(needle));
  });

  async function handleCleanupDuplicates() {
    const ok = window.confirm("Remove accidental duplicate untitled draft quotes? The newest copy in each exact duplicate group will be kept.");
    if (!ok) return;
    setActionBusy(true);
    setActionStatus("Cleaning duplicate drafts...");
    try {
      const result = await cleanupDuplicateDraftQuotes();
      await refresh();
      setActionStatus(result.deletedCount > 0
        ? `Removed ${result.deletedCount} duplicate draft${result.deletedCount === 1 ? "" : "s"}.`
        : "No duplicate drafts found.");
    } catch (error) {
      setActionStatus(error instanceof Error ? error.message : "Duplicate cleanup failed.");
    } finally {
      setActionBusy(false);
    }
  }

  async function handleNewQuote() {
    setActionBusy(true);
    setActionStatus("Creating new quote...");
    try {
      const id = await createBlankQuoteWorkflow();
      navigate(`/quotes/${id}`);
    } catch (error) {
      setActionStatus(error instanceof Error ? error.message : "Failed to create quote.");
      setActionBusy(false);
    }
  }

  async function handleDeleteQuote(quote: Quote) {
    const label = quote.quoteNumber || quote.title || quote.id;
    const ok = window.confirm(`Delete quote "${label}"? This removes its parts, operations, and history.`);
    if (!ok) return;
    setActionBusy(true);
    setActionStatus("Deleting quote...");
    try {
      await deleteQuoteWorkflow(quote.id);
      await refresh();
      setActionStatus("Quote deleted.");
    } catch (error) {
      setActionStatus(error instanceof Error ? error.message : "Delete failed.");
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">Quotes</h1>
        <div className="page-sub">{filteredRows.length} shown / {rows.length} total</div>
        <div className="right" style={{ marginLeft: "auto" }}>
          <button className="btn sm" onClick={handleCleanupDuplicates} disabled={actionBusy}>
            <RefreshCw size={14}/> Clean duplicates
          </button>
          <button className="btn primary sm" onClick={() => void handleNewQuote()} disabled={actionBusy}>
            <Plus size={14}/> New Quote
          </button>
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
        <div className="search" style={{ width: 360, maxWidth: "100%" }}>
          <Search size={13} className="ic" />
          <input
            type="text"
            placeholder="Search quotes..."
            value={query}
            onChange={event => setQuery(event.target.value)}
          />
        </div>
        {actionStatus && <span className="muted" style={{ fontSize: 12 }}>{actionStatus}</span>}
      </div>
      <div className="panel quotes-list-panel">
        <div className="panel-head"><div className="title">All Quotes</div></div>
        {loading ? <EmptyState text="Loading..." /> : rows.length === 0 ? (
          <EmptyState text="No quotes yet." />
        ) : filteredRows.length === 0 ? (
          <EmptyState text="No quotes match the search." />
        ) : (
          <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Quote Number</th>
                <th>Rev</th>
                <th>Title</th>
                <th>Status</th>
                <th>Asm Qty</th>
                <th>Total</th>
                <th style={{ width: "96px" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map(r => {
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

                let totalDisplay = "-";
                if (r.costSnapshot) {
                  try {
                    const costObj = typeof r.costSnapshot === "string" ? JSON.parse(r.costSnapshot) : r.costSnapshot;
                    if (costObj && costObj.total !== undefined) {
                      totalDisplay = `${r.currency} ${costObj.total.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                    }
                  } catch {
                    totalDisplay = "-";
                  }
                }

                return (
                  <tr key={r.id} style={{ cursor: "pointer" }} onClick={() => navigate(`/quotes/${r.id}`)}>
                    <td>{r.quoteNumber || <span className="muted">Draft {r.id.slice(0, 8)}</span>}</td>
                    <td>{r.revision}</td>
                    <td>{r.title}</td>
                    <td><span className="status-pill" style={{ background: badgeClass, color: badgeText }}>{r.status}</span></td>
                    <td>{r.assemblyQuantity}</td>
                    <td>{totalDisplay}</td>
                    <td>
                      <div className="actions" onClick={event => event.stopPropagation()}>
                        <button className="icon-btn sm" title="Open quote" onClick={() => navigate(`/quotes/${r.id}`)} disabled={actionBusy}>
                          <ExternalLink size={14} />
                        </button>
                        <button className="icon-btn sm danger" title="Delete quote" onClick={() => void handleDeleteQuote(r)} disabled={actionBusy}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}
