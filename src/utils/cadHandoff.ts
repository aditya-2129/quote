import type { CadImportResult } from "./cad";
import type { Part, Stock } from "./quoteTypes";
import { groupIdenticalMeshes } from "./meshFingerprint";
import { analyzeShape, computeMeshStats } from "./shapeAnalysis";

function stockFromGeometry(geometry: import("three").BufferGeometry): Stock {
  const shape = analyzeShape(geometry);
  if (shape.kind === "cylinder") {
    return {
      shape: "round",
      dims: {
        D: round1(shape.outerDiaMm),
        L: round1(shape.lengthMm),
        ID: shape.innerDiaMm != null ? round1(shape.innerDiaMm) : 0,
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
    const stock = stockFromGeometry(rep.geometry);
    const stats = computeMeshStats(rep.geometry);
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
    };
  });
}
