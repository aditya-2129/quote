import { useState, useEffect } from "react";
import { importStepFile } from "@utils/index";
import type { CadImportResult } from "@utils/index";
import { ViewerWorkspace } from "@components/ViewerWorkspace";

declare global {
  interface Window {
    __focusGlobalSearch?: () => void;
  }
}

export function ViewerPage() {
  const [cad, setCad] = useState<CadImportResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      const inField = tag === "input" || tag === "textarea" || tag === "select" || (e.target as HTMLElement)?.isContentEditable;
      if (e.key === "/" && !inField) { e.preventDefault(); window.__focusGlobalSearch?.(); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const handleFile = async (file?: File) => {
    if (!file) return;
    setIsImporting(true);
    try {
      const result = await importStepFile(file);
      setCad(result);
    } catch {
      // import failed — user can retry
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="page">
      <ViewerWorkspace cad={cad} isImporting={isImporting} onFile={handleFile} />
    </div>
  );
}
