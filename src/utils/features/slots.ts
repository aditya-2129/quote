import {
  findFacesByClass,
  type FaceClass,
  type TopologyGraph,
} from "../topology";

export interface Slot {
  kind: "rounded" | "rectangular";
  lengthMm: number;
  widthMm: number;
  depthMm: number;
  axis: [number, number, number];
  faceIds: string[];
}

type Vec3 = [number, number, number];
type PlaneClass = Extract<FaceClass, { kind: "plane" }>;

// Tolerances
const PARALLEL_TOLERANCE = 0.01;
const ORTHOGONAL_TOLERANCE = 0.05;
const RADIUS_TOLERANCE_MM = 0.05;

export function detectSlots(graph: TopologyGraph | undefined): Slot[] {
  if (!graph) return [];

  const slots: Slot[] = [];
  const matchedFaceIds = new Set<string>();
  const faceEdgeSets = buildFaceEdgeSets(graph);

  // 1. Detect Rounded Slots
  const cylinders = findFacesByClass(graph, "cylinder").filter(
    (c) => !c.angularSpan || c.angularSpan < Math.PI * 1.9,
  );
  const planes = findFacesByClass(graph, "plane");

  for (let i = 0; i < cylinders.length; i++) {
    const c1 = cylinders[i];
    if (matchedFaceIds.has(c1.face.id)) continue;

    for (let j = i + 1; j < cylinders.length; j++) {
      const c2 = cylinders[j];
      if (matchedFaceIds.has(c2.face.id)) continue;

      // Check same radius
      if (Math.abs(c1.radius - c2.radius) > RADIUS_TOLERANCE_MM) continue;

      // Check parallel axes
      if (!isParallel(c1.axisDirection, c2.axisDirection)) continue;

      const V_axis = normalize(c1.axisDirection);

      // Compute separation along plane perpendicular to V_axis
      const p1 = c1.axisOrigin;
      const p2 = c2.axisOrigin;
      const V_diff = sub(p2, p1);
      const V_proj = scale(V_axis, dot(V_diff, V_axis));
      const V_perp = sub(V_diff, V_proj);
      const L_sep = length(V_perp);

      if (L_sep < 0.1) continue; // coaxial

      const V_sep = normalize(V_perp);
      const radius = c1.radius;
      const L_slot = L_sep + 2 * radius;
      const W_slot = 2 * radius;
      const aspect = L_slot / W_slot;

      if (aspect <= 2.0) continue;

      // Look for parallel planar walls connecting c1 and c2
      const N_ideal = normalize(cross(V_axis, V_sep));
      const matchingWalls = planes.filter((pl) => {
        const sharesWithC1 = sharesEdge(pl.face.id, c1.face.id, faceEdgeSets);
        const sharesWithC2 = sharesEdge(pl.face.id, c2.face.id, faceEdgeSets);
        if (!sharesWithC1 || !sharesWithC2) return false;
        return isParallel(pl.normal, N_ideal);
      });

      // We need planar walls connecting them to be a rounded slot
      if (matchingWalls.length === 0) continue;

      // Look for floors
      const floors = planes.filter((pl) => {
        if (!isParallel(pl.normal, V_axis)) return false;
        return (
          sharesEdge(pl.face.id, c1.face.id, faceEdgeSets) ||
          sharesEdge(pl.face.id, c2.face.id, faceEdgeSets) ||
          matchingWalls.some((w) => sharesEdge(pl.face.id, w.face.id, faceEdgeSets))
        );
      });

      // Depth is length of cylinders, or distance between floor and any parallel plane
      let depth = c1.length ?? c2.length ?? 0;
      if (depth === 0 && floors.length > 0) {
        const floor = floors[0];
        const parallelPlanes = planes.filter(
          (p) =>
            p.face.id !== floor.face.id && isParallel(p.normal, floor.normal),
        );
        let bestTop: PlaneClass | null = null;
        for (const p of parallelPlanes) {
          const sharesWithWall = matchingWalls.some((w) =>
            sharesEdge(p.face.id, w.face.id, faceEdgeSets),
          );
          if (sharesWithWall) {
            bestTop = p;
            break;
          }
        }
        if (bestTop) {
          depth = Math.abs(dot(sub(bestTop.origin, floor.origin), floor.normal));
        } else if (parallelPlanes.length > 0) {
          let minDistance = Infinity;
          for (const p of parallelPlanes) {
            const dist = Math.abs(
              dot(sub(p.origin, floor.origin), floor.normal),
            );
            if (dist > 0.01 && dist < minDistance) {
              minDistance = dist;
            }
          }
          if (minDistance !== Infinity) depth = minDistance;
        }
      }
      if (depth === 0) depth = 10.0; // fallback

      // Mark matched
      matchedFaceIds.add(c1.face.id);
      matchedFaceIds.add(c2.face.id);
      matchingWalls.forEach((w) => matchedFaceIds.add(w.face.id));
      floors.forEach((f) => matchedFaceIds.add(f.face.id));

      slots.push({
        kind: "rounded",
        lengthMm: L_slot,
        widthMm: W_slot,
        depthMm: depth,
        axis: V_sep, // Matches the longest slot dimension
        faceIds: Array.from(
          new Set([
            c1.face.id,
            c2.face.id,
            ...matchingWalls.map((w) => w.face.id),
            ...floors.map((f) => f.face.id),
          ]),
        ),
      });
    }
  }

  // 2. Detect Rectangular Slots
  for (const floor of planes) {
    if (matchedFaceIds.has(floor.face.id)) continue;

    // Find all perpendicular adjacent planar walls
    const adjWalls = planes.filter((w) => {
      if (w.face.id === floor.face.id) return false;
      if (matchedFaceIds.has(w.face.id)) return false;
      return (
        sharesEdge(floor.face.id, w.face.id, faceEdgeSets) &&
        isOrthogonal(floor.normal, w.normal)
      );
    });

    if (adjWalls.length < 2) continue;

    // Group walls into parallel pairs
    const wallPairs: { w1: PlaneClass; w2: PlaneClass; distance: number }[] = [];
    const usedWallIds = new Set<string>();

    for (let i = 0; i < adjWalls.length; i++) {
      const w1 = adjWalls[i];
      if (usedWallIds.has(w1.face.id)) continue;

      for (let j = i + 1; j < adjWalls.length; j++) {
        const w2 = adjWalls[j];
        if (usedWallIds.has(w2.face.id)) continue;

        if (isParallel(w1.normal, w2.normal)) {
          const dist = Math.abs(dot(sub(w2.origin, w1.origin), w1.normal));
          if (dist > 0.1) {
            wallPairs.push({ w1, w2, distance: dist });
            usedWallIds.add(w1.face.id);
            usedWallIds.add(w2.face.id);
            break;
          }
        }
      }
    }

    // A rectangular slot must have at least 2 pairs of parallel walls (i.e. 4 walls in total)
    // and the normals of the two pairs must be perpendicular to each other.
    if (wallPairs.length >= 2) {
      // Find two pairs that are perpendicular
      let foundSlot = false;
      for (let i = 0; i < wallPairs.length; i++) {
        const p1 = wallPairs[i];
        for (let j = i + 1; j < wallPairs.length; j++) {
          const p2 = wallPairs[j];

          if (isOrthogonal(p1.w1.normal, p2.w1.normal)) {
            const d1 = p1.distance;
            const d2 = p2.distance;

            const L_slot = Math.max(d1, d2);
            const W_slot = Math.min(d1, d2);
            const aspect = L_slot / W_slot;

            if (aspect > 2.0) {
              // The orientation axis is the normal of the pair that has the larger distance (length)
              // Wait, which pair has the larger distance?
              const axisPair = d1 > d2 ? p1 : p2;
              const axis = normalize(axisPair.w1.normal);

              // Find depth
              const parallelPlanes = planes.filter(
                (p) =>
                  p.face.id !== floor.face.id &&
                  isParallel(p.normal, floor.normal),
              );
              let depth = 0;
              let bestTop: PlaneClass | null = null;
              for (const p of parallelPlanes) {
                const sharesWithWall = [p1.w1, p1.w2, p2.w1, p2.w2].some((w) =>
                  sharesEdge(p.face.id, w.face.id, faceEdgeSets),
                );
                if (sharesWithWall) {
                  bestTop = p;
                  break;
                }
              }
              if (bestTop) {
                depth = Math.abs(
                  dot(sub(bestTop.origin, floor.origin), floor.normal),
                );
              } else if (parallelPlanes.length > 0) {
                let minDistance = Infinity;
                for (const p of parallelPlanes) {
                  const dist = Math.abs(
                    dot(sub(p.origin, floor.origin), floor.normal),
                  );
                  if (dist > 0.01 && dist < minDistance) {
                    minDistance = dist;
                  }
                }
                if (minDistance !== Infinity) depth = minDistance;
              }
              if (depth === 0) depth = 10.0; // fallback

              const slotFaceIds = [
                floor.face.id,
                p1.w1.face.id,
                p1.w2.face.id,
                p2.w1.face.id,
                p2.w2.face.id,
              ];

              // Mark all these faces as matched
              matchedFaceIds.add(floor.face.id);
              matchedFaceIds.add(p1.w1.face.id);
              matchedFaceIds.add(p1.w2.face.id);
              matchedFaceIds.add(p2.w1.face.id);
              matchedFaceIds.add(p2.w2.face.id);

              slots.push({
                kind: "rectangular",
                lengthMm: L_slot,
                widthMm: W_slot,
                depthMm: depth,
                axis,
                faceIds: slotFaceIds,
              });

              foundSlot = true;
              break;
            }
          }
        }
        if (foundSlot) break;
      }
    }
  }

  return slots;
}

