import type { CadImportResult } from "./cad";
import type { Part, Stock } from "./quoteTypes";
import { groupIdenticalMeshes } from "./meshFingerprint";
import { analyzeRawStock, computeMeshStats } from "./shapeAnalysis";

// Quote handoff always uses raw-material stock, never the finished-body
// classification: a featured body still needs a buyable blank.
function stockFromGeometry(geometry: import("three").BufferGeometry): Stock {
  const rawStock = analyzeRawStock(geometry);
  if (rawStock.shape === "round") {
    return { shape: "round", dims: { D: rawStock.dims.D, L: rawStock.dims.L } };
  }
  if (rawStock.shape === "hex") {
    return { shape: "hex", dims: { AF: rawStock.dims.AF, L: rawStock.dims.L } };
  }
  if (rawStock.shape === "rect") {
    return {
      shape: "rect",
      dims: { L: rawStock.dims.L, W: rawStock.dims.W, H: rawStock.dims.H },
    };
  }
  // Degenerate envelope — fall back to sorted raw envelope dimensions.
  const sorted = [
    rawStock.dims.xMm,
    rawStock.dims.yMm,
    rawStock.dims.zMm,
  ].sort((a, b) => b - a);
  return { shape: "rect", dims: { L: sorted[0], W: sorted[1], H: sorted[2] } };
}

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
