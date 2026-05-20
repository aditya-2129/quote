import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { CadImportResult } from "@utils/index";
import { analyzeShape, type ShapeAnalysis } from "@utils/shapeAnalysis";

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

// ── Measure helpers ──────────────────────────────────────────────────────────

function axisConstrain(a: THREE.Vector3, b: THREE.Vector3): THREE.Vector3 {
  const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y), dz = Math.abs(b.z - a.z);
  if (dx >= dy && dx >= dz) return new THREE.Vector3(b.x, a.y, a.z);
  if (dy >= dx && dy >= dz) return new THREE.Vector3(a.x, b.y, a.z);
  return new THREE.Vector3(a.x, a.y, b.z);
}

type CadViewerProps = {
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

type SceneMeshRecord = {
  meshId: string;
  mesh: THREE.Mesh;
  edges: THREE.LineSegments;
  basePosition: THREE.Vector3;
  explodeDirection: THREE.Vector3;
  materials: THREE.MeshStandardMaterial[];
  edgeMaterial: THREE.LineBasicMaterial;
};

/**
 * Compute edges per BREP face group so that flat-face tessellation diagonals
 * get correct dihedral angles (≈0°) and are culled by the threshold.
 * Without this, OCCT's per-face vertex pools give EdgesGeometry no adjacency
 * across triangle boundaries, so every triangle edge renders.
 */
function buildFaceAwareEdges(geo: THREE.BufferGeometry, thresholdDeg: number): THREE.BufferGeometry {
  const idx = geo.index;
  const pos = geo.attributes.position;
  const groups = geo.groups;

  const allEdgePositions: number[] = [];

  const processGroup = (startIdx: number, countIdx: number) => {
    const numTri = Math.floor(countIdx / 3);
    if (numTri === 0) return;

    const subPos: number[] = [];
    const subIdx: number[] = [];

    for (let t = 0; t < numTri; t++) {
      const base = subPos.length / 3;
      const ia = startIdx + t * 3;
      const a = idx ? idx.getX(ia)     : ia;
      const b = idx ? idx.getX(ia + 1) : ia + 1;
      const c = idx ? idx.getX(ia + 2) : ia + 2;
      subPos.push(pos.getX(a), pos.getY(a), pos.getZ(a));
      subPos.push(pos.getX(b), pos.getY(b), pos.getZ(b));
      subPos.push(pos.getX(c), pos.getY(c), pos.getZ(c));
      subIdx.push(base, base + 1, base + 2);
    }

    const subGeo = new THREE.BufferGeometry();
    subGeo.setAttribute("position", new THREE.Float32BufferAttribute(subPos, 3));
    subGeo.setIndex(subIdx);
    const edgeGeo = new THREE.EdgesGeometry(subGeo, thresholdDeg);
    const ePosArr = edgeGeo.attributes.position;
    for (let i = 0; i < ePosArr.count; i++) {
      allEdgePositions.push(ePosArr.getX(i), ePosArr.getY(i), ePosArr.getZ(i));
    }
    edgeGeo.dispose();
    subGeo.dispose();
  };

  if (groups.length > 0) {
    for (const g of groups) processGroup(g.start, g.count);
  } else {
    const totalIdx = idx ? idx.count : Math.floor(pos.count / 3) * 3;
    processGroup(0, totalIdx);
  }

  const result = new THREE.BufferGeometry();
  result.setAttribute("position", new THREE.Float32BufferAttribute(allEdgePositions, 3));
  return result;
}

export function CadViewer({
  model,
  selectedMeshId,
  hiddenMeshIds,
  displayMode,
  viewportTheme,
  explode,
  showEdges = true,
  bgColor,
  clippingPlane,
  measureMode,
  selectionFilter = "point",
  onSelectMesh,
  onMeasured,
  onBodyMeasure,
  ref,
}: CadViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const recordsRef = useRef<SceneMeshRecord[]>([]);
  const modelSizeRef = useRef(1);
  const modelScaleRef = useRef(1);
  const selectedMeshIdRef = useRef(selectedMeshId);
  const measureModeRef = useRef(measureMode ?? false);
  const onMeasuredRef = useRef(onMeasured);
  const onSelectMeshRef = useRef(onSelectMesh);
  const measurePointsRef = useRef<THREE.Vector3[]>([]);
  const measureObjectsRef = useRef<THREE.Object3D[]>([]);
  const measurePointARef = useRef<THREE.Vector3 | null>(null);
  const shiftPressedRef = useRef(false);
  const previewLineRef = useRef<THREE.Line | null>(null);
  const snapIndicatorRef = useRef<THREE.Mesh | null>(null);
  const currentSnapRef = useRef<THREE.Vector3 | null>(null);
  const hoveredMeshIdRef = useRef<string | null>(null);
  const selectionFilterRef = useRef<"body" | "point">(selectionFilter);
  const onBodyMeasureRef = useRef(onBodyMeasure);
  useEffect(() => { selectedMeshIdRef.current = selectedMeshId; }, [selectedMeshId]);
  useEffect(() => {
    measureModeRef.current = measureMode ?? false;
    if (!measureMode) {
      if (snapIndicatorRef.current) snapIndicatorRef.current.visible = false;
      if (previewLineRef.current) previewLineRef.current.visible = false;
      measurePointARef.current = null;
    }
  }, [measureMode]);
  useEffect(() => { onMeasuredRef.current = onMeasured; }, [onMeasured]);
  useEffect(() => { onSelectMeshRef.current = onSelectMesh; }, [onSelectMesh]);
  useEffect(() => { selectionFilterRef.current = selectionFilter; }, [selectionFilter]);
  useEffect(() => { onBodyMeasureRef.current = onBodyMeasure; }, [onBodyMeasure]);

  const setCameraOrientation = (orientation: CadViewOrientation) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) {
      return;
    }

    // Frame the orientation around currently-visible bodies so that isolating a
    // small body and then clicking Top/Front/Right/Iso keeps it filling the view.
    const box = new THREE.Box3();
    recordsRef.current.forEach((record) => {
      if (record.mesh.visible) box.expandByObject(record.mesh);
    });
    const center = new THREE.Vector3();
    let distance = modelSizeRef.current * 1.9;
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
  };

  useImperativeHandle(ref, () => ({
    fit: (meshId?: string) => fitCamera(meshId),
    setOrientation: (orientation: CadViewOrientation) => setCameraOrientation(orientation),
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
  }));

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }

    const scene = new THREE.Scene();
    sceneRef.current = scene;
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
    controls.mouseButtons = {
      LEFT: undefined as unknown as THREE.MOUSE,
      MIDDLE: THREE.MOUSE.ROTATE,
      RIGHT: THREE.MOUSE.PAN,
    };
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

    // Hybrid explode: every part gets a guaranteed linear slot along the
    // assembly's principal (stacking) axis, plus a radial offset perpendicular
    // to that axis. The per-axis Trim X/Y/Z sliders then scale each world axis,
    // so the user can dampen the linear stack independently of the lateral fan.
    type ExplodePart = {
      rec: SceneMeshRecord;
      center: THREE.Vector3;
      size: THREE.Vector3;
      maxSize: number;
      idx: number;
    };

    const parts: ExplodePart[] = recordsRef.current.map((rec, idx) => {
      const box = new THREE.Box3().setFromObject(rec.mesh);
      const center = new THREE.Vector3();
      const sizeVec = new THREE.Vector3();
      box.getCenter(center);
      box.getSize(sizeVec);
      return {
        rec,
        center,
        size: sizeVec,
        maxSize: Math.max(sizeVec.x, sizeVec.y, sizeVec.z, 1),
        idx,
      };
    });

    if (parts.length > 1) {
      const assemblyCenter = new THREE.Vector3();
      parts.forEach(p => assemblyCenter.add(p.center));
      assemblyCenter.divideScalar(parts.length);

      // Principal axis from the assembly bounding box shape (proportions, not
      // part-center variance — a grid of small buttons would otherwise out-vote
      // the few large plates and pick the wrong axis):
      //   * Plate-stack / mould (one very thin bbox dim) → thinnest axis is
      //     the stacking direction.
      //   * Shaft / fixture (roughly equal short dims, one long) → longest
      //     axis is the principal axis.
      const PLATE_RATIO_THRESHOLD = 0.35;
      const bboxMin = Math.min(size.x, size.y, size.z);
      const bboxMax = Math.max(size.x, size.y, size.z);
      const principalIdx: 0 | 1 | 2 =
        bboxMin / Math.max(bboxMax, 1) < PLATE_RATIO_THRESHOLD
          ? (size.x <= size.y && size.x <= size.z ? 0
             : size.y <= size.z ? 1 : 2)
          : (size.x >= size.y && size.x >= size.z ? 0
             : size.y >= size.z ? 1 : 2);
      const principalAxis = new THREE.Vector3();
      principalAxis.setComponent(principalIdx, 1);

      // Rank parts by their coord on the principal axis. Ties broken by idx so
      // the ordering is stable across reloads.
      const sorted = [...parts].sort((a, b) => {
        const da = a.center.getComponent(principalIdx);
        const db = b.center.getComponent(principalIdx);
        return da === db ? a.idx - b.idx : da - db;
      });
      const rankByIdx = new Map<number, number>();
      sorted.forEach((p, rank) => rankByIdx.set(p.idx, rank));

      // Linear step: at least the thickest part along the principal axis, so
      // even big plates clear their neighbours at master=1.0.
      const maxSizeOnPrincipal = parts.reduce(
        (m, p) => Math.max(m, p.size.getComponent(principalIdx)),
        0,
      );
      const avgSize = parts.reduce((s, p) => s + p.maxSize, 0) / parts.length;
      const linearStep = Math.max(maxSizeOnPrincipal * 1.1, avgSize * 1.3);
      const midRank = (parts.length - 1) / 2;

      // Radial scatter: small parts travel further than large ones so dowels
      // and buttons clear the plate they were nested in.
      const maxPartSize = parts.reduce((m, p) => Math.max(m, p.maxSize), 0);
      const RADIAL_GAIN = 1.4;
      const perp1Idx = ((principalIdx + 1) % 3) as 0 | 1 | 2;
      const perp2Idx = ((principalIdx + 2) % 3) as 0 | 1 | 2;

      parts.forEach(p => {
        const rank = rankByIdx.get(p.idx) ?? 0;

        // Linear: every part gets a unique slot along the principal axis.
        const linear = principalAxis.clone()
          .multiplyScalar((rank - midRank) * linearStep);

        // Radial: offset from assembly axis projected into the perpendicular
        // plane, then scaled by inverse size so small parts fan out further.
        const radial = p.center.clone().sub(assemblyCenter);
        radial.setComponent(principalIdx, 0);
        const sizeRatio = p.maxSize / Math.max(maxPartSize, 1);
        radial.multiplyScalar(1 + (1 - sizeRatio) * RADIAL_GAIN);

        // Parts sitting exactly on the principal axis (no radial offset) get a
        // deterministic angular fan-out so they don't visually stay glued.
        if (radial.length() < avgSize * 0.05) {
          const a = (p.idx / parts.length) * Math.PI * 2;
          radial.setComponent(perp1Idx, Math.cos(a) * avgSize * 0.5);
          radial.setComponent(perp2Idx, Math.sin(a) * avgSize * 0.5);
        }

        p.rec.explodeDirection.copy(linear).add(radial);
      });
    } else {
      parts.forEach(p => p.rec.explodeDirection.set(0, 0, 0));
    }

    // Measure overlay objects
    const previewLineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const previewLine = new THREE.Line(
      previewLineGeo,
      new THREE.LineBasicMaterial({ color: "#f59e0b", depthTest: false, transparent: true, opacity: 0.6 }),
    );
    previewLine.renderOrder = 997;
    previewLine.visible = false;
    scene.add(previewLine);
    previewLineRef.current = previewLine;

    const snapIndicatorMat = new THREE.MeshBasicMaterial({ color: "#22c55e", depthTest: false });
    const snapIndicator = new THREE.Mesh(
      new THREE.SphereGeometry(3.5, 12, 12),
      snapIndicatorMat,
    );
    snapIndicator.renderOrder = 1000;
    snapIndicator.visible = false;
    scene.add(snapIndicator);
    snapIndicatorRef.current = snapIndicator;

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    // Screen-space snap: project every visible edge to 2D pixels, find closest
    // segment within a pixel radius. This is how SolidWorks/Fusion/Onshape snap —
    // it works even when the cursor hovers over empty space (inside a hole, in
    // section gaps, etc.) because it doesn't depend on a surface raycast hit.
    const PIXEL_SNAP_RADIUS = 12;
    const ENDPOINT_T_THRESHOLD = 0.08;  // segment param threshold for "this is a vertex"
    type ScreenSnap = { point: THREE.Vector3; type: 'vertex' | 'edge'; distPx: number };

    const _va = new THREE.Vector3();
    const _vb = new THREE.Vector3();
    const _pa = new THREE.Vector3();
    const _pb = new THREE.Vector3();

    const findScreenSpaceSnap = (event: { clientX: number; clientY: number }): ScreenSnap | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      const sx = event.clientX - rect.left;
      const sy = event.clientY - rect.top;
      const W = rect.width, H = rect.height;
      let best: ScreenSnap | null = null;

      for (const rec of recordsRef.current) {
        if (!rec.mesh.visible) continue;
        rec.edges.updateMatrixWorld();
        const edgePos = rec.edges.geometry.attributes.position as THREE.BufferAttribute | undefined;
        if (!edgePos) continue;
        const ewm = rec.edges.matrixWorld;
        const count = edgePos.count;

        for (let i = 0; i + 1 < count; i += 2) {
          _va.fromBufferAttribute(edgePos, i).applyMatrix4(ewm);
          _vb.fromBufferAttribute(edgePos, i + 1).applyMatrix4(ewm);
          // World-space copies for the actual snap output (project() mutates in place)
          _pa.copy(_va).project(camera);
          _pb.copy(_vb).project(camera);
          // Skip if both endpoints are clipped out of NDC z range
          if ((_pa.z < -1 || _pa.z > 1) && (_pb.z < -1 || _pb.z > 1)) continue;

          const ax = (_pa.x + 1) * 0.5 * W;
          const ay = (1 - _pa.y) * 0.5 * H;
          const bx = (_pb.x + 1) * 0.5 * W;
          const by = (1 - _pb.y) * 0.5 * H;

          // Quick reject: cursor outside expanded segment bbox
          const minX = Math.min(ax, bx) - PIXEL_SNAP_RADIUS;
          const maxX = Math.max(ax, bx) + PIXEL_SNAP_RADIUS;
          const minY = Math.min(ay, by) - PIXEL_SNAP_RADIUS;
          const maxY = Math.max(ay, by) + PIXEL_SNAP_RADIUS;
          if (sx < minX || sx > maxX || sy < minY || sy > maxY) continue;

          const dx = bx - ax, dy = by - ay;
          const lenSq = dx * dx + dy * dy;
          let t = 0;
          if (lenSq > 0.0001) t = Math.max(0, Math.min(1, ((sx - ax) * dx + (sy - ay) * dy) / lenSq));
          const px = ax + t * dx, py = ay + t * dy;
          const d = Math.hypot(px - sx, py - sy);
          if (d > PIXEL_SNAP_RADIUS) continue;

          const isEndpoint = t < ENDPOINT_T_THRESHOLD || t > 1 - ENDPOINT_T_THRESHOLD;
          // Endpoints get a 4px attraction bonus so corners win ties over edge midpoints
          const effective = d - (isEndpoint ? 4 : 0);
          if (best && effective >= best.distPx) continue;

          const point = _va.clone().lerp(_vb, t);
          best = { point, type: isEndpoint ? 'vertex' : 'edge', distPx: effective };
        }
      }
      return best;
    };

    const setSnapIndicatorColor = (type: 'vertex' | 'edge' | null) => {
      if (type === 'vertex') snapIndicatorMat.color.set("#22c55e");      // green
      else if (type === 'edge') snapIndicatorMat.color.set("#f59e0b");   // amber
    };

    const getSnappedPoint = (event: { clientX: number; clientY: number }): THREE.Vector3 | null => {
      // Stage 1: screen-space snap (works regardless of raycast hit)
      const ssSnap = findScreenSpaceSnap(event);
      if (ssSnap) {
        setSnapIndicatorColor(ssSnap.type);
        return ssSnap.point;
      }
      // Stage 2: fallback to surface raycast hit point (free-form point on a face)
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(recordsRef.current.map(r => r.mesh), false);
      if (hits.length === 0) return null;
      // No edge nearby — show neutral indicator for surface snap
      setSnapIndicatorColor('edge');
      return hits[0].point.clone();
    };

    const applyHoverState = (meshId: string | null) => {
      if (hoveredMeshIdRef.current !== null) {
        const prev = recordsRef.current.find(r => r.meshId === hoveredMeshIdRef.current);
        if (prev) {
          const sel = prev.meshId === selectedMeshIdRef.current;
          prev.materials.forEach(m => { m.emissive.set(sel ? "#38bdf8" : "#000000"); m.emissiveIntensity = sel ? 0.65 : 0; });
        }
      }
      if (meshId !== null) {
        const rec = recordsRef.current.find(r => r.meshId === meshId);
        if (rec && rec.meshId !== selectedMeshIdRef.current) {
          rec.materials.forEach(m => { m.emissive.set("#38bdf8"); m.emissiveIntensity = 0.25; });
        }
      }
      hoveredMeshIdRef.current = meshId;
    };

    const handlePointerMove = (event: PointerEvent) => {
      // Hover highlight — always active
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hoverHits = raycaster.intersectObjects(recordsRef.current.map(r => r.mesh), false);
      const hitId = (hoverHits[0]?.object.userData.meshId as string | undefined) ?? null;
      if (hitId !== hoveredMeshIdRef.current) applyHoverState(hitId);

      if (!measureModeRef.current || selectionFilterRef.current === "body") {
        if (!measureModeRef.current) {
          snapIndicator.visible = false;
          previewLine.visible = false;
          currentSnapRef.current = null;
        }
        return;
      }

      const snapped = getSnappedPoint(event);
      if (!snapped) {
        snapIndicator.visible = false;
        previewLine.visible = false;
        currentSnapRef.current = null;
        return;
      }
      currentSnapRef.current = snapped;
      snapIndicator.position.copy(snapped);
      snapIndicator.visible = true;
      const ptA = measurePointARef.current;
      if (ptA) {
        const ptB = shiftPressedRef.current ? axisConstrain(ptA, snapped) : snapped;
        const positions = previewLine.geometry.attributes.position as THREE.BufferAttribute;
        positions.setXYZ(0, ptA.x, ptA.y, ptA.z);
        positions.setXYZ(1, ptB.x, ptB.y, ptB.z);
        positions.needsUpdate = true;
        previewLine.geometry.computeBoundingSphere();
        previewLine.visible = true;
      }
    };

    const handlePointerLeave = () => {
      applyHoverState(null);
      snapIndicator.visible = false;
      previewLine.visible = false;
      currentSnapRef.current = null;
    };

    renderer.domElement.addEventListener("pointermove", handlePointerMove);
    renderer.domElement.addEventListener("pointerleave", handlePointerLeave);

    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === "Shift") shiftPressedRef.current = true; };
    const handleKeyUp = (e: KeyboardEvent) => { if (e.key === "Shift") shiftPressedRef.current = false; };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    const handlePointerDown = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const meshes = recordsRef.current.map(r => r.mesh);
      const hits = raycaster.intersectObjects(meshes, false);

      if (measureModeRef.current) {
        if (selectionFilterRef.current === "body") {
          const meshId = hits[0]?.object.userData.meshId as string | undefined;
          if (!meshId) return;
          const rec = recordsRef.current.find(r => r.meshId === meshId);
          if (!rec) return;
          const analysis = analyzeShape(rec.mesh.geometry);
          onBodyMeasureRef.current?.(analysis, meshId);
          rec.edgeMaterial.color.set("#f59e0b");
          rec.edgeMaterial.opacity = 1;
          rec.edges.visible = true;
          setTimeout(() => {
            const isSelected = rec.meshId === selectedMeshIdRef.current;
            rec.edgeMaterial.color.set(isSelected ? "#38bdf8" : "#111827");
            rec.edgeMaterial.opacity = isSelected ? 1 : 0.38;
          }, 600);
          return;
        }
        const pt = currentSnapRef.current?.clone() ?? (hits.length > 0 ? hits[0].point.clone() : null);
        if (!pt) {
          // Clicked empty space — cancel in-progress measurement
          if (measurePointARef.current !== null) {
            measurePointARef.current = null;
            measureObjectsRef.current.forEach(o => scene.remove(o));
            measureObjectsRef.current = [];
            previewLine.visible = false;
          }
          return;
        }

        const makeDot = (pos: THREE.Vector3) => {
          const mat = new THREE.LineBasicMaterial({ color: "#f59e0b", depthTest: false });
          const distToCam = () => camera.position.distanceTo(pos);
          // Size scales with distance so it stays screen-consistent
          const r = distToCam() * 0.022;
          const arm = r * 1.5;

          // Ring
          const ringPts: THREE.Vector3[] = [];
          const SEG = 32;
          for (let i = 0; i <= SEG; i++) {
            const a = (i / SEG) * Math.PI * 2;
            ringPts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0));
          }
          const ring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(ringPts), mat);
          ring.renderOrder = 999;

          // Horizontal arm
          const hGeo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(-arm, 0, 0),
            new THREE.Vector3(-r * 1.05, 0, 0),
            new THREE.Vector3(r * 1.05, 0, 0),
            new THREE.Vector3(arm, 0, 0),
          ]);
          const hLine = new THREE.Line(hGeo, mat);
          hLine.renderOrder = 999;

          // Vertical arm
          const vGeo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, -arm, 0),
            new THREE.Vector3(0, -r * 1.05, 0),
            new THREE.Vector3(0, r * 1.05, 0),
            new THREE.Vector3(0, arm, 0),
          ]);
          const vLine = new THREE.Line(vGeo, mat);
          vLine.renderOrder = 999;

          const group = new THREE.Group();
          group.add(ring, hLine, vLine);
          group.position.copy(pos);
          // Billboard: always face camera
          group.onBeforeRender = (_r, _s, cam) => { group.quaternion.copy(cam.quaternion); };
          scene.add(group);
          measureObjectsRef.current.push(group);
        };

        if (measurePointARef.current === null) {
          // Clear any previous measurement before starting a new one
          measureObjectsRef.current.forEach(o => scene.remove(o));
          measureObjectsRef.current = [];
          measurePointARef.current = pt;
          makeDot(pt);
        } else {
          const ptB = shiftPressedRef.current ? axisConstrain(measurePointARef.current, pt) : pt;
          makeDot(ptB);
          const lineGeo = new THREE.BufferGeometry().setFromPoints([measurePointARef.current, ptB]);
          const line = new THREE.Line(
            lineGeo,
            new THREE.LineBasicMaterial({ color: "#f59e0b", depthTest: false }),
          );
          line.renderOrder = 998;
          scene.add(line);
          measureObjectsRef.current.push(line);
          const distMm = measurePointARef.current.distanceTo(ptB) / modelScaleRef.current;
          onMeasuredRef.current?.(distMm);
          measurePointARef.current = null;
          previewLine.visible = false;
        }
        return;
      }

      const meshId = hits[0]?.object.userData.meshId as string | undefined;
      if (!meshId || meshId === selectedMeshIdRef.current) {
        onSelectMeshRef.current?.(undefined);
      } else {
        onSelectMeshRef.current?.(meshId);
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

    // ── Axis gizmo ───────────────────────────────────────────────────────────
    const gizmoScene = new THREE.Scene();
    const makeArrow = (dir: THREE.Vector3, color: string) =>
      new THREE.ArrowHelper(dir, new THREE.Vector3(), 0.75, color, 0.28, 0.13);
    gizmoScene.add(makeArrow(new THREE.Vector3(1, 0, 0), "#ef4444")); // X red
    gizmoScene.add(makeArrow(new THREE.Vector3(0, 1, 0), "#22c55e")); // Y green
    gizmoScene.add(makeArrow(new THREE.Vector3(0, 0, 1), "#3b82f6")); // Z blue
    gizmoScene.add(new THREE.AmbientLight("#ffffff", 3));
    const gizmoCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 10);
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
    animate();

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("pointerleave", handlePointerLeave);
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      controls.dispose();
      renderer.dispose();
      previewLine.geometry.dispose();
      snapIndicator.geometry.dispose();
      previewLineRef.current = null;
      snapIndicatorRef.current = null;
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
      container.removeChild(renderer.domElement);
      rendererRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
      sceneRef.current = null;
    };
  // Scene setup is intentionally tied to model identity; live viewer props are
  // applied by narrower effects below to avoid rebuilding the Three.js scene.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  useEffect(() => {
    hoveredMeshIdRef.current = null;
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

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    if (!clippingPlane) {
      renderer.clippingPlanes = [];
      return;
    }
    const normals: Record<'x'|'y'|'z', THREE.Vector3> = {
      x: new THREE.Vector3(1, 0, 0),
      y: new THREE.Vector3(0, 1, 0),
      z: new THREE.Vector3(0, 0, 1),
    };
    renderer.clippingPlanes = [new THREE.Plane(normals[clippingPlane.axis], -clippingPlane.value)];
  }, [clippingPlane]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      aria-label={model.fileName}
    />
  );
}
