import type { CadImportResult } from "./cad";
import type { Part } from "./quoteTypes";
import { groupIdenticalMeshes } from "./meshFingerprint";

export function cadResultToParts(cad: CadImportResult): Part[] {
  const byId = new Map(cad.meshes.map(m => [m.id, m]));
  const groups = groupIdenticalMeshes(
    cad.meshes.map(m => ({ id: m.id, geometry: m.geometry })),
  );
  return groups.map(({ representativeId, meshIds }) => {
    const rep = byId.get(representativeId)!;
    return {
      id: rep.id,
      name: meshIds.length > 1 ? `${rep.name} × ${meshIds.length}` : rep.name,
      color: rep.color,
      material: "",
      perAssembly: meshIds.length,
      mass: 0,
      finishing: 0,
      included: true,
      stocked: false,
      stock: null,
      operations: [],
      meshIds,
    };
  });
}
