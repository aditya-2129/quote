import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { ErrorBoundary } from "./ErrorBoundary";

function ProblematicComponent({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error("Test render error");
  }
  return <div>Normal Content</div>;
}

describe("ErrorBoundary Component", () => {
  let consoleErrorMock: MockInstance;

  beforeEach(() => {
    // Silence React rendering error logs in terminal output during test
    consoleErrorMock = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    consoleErrorMock.mockRestore();
    vi.restoreAllMocks();
  });

  it("renders children successfully when no error is thrown", () => {
    render(
      <ErrorBoundary>
        <ProblematicComponent shouldThrow={false} />
      </ErrorBoundary>
    );

    expect(screen.getByText("Normal Content")).toBeTruthy();
    expect(screen.queryByText("Application Crash Detected")).toBeNull();
  });

  it("catches errors, suppresses standard crash and renders fallback UI", () => {
    render(
      <ErrorBoundary>
        <ProblematicComponent shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText("Application Crash Detected")).toBeTruthy();
    expect(screen.getByText("Test render error")).toBeTruthy();
    expect(screen.getByText("Reload Application")).toBeTruthy();
    expect(screen.getByText("Copy Diagnostics")).toBeTruthy();
  });

  it("reloads the browser cleanly when the Reload Application button is clicked", () => {
    const originalLocation = window.location;
    const reloadMock = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, reload: reloadMock },
    });

    render(
      <ErrorBoundary>
        <ProblematicComponent shouldThrow={true} />
      </ErrorBoundary>
    );

    const reloadBtn = screen.getByText("Reload Application");
    fireEvent.click(reloadBtn);

    expect(reloadMock).toHaveBeenCalledTimes(1);

    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  it("copies structured diagnostics to the clipboard and changes button text upon copy click", async () => {
    const mockWriteText = vi.fn().mockResolvedValue(undefined);
    const originalClipboard = navigator.clipboard;
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: mockWriteText },
      writable: true,
      configurable: true,
    });

    render(
      <ErrorBoundary>
        <ProblematicComponent shouldThrow={true} />
      </ErrorBoundary>
    );

    const copyBtn = screen.getByText("Copy Diagnostics");
    fireEvent.click(copyBtn);

    expect(mockWriteText).toHaveBeenCalledTimes(1);
    const copiedText = mockWriteText.mock.calls[0][0];
    const parsed = JSON.parse(copiedText);

    expect(parsed.message).toBe("Test render error");
    expect(parsed.stack).toBeDefined();
    expect(parsed.route).toBeDefined();
    expect(parsed.timestamp).toBeDefined();
    expect(parsed.userAgent).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText("Diagnostics Copied")).toBeTruthy();
    });

    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      writable: true,
      configurable: true,
    });
  });
});
