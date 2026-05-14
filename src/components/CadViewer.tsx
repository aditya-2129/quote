import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { CadImportResult, CadTreeNode } from "@utils/index";

export type CadViewOrientation = "iso" | "front" | "top" | "right";
export type CadDisplayMode = "solid" | "wireframe";
export type CadViewportTheme = "dark" | "light";

export type CadViewerHandle = {
  fit: (meshId?: string) => void;
  setOrientation: (orientation: CadViewOrientation) => void;
  screenshot: () => string | null;
};

type CadViewerProps = {
  model: CadImportResult;
  selectedMeshId?: string;
  hiddenMeshIds: Set<string>;
  displayMode: CadDisplayMode;
  viewportTheme: CadViewportTheme;
  explode: { x: number; y: number; z: number };
  showEdges?: boolean;
  bgColor?: string;
  onSelectMesh?: (meshId: string | undefined) => void;
  ref?: Ref<CadViewerHandle>;
};

type SceneMeshRecord = {
  meshId: string;
  mesh: THREE.Mesh;
  edges: THREE.LineSegments;
  basePosition: THREE.Vector3;
  explodeDirection: THREE.Vector3;
  materials: THREE.MeshStandardMaterial[];
  edgeMaterial: THREE.LineBasicMaterial;
};

