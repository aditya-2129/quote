import * as THREE from "three";
import { isTauriRuntime } from "./tauriRuntime";
import { DEFAULT_OCCT_OPTIONS } from "./occtOptions";
import type { CadImportResult, CadMesh, CadTreeNode } from "./cad";
import type { StepGeometryInput } from "../types";

const CACHE_DIR = "geometry_cache";
const memoryStore = new Map<string, Uint8Array>();

let hits = 0;
let misses = 0;

export type CacheStats = { hits: number; misses: number; ratio: number };

export function getCacheStats(): CacheStats {
  const total = hits + misses;
  return { hits, misses, ratio: total === 0 ? 0 : hits / total };
}

export function recordCacheHit(): void {
  hits += 1;
}

export function recordCacheMiss(): void {
  misses += 1;
}

export function resetCacheStats(): void {
  hits = 0;
  misses = 0;
}

async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

let cachedOptionsDigest: string | null = null;
async function optionsDigest(): Promise<string> {
  if (cachedOptionsDigest) return cachedOptionsDigest;
  const full = await sha256Hex(JSON.stringify(DEFAULT_OCCT_OPTIONS));
  cachedOptionsDigest = full.slice(0, 16);
  return cachedOptionsDigest;
}

export async function computeCacheKey(buffer: Uint8Array): Promise<string> {
  const bytesHash = await sha256Hex(buffer);
  const opts = await optionsDigest();
  return `${bytesHash}-${opts}`;
}

type SerializedMesh = {
  id: string;
  name: string;
  color: string;
  faceColors?: string[];
  occtIndex: number;
  triangleCount: number;
  vertexCount: number;
  positionBytes: number;
  indexBytes: number;
  normalBytes: number;
  groups: { start: number; count: number; materialIndex?: number }[];
};

type CacheHeader = {
  fileName: string;
  source: "step" | "sample";
  geometry: StepGeometryInput;
  rootNode: CadTreeNode;
  meshes: SerializedMesh[];
};

function encodeHeader(header: CacheHeader): Uint8Array {
  const text = new TextEncoder().encode(JSON.stringify(header));
  const out = new Uint8Array(4 + text.length);
  new DataView(out.buffer).setUint32(0, text.length, true);
  out.set(text, 4);
  return out;
}

function decodeHeader(buffer: Uint8Array): { header: CacheHeader; offset: number } {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const headerLen = view.getUint32(0, true);
  const text = new TextDecoder().decode(buffer.subarray(4, 4 + headerLen));
  return { header: JSON.parse(text) as CacheHeader, offset: 4 + headerLen };
}

function toUint32Array(src: ArrayLike<number> | Uint16Array | Uint32Array): Uint32Array {
  if (src instanceof Uint32Array) return src;
  return new Uint32Array(src as ArrayLike<number>);
}

