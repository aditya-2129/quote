import * as THREE from "three";
import { isTauriRuntime } from "./tauriRuntime";
import type { CadImportResult, CadMesh, CadTreeNode } from "./cad";
import type { StepGeometryInput } from "../types";

export interface OcctImportOptions {
  linearUnit: "millimeter" | "inch";
  linearDeflectionType: "bounding_box_ratio" | "absolute";
  linearDeflection: number;
  angularDeflection: number;
}

export const DEFAULT_OCCT_OPTIONS: OcctImportOptions = {
  linearUnit: "millimeter",
  linearDeflectionType: "bounding_box_ratio",
  linearDeflection: 0.001,
  angularDeflection: 0.5,
};

const CACHE_DIR_NAME = "geometry_cache";

interface SerializedMesh {
  id: string;
  name: string;
  color: string;
  faceColors?: string[];
  triangleCount: number;
  vertexCount: number;
  occtIndex: number;
  positions: string;
  indexes?: string;
  normals?: string;
  groups: { start: number; count: number; materialIndex?: number }[];
  meshBlobPath?: string | null;
}

// Helper to load Tauri APIs dynamically to ensure browser fallback compatibility.
async function getTauriApis() {
  if (!isTauriRuntime()) return null;
  try {
    const { appDataDir, join } = await import("@tauri-apps/api/path");
    const { readFile, writeFile, mkdir, remove, exists } = await import("@tauri-apps/plugin-fs");
    return { appDataDir, join, readFile, writeFile, mkdir, remove, exists };
  } catch (e) {
    console.error("Tauri APIs unavailable", e);
    return null;
  }
}

// Compute SHA-256 hex string of a Uint8Array or string.
export async function sha256(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

// Get the digest of the current OCCT options.
export async function getOcctOptionsDigest(options: OcctImportOptions): Promise<string> {
  return sha256(JSON.stringify(options));
}

// Base64 serialization helpers for Float32Array and Uint32Array
function float32ArrayToBase64(arr: Float32Array): string {
  const u8 = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  const CHUNK = 0x8000;
  let s = "";
  for (let i = 0; i < u8.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, Array.from(u8.subarray(i, i + CHUNK)));
  }
  return btoa(s);
}

function base64ToFloat32Array(b64: string): Float32Array {
  const binary = atob(b64);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    buf[i] = binary.charCodeAt(i);
  }
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

function uint32ArrayToBase64(arr: Uint32Array): string {
  const u8 = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  const CHUNK = 0x8000;
  let s = "";
  for (let i = 0; i < u8.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, Array.from(u8.subarray(i, i + CHUNK)));
  }
  return btoa(s);
}

function base64ToUint32Array(b64: string): Uint32Array {
  const binary = atob(b64);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    buf[i] = binary.charCodeAt(i);
  }
  return new Uint32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

// In-memory fallback cache for browser/dev environments.
const memoryCache = new Map<string, string>();

// Get the cache directory path on disk.
async function getCacheDir(): Promise<string | null> {
  const apis = await getTauriApis();
  if (!apis) return null;
  try {
    const base = await apis.appDataDir();
    const path = await apis.join(base, CACHE_DIR_NAME);
    const dirExists = await apis.exists(path);
    if (!dirExists) {
      await apis.mkdir(path, { recursive: true });
    }
    return path;
  } catch (e) {
    console.error("Error creating cache directory:", e);
    return null;
  }
}

// Tracking cache hit/miss statistics in localStorage.
export interface CacheStats {
  hits: number;
  misses: number;
  ratio: number;
}

export function getCacheStats(): CacheStats {
  try {
    const hits = Number(localStorage.getItem("geometry-cache:hits") ?? "0");
    const misses = Number(localStorage.getItem("geometry-cache:misses") ?? "0");
    const total = hits + misses;
    return {
      hits,
      misses,
      ratio: total > 0 ? (hits / total) * 100 : 0,
    };
  } catch {
    return { hits: 0, misses: 0, ratio: 0 };
  }
}

export function incrementCacheHits() {
  try {
    const current = Number(localStorage.getItem("geometry-cache:hits") ?? "0");
    localStorage.setItem("geometry-cache:hits", String(current + 1));
  } catch { /* ignore */ }
}

export function incrementCacheMisses() {
  try {
    const current = Number(localStorage.getItem("geometry-cache:misses") ?? "0");
    localStorage.setItem("geometry-cache:misses", String(current + 1));
  } catch { /* ignore */ }
}

export function resetCacheStats() {
  try {
    localStorage.setItem("geometry-cache:hits", "0");
    localStorage.setItem("geometry-cache:misses", "0");
  } catch { /* ignore */ }
}

// Get/set current OCCT options in localStorage
export function getStoredOcctOptions(): OcctImportOptions {
  try {
    const raw = localStorage.getItem("geometry-cache:occt-options");
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_OCCT_OPTIONS, ...parsed };
    }
  } catch { /* ignore */ }
  return DEFAULT_OCCT_OPTIONS;
}