export function CadViewer({
  model,
  selectedMeshId,
  hiddenMeshIds,
  displayMode,
  viewportTheme,
  explode,
  showEdges = true,
  bgColor,
  onSelectMesh,
  ref,
}: CadViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const recordsRef = useRef<SceneMeshRecord[]>([]);
  const modelSizeRef = useRef(1);
  const selectedMeshIdRef = useRef(selectedMeshId);
  useEffect(() => { selectedMeshIdRef.current = selectedMeshId; }, [selectedMeshId]);

  const setCameraOrientation = (orientation: CadViewOrientation) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) {
      return;
    }

    const distance = modelSizeRef.current * 1.9;
    const positions: Record<CadViewOrientation, THREE.Vector3> = {
      iso: new THREE.Vector3(distance, distance * 0.78, distance),
      front: new THREE.Vector3(0, 0, distance),
      top: new THREE.Vector3(0, distance, 0.01),
      right: new THREE.Vector3(distance, 0, 0),
    };

    camera.position.copy(positions[orientation]);
    controls.target.set(0, 0, 0);
    camera.lookAt(controls.target);
    controls.update();
  };

  const fitCamera = (meshId?: string) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) {
      return;
    }

    const box = new THREE.Box3();
    const records = meshId
      ? recordsRef.current.filter((record) => record.meshId === meshId)
      : recordsRef.current.filter(
          (record) => !hiddenMeshIds.has(record.meshId),
        );

    records.forEach((record) => {
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

    controls.target.copy(center);
    camera.position.set(
      center.x + distance,
      center.y + distance * 0.78,
      center.z + distance,
    );
    camera.near = Math.max(distance / 500, 0.01);
    camera.far = distance * 20;
    camera.updateProjectionMatrix();
    controls.update();
  };

  useImperativeHandle(ref, () => ({
    fit: (meshId?: string) => fitCamera(meshId),
    setOrientation: (orientation: CadViewOrientation) => {
      setCameraOrientation(orientation);
    },
    screenshot: () =>
      rendererRef.current?.domElement.toDataURL("image/png") ?? null,
  }));

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }

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

    rendererRef.current = renderer;
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = true;
    controlsRef.current = controls;

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
        new THREE.EdgesGeometry(object.geometry, 18),
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

    const meshRecordById = new Map(
      recordsRef.current.map((record) => [record.meshId, record]),
    );

    type AssemblyInfo = {
      center: THREE.Vector3;
      size: number;
      directMeshIds: string[];
      childInfos: AssemblyInfo[];
    };

    const buildAssembly = (treeNode: CadTreeNode): AssemblyInfo => {
      const childInfos = treeNode.children.map(buildAssembly);
      const box = new THREE.Box3();
      const expandFromAssembly = (info: AssemblyInfo) => {
        info.directMeshIds.forEach((meshId) => {
          const rec = meshRecordById.get(meshId);
          if (rec) box.expandByObject(rec.mesh);
        });
        info.childInfos.forEach(expandFromAssembly);
      };
      treeNode.meshIds.forEach((meshId) => {
        const rec = meshRecordById.get(meshId);
        if (rec) box.expandByObject(rec.mesh);
      });
      childInfos.forEach(expandFromAssembly);

      const center = new THREE.Vector3();
      const size = new THREE.Vector3();
      if (!box.isEmpty()) {
        box.getCenter(center);
        box.getSize(size);
      }
      return {
        center,
        size: Math.max(size.x, size.y, size.z, 1),
        directMeshIds: treeNode.meshIds,
        childInfos,
      };
    };

    const rootInfo = buildAssembly(model.rootNode);

    const walkAssembly = (info: AssemblyInfo, accumulated: THREE.Vector3) => {
      const childCount = info.directMeshIds.length + info.childInfos.length;
      let childIndex = 0;
      const fallbackDir = (i: number) =>
        new THREE.Vector3((i % 3) - 1, 0.25, i % 2 ? 1 : -1).normalize();

      info.directMeshIds.forEach((meshId) => {
        const rec = meshRecordById.get(meshId);
        if (!rec) {
          childIndex += 1;
          return;
        }
        const meshBox = new THREE.Box3().setFromObject(rec.mesh);
        const meshCenter = new THREE.Vector3();
        meshBox.getCenter(meshCenter);
        const dir = meshCenter.clone().sub(info.center);
        if (dir.length() < 0.001) {
          dir.copy(fallbackDir(childIndex));
        } else {
          dir.normalize();
        }
        const factor = childCount > 1 ? 0.5 : 0;
        const offset = dir.multiplyScalar(info.size * factor);
        rec.explodeDirection.copy(accumulated).add(offset);
        childIndex += 1;
      });

      info.childInfos.forEach((childInfo) => {
        const dir = childInfo.center.clone().sub(info.center);
        if (dir.length() < 0.001) {
          dir.copy(fallbackDir(childIndex));
        } else {
          dir.normalize();
        }
        const factor = childCount > 1 ? 0.5 : 0;
        const offset = dir.multiplyScalar(info.size * factor);
        walkAssembly(childInfo, accumulated.clone().add(offset));
        childIndex += 1;
      });
    };

    walkAssembly(rootInfo, new THREE.Vector3());

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const handlePointerDown = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(
        recordsRef.current.map((record) => record.mesh),
        false,
      );
      const meshId = hits[0]?.object.userData.meshId as string | undefined;
      if (!meshId || meshId === selectedMeshIdRef.current) {
        onSelectMesh?.(undefined);
      } else {
        onSelectMesh?.(meshId);
      }
    };
    renderer.domElement.addEventListener("pointerdown", handlePointerDown);

    const resize = () => {
      const bounds = container.getBoundingClientRect();
      const width = Math.max(container.clientWidth || bounds.width, 1);
      const height = Math.max(container.clientHeight || bounds.height, 420);
      renderer.setSize(width, height, true);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    setCameraOrientation("iso");
    fitCamera();

    let frame = 0;
    const animate = () => {
      frame = window.requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      controls.dispose();
      renderer.dispose();
      recordsRef.current.forEach((record) => {
        record.mesh.geometry.dispose();
        record.edges.geometry.dispose();
        record.materials.forEach((mat) => mat.dispose());
        record.edgeMaterial.dispose();
      });
      recordsRef.current = [];
      container.removeChild(renderer.domElement);
      rendererRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
    };
  }, [model, onSelectMesh]);

  useEffect(() => {
    const sceneColor = bgColor ?? (viewportTheme === "light" ? "#f8fafc" : "#0b0f14");
    const renderer = rendererRef.current;
    if (renderer) {
      renderer.setClearColor(sceneColor);
    }

    recordsRef.current.forEach((record) => {
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
  }, [bgColor, displayMode, explode, hiddenMeshIds, selectedMeshId, showEdges, viewportTheme]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      aria-label={model.fileName}
    />
  );
}
