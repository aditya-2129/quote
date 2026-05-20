import type { Ref } from "react";
import * as THREE from "three";
import type { ShapeAnalysis } from "@utils/shapeAnalysis";
import type { CadImportResult } from "@utils/index";

export type CadViewOrientation = "iso" | "front" | "top" | "right";
export type CadDisplayMode = "solid" | "wireframe";
export type CadViewportTheme = "dark" | "light";

export type CadViewerHandle = {
  fit: (meshId?: string) => void;
  setOrientation: (orientation: CadViewOrientation) => void;
  screenshot: () => string | null;
  clearMeasure: () => void;
  getModelSize: () => number;
};

export type CadViewerProps = {
  model: CadImportResult;
  selectedMeshId?: string;
  hiddenMeshIds: Set<string>;
  displayMode: CadDisplayMode;
  viewportTheme: CadViewportTheme;
  explode: { x: number; y: number; z: number };
  showEdges?: boolean;
  bgColor?: string;
  clippingPlane?: { axis: 'x' | 'y' | 'z'; value: number } | null;
  measureMode?: boolean;
  selectionFilter?: "body" | "point";
  onSelectMesh?: (meshId: string | undefined) => void;
  onMeasured?: (distanceMm: number) => void;
  onBodyMeasure?: (analysis: ShapeAnalysis, meshId: string) => void;
  ref?: Ref<CadViewerHandle>;
};

export type SceneMeshRecord = {
  meshId: string;
  mesh: THREE.Mesh;
  edges: THREE.LineSegments;
  basePosition: THREE.Vector3;
  explodeDirection: THREE.Vector3;
  materials: THREE.MeshStandardMaterial[];
  edgeMaterial: THREE.LineBasicMaterial;
};