export function storeOcctOptions(options: OcctImportOptions) {
  try {
    localStorage.setItem("geometry-cache:occt-options", JSON.stringify(options));
  } catch { /* ignore */ }
}

// Look up a cached CAD result.
export async function getCachedImport(
  sha256Hash: string,
  optionsDigest: string
): Promise<CadImportResult | null> {
  const cacheKey = `${sha256Hash}-${optionsDigest}`;
  const apis = await getTauriApis();

  try {
    let rawContent: string | null = null;

    if (apis) {
      const cacheDir = await getCacheDir();
      if (!cacheDir) return null;
      const filePath = await apis.join(cacheDir, `geometry-cache-${cacheKey}.json`);
      const fileExists = await apis.exists(filePath);
      if (fileExists) {
        const bytes = await apis.readFile(filePath);
        rawContent = new TextDecoder().decode(bytes);
      }
    } else {
      rawContent = memoryCache.get(cacheKey) ?? null;
    }

    if (!rawContent) {
      return null;
    }

    const parsed = JSON.parse(rawContent);

    // Verify all mesh blob files actually exist on disk if running under Tauri.
    // If any mesh blob file is missing (e.g. deleted), treat it as a cache miss/stale cache.
    if (apis) {
      for (const m of parsed.meshes) {
        if (m.meshBlobPath) {
          const meshFileExists = await apis.exists(m.meshBlobPath);
          if (!meshFileExists) {
            console.warn(`Mesh blob file not found: ${m.meshBlobPath}. Invalidating cache.`);
            await deleteCacheFile(cacheKey);
            return null;
          }
        }
      }
    }

    // Reconstruct THREEJS geometries.
    const meshes: CadMesh[] = parsed.meshes.map((m: SerializedMesh) => {
      const geometry = new THREE.BufferGeometry();
      const posArray = base64ToFloat32Array(m.positions);
      geometry.setAttribute("position", new THREE.BufferAttribute(posArray, 3));

      if (m.indexes) {
        const idxArray = base64ToUint32Array(m.indexes);
        geometry.setIndex(new THREE.BufferAttribute(idxArray, 1));
      }

      if (m.normals) {
        const normArray = base64ToFloat32Array(m.normals);
        geometry.setAttribute("normal", new THREE.BufferAttribute(normArray, 3));
      } else {
        geometry.computeVertexNormals();
      }

      if (m.groups) {
        for (const g of m.groups) {
          geometry.addGroup(g.start, g.count, g.materialIndex);
        }
      }

      geometry.computeBoundingBox();
      const center = new THREE.Vector3();
      geometry.boundingBox?.getCenter(center);

      return {
        id: m.id,
        name: m.name,
        geometry,
        color: m.color,
        faceColors: m.faceColors,
        triangleCount: m.triangleCount,
        vertexCount: m.vertexCount,
        center,
        occtIndex: m.occtIndex,
        meshBlobPath: m.meshBlobPath || null,
      } as CadMesh;
    });

    incrementCacheHits();

    return {
      fileName: parsed.fileName,
      meshes,
      rootNode: parsed.rootNode as CadTreeNode,
      geometry: parsed.geometry as StepGeometryInput,
      source: parsed.source,
      cacheStatus: "hit",
    } as CadImportResult;

  } catch (e) {
    console.error("Error loading geometry cache:", e);
    return null;
  }
}

// Save a CAD import result to the cache.
export async function saveCachedImport(
  sha256Hash: string,
  optionsDigest: string,
  result: CadImportResult
): Promise<CadImportResult> {
  const cacheKey = `${sha256Hash}-${optionsDigest}`;
  const apis = await getTauriApis();

  try {
    const serializedMeshes = [];

    const cacheDir = apis ? await getCacheDir() : null;

    for (let i = 0; i < result.meshes.length; i++) {
      const mesh = result.meshes[i]!;
      const geo = mesh.geometry;

      const positions = geo.getAttribute("position") as THREE.BufferAttribute;
      const indexes = geo.getIndex();
      const normals = geo.getAttribute("normal") as THREE.BufferAttribute | undefined;

      const groups = geo.groups.map(g => ({
        start: g.start,
        count: g.count,
        materialIndex: g.materialIndex,
      }));

      // Create serialized mesh representation
      const meshData: SerializedMesh = {
        id: mesh.id,
        name: mesh.name,
        color: mesh.color,
        faceColors: mesh.faceColors,
        triangleCount: mesh.triangleCount,
        vertexCount: mesh.vertexCount,
        occtIndex: mesh.occtIndex,
        positions: float32ArrayToBase64(positions.array as Float32Array),
        indexes: indexes ? uint32ArrayToBase64(indexes.array as Uint32Array) : undefined,
        normals: normals ? float32ArrayToBase64(normals.array as Float32Array) : undefined,
        groups,
      };

      // Write individual mesh blob path if Tauri is running.
      if (apis && cacheDir) {
        const meshFileName = `mesh-${cacheKey}-${mesh.id}.json`;
        const meshFilePath = await apis.join(cacheDir, meshFileName);
        const meshContent = JSON.stringify(meshData);
        await apis.writeFile(meshFilePath, new TextEncoder().encode(meshContent));
        mesh.meshBlobPath = meshFilePath;
        meshData.meshBlobPath = meshFilePath;
      }

      serializedMeshes.push(meshData);
    }

    const payload = {
      fileName: result.fileName,
      source: result.source,
      geometry: result.geometry,
      rootNode: result.rootNode,
      meshes: serializedMeshes,
    };

    const serializedContent = JSON.stringify(payload);

    if (apis && cacheDir) {
      const cacheFilePath = await apis.join(cacheDir, `geometry-cache-${cacheKey}.json`);
      await apis.writeFile(cacheFilePath, new TextEncoder().encode(serializedContent));
    } else {
      memoryCache.set(cacheKey, serializedContent);
    }

    // Set cacheStatus flag as "miss" for the newly-imported item.
    result.cacheStatus = "miss";

    return result;
  } catch (e) {
    console.error("Error saving geometry cache:", e);
    return result;
  }
}

