import { Package } from "lucide-react";
import { Link } from "react-router-dom";
import { EmptyState } from "../components/EmptyState";

export function PartsPage() {
  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">Parts</h1>
      </div>
      <div className="panel">
        <div className="panel-head"><div className="title">Parts Management</div></div>
        <EmptyState 
          icon={<Package size={24} />}
          text="Parts are managed inside each quote. Pick a quote from the Quotes page to edit its BOM." 
        />
        <div style={{ textAlign: "center", paddingBottom: "40px" }}>
          <Link to="/quotes" className="btn primary">Go to Quotes</Link>
        </div>
      </div>
    </div>
  );
}
