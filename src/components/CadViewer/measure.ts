import type { MutableRefObject } from "react";
import * as THREE from "three";
import type { SceneMeshRecord } from "./types";

// ── Measure helpers ──────────────────────────────────────────────────────────

export function axisConstrain(a: THREE.Vector3, b: THREE.Vector3): THREE.Vector3 {
  const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y), dz = Math.abs(b.z - a.z);
  if (dx >= dy && dx >= dz) return new THREE.Vector3(b.x, a.y, a.z);
  if (dy >= dx && dy >= dz) return new THREE.Vector3(a.x, b.y, a.z);
  return new THREE.Vector3(a.x, a.y, b.z);
}

export type ScreenSnap = { point: THREE.Vector3; type: 'vertex' | 'edge'; distPx: number };

const PIXEL_SNAP_RADIUS = 12;
const ENDPOINT_T_THRESHOLD = 0.08; // segment param threshold for "this is a vertex"

export function makeFindScreenSpaceSnap(params: {
  records: MutableRefObject<SceneMeshRecord[]>;
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
}): (event: { clientX: number; clientY: number }) => ScreenSnap | null {
  const { records, renderer, camera } = params;
  const _va = new THREE.Vector3();
  const _vb = new THREE.Vector3();
  const _pa = new THREE.Vector3();
  const _pb = new THREE.Vector3();

  return (event: { clientX: number; clientY: number }): ScreenSnap | null => {
    const rect = renderer.domElement.getBoundingClientRect();
    const sx = event.clientX - rect.left;
    const sy = event.clientY - rect.top;
    const W = rect.width, H = rect.height;
    let best: ScreenSnap | null = null;

    for (const rec of records.current) {
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
}

export function makeGetSnappedPoint(params: {
  findScreenSpaceSnap: (event: { clientX: number; clientY: number }) => ScreenSnap | null;
  setSnapIndicatorColor: (type: 'vertex' | 'edge' | null) => void;
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  pointer: THREE.Vector2;
  raycaster: THREE.Raycaster;
  records: MutableRefObject<SceneMeshRecord[]>;
}): (event: { clientX: number; clientY: number }) => THREE.Vector3 | null {
  const { findScreenSpaceSnap, setSnapIndicatorColor, renderer, camera, pointer, raycaster, records } = params;

  return (event: { clientX: number; clientY: number }): THREE.Vector3 | null => {
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
    const hits = raycaster.intersectObjects(records.current.map(r => r.mesh), false);
    if (hits.length === 0) return null;
    // No edge nearby — show neutral indicator for surface snap
    setSnapIndicatorColor('edge');
    return hits[0].point.clone();
  };
}

export function makeMakeDot(params: {
  camera: THREE.PerspectiveCamera;
  scene: THREE.Scene;
  measureObjectsRef: MutableRefObject<THREE.Object3D[]>;
}): (pos: THREE.Vector3) => void {
  const { camera, scene, measureObjectsRef } = params;

  return (pos: THREE.Vector3): void => {
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
}