// Delete cache files for a given key.
async function deleteCacheFile(cacheKey: string): Promise<void> {
  const apis = await getTauriApis();
  if (!apis) {
    memoryCache.delete(cacheKey);
    return;
  }
  try {
    const cacheDir = await getCacheDir();
    if (!cacheDir) return;
    const cacheFilePath = await apis.join(cacheDir, `geometry-cache-${cacheKey}.json`);
    const fileExists = await apis.exists(cacheFilePath);
    if (fileExists) {
      await apis.remove(cacheFilePath);
    }
  } catch (e) {
    console.error("Error deleting cache file:", e);
  }
}

// Clear the entire geometry cache.
export async function clearGeometryCache(): Promise<void> {
  memoryCache.clear();
  resetCacheStats();

  const apis = await getTauriApis();
  if (!apis) return;

  try {
    const { readDir, remove } = await import("@tauri-apps/plugin-fs");
    const cacheDir = await getCacheDir();
    if (!cacheDir) return;

    const entries = await readDir(cacheDir);
    for (const entry of entries) {
      if (entry.name && (entry.name.startsWith("geometry-cache-") || entry.name.startsWith("mesh-"))) {
        const filePath = await apis.join(cacheDir, entry.name);
        await remove(filePath);
      }
    }
  } catch (e) {
    console.error("Error clearing geometry cache:", e);
  }
}

export interface SerializedBufferGeometry {
  positions?: string;
  indexes?: string;
  normals?: string;
  position?: string;
  index?: string;
  normal?: string;
  groups: { start: number; count: number; materialIndex?: number }[];
}

export function serializeBufferGeometry(geo: THREE.BufferGeometry): SerializedBufferGeometry {
  const positions = geo.getAttribute("position") as THREE.BufferAttribute;
  const indexes = geo.getIndex();
  const normals = geo.getAttribute("normal") as THREE.BufferAttribute | undefined;

  const groups = geo.groups.map(g => ({
    start: g.start,
    count: g.count,
    materialIndex: g.materialIndex,
  }));

  const posBase64 = float32ArrayToBase64(positions.array as Float32Array);
  const idxBase64 = indexes ? uint32ArrayToBase64(indexes.array as Uint32Array) : undefined;
  const normBase64 = normals ? float32ArrayToBase64(normals.array as Float32Array) : undefined;

  return {
    positions: posBase64,
    indexes: idxBase64,
    normals: normBase64,
    position: posBase64,
    index: idxBase64,
    normal: normBase64,
    groups,
  };
}

export function deserializeBufferGeometry(serialized: SerializedBufferGeometry): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const posStr = serialized.position || serialized.positions;
  if (!posStr) {
    throw new Error("Serialized geometry does not contain position data");
  }
  const posArray = base64ToFloat32Array(posStr);
  geometry.setAttribute("position", new THREE.BufferAttribute(posArray, 3));

  const idxStr = serialized.index || serialized.indexes;
  if (idxStr) {
    const idxArray = base64ToUint32Array(idxStr);
    geometry.setIndex(new THREE.BufferAttribute(idxArray, 1));
  }

  const normStr = serialized.normal || serialized.normals;
  if (normStr) {
    const normArray = base64ToFloat32Array(normStr);
    geometry.setAttribute("normal", new THREE.BufferAttribute(normArray, 3));
  } else {
    geometry.computeVertexNormals();
  }

  if (serialized.groups) {
    for (const g of serialized.groups) {
      geometry.addGroup(g.start, g.count, g.materialIndex);
    }
  }

  return geometry;
}
