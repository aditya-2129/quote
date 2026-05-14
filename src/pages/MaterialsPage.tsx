import { useState, useEffect } from "react";
import { Gem, Plus } from "lucide-react";
import { getAllMaterials } from "../db/queries";
import type { Material } from "../db/schema";
import { EmptyState } from "../components/EmptyState";

export function MaterialsPage() {
  const [rows, setRows] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAllMaterials().then(r => { setRows(r); setLoading(false); });
  }, []);

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">Material Library</h1>
        <div className="page-sub">{rows.length} total</div>
        <div className="right" style={{ marginLeft: "auto" }}>
          <button className="btn primary sm"><Plus size={14}/> New Material</button>
        </div>
      </div>
      <div className="panel">
        <div className="panel-head"><div className="title">All Materials</div></div>
        {loading ? <EmptyState text="Loading…" />
          : rows.length === 0 ? <EmptyState text="No materials yet." icon={<Gem size={24}/>} />
          : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Swatch</th>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Density (kg/m³)</th>
                  <th>Cost/kg</th>
                  <th>Machinability</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <td>
                      <div style={{ width: "16px", height: "16px", borderRadius: "3px", backgroundColor: r.colorHex || "#ccc", border: "1px solid var(--border-strong)" }} title={r.colorHex || "default"} />
                    </td>
                    <td style={{ fontWeight: 500 }}>{r.name}</td>
                    <td>{r.category}</td>
                    <td>{r.densityKgPerM3}</td>
                    <td>{r.currency} {r.costPerKg}</td>
                    <td>{r.machinability}/5</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </div>
  );
}
