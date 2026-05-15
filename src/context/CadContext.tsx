import { createContext, useContext, useState, type ReactNode } from "react";
import { importStepFile, importStepUrl } from "@utils/index";
import type { CadImportResult } from "@utils/index";

interface CadCtx {
  cad: CadImportResult | null;
  isImporting: boolean;
  importStatus: string;
  handleFile: (file?: File) => Promise<void>;
  handleTestFile: (fileName: string) => Promise<void>;
}

const CadContext = createContext<CadCtx | null>(null);

export function CadProvider({ children }: { children: ReactNode }) {
  const [cad, setCad] = useState<CadImportResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setStatus] = useState("Import a STEP file to get started");

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

  return (
    <CadContext.Provider value={{ cad, isImporting, importStatus, handleFile, handleTestFile }}>
      {children}
    </CadContext.Provider>
  );
}

export function useCad(): CadCtx {
  const ctx = useContext(CadContext);
  if (!ctx) throw new Error("useCad must be used within CadProvider");
  return ctx;
}
