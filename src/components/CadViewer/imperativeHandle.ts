import type { MutableRefObject } from "react";
import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { fitCamera, setCameraOrientation } from "./fitCamera";
import type { CadViewerHandle, CadViewOrientation, SceneMeshRecord } from "./types";

export function createCadViewerHandle(params: {
  cameraRef: MutableRefObject<THREE.PerspectiveCamera | null>;
  controlsRef: MutableRefObject<OrbitControls | null>;
  rendererRef: MutableRefObject<THREE.WebGLRenderer | null>;
  sceneRef: MutableRefObject<THREE.Scene | null>;
  recordsRef: MutableRefObject<SceneMeshRecord[]>;
  hiddenMeshIds: Set<string>;
  modelSizeRef: MutableRefObject<number>;
  measurePointsRef: MutableRefObject<THREE.Vector3[]>;
  measurePointARef: MutableRefObject<THREE.Vector3 | null>;
  measureObjectsRef: MutableRefObject<THREE.Object3D[]>;
  previewLineRef: MutableRefObject<THREE.Line | null>;
  snapIndicatorRef: MutableRefObject<THREE.Mesh | null>;
}): CadViewerHandle {
  const {
    cameraRef, controlsRef, rendererRef, sceneRef, recordsRef, hiddenMeshIds,
    modelSizeRef, measurePointsRef, measurePointARef, measureObjectsRef,
    previewLineRef, snapIndicatorRef,
  } = params;

  return {
    fit: (meshId?: string) => {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls) return;
      fitCamera({ meshId, camera, controls, records: recordsRef.current, hiddenMeshIds });
    },
    setOrientation: (orientation: CadViewOrientation) => {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls) return;
      setCameraOrientation({
        orientation,
        camera,
        controls,
        records: recordsRef.current,
        modelSize: modelSizeRef.current,
      });
    },
    screenshot: () => rendererRef.current?.domElement.toDataURL("image/png") ?? null,
    getModelSize: () => modelSizeRef.current,
    clearMeasure: () => {
      measurePointsRef.current = [];
      measurePointARef.current = null;
      measureObjectsRef.current.forEach(o => sceneRef.current?.remove(o));
      measureObjectsRef.current = [];
      if (previewLineRef.current) previewLineRef.current.visible = false;
      if (snapIndicatorRef.current) snapIndicatorRef.current.visible = false;
    },
  };
}
