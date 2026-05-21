import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  computeSha256,
  bytesToBase64,
  base64ToBytes,
  storeCadSource,
  loadCadSource,
  deleteCadSourceFile,
} from "./cadSourceStore";
import { isTauriRuntime } from "./tauriRuntime";
import { getQuoteCadSource, upsertQuoteCadSource } from "../db/queries/quote_cad_sources";

// Mock the modules
vi.mock("./tauriRuntime", () => ({
  isTauriRuntime: vi.fn(),
}));

vi.mock("../db/queries/quote_cad_sources", () => ({
  getQuoteCadSource: vi.fn(),
  upsertQuoteCadSource: vi.fn(),
}));

// Mock @tauri-apps/plugin-fs
const mockWriteFile = vi.fn(() => Promise.resolve());
const mockReadFile = vi.fn(() => Promise.resolve(new Uint8Array([4, 5, 6])));
const mockRemove = vi.fn(() => Promise.resolve());
const mockMkdir = vi.fn(() => Promise.resolve());

vi.mock("@tauri-apps/plugin-fs", () => ({
  writeFile: mockWriteFile,
  readFile: mockReadFile,
  remove: mockRemove,
  mkdir: mockMkdir,
}));

// Mock @tauri-apps/api/path
vi.mock("@tauri-apps/api/path", () => ({
  appDataDir: vi.fn(() => Promise.resolve("/mock/app-data")),
  join: vi.fn((...args) => Promise.resolve(args.join("/"))),
}));

// Mock getDb in client
vi.mock("../db/client", () => ({
  getDb: vi.fn(() => Promise.resolve({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          all: vi.fn(() => Promise.resolve([])), // No other quote referencing the file path
        })),
      })),
    })),
  })),
}));

describe("cadSourceStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("hashing and base64 helpers", () => {
    it("computes a valid SHA-256 hash", async () => {
      const bytes = new Uint8Array([1, 2, 3]);
      const hash = await computeSha256(bytes);
      // SHA-256 of [1, 2, 3] in hex
      expect(hash).toBe("039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81");
    });

    it("roundtrips base64 conversion correctly", () => {
      const original = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
      const b64 = bytesToBase64(original);
      expect(b64).toBe("SGVsbG8=");

      const decoded = base64ToBytes(b64);
      expect(decoded).toEqual(original);
    });
  });

  describe("storeCadSource", () => {
    it("stores a small file inline (<= 5MB) in Tauri", async () => {
      vi.mocked(isTauriRuntime).mockReturnValue(true);
      vi.mocked(getQuoteCadSource).mockReturnValue(Promise.resolve(null));

      const smallBytes = new Uint8Array([1, 2, 3]);
      await storeCadSource("quote-small", "small.step", smallBytes);

      expect(upsertQuoteCadSource).toHaveBeenCalledWith({
        quoteId: "quote-small",
        fileName: "small.step",
        fileBytesBase64: "AQID", // base64 of [1, 2, 3]
        filePath: null,
        fileSize: 3,
        sha256: "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81",
      });
      expect(mockWriteFile).not.toHaveBeenCalled();
    });

    it("stores a large file (> 5MB) on disk in Tauri environment", async () => {
      vi.mocked(isTauriRuntime).mockReturnValue(true);
      vi.mocked(getQuoteCadSource).mockReturnValue(Promise.resolve(null));

      // 5.1 MB
      const largeBytes = new Uint8Array(5.1 * 1024 * 1024);
      largeBytes[0] = 99; // modify one byte to make it unique-ish

      await storeCadSource("quote-large", "large.step", largeBytes);

      expect(mockWriteFile).toHaveBeenCalled();
      expect(upsertQuoteCadSource).toHaveBeenCalledWith({
        quoteId: "quote-large",
        fileName: "large.step",
        fileBytesBase64: null,
        filePath: expect.stringContaining("cad-sources"),
        fileSize: largeBytes.length,
        sha256: expect.any(String),
      });
    });

    it("stores large file inline if not running inside Tauri (e.g. browser fallback)", async () => {
      vi.mocked(isTauriRuntime).mockReturnValue(false);
      vi.mocked(getQuoteCadSource).mockReturnValue(Promise.resolve(null));

      const largeBytes = new Uint8Array(6 * 1024 * 1024); // 6MB

      await storeCadSource("quote-large-browser", "large.step", largeBytes);

      expect(mockWriteFile).not.toHaveBeenCalled();
      expect(upsertQuoteCadSource).toHaveBeenCalledWith({
        quoteId: "quote-large-browser",
        fileName: "large.step",
        fileBytesBase64: expect.any(String),
        filePath: null,
        fileSize: largeBytes.length,
        sha256: expect.any(String),
      });
    });
  });

  describe("loadCadSource", () => {
    it("loads inline stored files correctly", async () => {
      vi.mocked(getQuoteCadSource).mockReturnValue(Promise.resolve({
        id: "1",
        quoteId: "quote-inline",
        fileName: "inline.step",
        fileBytesBase64: "SGVsbG8=",
        filePath: null,
        fileSize: 5,
        sha256: "somehash",
        importedAt: new Date(),
      }));

      const loaded = await loadCadSource("quote-inline");
      expect(loaded).not.toBeNull();
      expect(loaded?.fileName).toBe("inline.step");
      expect(loaded?.bytes).toEqual(new Uint8Array([72, 101, 108, 108, 111]));
    });

    it("loads disk stored files correctly in Tauri runtime", async () => {
      vi.mocked(isTauriRuntime).mockReturnValue(true);
      vi.mocked(getQuoteCadSource).mockReturnValue(Promise.resolve({
        id: "2",
        quoteId: "quote-disk",
        fileName: "disk.step",
        fileBytesBase64: null,
        filePath: "/mock/app-data/cad-sources/hash",
        fileSize: 3,
        sha256: "hash",
        importedAt: new Date(),
      }));

      const loaded = await loadCadSource("quote-disk");
      expect(mockReadFile).toHaveBeenCalledWith("/mock/app-data/cad-sources/hash");
      expect(loaded).not.toBeNull();
      expect(loaded?.fileName).toBe("disk.step");
      expect(loaded?.bytes).toEqual(new Uint8Array([4, 5, 6]));
    });

    it("falls back gracefully (returns null) if disk file is missing", async () => {
      vi.mocked(isTauriRuntime).mockReturnValue(true);
      vi.mocked(getQuoteCadSource).mockReturnValue(Promise.resolve({
        id: "2",
        quoteId: "quote-missing",
        fileName: "missing.step",
        fileBytesBase64: null,
        filePath: "/mock/app-data/cad-sources/missing",
        fileSize: 100,
        sha256: "missing",
        importedAt: new Date(),
      }));

      mockReadFile.mockRejectedValueOnce(new Error("File not found"));

      const loaded = await loadCadSource("quote-missing");
      expect(loaded).toBeNull(); // Graceful fallback
    });
  });

  describe("deleteCadSourceFile", () => {
    it("removes the disk file if it becomes orphaned", async () => {
      vi.mocked(isTauriRuntime).mockReturnValue(true);
      vi.mocked(getQuoteCadSource).mockReturnValue(Promise.resolve({
        id: "3",
        quoteId: "quote-deleted",
        fileName: "todelete.step",
        fileBytesBase64: null,
        filePath: "/mock/app-data/cad-sources/todelete",
        fileSize: 1000,
        sha256: "todelete",
        importedAt: new Date(),
      }));

      await deleteCadSourceFile("quote-deleted");
      expect(mockRemove).toHaveBeenCalledWith("/mock/app-data/cad-sources/todelete");
    });
  });
});
