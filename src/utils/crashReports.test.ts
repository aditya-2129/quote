import { describe, expect, it } from "vitest";
import { createCrashReport } from "./crashReports";

describe("crash report helpers", () => {
  it("creates a structured report and redacts sensitive payloads", () => {
    const report = createCrashReport({
      source: "renderer-boundary",
      message: "Failed while reading C:\\Users\\aditya\\Desktop\\quote\\secret.step",
      stack: `Error: boom
data:application/octet-stream,${"A".repeat(120)}`,
      componentStack: "QuoteDetailPage",
      context: {
        localPath: "C:\\Users\\aditya\\Desktop\\quote\\customer.step",
        partCount: 4,
      },
    });

    expect(report.source).toBe("renderer-boundary");
    expect(report.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(report.appVersion).toBeDefined();
    expect(report.platform).toBeDefined();
    expect(report.route).toBeDefined();
    expect(report.userAgent).toBeDefined();
    expect(report.message).toContain("[redacted-local-path]");
    expect(report.stack).toContain("[redacted-data-url]");
    expect(report.context).toEqual({
      localPath: "[redacted-local-path]",
      partCount: 4,
    });
  });
});
