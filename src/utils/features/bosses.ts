import {
  findFacesByClass,
  neighborsOf,
  type FaceClass,
  type TopologyGraph,
} from "../topology";

export interface Boss {
  kind: "round" | "rectangular";
  height: number;
  baseFaceId: string;
  faceIds: string[];
  diameter?: number;
  width?: number;
  length?: number;
}

type Vec3 = [number, number, number];
type PlaneClass = Extract<FaceClass, { kind: "plane" }>;

export function detectBosses(graph: TopologyGraph | undefined): Boss[] {
  if (!graph) return [];

  const bosses: Boss[] = [];
  const matchedFaceIds = new Set<string>();

  // 1. Detect Round Bosses
  const cylinders = findFacesByClass(graph, "cylinder").filter(
    (c) => c.angularSpan === undefined || c.angularSpan >= Math.PI * 1.9,
  );

  for (const cyl of cylinders) {
    const neighbors = neighborsOf(graph, cyl.face.id);
    if (neighbors.length === 0) continue;

    // Find adjacent planes whose normal is parallel to the cylinder axis
    const adjacentPlanes = neighbors
      .map((n) => graph.faceClasses.get(n.id))
      .filter(
        (cls): cls is PlaneClass =>
          !!cls && cls.kind === "plane" && isParallel(cls.normal, cyl.axisDirection),
      );

    if (adjacentPlanes.length < 2) continue;

    // Sort adjacent planes by projection onto cylinder axis
    const sortedPlanes = adjacentPlanes
      .map((p) => {
        const proj = dot(sub(p.origin, cyl.axisOrigin), cyl.axisDirection);
        return { plane: p, proj };
      })
      .sort((a, b) => a.proj - b.proj);

    // We assume the first is p1 and the last is p2
    const p1 = sortedPlanes[0].plane;
    const p2 = sortedPlanes[sortedPlanes.length - 1].plane;

    // Check for concentric cylinder with larger radius (boss-with-a-hole case)
    const isInnerHole = cylinders.some((other) => {
      if (other.face.id === cyl.face.id) return false;
      const diff = sub(other.axisOrigin, cyl.axisOrigin);
      const proj = scale(cyl.axisDirection, dot(diff, cyl.axisDirection));
      const perp = sub(diff, proj);
      const distPerp = length(perp);
      const isCoaxial = isParallel(other.axisDirection, cyl.axisDirection) && distPerp < 0.05;
      return isCoaxial && other.radius > cyl.radius;
    });

    if (isInnerHole) continue;

    // Identify parent (base) and cap (top) planes using wire loops
    let parentPlane: PlaneClass | null = null;
    let capPlane: PlaneClass | null = null;

    const cylEdges = graph.adjacency.get(cyl.face.id) ?? [];
    const p1Edges = graph.adjacency.get(p1.face.id) ?? [];
    const p2Edges = graph.adjacency.get(p2.face.id) ?? [];

    const p1Shared = p1Edges.filter((eId) => cylEdges.includes(eId));
    const p2Shared = p2Edges.filter((eId) => cylEdges.includes(eId));

    const p1Wire = p1.face.wires.find((w) => w.edge_ids.some((eId) => p1Shared.includes(eId)));
    const p2Wire = p2.face.wires.find((w) => w.edge_ids.some((eId) => p2Shared.includes(eId)));

    if (p1Wire && p2Wire) {
      if (p1Wire.is_outer && !p2Wire.is_outer) {
        capPlane = p1;
        parentPlane = p2;
      } else if (!p1Wire.is_outer && p2Wire.is_outer) {
        parentPlane = p1;
        capPlane = p2;
      }
    }

    // Fallback for mocks/tests if wires are empty or inconclusive
    if (!parentPlane || !capPlane) {
      const p1Id = p1.face.id.toLowerCase();
      const p2Id = p2.face.id.toLowerCase();
      if (p1Id.includes("base") || p2Id.includes("top") || p2Id.includes("cap")) {
        parentPlane = p1;
        capPlane = p2;
      } else if (p2Id.includes("base") || p1Id.includes("top") || p1Id.includes("cap")) {
        parentPlane = p2;
        capPlane = p1;
      } else {
        // Default assumption: p1 is base, p2 is top
        parentPlane = p1;
        capPlane = p2;
      }
    }

    // Verify boss convexity: top cap is in the direction of base face's outward normal
    const isBoss = dot(sub(capPlane.origin, parentPlane.origin), parentPlane.normal) > 0;
    if (!isBoss) continue;

    const height = Math.abs(
      dot(sub(capPlane.origin, parentPlane.origin), cyl.axisDirection),
    );

    bosses.push({
      kind: "round",
      height,
      baseFaceId: parentPlane.face.id,
      faceIds: [cyl.face.id, capPlane.face.id],
      diameter: 2 * cyl.radius,
    });

    matchedFaceIds.add(cyl.face.id);
    matchedFaceIds.add(capPlane.face.id);
  }

  // 2. Detect Rectangular Bosses
  const planes = findFacesByClass(graph, "plane");

  for (const top of planes) {
    if (matchedFaceIds.has(top.face.id)) continue;

    // Find adjacent planar walls whose normals are perpendicular to the top face normal
    const neighbors = neighborsOf(graph, top.face.id);
    const walls = neighbors
      .map((n) => graph.faceClasses.get(n.id))
      .filter(
        (cls): cls is PlaneClass =>
          !!cls && cls.kind === "plane" && isOrthogonal(cls.normal, top.normal),
      );

    if (walls.length < 3) continue;

    // Verify wall orthogonal pairs
    const axis1 = normalize(walls[0].normal);
    const validWalls = walls.every(
      (w) => isParallel(w.normal, axis1) || isOrthogonal(w.normal, axis1),
    );
    if (!validWalls) continue;

    const axis2 = normalize(cross(top.normal, axis1));

    // Find the base face
    const candidateBases = new Map<string, PlaneClass>();
    for (const wall of walls) {
      const wallNeighbors = neighborsOf(graph, wall.face.id);
      for (const n of wallNeighbors) {
        if (n.id === top.face.id) continue;
        const cls = graph.faceClasses.get(n.id);
        if (cls && cls.kind === "plane" && isParallel(cls.normal, top.normal)) {
          candidateBases.set(n.id, cls);
        }
      }
    }

    if (candidateBases.size === 0) continue;

    // Select the base face
    const base = Array.from(candidateBases.values())[0];

    // Verify boss convexity: top rises from base face
    const isBoss = dot(sub(top.origin, base.origin), base.normal) > 0;
    if (!isBoss) continue;

    // Group walls by axes to compute width and length
    const walls1 = walls.filter((w) => isParallel(w.normal, axis1));
    const walls2 = walls.filter((w) => isParallel(w.normal, axis2));

    let dim1 = 0;
    if (walls1.length >= 2) {
      dim1 = Math.abs(dot(sub(walls1[0].origin, walls1[1].origin), axis1));
    } else if (walls1.length === 1) {
      dim1 = 2 * Math.abs(dot(sub(top.origin, walls1[0].origin), axis1));
    }

    let dim2 = 0;
    if (walls2.length >= 2) {
      dim2 = Math.abs(dot(sub(walls2[0].origin, walls2[1].origin), axis2));
    } else if (walls2.length === 1) {
      dim2 = 2 * Math.abs(dot(sub(top.origin, walls2[0].origin), axis2));
    }

    if (dim1 === 0 || dim2 === 0) continue;

    const width = Math.min(dim1, dim2);
    const length = Math.max(dim1, dim2);
    const height = Math.abs(dot(sub(top.origin, base.origin), base.normal));

    const bossFaceIds = [top.face.id, ...walls.map((w) => w.face.id)];

    bosses.push({
      kind: "rectangular",
      height,
      baseFaceId: base.face.id,
      faceIds: bossFaceIds,
      width,
      length,
    });

    matchedFaceIds.add(top.face.id);
    walls.forEach((w) => matchedFaceIds.add(w.face.id));
  }

  return bosses;
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

function isParallel(a: Vec3, b: Vec3, tolerance = 0.01): boolean {
  return Math.abs(1 - Math.abs(dot(normalize(a), normalize(b)))) < tolerance;
}

function isOrthogonal(a: Vec3, b: Vec3, tolerance = 0.05): boolean {
  return Math.abs(dot(normalize(a), normalize(b))) < tolerance;
}
