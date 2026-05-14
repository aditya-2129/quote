import { useState, useEffect } from "react";
import { Users, Plus } from "lucide-react";
import { getAllCustomers } from "../db/queries";
import type { Customer } from "../db/schema";
import { EmptyState } from "../components/EmptyState";

export function CustomersPage() {
  const [rows, setRows] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAllCustomers().then(r => { setRows(r); setLoading(false); });
  }, []);

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">Customers</h1>
        <div className="page-sub">{rows.length} total</div>
        <div className="right" style={{ marginLeft: "auto" }}>
          <button className="btn primary sm"><Plus size={14}/> New Customer</button>
        </div>
      </div>
      <div className="panel">
        <div className="panel-head"><div className="title">All Customers</div></div>
        {loading ? <EmptyState text="Loading…" />
          : rows.length === 0 ? <EmptyState text="No customers yet." icon={<Users size={24}/>} />
          : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Company</th>
                  <th>Email</th>
                  <th>Phone</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td>{r.company}</td>
                    <td>{r.email}</td>
                    <td>{r.phone}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </div>
  );
}
