import { useState, useEffect } from "react";
import { Settings2, Plus } from "lucide-react";
import { getAllMachines } from "../db/queries";
import type { Machine } from "../db/schema";
import { EmptyState } from "../components/EmptyState";

export function MachinesPage() {
  const [rows, setRows] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAllMachines().then(r => { setRows(r); setLoading(false); });
  }, []);

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">Machines & Rates</h1>
        <div className="page-sub">{rows.length} total</div>
        <div className="right" style={{ marginLeft: "auto" }}>
          <button className="btn primary sm"><Plus size={14}/> New Machine</button>
        </div>
      </div>
      <div className="panel">
        <div className="panel-head"><div className="title">All Machines</div></div>
        {loading ? <EmptyState text="Loading…" />
          : rows.length === 0 ? <EmptyState text="No machines yet." icon={<Settings2 size={24}/>} />
          : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Short Name</th>
                  <th>Category</th>
                  <th>Rate/Hour</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td>{r.shortName}</td>
                    <td>{r.category}</td>
                    <td>$ {r.ratePerHour}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </div>
  );
}
