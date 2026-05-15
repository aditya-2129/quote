import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Box, Calculator, Share2 } from "lucide-react";
import { useCad } from "@context/CadContext";
import { ViewerWorkspace } from "@components/ViewerWorkspace";

export function QuoteViewerPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { cad, isImporting, importStatus, handleFile } = useCad();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      const inField = tag === "input" || tag === "textarea" || tag === "select" || (e.target as HTMLElement)?.isContentEditable;
      if (inField) return;
      if (e.key.toLowerCase() === "q") navigate(`/quotes/${id}`);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [id, navigate]);

  const subText = cad
    ? `${cad.meshes.length} bodies · ${(cad.geometry.faceCount ?? 0).toLocaleString()} triangles`
    : importStatus;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">{cad ? cad.fileName : "Viewer"}</h1>
          <div className="page-sub">
            <span className="status-dot" />
            <span>{subText}</span>
            <span style={{ color: "var(--text-4)" }}>•</span>
            <span className="quote-num">RFQ-2026-014</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button className="btn sm"><Share2 size={13} /> Share</button>
          <div className="seg">
            <button className="on">
              <Box size={13} /> Viewer <span className="kbd-key" style={{ marginLeft: 6, fontSize: 9, padding: "1px 4px", minWidth: 0 }}>V</span>
            </button>
            <button onClick={() => navigate(`/quotes/${id}`)}>
              <Calculator size={13} /> Quote <span className="kbd-key" style={{ marginLeft: 6, fontSize: 9, padding: "1px 4px", minWidth: 0 }}>Q</span>
            </button>
          </div>
        </div>
      </div>
      <ViewerWorkspace cad={cad} isImporting={isImporting} onFile={handleFile} />
    </div>
  );
}
