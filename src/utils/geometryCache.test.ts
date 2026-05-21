import { describe, it, expect, beforeEach } from "vitest";
import * as THREE from "three";
import {
  sha256,
  getOcctOptionsDigest,
  serializeBufferGeometry,
  deserializeBufferGeometry,
  getCachedImport,
  saveCachedImport,
  clearGeometryCache,
  getCacheStats,
  incrementCacheMisses,
} from "./geometryCache";
import type { CadImportResult } from "./cad";

describe("Geometry Cache Utilities", () => {
  beforeEach(async () => {
    localStorage.clear();
    await clearGeometryCache();
  });

  it("computes a deterministic SHA-256 hash", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const hash1 = await sha256(bytes);
    const hash2 = await sha256(bytes);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
    expect(hash1).toBe("74f81fe167d99b4cb41d6d0ccda82278caee9f3e2f25d5e5a3936ff3dcec60d0");
  });

  it("computes a deterministic digest of OCCT import options", async () => {
    const opts1 = { linearUnit: "millimeter" as const, linearDeflection: 0.001 };
    const opts2 = { linearUnit: "millimeter" as const, linearDeflection: 0.001 };
    const opts3 = { linearUnit: "inch" as const, linearDeflection: 0.05 };

    const digest1 = await getOcctOptionsDigest(opts1);
    const digest2 = await getOcctOptionsDigest(opts2);
    const digest3 = await getOcctOptionsDigest(opts3);

    expect(digest1).toBe(digest2);
    expect(digest1).not.toBe(digest3);
  });

  it("correctly serializes and deserializes a THREE.BufferGeometry", () => {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const indices = new Uint32Array([0, 1, 2]);
    const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]);

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.addGroup(0, 3, 1);

    const serialized = serializeBufferGeometry(geometry);
    expect(serialized.position).toBeDefined();
    expect(serialized.index).toBeDefined();
    expect(serialized.normal).toBeDefined();
    expect(serialized.groups).toHaveLength(1);
    expect(serialized.groups[0]).toEqual({ start: 0, count: 3, materialIndex: 1 });

    const deserialized = deserializeBufferGeometry(serialized);
    expect(deserialized).toBeInstanceOf(THREE.BufferGeometry);
    
    const dPos = deserialized.getAttribute("position") as THREE.BufferAttribute;
    const dNorm = deserialized.getAttribute("normal") as THREE.BufferAttribute;
    const dIdx = deserialized.getIndex();

    expect(Array.from(dPos.array)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    expect(Array.from(dNorm.array)).toEqual([0, 0, 1, 0, 0, 1, 0, 0, 1]);
    expect(Array.from(dIdx!.array)).toEqual([0, 1, 2]);
    expect(deserialized.groups).toHaveLength(1);
    expect(deserialized.groups[0]).toEqual({ start: 0, count: 3, materialIndex: 1 });
  });

  it("handles saving and loading CAD imports in the cache", async () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
    geometry.setIndex([0, 1, 2]);

    const importResult: CadImportResult = {
      fileName: "test.step",
      source: "step",
      rootNode: {
        id: "root",
        name: "test.step",
        meshIds: ["mesh-1"],
        children: [],
      },
      geometry: {
        fileName: "test.step",
        boundingBoxMm: { x: 1, y: 1, z: 1 },
        volumeMm3: 0.5,
        surfaceAreaMm2: 0.5,
        faceCount: 1,
        vertexCount: 3,
      },
      meshes: [
        {
          id: "mesh-1",
          name: "Test Body",
          color: "#ff0000",
          triangleCount: 1,
          vertexCount: 3,
          center: new THREE.Vector3(0.3, 0.3, 0),
          geometry,
          occtIndex: 0,
          meshBlobPath: null,
        },
      ],
    };

    const hash = "test-file-sha256-hash";
    const optionsDigest = "test-options-digest";

    // 1. Initially no hit
    const initial = await getCachedImport(hash, optionsDigest);
    expect(initial).toBeNull();
    incrementCacheMisses();

    // 2. Save to cache
    const saved = await saveCachedImport(hash, optionsDigest, importResult);
    expect(saved.cacheStatus).toBe("miss");

    // 3. Cache hit
    const hit = await getCachedImport(hash, optionsDigest);
    expect(hit).not.toBeNull();
    expect(hit!.fileName).toBe("test.step");
    expect(hit!.cacheStatus).toBe("hit");
    expect(hit!.meshes).toHaveLength(1);
    expect(hit!.meshes[0].name).toBe("Test Body");
    expect(hit!.meshes[0].geometry).toBeInstanceOf(THREE.BufferGeometry);

    // Verify statistics
    const stats = getCacheStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1); // 1 miss for the saveCachedImport / first load
    expect(stats.ratio).toBe(50); // 1 / 2 = 50%
  });
});
