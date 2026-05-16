import type { CadImportResult } from "./cad";
import type { Part } from "./quoteTypes";

export function cadResultToParts(cad: CadImportResult): Part[] {
  return cad.meshes.map((mesh) => ({
    id: mesh.id,
    name: mesh.name,
    color: mesh.color,
    material: "",
    perAssembly: 1,
    mass: 0,
    finishing: 0,
    included: true,
    stocked: false,
    stock: null,
    operations: [],
  }));
}
