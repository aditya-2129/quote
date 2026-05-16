import { createContext, useContext, useCallback, useState, type ReactNode } from "react";
import { importStepFile, importStepUrl } from "@utils/index";
import type { CadImportResult } from "@utils/index";

interface CadCtx {
  cad: CadImportResult | null;
  isImporting: boolean;
  importStatus: string;
  pendingHandoff: boolean;
  handleFile: (file?: File) => Promise<void>;
  handleTestFile: (fileName: string) => Promise<void>;
  requestHandoff: () => void;
  consumeHandoff: () => CadImportResult | null;
}

const CadContext = createContext<CadCtx | null>(null);

export function CadProvider({ children }: { children: ReactNode }) {
  const [cad, setCad] = useState<CadImportResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setStatus] = useState("Import a STEP file to get started");
  const [pendingHandoff, setPendingHandoff] = useState(false);

  const handleFile = async (file?: File) => {
    if (!file) return;
    setIsImporting(true);
    setStatus(`Importing ${file.name}`);
    try {
      const result = await importStepFile(file);
      setCad(result);
      setStatus("STEP geometry imported");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Import failed");
    } finally {
      setIsImporting(false);
    }
  };

  const handleTestFile = async (fileName: string) => {
    setIsImporting(true);
    setStatus(`Loading ${fileName}`);
    try {
      const result = await importStepUrl(fileName, `/test_files/${encodeURIComponent(fileName)}`);
      setCad(result);
      setStatus("Test file imported");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Import failed");
    } finally {
      setIsImporting(false);
    }
  };

  const requestHandoff = useCallback(() => setPendingHandoff(true), []);

  const consumeHandoff = useCallback((): CadImportResult | null => {
    setPendingHandoff(false);
    return cad;
  }, [cad]);

  return (
    <CadContext.Provider value={{ cad, isImporting, importStatus, pendingHandoff, handleFile, handleTestFile, requestHandoff, consumeHandoff }}>
      {children}
    </CadContext.Provider>
  );
}

export function useCad(): CadCtx {
  const ctx = useContext(CadContext);
  if (!ctx) throw new Error("useCad must be used within CadProvider");
  return ctx;
}