// Vector math utilities
function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scale(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

function length(v: Vec3): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

function normalize(v: Vec3): Vec3 {
  const n = length(v);
  if (n === 0) return [0, 0, 1];
  return [v[0] / n, v[1] / n, v[2] / n];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function isParallel(
  a: Vec3,
  b: Vec3,
  tolerance = PARALLEL_TOLERANCE,
): boolean {
  return Math.abs(1 - Math.abs(dot(normalize(a), normalize(b)))) < tolerance;
}

function isOrthogonal(
  a: Vec3,
  b: Vec3,
  tolerance = ORTHOGONAL_TOLERANCE,
): boolean {
  return Math.abs(dot(normalize(a), normalize(b))) < tolerance;
}

function buildFaceEdgeSets(
  graph: TopologyGraph,
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const [faceId, edgeIds] of graph.adjacency.entries()) {
    map.set(faceId, new Set(edgeIds));
  }
  return map;
}

function sharesEdge(
  faceId1: string,
  faceId2: string,
  faceEdgeSets: Map<string, Set<string>>,
): boolean {
  const set1 = faceEdgeSets.get(faceId1);
  const set2 = faceEdgeSets.get(faceId2);
  if (!set1 || !set2) return false;
  const [small, big] = set1.size <= set2.size ? [set1, set2] : [set2, set1];
  for (const e of small) {
    if (big.has(e)) return true;
  }
  return false;
}
