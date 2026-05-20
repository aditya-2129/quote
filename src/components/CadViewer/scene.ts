import type { MutableRefObject } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { CadImportResult } from "@utils/index";
import type { SceneMeshRecord } from "./types";
import { buildFaceAwareEdges } from "./edges";
import { applyExplode } from "./explode";

export type SceneBundle = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  modelGroup: THREE.Group;
  gizmoScene: THREE.Scene;
  gizmoCamera: THREE.PerspectiveCamera;
};

export function initScene(
  container: HTMLDivElement,
  model: CadImportResult,
  recordsRef: MutableRefObject<SceneMeshRecord[]>,
  modelSizeRef: MutableRefObject<number>,
  modelScaleRef: MutableRefObject<number>,
): SceneBundle {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 50000);
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.domElement.style.display = "block";
  renderer.domElement.style.height = "100%";
  renderer.domElement.style.width = "100%";
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.screenSpacePanning = true;
  controls.mouseButtons = {
    LEFT: undefined as unknown as THREE.MOUSE,
    MIDDLE: THREE.MOUSE.ROTATE,
    RIGHT: THREE.MOUSE.PAN,
  };

  scene.add(new THREE.HemisphereLight("#ffffff", "#6b7280", 2.7));
  const keyLight = new THREE.DirectionalLight("#ffffff", 3.2);
  keyLight.position.set(160, 220, 180);
  keyLight.castShadow = true;
  scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight("#bdefff", 1.4);
  fillLight.position.set(-220, 100, -160);
  scene.add(fillLight);

  const modelGroup = new THREE.Group();
  scene.add(modelGroup);

  const bounds = new THREE.Box3();
  const rawGroup = new THREE.Group();
  model.meshes.forEach((cadMesh) => {
    const geometry = cadMesh.geometry.clone();
    const makeMat = (color: string) =>
      new THREE.MeshStandardMaterial({
        color,
        metalness: 0.12,
        roughness: 0.55,
        side: THREE.DoubleSide,
      });
    const materials =
      cadMesh.faceColors && cadMesh.faceColors.length > 0
        ? cadMesh.faceColors.map(makeMat)
        : [makeMat(cadMesh.color)];
    const mesh = new THREE.Mesh(geometry, materials.length === 1 ? materials[0] : materials);
    mesh.userData.meshId = cadMesh.id;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    rawGroup.add(mesh);
    bounds.expandByObject(mesh);
  });

  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  bounds.getCenter(center);
  bounds.getSize(size);
  const maxSize = Math.max(size.x, size.y, size.z, 1);
  const scale = 420 / maxSize;
  modelSizeRef.current = Math.max(size.x, size.y, size.z) * scale;
  modelScaleRef.current = scale;

  const rawChildren = [...rawGroup.children];
  rawChildren.forEach((object, index) => {
    if (!(object instanceof THREE.Mesh)) {
      return;
    }

    object.geometry.translate(-center.x, -center.y, -center.z);
    object.scale.setScalar(scale);
    object.geometry.computeBoundingBox();
    object.geometry.computeVertexNormals();

    const cadMesh = model.meshes[index];

    const edgeMaterial = new THREE.LineBasicMaterial({
      color: "#111827",
      transparent: true,
      opacity: 0.38,
    });
    const edges = new THREE.LineSegments(
      buildFaceAwareEdges(object.geometry, 30),
      edgeMaterial,
    );
    edges.scale.copy(object.scale);

    modelGroup.add(object);
    modelGroup.add(edges);
    const mats = Array.isArray(object.material)
      ? (object.material as THREE.MeshStandardMaterial[])
      : [object.material as THREE.MeshStandardMaterial];
    recordsRef.current.push({
      meshId: cadMesh.id,
      mesh: object,
      edges,
      basePosition: object.position.clone(),
      explodeDirection: new THREE.Vector3(),
      materials: mats,
      edgeMaterial,
    });
  });

  applyExplode({ records: recordsRef.current, size });

  // ── Axis gizmo ───────────────────────────────────────────────────────────
  const gizmoScene = new THREE.Scene();
  const makeArrow = (dir: THREE.Vector3, color: string) =>
    new THREE.ArrowHelper(dir, new THREE.Vector3(), 0.75, color, 0.28, 0.13);
  gizmoScene.add(makeArrow(new THREE.Vector3(1, 0, 0), "#ef4444")); // X red
  gizmoScene.add(makeArrow(new THREE.Vector3(0, 1, 0), "#22c55e")); // Y green
  gizmoScene.add(makeArrow(new THREE.Vector3(0, 0, 1), "#3b82f6")); // Z blue
  gizmoScene.add(new THREE.AmbientLight("#ffffff", 3));
  const gizmoCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 10);

  return { scene, camera, renderer, controls, modelGroup, gizmoScene, gizmoCamera };
}

