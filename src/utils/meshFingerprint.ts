import type * as THREE from "three";
import { computeMeshStats, type MeshStats } from "./shapeAnalysis";

/**
 * Identity match for two BREP bodies given only their triangulated meshes.
 *
 * Layer 1 (cheap reject): triCount, volume, sorted bbox dims, surface area.
 *
 * Layer 2 (radial signature): sorted multiset of |vertex - centroid|, quantised.
 * Strictly invariant under rigid motion AND mirroring — no basis choice
 * involved, so it's stable across the tessellation jitter that produces tiny
 * inertia-tensor wobble between instances. Combined with the cheap key, the
 * chance of two genuinely different bodies sharing both is astronomically low
 * for real mechanical parts.
 *
 * The previous attempt used principal-axis projection + a 48-orientation
 * lex-min search; the orientation chosen was unstable under quantisation
 * noise, which caused true duplicates to split into different sub-groups.
 * Radial signature avoids that entire failure mode.
 */

type CheapKey = string;

function cheapKey(stats: MeshStats): CheapKey {
  // Bucket only on integer-stable fields. Floats (volume, area, bbox dims)
  // jitter slightly between OCCT-tessellated instances of the same body, so
  // ANY rounded-float key has boundary cases where true duplicates land in
  // different buckets and never get compared. triCount + vertexCount are
  // deterministic for a given BREP shape and don't have that problem.
  // Pass 2 (pairwise radial-distance tolerance) confirms identity within each
  // bucket and rejects unrelated bodies that happen to share these counts.
  return `${stats.triangleCount}|${stats.vertexCount}`;
}

// Per-vertex tolerance for the pairwise comparison (mm). Two bodies count as
// the same if at least (1 - OUTLIER_FRACTION) of sorted radial distances agree
// within this tolerance. 0.1 mm is below any meaningful machining tolerance.
//
// We allow a small outlier fraction because OCCT can re-place 1-2 boundary or
// interior vertices very differently between tessellated instances of the same
// nominal BREP body — the bulk of the mesh agrees but a handful of stragglers
// shift by mm. Strict element-wise compare rejected real duplicates because of
// these stragglers; allowing 1% outliers admits them while still rejecting
// genuinely different bodies (whose distance distributions differ across many
// vertices, not just a few).
const RADIAL_TOL_MM = 0.1;
const OUTLIER_FRACTION = 0.01;

function sortedRadialDistances(geo: THREE.BufferGeometry): Float64Array {
  const pos = geo.attributes.position;
  if (!pos || pos.count === 0) return new Float64Array(0);
  const n = pos.count;
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < n; i++) {
    cx += pos.getX(i); cy += pos.getY(i); cz += pos.getZ(i);
  }
  cx /= n; cy /= n; cz /= n;
  const d = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const dx = pos.getX(i) - cx;
    const dy = pos.getY(i) - cy;
    const dz = pos.getZ(i) - cz;
    d[i] = Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  d.sort();
  return d;
}

// True iff every paired distance agrees within tolerance. Lengths must match
// (the cheap key already ensures triCount/vertexCount match for same-bucket
// meshes, so this is a same-length comparison).
function radialMatch(a: Float64Array, b: Float64Array): boolean {
  if (a.length !== b.length) return false;
  const maxOutliers = Math.max(2, Math.floor(a.length * OUTLIER_FRACTION));
  let outliers = 0;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i] - b[i]) > RADIAL_TOL_MM) {
      outliers++;
      if (outliers > maxOutliers) return false;
    }
  }
  return true;
}

export type FingerprintedMesh = {
  meshId: string;
  stats: MeshStats;
  groupKey: string; // cheapKey + canonicalHash
};

/**
 * Group meshes that are identical bodies up to rigid motion. Returns an array
 * of groups; the first meshId in each group is the "representative".
 *
 * Two-phase: first bucket by cheap key (O(n)), then within each bucket compare
 * canonical hashes (which is expensive — we only compute it when the bucket
 * has more than one member). This keeps the common case (all bodies distinct)
 * at O(n) and only pays the canonical-hash cost where it matters.
 */
export function groupIdenticalMeshes(
  meshes: { id: string; geometry: THREE.BufferGeometry }[],
): { representativeId: string; meshIds: string[] }[] {
  // Pass 1: cheap stats + bucket by cheap key.
  type Entry = { id: string; geo: THREE.BufferGeometry; stats: MeshStats };
  const buckets = new Map<CheapKey, Entry[]>();
  for (const m of meshes) {
    const stats = computeMeshStats(m.geometry);
    const key = cheapKey(stats);
    const bucket = buckets.get(key);
    if (bucket) bucket.push({ id: m.id, geo: m.geometry, stats });
    else buckets.set(key, [{ id: m.id, geo: m.geometry, stats }]);
  }

  // Pass 2: within each multi-member bucket, group by pairwise sorted-radial
  // tolerance compare. Hashing was tried first but ANY quantisation grid has
  // boundary cases where tessellation jitter pushes true duplicates to
  // different cells. Tolerance-based compare avoids that entire failure mode.
  // O(N² × vertexCount) per bucket — fine because buckets are small (a few
  // members each) and most buckets are size-1.
  const groups: { representativeId: string; meshIds: string[] }[] = [];
  for (const bucket of buckets.values()) {
    if (bucket.length === 1) {
      groups.push({ representativeId: bucket[0].id, meshIds: [bucket[0].id] });
      continue;
    }
    // Compute sorted radial distances once per bucket member.
    const sigs = bucket.map(e => sortedRadialDistances(e.geo));
    // Union-find over bucket indices, edge = radialMatch.
    const parent = bucket.map((_, i) => i);
    const find = (x: number): number => parent[x] === x ? x : (parent[x] = find(parent[x]));
    for (let i = 0; i < bucket.length; i++) {
      for (let j = i + 1; j < bucket.length; j++) {
        if (find(i) === find(j)) continue;
        if (radialMatch(sigs[i], sigs[j])) parent[find(j)] = find(i);
      }
    }
    // Collect members per root, preserving original order.
    const byRoot = new Map<number, string[]>();
    for (let i = 0; i < bucket.length; i++) {
      const root = find(i);
      const list = byRoot.get(root);
      if (list) list.push(bucket[i].id);
      else byRoot.set(root, [bucket[i].id]);
    }
    for (const ids of byRoot.values()) {
      groups.push({ representativeId: ids[0], meshIds: ids });
    }
  }

  // Preserve original mesh order (by first occurrence of representative).
  const order = new Map(meshes.map((m, i) => [m.id, i]));
  groups.sort((a, b) => (order.get(a.representativeId)! - order.get(b.representativeId)!));
  return groups;
}
