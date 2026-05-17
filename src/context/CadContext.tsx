import { createContext, useContext, useCallback, useRef, useState, type ReactNode } from "react";
import { importStepBytes } from "@utils/index";
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
  /** Raw STEP bytes for the current import — used by the quote workflow to persist source CAD per quote. */
  getCadBytes: () => { bytes: Uint8Array; fileName: string } | null;
  /** Re-import a STEP file from its raw bytes (used to restore after a quote reload). */
  restoreFromBytes: (bytes: Uint8Array, fileName: string) => Promise<void>;
  /** Clear in-memory CAD state (used when navigating to a quote that has no source). */
  clearCad: () => void;
}

const CadContext = createContext<CadCtx | null>(null);

export function CadProvider({ children }: { children: ReactNode }) {
  const [cad, setCad] = useState<CadImportResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setStatus] = useState("Import a STEP file to get started");
  const [pendingHandoff, setPendingHandoff] = useState(false);
  // Bytes are kept in a ref (not state) so they don't trigger re-renders. The
  // quote-save path reads them on demand via getCadBytes().
  const cadBytesRef = useRef<{ bytes: Uint8Array; fileName: string } | null>(null);

  const handleFile = async (file?: File) => {
    if (!file) return;
    setIsImporting(true);
    setStatus(`Importing ${file.name}`);
    try {
      const buffer = new Uint8Array(await file.arrayBuffer());
      const result = await importStepBytes(file.name, buffer);
      cadBytesRef.current = { bytes: buffer, fileName: file.name };
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
      const response = await fetch(`/test_files/${encodeURIComponent(fileName)}`);
      if (!response.ok) throw new Error(`Unable to load ${fileName}.`);
      const buffer = new Uint8Array(await response.arrayBuffer());
      const result = await importStepBytes(fileName, buffer);
      cadBytesRef.current = { bytes: buffer, fileName };
      setCad(result);
      setStatus("Test file imported");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Import failed");
    } finally {
      setIsImporting(false);
    }
  };

  const restoreFromBytes = useCallback(async (bytes: Uint8Array, fileName: string) => {
    setIsImporting(true);
    setStatus(`Restoring ${fileName}`);
    try {
      const result = await importStepBytes(fileName, bytes);
      cadBytesRef.current = { bytes, fileName };
      setCad(result);
      setStatus("STEP geometry restored");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Restore failed");
    } finally {
      setIsImporting(false);
    }
  }, []);

  const clearCad = useCallback(() => {
    cadBytesRef.current = null;
    setCad(null);
    setPendingHandoff(false);
    setStatus("Import a STEP file to get started");
  }, []);

  const getCadBytes = useCallback(() => cadBytesRef.current, []);

  const requestHandoff = useCallback(() => setPendingHandoff(true), []);

  const consumeHandoff = useCallback((): CadImportResult | null => {
    setPendingHandoff(false);
    return cad;
  }, [cad]);

  return (
    <CadContext.Provider value={{ cad, isImporting, importStatus, pendingHandoff, handleFile, handleTestFile, requestHandoff, consumeHandoff, getCadBytes, restoreFromBytes, clearCad }}>
      {children}
    </CadContext.Provider>
  );
}

export function useCad(): CadCtx {
  const ctx = useContext(CadContext);
  if (!ctx) throw new Error("useCad must be used within CadProvider");
  return ctx;
}
