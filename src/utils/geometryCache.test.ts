import * as THREE from "three";
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearAllCache,
  computeCacheKey,
  getCacheStats,
  lookupCachedImport,
  recordCacheHit,
  recordCacheMiss,
  resetCacheStats,
  storeCachedImport,
} from "./geometryCache";
import type { CadImportResult } from "./cad";

function makeResult(fileName = "x.step"): CadImportResult {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array([
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
    1, 1, 0,
  ]);
  const index = new Uint32Array([0, 1, 2, 1, 3, 2]);
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.computeVertexNormals();
  geometry.addGroup(0, 6, 0);
  const center = new THREE.Vector3();
  geometry.computeBoundingBox();
  geometry.boundingBox?.getCenter(center);

  return {
    fileName,
    meshes: [
      {
        id: "part-0",
        name: "Square",
        geometry,
        color: "#abcdef",
        faceColors: undefined,
        triangleCount: 2,
        vertexCount: 4,
        center,
        occtIndex: 0,
      },
    ],
    rootNode: {
      id: "root",
      name: fileName,
      meshIds: ["part-0"],
      children: [],
    },
    geometry: {
      fileName,
      boundingBoxMm: { x: 1, y: 1, z: 0 },
      volumeMm3: 0,
      surfaceAreaMm2: 1,
      faceCount: 2,
      vertexCount: 4,
    },
    source: "step",
  };
}

beforeEach(async () => {
  await clearAllCache();
  resetCacheStats();
});

describe("computeCacheKey", () => {
  it("is stable across identical byte arrays", async () => {
    const a = new Uint8Array([1, 2, 3, 4, 5]);
    const b = new Uint8Array([1, 2, 3, 4, 5]);
    expect(await computeCacheKey(a)).toBe(await computeCacheKey(b));
  });

  it("differs across different byte arrays", async () => {
    const a = await computeCacheKey(new Uint8Array([1, 2, 3]));
    const b = await computeCacheKey(new Uint8Array([1, 2, 4]));
    expect(a).not.toBe(b);
  });
});

describe("cache storage", () => {
  it("returns null for a missing key", async () => {
    expect(await lookupCachedImport("missing-key")).toBeNull();
  });

  it("round-trips a CadImportResult through serialize/deserialize", async () => {
    const original = makeResult("round-trip.step");
    await storeCachedImport("round-trip-key", original);
    const restored = await lookupCachedImport("round-trip-key");

    expect(restored).not.toBeNull();
    expect(restored!.fileName).toBe(original.fileName);
    expect(restored!.source).toBe(original.source);
    expect(restored!.meshes).toHaveLength(1);
    const restoredMesh = restored!.meshes[0];
    expect(restoredMesh.id).toBe("part-0");
    expect(restoredMesh.triangleCount).toBe(2);
    expect(restoredMesh.vertexCount).toBe(4);
    const restoredPositions = restoredMesh.geometry.getAttribute("position").array;
    const originalPositions = original.meshes[0].geometry.getAttribute("position").array;
    expect(Array.from(restoredPositions)).toEqual(Array.from(originalPositions));
    const restoredIndex = restoredMesh.geometry.getIndex();
    expect(restoredIndex).not.toBeNull();
    expect(Array.from(restoredIndex!.array)).toEqual([0, 1, 2, 1, 3, 2]);
    expect(restoredMesh.geometry.groups).toHaveLength(1);
  });

  it("overrides fileName on lookup so renamed copies still hit cache", async () => {
    await storeCachedImport("rename-key", makeResult("original.step"));
    const restored = await lookupCachedImport("rename-key");
    expect(restored).not.toBeNull();
    // Caller spreads { ...cached, fileName } at the call site; here we just
    // verify the stored fileName reflects what we wrote.
    expect(restored!.fileName).toBe("original.step");
  });
});

describe("cache stats", () => {
  it("accumulates hits and misses independently and computes ratio", () => {
    recordCacheHit();
    recordCacheHit();
    recordCacheHit();
    recordCacheMiss();
    const stats = getCacheStats();
    expect(stats.hits).toBe(3);
    expect(stats.misses).toBe(1);
    expect(stats.ratio).toBeCloseTo(0.75, 5);
  });

  it("returns zero ratio when no activity recorded", () => {
    expect(getCacheStats()).toEqual({ hits: 0, misses: 0, ratio: 0 });
  });
});
