import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { CadViewOrientation, SceneMeshRecord } from "./types";

export function setCameraOrientation(params: {
  orientation: CadViewOrientation;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  records: SceneMeshRecord[];
  modelSize: number;
}): void {
  const { orientation, camera, controls, records, modelSize } = params;

  // Frame the orientation around currently-visible bodies so that isolating a
  // small body and then clicking Top/Front/Right/Iso keeps it filling the view.
  const box = new THREE.Box3();
  records.forEach((record) => {
    if (record.mesh.visible) box.expandByObject(record.mesh);
  });
  const center = new THREE.Vector3();
  let distance = modelSize * 1.9;
  if (!box.isEmpty()) {
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    const maxSize = Math.max(size.x, size.y, size.z, 1);
    distance = maxSize * 1.9;
  }

  const offsets: Record<CadViewOrientation, THREE.Vector3> = {
    iso: new THREE.Vector3(distance, distance * 0.78, distance),
    front: new THREE.Vector3(0, 0, distance),
    top: new THREE.Vector3(0, distance, 0.01),
    right: new THREE.Vector3(distance, 0, 0),
  };

  camera.position.copy(center).add(offsets[orientation]);
  controls.target.copy(center);
  camera.lookAt(controls.target);
  camera.near = Math.max(distance / 500, 0.01);
  camera.far = distance * 20;
  camera.updateProjectionMatrix();
  controls.update();
}

export function fitCamera(params: {
  meshId?: string;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  records: SceneMeshRecord[];
  hiddenMeshIds: Set<string>;
}): void {
  const { meshId, camera, controls, records, hiddenMeshIds } = params;

  const box = new THREE.Box3();
  const filtered = meshId
    ? records.filter((record) => record.meshId === meshId)
    : records.filter((record) => !hiddenMeshIds.has(record.meshId));

  filtered.forEach((record) => {
    box.expandByObject(record.mesh);
  });

  if (box.isEmpty()) {
    return;
  }

  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);
  const maxSize = Math.max(size.x, size.y, size.z, 1);
  const distance = maxSize * 1.8;
  const viewDirection = camera.position.clone().sub(controls.target).normalize();
  if (viewDirection.lengthSq() === 0) {
    viewDirection.set(1, 0.78, 1).normalize();
  }

  controls.target.copy(center);
  camera.position.copy(center).addScaledVector(viewDirection, distance);
  camera.near = Math.max(distance / 500, 0.01);
  camera.far = distance * 20;
  camera.updateProjectionMatrix();
  controls.update();
}
