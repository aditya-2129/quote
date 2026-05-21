import type { CadImportResult } from "./cad";
import type { Part, Stock } from "./quoteTypes";
import { groupIdenticalMeshes, computeFingerprintHash } from "./meshFingerprint";
import { analyzeShape, computeMeshStats } from "./shapeAnalysis";

function stockFromGeometry(geometry: import("three").BufferGeometry): Stock {
  const shape = analyzeShape(geometry);
  if (shape.kind === "cylinder") {
    return {
      shape: "round",
      dims: {
        D: round1(shape.outerDiaMm),
        L: round1(shape.lengthMm),
      },
    };
  }
  if (shape.kind === "hex") {
    return { shape: "hex", dims: { AF: round1(shape.afMm), L: round1(shape.lengthMm) } };
  }
  const sorted = [shape.xMm, shape.yMm, shape.zMm].sort((a, b) => b - a);
  return { shape: "rect", dims: { L: round1(sorted[0]), W: round1(sorted[1]), H: round1(sorted[2]) } };
}

function round1(n: number) { return Math.round(n * 10) / 10; }

export function cadResultToParts(cad: CadImportResult): Part[] {
  const byId = new Map(cad.meshes.map(m => [m.id, m]));
  const groups = groupIdenticalMeshes(
    cad.meshes.map(m => ({ id: m.id, geometry: m.geometry })),
  );
  return groups.map(({ representativeId, meshIds }) => {
    const rep = byId.get(representativeId)!;
    const shape = analyzeShape(rep.geometry);
    const stock = stockFromGeometry(rep.geometry);
    const stats = computeMeshStats(rep.geometry);
    const fingerprintHash = computeFingerprintHash(rep.geometry);
    return {
      id: rep.id,
      name: meshIds.length > 1 ? `${rep.name} × ${meshIds.length}` : rep.name,
      color: rep.color,
      material: "",
      perAssembly: meshIds.length,
      mass: 0,
      netVolumeMm3: stats.volumeMm3,
      finishing: 0,
      included: true,
      stocked: false,
      stock,
      operations: [],
      meshIds,
      geometry: {
        fileName: cad.fileName,
        unitSystem: "metric" as const,
        bboxXMm: stats.boundingBoxMm.x,
        bboxYMm: stats.boundingBoxMm.y,
        bboxZMm: stats.boundingBoxMm.z,
        volumeMm3: stats.volumeMm3,
        surfaceAreaMm2: stats.surfaceAreaMm2,
        faceCount: stats.triangleCount,
        vertexCount: stats.vertexCount,
        fingerprintHash,
        triangleCount: stats.triangleCount,
        shapeKind: shape.kind,
        shapeParams: JSON.stringify(shape),
        faceColors: rep.faceColors ? JSON.stringify(rep.faceColors) : null,
        meshBlobPath: rep.meshBlobPath || null,
      },
    };
  });
}
