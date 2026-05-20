import * as THREE from "three";
import type { SceneMeshRecord } from "./types";

export function applyViewerAppearance(params: {
  renderer: THREE.WebGLRenderer | null;
  records: SceneMeshRecord[];
  selectedMeshId?: string;
  hiddenMeshIds: Set<string>;
  displayMode: "solid" | "wireframe";
  viewportTheme: "dark" | "light";
  explode: { x: number; y: number; z: number };
  showEdges: boolean;
  bgColor?: string;
}): void {
  const {
    renderer, records, selectedMeshId, hiddenMeshIds,
    displayMode, viewportTheme, explode, showEdges, bgColor,
  } = params;
  const sceneColor = bgColor ?? (viewportTheme === "light" ? "#f8fafc" : "#0b0f14");
  renderer?.setClearColor(sceneColor);

  records.forEach((record) => {
    const isHidden = hiddenMeshIds.has(record.meshId);
    const isSelected = selectedMeshId === record.meshId;
    record.mesh.visible = !isHidden;
    record.edges.visible = !isHidden && (showEdges || isSelected);
    record.materials.forEach((mat) => {
      mat.wireframe = displayMode === "wireframe";
      mat.emissive.set(isSelected ? "#38bdf8" : "#000000");
      mat.emissiveIntensity = isSelected ? 0.65 : 0;
    });
    record.edgeMaterial.color.set(isSelected ? "#38bdf8" : "#111827");
    record.edgeMaterial.opacity = isSelected ? 1 : 0.38;
    record.edges.renderOrder = isSelected ? 1 : 0;
    record.mesh.position.set(
      record.basePosition.x + record.explodeDirection.x * explode.x,
      record.basePosition.y + record.explodeDirection.y * explode.y,
      record.basePosition.z + record.explodeDirection.z * explode.z,
    );
    record.edges.position.copy(record.mesh.position);
  });
}

export function applyClippingPlane(
  renderer: THREE.WebGLRenderer | null,
  clippingPlane: { axis: "x" | "y" | "z"; value: number } | null | undefined,
): void {
  if (!renderer) return;
  if (!clippingPlane) {
    renderer.clippingPlanes = [];
    return;
  }
  const normals: Record<"x" | "y" | "z", THREE.Vector3> = {
    x: new THREE.Vector3(1, 0, 0),
    y: new THREE.Vector3(0, 1, 0),
    z: new THREE.Vector3(0, 0, 1),
  };
  renderer.clippingPlanes = [new THREE.Plane(normals[clippingPlane.axis], -clippingPlane.value)];
}
