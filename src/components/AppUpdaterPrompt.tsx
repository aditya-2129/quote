import { useEffect, useState } from "react";
import { Download, RefreshCw, X } from "lucide-react";
import type { DownloadEvent, Update } from "@tauri-apps/plugin-updater";
import { isTauriRuntime } from "@utils/tauriRuntime";

type UpdateStatus = "checking" | "installing" | "installed" | "failed";

type DownloadProgress = {
  downloadedBytes: number;
  totalBytes: number | null;
};

export function AppUpdaterPrompt() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [status, setStatus] = useState<UpdateStatus>("checking");
  const [progress, setProgress] = useState<DownloadProgress>({ downloadedBytes: 0, totalBytes: null });
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!isTauriRuntime()) return;

    let cancelled = false;

    async function checkForUpdate() {
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const availableUpdate = await check();

        if (cancelled || !availableUpdate) return;
        setUpdate(availableUpdate);
        setStatus("installing");
        setError(null);
        setProgress({ downloadedBytes: 0, totalBytes: null });

        await availableUpdate.downloadAndInstall((event: DownloadEvent) => {
          if (cancelled) return;

          if (event.event === "Started") {
            setProgress({ downloadedBytes: 0, totalBytes: event.data.contentLength ?? null });
          }

          if (event.event === "Progress") {
            setProgress(prev => ({
              downloadedBytes: prev.downloadedBytes + event.data.chunkLength,
              totalBytes: prev.totalBytes,
            }));
          }
        });

        if (!cancelled) setStatus("installed");
      } catch (cause) {
        if (cancelled) return;
        setStatus("failed");
        setError(cause instanceof Error ? cause.message : "Unable to install the update.");
      }
    }

    void checkForUpdate();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!update || dismissed) return null;

  const isInstalling = status === "installing";
  const versionLabel = `Version ${update.version}`;
  const progressLabel =
    progress.totalBytes && progress.totalBytes > 0
      ? `${Math.min(100, Math.round((progress.downloadedBytes / progress.totalBytes) * 100))}%`
      : null;

  return (
    <div className="modal-overlay" role="presentation">
      <section className="confirm-card app-update-card" role="dialog" aria-modal="true" aria-labelledby="app-update-title">
        <div className="app-update-head">
          <div className="confirm-icon">
            <Download size={20} />
          </div>
          <div>
            <h2 id="app-update-title">{status === "installed" ? "Update installed" : "Updating app"}</h2>
            <p>{versionLabel}</p>
          </div>
          <button className="modal-close" type="button" aria-label="Dismiss update" onClick={() => setDismissed(true)} disabled={isInstalling}>
            <X size={16} />
          </button>
        </div>

        {update.body && <p className="app-update-notes">{update.body}</p>}

        {status === "installing" && (
          <div className="app-update-progress" aria-live="polite">
            <RefreshCw size={14} />
            <span>{progressLabel ? `Installing update ${progressLabel}` : "Installing update"}</span>
          </div>
        )}

        {status === "installed" && (
          <div className="app-update-progress" aria-live="polite">
            <span>Update installed. Restart the app to finish.</span>
          </div>
        )}

        {error && (
          <div className="error-banner">
            <span>{error}</span>
          </div>
        )}

        <div className="confirm-actions">
          <button className="btn sm" type="button" onClick={() => setDismissed(true)} disabled={isInstalling}>
            {status === "installed" ? "Close" : "Later"}
          </button>
        </div>
      </section>
    </div>
  );
}
