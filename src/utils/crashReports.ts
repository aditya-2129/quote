import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "./tauriRuntime";

export type CrashReportSource = "renderer-boundary" | "renderer-global" | "rust-panic";

export type CrashReportInput = {
  source: CrashReportSource;
  message: string;
  stack?: string;
  componentStack?: string;
  route?: string;
  context?: Record<string, unknown>;
};

export type CrashReport = {
  timestamp: string;
  appVersion: string;
  platform: string;
  route: string;
  userAgent: string;
  source: CrashReportSource;
  message: string;
  stack?: string;
  componentStack?: string;
  context?: Record<string, unknown>;
};

const LAST_BROWSER_REPORT_KEY = "quote:last-crash-report";

function redactText(value: string): string {
  return value
    .replace(/data:[^,\s]+,[A-Za-z0-9+/=]{80,}/g, "[redacted-data-url]")
    .replace(/[A-Za-z]:\\[^\n\r\t"]+/g, "[redacted-local-path]")
    .replace(/\/(?:Users|home|var|tmp)\/[^\n\r\t"]+/g, "[redacted-local-path]")
    .replace(/[A-Za-z0-9+/=]{180,}/g, "[redacted-long-encoded-value]");
}

function redactContext(context: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!context) return undefined;
  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => [
      key,
      typeof value === "string" ? redactText(value) : value,
    ]),
  );
}

export function createCrashReport(input: CrashReportInput): CrashReport {
  return {
    timestamp: new Date().toISOString(),
    appVersion: import.meta.env.PACKAGE_VERSION ?? "0.1.1",
    platform: navigator.platform || "unknown",
    route: input.route ?? window.location.hash ?? window.location.pathname ?? "unknown",
    userAgent: navigator.userAgent || "unknown",
    source: input.source,
    message: redactText(input.message),
    stack: input.stack ? redactText(input.stack) : undefined,
    componentStack: input.componentStack ? redactText(input.componentStack) : undefined,
    context: redactContext(input.context),
  };
}

export async function recordCrashReport(input: CrashReportInput): Promise<CrashReport> {
  const report = createCrashReport(input);
  if (isTauriRuntime()) {
    await invoke<string>("write_crash_report", { report });
  } else {
    localStorage.setItem(LAST_BROWSER_REPORT_KEY, JSON.stringify(report, null, 2));
  }
  return report;
}

export async function openCrashReportsFolder(): Promise<void> {
  await invoke("open_crash_reports_folder");
}

export async function getLatestCrashReportText(): Promise<string | null> {
  if (isTauriRuntime()) {
    return await invoke<string | null>("get_latest_crash_report");
  }
  return localStorage.getItem(LAST_BROWSER_REPORT_KEY);
}

export async function writeTestRustCrashReport(): Promise<string> {
  return await invoke<string>("write_test_rust_crash_report");
}

export function installGlobalCrashReportListeners(): () => void {
  const onError = (event: ErrorEvent) => {
    void recordCrashReport({
      source: "renderer-global",
      message: event.message || "Unhandled renderer error",
      stack: event.error instanceof Error ? event.error.stack : undefined,
      context: {
        filename: event.filename,
        line: event.lineno,
        column: event.colno,
      },
    }).catch((error) => console.error("Failed to write renderer crash report", error));
  };

  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    void recordCrashReport({
      source: "renderer-global",
      message: reason instanceof Error ? reason.message : String(reason ?? "Unhandled promise rejection"),
      stack: reason instanceof Error ? reason.stack : undefined,
    }).catch((error) => console.error("Failed to write rejection crash report", error));
  };

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onUnhandledRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onUnhandledRejection);
  };
}