export function makeAnimateLoop(params: {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  gizmoScene: THREE.Scene;
  gizmoCamera: THREE.PerspectiveCamera;
}): { start: () => void; stop: () => void } {
  const { renderer, scene, camera, controls, gizmoScene, gizmoCamera } = params;
  const GIZMO_PX = 80; // CSS pixels
  let frame = 0;

  const animate = () => {
    frame = window.requestAnimationFrame(animate);
    controls.update();

    // Main scene
    renderer.setScissorTest(false);
    renderer.render(scene, camera);

    // Gizmo in bottom-left corner
    gizmoCamera.position.set(0, 0, 2.5).applyQuaternion(camera.quaternion);
    gizmoCamera.quaternion.copy(camera.quaternion);
    renderer.setViewport(10, 10, GIZMO_PX, GIZMO_PX);
    renderer.setScissor(10, 10, GIZMO_PX, GIZMO_PX);
    renderer.setScissorTest(true);
    renderer.clearDepth();
    renderer.render(gizmoScene, gizmoCamera);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, renderer.domElement.clientWidth, renderer.domElement.clientHeight);
  };

  return {
    start: () => animate(),
    stop: () => window.cancelAnimationFrame(frame),
  };
}

export function makeResize(params: {
  container: HTMLDivElement;
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
}): () => void {
  const { container, renderer, camera } = params;
  return () => {
    const bounds = container.getBoundingClientRect();
    const width = Math.max(container.clientWidth || bounds.width, 1);
    const height = Math.max(container.clientHeight || bounds.height, 420);
    renderer.setSize(width, height, true);
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
  };
}

export function disposeScene(params: {
  bundle: SceneBundle;
  container: HTMLDivElement;
  recordsRef: MutableRefObject<SceneMeshRecord[]>;
  measureObjectsRef: MutableRefObject<THREE.Object3D[]>;
  measurePointsRef: MutableRefObject<THREE.Vector3[]>;
  measurePointARef: MutableRefObject<THREE.Vector3 | null>;
  currentSnapRef: MutableRefObject<THREE.Vector3 | null>;
  previewLine: THREE.Line;
  snapIndicator: THREE.Mesh;
}): void {
  const {
    bundle, container, recordsRef, measureObjectsRef,
    measurePointsRef, measurePointARef, currentSnapRef,
    previewLine, snapIndicator,
  } = params;

  bundle.controls.dispose();
  bundle.renderer.dispose();
  previewLine.geometry.dispose();
  snapIndicator.geometry.dispose();
  recordsRef.current.forEach((record) => {
    record.mesh.geometry.dispose();
    record.edges.geometry.dispose();
    record.materials.forEach((mat) => mat.dispose());
    record.edgeMaterial.dispose();
  });
  recordsRef.current = [];
  measureObjectsRef.current = [];
  measurePointsRef.current = [];
  measurePointARef.current = null;
  currentSnapRef.current = null;
  container.removeChild(bundle.renderer.domElement);
}
