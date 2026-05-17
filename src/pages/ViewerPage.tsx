import { useEffect } from "react";
import { ViewerWorkspace } from "@components/ViewerWorkspace";
import { useCad } from "@context/CadContext";

declare global {
  interface Window {
    __focusGlobalSearch?: () => void;
  }
}

export function ViewerPage() {
  const { cad, isImporting, handleFile } = useCad();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      const inField = tag === "input" || tag === "textarea" || tag === "select" || (e.target as HTMLElement)?.isContentEditable;
      if (e.key === "/" && !inField) { e.preventDefault(); window.__focusGlobalSearch?.(); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="page viewer-page">
      <ViewerWorkspace cad={cad} isImporting={isImporting} onFile={handleFile} />
    </div>
  );
}
