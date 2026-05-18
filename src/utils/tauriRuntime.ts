export function isTauriRuntime(): boolean {
  const g = globalThis as typeof globalThis & {
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: unknown;
  };

  return Boolean(g.__TAURI__ || g.__TAURI_INTERNALS__);
}
