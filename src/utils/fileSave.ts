import { isTauriRuntime } from "./tauriRuntime";

export { isTauriRuntime };

export async function downloadBytes(fileName: string, bytes: Uint8Array, mimeType: string): Promise<boolean> {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  const extLabel = ext === "pdf" ? "PDF Document" : ext.toUpperCase() || "File";

  if (isTauriRuntime()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeFile } = await import("@tauri-apps/plugin-fs");
    const filePath = await save({
      title: "Save quotation",
      defaultPath: fileName,
      filters: ext ? [{ name: extLabel, extensions: [ext] }] : undefined,
    });
    if (!filePath) return false;
    await writeFile(filePath, bytes);
    return true;
  }

  const picker = (window as Window & { showSaveFilePicker?: (opts: unknown) => Promise<FileSystemFileHandle> }).showSaveFilePicker;
  if (typeof picker === "function") {
    try {
      const handle = await picker({
        suggestedName: fileName,
        types: ext ? [{ description: extLabel, accept: { [mimeType]: [`.${ext}`] } }] : undefined,
      });
      const writable = await (handle as FileSystemFileHandle & { createWritable: () => Promise<FileSystemWritableFileStream> }).createWritable();
      await writable.write(new Uint8Array(bytes).buffer as ArrayBuffer);
      await writable.close();
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return false;
      throw error;
    }
  }

  const blob = new Blob([new Uint8Array(bytes).buffer as ArrayBuffer], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return true;
}