function serializeResult(result: CadImportResult): Uint8Array {
  const meshes: SerializedMesh[] = [];
  const chunks: Uint8Array[] = [];

  for (const mesh of result.meshes) {
    const geo = mesh.geometry;
    const positions = geo.getAttribute("position");
    if (!(positions instanceof THREE.BufferAttribute)) continue;
    const positionsArray = positions.array as Float32Array;
    const indexAttr = geo.getIndex();
    const indexArray = indexAttr ? toUint32Array(indexAttr.array) : null;
    const normalAttr = geo.getAttribute("normal");
    const normalArray =
      normalAttr instanceof THREE.BufferAttribute ? (normalAttr.array as Float32Array) : null;

    const posBytes = new Uint8Array(
      positionsArray.buffer,
      positionsArray.byteOffset,
      positionsArray.byteLength,
    );
    chunks.push(posBytes);
    const idxBytes = indexArray
      ? new Uint8Array(indexArray.buffer, indexArray.byteOffset, indexArray.byteLength)
      : null;
    if (idxBytes) chunks.push(idxBytes);
    const nrmBytes = normalArray
      ? new Uint8Array(normalArray.buffer, normalArray.byteOffset, normalArray.byteLength)
      : null;
    if (nrmBytes) chunks.push(nrmBytes);

    meshes.push({
      id: mesh.id,
      name: mesh.name,
      color: mesh.color,
      faceColors: mesh.faceColors,
      occtIndex: mesh.occtIndex,
      triangleCount: mesh.triangleCount,
      vertexCount: mesh.vertexCount,
      positionBytes: posBytes.byteLength,
      indexBytes: idxBytes ? idxBytes.byteLength : 0,
      normalBytes: nrmBytes ? nrmBytes.byteLength : 0,
      groups: geo.groups.map((g) => ({
        start: g.start,
        count: g.count,
        materialIndex: g.materialIndex,
      })),
    });
  }

  const header = encodeHeader({
    fileName: result.fileName,
    source: result.source,
    geometry: result.geometry,
    rootNode: result.rootNode,
    meshes,
  });

  let totalDataLen = 0;
  for (const c of chunks) totalDataLen += c.byteLength;
  const out = new Uint8Array(header.byteLength + totalDataLen);
  out.set(header, 0);
  let off = header.byteLength;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

function sliceTyped<T extends Float32Array | Uint32Array>(
  source: Uint8Array,
  start: number,
  byteLength: number,
  ctor: { new (buf: ArrayBuffer): T },
): T {
  const sourceBuffer = source.buffer as ArrayBuffer;
  const copy = sourceBuffer.slice(
    source.byteOffset + start,
    source.byteOffset + start + byteLength,
  );
  return new ctor(copy);
}

function deserializeResult(buffer: Uint8Array): CadImportResult {
  const { header, offset } = decodeHeader(buffer);
  let cursor = offset;
  const meshes: CadMesh[] = [];

  for (const m of header.meshes) {
    const positions = sliceTyped(buffer, cursor, m.positionBytes, Float32Array);
    cursor += m.positionBytes;

    let index: Uint32Array | null = null;
    if (m.indexBytes > 0) {
      index = sliceTyped(buffer, cursor, m.indexBytes, Uint32Array);
      cursor += m.indexBytes;
    }

    let normal: Float32Array | null = null;
    if (m.normalBytes > 0) {
      normal = sliceTyped(buffer, cursor, m.normalBytes, Float32Array);
      cursor += m.normalBytes;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    if (index) geometry.setIndex(new THREE.BufferAttribute(index, 1));
    if (normal) geometry.setAttribute("normal", new THREE.BufferAttribute(normal, 3));
    else geometry.computeVertexNormals();
    for (const g of m.groups) geometry.addGroup(g.start, g.count, g.materialIndex);
    geometry.computeBoundingBox();
    const center = new THREE.Vector3();
    geometry.boundingBox?.getCenter(center);

    meshes.push({
      id: m.id,
      name: m.name,
      geometry,
      color: m.color,
      faceColors: m.faceColors,
      triangleCount: m.triangleCount,
      vertexCount: m.vertexCount,
      center,
      occtIndex: m.occtIndex,
    });
  }

  return {
    fileName: header.fileName,
    meshes,
    rootNode: header.rootNode,
    geometry: header.geometry,
    source: header.source,
  };
}

async function getCacheDir(): Promise<string | null> {
  if (!isTauriRuntime()) return null;
  try {
    const { appDataDir, join } = await import("@tauri-apps/api/path");
    const { mkdir, exists } = await import("@tauri-apps/plugin-fs");
    const base = await appDataDir();
    const dir = await join(base, CACHE_DIR);
    if (!(await exists(dir))) await mkdir(dir, { recursive: true });
    return dir;
  } catch (err) {
    console.warn("[geometryCache] unable to access cache dir", err);
    return null;
  }
}

async function readCacheFile(key: string): Promise<Uint8Array | null> {
  if (!isTauriRuntime()) return memoryStore.get(key) ?? null;
  try {
    const dir = await getCacheDir();
    if (!dir) return null;
    const { join } = await import("@tauri-apps/api/path");
    const { exists, readFile } = await import("@tauri-apps/plugin-fs");
    const path = await join(dir, `${key}.bin`);
    if (!(await exists(path))) return null;
    return await readFile(path);
  } catch (err) {
    console.warn("[geometryCache] read failed; treating as miss", err);
    return null;
  }
}

async function writeCacheFile(key: string, data: Uint8Array): Promise<void> {
  if (!isTauriRuntime()) {
    memoryStore.set(key, data);
    return;
  }
  try {
    const dir = await getCacheDir();
    if (!dir) return;
    const { join } = await import("@tauri-apps/api/path");
    const { writeFile } = await import("@tauri-apps/plugin-fs");
    const path = await join(dir, `${key}.bin`);
    await writeFile(path, data);
  } catch (err) {
    console.warn("[geometryCache] write failed", err);
  }
}

export async function lookupCachedImport(key: string): Promise<CadImportResult | null> {
  const data = await readCacheFile(key);
  if (!data) return null;
  try {
    return deserializeResult(data);
  } catch (err) {
    console.warn("[geometryCache] corrupt cache entry, evicting", err);
    await deleteCacheEntry(key);
    return null;
  }
}

export async function storeCachedImport(key: string, result: CadImportResult): Promise<void> {
  const data = serializeResult(result);
  await writeCacheFile(key, data);
}

export async function deleteCacheEntry(key: string): Promise<void> {
  memoryStore.delete(key);
  if (!isTauriRuntime()) return;
  try {
    const dir = await getCacheDir();
    if (!dir) return;
    const { join } = await import("@tauri-apps/api/path");
    const { remove, exists } = await import("@tauri-apps/plugin-fs");
    const path = await join(dir, `${key}.bin`);
    if (await exists(path)) await remove(path);
  } catch (err) {
    console.warn("[geometryCache] delete failed", err);
  }
}

export async function clearAllCache(): Promise<void> {
  memoryStore.clear();
  resetCacheStats();
  if (!isTauriRuntime()) return;
  try {
    const dir = await getCacheDir();
    if (!dir) return;
    const { join } = await import("@tauri-apps/api/path");
    const { readDir, remove } = await import("@tauri-apps/plugin-fs");
    const entries = await readDir(dir);
    for (const entry of entries) {
      if (entry.name?.endsWith(".bin")) {
        const path = await join(dir, entry.name);
        await remove(path);
      }
    }
  } catch (err) {
    console.warn("[geometryCache] clear failed", err);
  }
}
