import * as THREE from "three";
import type { SceneMeshRecord } from "./types";

export type ExplodeParams = {
  records: SceneMeshRecord[];
  size: THREE.Vector3;  // assembly bbox size, computed at original line 333 in scene init
};

/**
 * DO NOT MODIFY — protected explode algorithm per AGENTS.MD.
 * Principal-axis detection, rank-based linear slots, size-scaled radial
 * scatter, and angular fan-out fallback. Any change requires explicit user
 * approval.
 */
export function applyExplode({ records, size }: ExplodeParams): void {
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

  const parts: ExplodePart[] = records.map((rec, idx) => {
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
}
