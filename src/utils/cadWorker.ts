import * as Comlink from 'comlink';
import type { WorkerImportResult } from '../workers/occt.worker';

export async function importStep(
  buffer: Uint8Array,
  _fileName: string,
  signal?: AbortSignal
): Promise<WorkerImportResult> {
  if (signal?.aborted) {
    throw new DOMException('Import aborted', 'AbortError');
  }

  // Spin up a fresh worker on-demand using Vite worker URL syntax
  const worker = new Worker(
    new URL('../workers/occt.worker.ts', import.meta.url),
    { type: 'module' }
  );

  const api = Comlink.wrap<typeof import('../workers/occt.worker').occtWorkerApi>(worker);

  let onAbort: (() => void) | undefined;

  const importPromise = (async () => {
    try {
      // Transfer the buffer copy to the worker for high performance
      // Note: we transfer a copy of the buffer's ArrayBuffer so we don't detach the caller's buffer.
      const bufferCopy = new Uint8Array(buffer);
      const res = await api.importStep(Comlink.transfer(bufferCopy, [bufferCopy.buffer]));
      return res;
    } finally {
      // Cleanup: release comlink proxy
      api[Comlink.releaseProxy]();
    }
  })();

  if (signal) {
    const abortPromise = new Promise<never>((_, reject) => {
      onAbort = () => {
        worker.terminate();
        reject(new DOMException('Import aborted', 'AbortError'));
      };
      signal.addEventListener('abort', onAbort);
    });

    try {
      return await Promise.race([importPromise, abortPromise]);
    } finally {
      if (onAbort) {
        signal.removeEventListener('abort', onAbort);
      }
      // Always ensure the worker is terminated after we are done
      worker.terminate();
    }
  } else {
    try {
      return await importPromise;
    } finally {
      worker.terminate();
    }
  }
}
