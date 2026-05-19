import { memo, useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { QuotePreviewViewer, type QuotePreviewViewerHandle } from "@components/QuotePreviewViewer";
import type { CadImportResult } from "@utils/index";
import { Box, ExternalLink } from "lucide-react";

export function QuotePreview({ onOpenViewer }: { onOpenViewer?: () => void }) {
  return (
    <div className="canvas" style={{ flex: 1, minHeight: 0, display: "grid", placeItems: "center" }}>
      <div className="canvas-grid" />
      <div className="empty-state quote-preview-empty">
        <div className="es-ic"><Box size={20} /></div>
        <div className="es-title">No CAD model attached</div>
        <div className="es-hint" style={{ maxWidth: 280, margin: "4px auto 0" }}>Import a STEP file in the viewer to see the 3D model here. Manual parts can be added below without one.</div>
        {onOpenViewer && <div style={{ marginTop: 12 }}><button className="btn sm" onClick={onOpenViewer}><ExternalLink size={12} /> Open viewer</button></div>}
      </div>
    </div>
  );
}

export const QuoteCadPreview = memo(function QuoteCadPreview({
  model,
  selectedId,
  selectedMeshIds,
  showAll,
  viewerRef: externalViewerRef,
}: {
  model: CadImportResult;
  selectedId: string | null;
  selectedMeshIds: string[];
  showAll: boolean;
  viewerRef?: MutableRefObject<QuotePreviewViewerHandle | null>;
}) {
  const localViewerRef = useRef<QuotePreviewViewerHandle | null>(null);
  const viewerRef = externalViewerRef ?? localViewerRef;
  const isolate = !showAll && selectedId !== null && selectedMeshIds.length > 0;
  const selectedMeshIdSet = useMemo(() => new Set(selectedMeshIds), [selectedMeshIds]);
  const hiddenMeshIds = useMemo(() => {
    if (!isolate) return new Set<string>();
    return new Set(model.meshes.filter(m => !selectedMeshIdSet.has(m.id)).map(m => m.id));
  }, [isolate, selectedMeshIdSet, model]);
  useEffect(() => {
    const id = window.setTimeout(() => viewerRef.current?.fit(isolate ? selectedMeshIds : undefined), 60);
    return () => window.clearTimeout(id);
  }, [isolate, selectedMeshIds, viewerRef]);
  return <div className="canvas" style={{ flex: 1, minHeight: 0, position: "relative" }}><QuotePreviewViewer ref={viewerRef} model={model} selectedMeshIds={selectedMeshIdSet} hiddenMeshIds={hiddenMeshIds} /></div>;
});
