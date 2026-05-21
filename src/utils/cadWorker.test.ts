import { afterEach, describe, expect, it, vi } from "vitest";
import { importStep } from "./cadWorker";

type WorkerCtorArgs = [URL, { type?: "classic" | "module" } | undefined];

class MockWorker {
  static instances: MockWorker[] = [];
  static lastArgs: WorkerCtorArgs | undefined;
  terminate = vi.fn();
  postMessage = vi.fn();
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
  constructor(url: URL, opts?: { type?: "classic" | "module" }) {
    MockWorker.lastArgs = [url, opts];
    MockWorker.instances.push(this);
  }
}

afterEach(() => {
  MockWorker.instances = [];
  MockWorker.lastArgs = undefined;
  vi.unstubAllGlobals();
});

describe("cadWorker.importStep", () => {
  it("rejects synchronously when the signal is already aborted", async () => {
    vi.stubGlobal("Worker", MockWorker);

    const controller = new AbortController();
    controller.abort();

    await expect(
      importStep(new Uint8Array([0x49, 0x53, 0x4f]), "x.step", controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(MockWorker.instances).toHaveLength(0);
  });

  it("terminates the worker and rejects with AbortError when aborted mid-import", async () => {
    vi.stubGlobal("Worker", MockWorker);

    const controller = new AbortController();
    const pending = importStep(
      new Uint8Array([0x49, 0x53, 0x4f]),
      "x.step",
      controller.signal,
    );

    await Promise.resolve();
    expect(MockWorker.instances).toHaveLength(1);

    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(MockWorker.instances[0].terminate).toHaveBeenCalled();
  });
});
