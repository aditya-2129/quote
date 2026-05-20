import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, Copy, Check } from "lucide-react";
import { isTauriRuntime } from "@utils/tauriRuntime";
import { createCrashReport, recordCrashReport, type CrashReport } from "@utils/crashReports";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    copied: false,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    void recordCrashReport({
      source: "renderer-boundary",
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack ?? undefined,
    }).catch((err) => console.error("ErrorBoundary failed to write crash report:", err));
    this.logToTauri(error, errorInfo);
  }

  private async logToTauri(error: Error, errorInfo: ErrorInfo) {
    try {
      if (isTauriRuntime()) {
        const { invoke } = await import("@tauri-apps/api/core");
        // Best-effort non-blocking log. Level 1 is Error in tauri-plugin-log.
        await invoke("plugin:log|log", {
          level: 1,
          message: `React Render Error: ${error.message}\nStack: ${error.stack || "N/A"}\nComponent Stack: ${errorInfo.componentStack || "N/A"}`,
          location: "ErrorBoundary.tsx",
        });
      } else {
        console.error("ErrorBoundary caught an error:", error, errorInfo);
      }
    } catch (err) {
      // Keep logging fully best-effort and non-blocking
      console.error("ErrorBoundary failed to log to Tauri:", err);
    }
  }

  private handleReload = () => {
    window.location.hash = "#/quotes";
    window.location.reload();
  };

  private copyDiagnostics = () => {
    const diagnostic = this.createDiagnosticPayload();
    const jsonStr = JSON.stringify(diagnostic, null, 2);

    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      navigator.clipboard
        .writeText(jsonStr)
        .then(() => {
          this.setState({ copied: true });
          setTimeout(() => this.setState({ copied: false }), 2000);
        })
        .catch((err) => {
          console.error("Failed to copy using navigator.clipboard:", err);
          this.fallbackCopy(jsonStr);
        });
    } else {
      this.fallbackCopy(jsonStr);
    }
  };

  private createDiagnosticPayload = (): CrashReport => {
    const { error, errorInfo } = this.state;
    return createCrashReport({
      source: "renderer-boundary",
      message: error?.message || "Unknown error",
      stack: error?.stack,
      componentStack: errorInfo?.componentStack ?? undefined,
    });
  };

  private fallbackCopy = (text: string) => {
    try {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.top = "0";
      textArea.style.left = "0";
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand("copy");
      document.body.removeChild(textArea);
      if (successful) {
        this.setState({ copied: true });
        setTimeout(() => this.setState({ copied: false }), 2000);
      } else {
        console.error("Fallback execCommand('copy') failed");
      }
    } catch (err) {
      console.error("Fallback copy failed:", err);
    }
  };

  public render() {
    if (this.state.hasError) {
      const { error } = this.state;
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            width: "100vw",
            height: "100vh",
            background: "var(--page-bg)",
            color: "var(--text-1)",
            padding: "24px",
            overflow: "auto",
          }}
        >
          <div
            className="panel"
            style={{
              maxWidth: "600px",
              width: "100%",
              boxShadow: "var(--shadow-md)",
            }}
          >
            <div
              className="panel-head"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                borderBottom: "1px solid var(--border)",
                padding: "16px 20px",
              }}
            >
              <AlertTriangle size={20} style={{ color: "var(--danger)" }} />
              <div className="title" style={{ fontSize: "15px", fontWeight: 600 }}>
                Application Crash Detected
              </div>
            </div>

            <div
              style={{
                padding: "20px",
                display: "flex",
                flexDirection: "column",
                gap: "16px",
              }}
            >
              <div style={{ color: "var(--text-2)", fontSize: "13px" }}>
                An unexpected error occurred during rendering. The application has crashed, but you can copy the diagnostic details to report the problem or attempt to reload the application.
              </div>

              <div
                style={{
                  background: "var(--panel-2)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  padding: "12px 16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                }}
              >
                <div
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    color: "var(--text-3)",
                    letterSpacing: "0.04em",
                  }}
                >
                  Error Message
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "12px",
                    color: "var(--danger)",
                    wordBreak: "break-word",
                  }}
                >
                  {error?.message || "Unknown error"}
                </div>
              </div>

              {error?.stack && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                  }}
                >
                  <div
                    style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      textTransform: "uppercase",
                      color: "var(--text-3)",
                      letterSpacing: "0.04em",
                    }}
                  >
                    Stack Trace
                  </div>
                  <pre
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "11px",
                      background: "var(--panel-2)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      padding: "12px 16px",
                      maxHeight: "150px",
                      overflowY: "auto",
                      color: "var(--text-2)",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-all",
                    }}
                  >
                    {error.stack}
                  </pre>
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  gap: "12px",
                  marginTop: "8px",
                  borderTop: "1px solid var(--divider)",
                  paddingTop: "16px",
                }}
              >
                <button
                  type="button"
                  className="btn"
                  onClick={this.copyDiagnostics}
                  style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}
                >
                  {this.state.copied ? (
                    <>
                      <Check size={14} style={{ color: "var(--success)" }} />
                      Diagnostics Copied
                    </>
                  ) : (
                    <>
                      <Copy size={14} />
                      Copy Diagnostics
                    </>
                  )}
                </button>
                <button
                  type="button"
                  className="btn primary"
                  onClick={this.handleReload}
                  style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}
                >
                  <RefreshCw size={14} />
                  Reload Application
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
