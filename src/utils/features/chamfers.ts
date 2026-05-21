import {
  findFacesByClass,
  type TopologyGraph,
  neighborsOf,
  type FaceClass,
} from "../topology";

export interface Chamfer {
  widthMm: number;
  angleDeg: number;
  lengthMm: number;
  adjacentFaceIds: string[];
  faceId: string;
}

type Vec3 = [number, number, number];
type PlaneClass = Extract<FaceClass, { kind: "plane" }>;

// Tolerances matching other feature detectors
const PARALLEL_TOLERANCE = 0.01;
const ORTHOGONAL_TOLERANCE = 0.05;

/**
 * Detects chamfers in a 3D CAD model represented by a TopologyGraph.
 * A chamfer is a narrow planar face whose normal is neither parallel nor perpendicular
 * to its two adjacent planar faces.
 *
 * Constraints:
 * 1. Shares edges with exactly two other planar faces.
 * 2. Angle with those faces is between 30° and 60° (typically 45°).
 * 3. Narrow planar face: width / length < 0.2.
 */
export function detectChamfers(graph: TopologyGraph | undefined): Chamfer[] {
  if (!graph) return [];

  const chamfers: Chamfer[] = [];

  // Find all planar faces in the graph
  const planes = findFacesByClass(graph, "plane");

  for (const planeClass of planes) {
    const faceId = planeClass.face.id;

    // Find all neighbors of this face
    const neighbors = neighborsOf(graph, faceId);

    // Filter neighbors to only planar faces
    const adjacentPlanes: PlaneClass[] = [];
    for (const neighbor of neighbors) {
      const neighborClass = graph.faceClasses.get(neighbor.id);
      if (neighborClass && neighborClass.kind === "plane") {
        adjacentPlanes.push(neighborClass);
      }
    }

    // Constraint 1: Shares edges with exactly two other planar faces
    if (adjacentPlanes.length !== 2) {
      continue;
    }

    const [A, B] = adjacentPlanes;

    // A chamfer normal must be neither parallel nor perpendicular to its adjacent planar faces
    if (
      isParallel(planeClass.normal, A.normal) ||
      isOrthogonal(planeClass.normal, A.normal) ||
      isParallel(planeClass.normal, B.normal) ||
      isOrthogonal(planeClass.normal, B.normal)
    ) {
      continue;
    }

    // Calculate angle in degrees relative to both adjacent faces
    const angleA = Math.acos(Math.abs(dot(normalize(planeClass.normal), normalize(A.normal)))) * (180 / Math.PI);
    const angleB = Math.acos(Math.abs(dot(normalize(planeClass.normal), normalize(B.normal)))) * (180 / Math.PI);

    // Constraint 2: Angle between 30° and 60°
    if (angleA < 29.5 || angleA > 60.5 || angleB < 29.5 || angleB > 60.5) {
      continue;
    }

    // Find a point on the intersection line of C with A, and C with B
    const P0 = findPlaneIntersectionPoint(planeClass.normal, planeClass.origin, A.normal, A.origin);
    const Q0 = findPlaneIntersectionPoint(planeClass.normal, planeClass.origin, B.normal, B.origin);

    // Direction along the intersection line (longitudinal direction)
    const D = normalize(cross(A.normal, planeClass.normal));

    // Direction perpendicular to the intersection line in the chamfer plane
    const U_perp = normalize(cross(planeClass.normal, D));

    // Width: analytical distance between the two shared boundaries projected into the chamfer plane
    const width = Math.abs(dot(sub(P0, Q0), U_perp));

    // Length: Bounded extent along the longitudinal direction.
    // Project the origins of all other adjacent planar faces (sharing edges with the chamfer C)
    // onto the longitudinal direction D of the chamfer, taking the max - min projection.
    const projections = adjacentPlanes.map((p) => dot(p.origin, D));
    const minProj = Math.min(...projections);
    const maxProj = Math.max(...projections);
    const lengthMm = maxProj - minProj;

    // Ensure we have a valid non-zero length and satisfy the narrow ratio constraint (width / length < 0.2)
    if (lengthMm <= 0.001 || width / lengthMm >= 0.2) {
      continue;
    }

    chamfers.push({
      widthMm: parseFloat(width.toFixed(4)),
      angleDeg: parseFloat(angleA.toFixed(2)),
      lengthMm: parseFloat(lengthMm.toFixed(4)),
      adjacentFaceIds: [A.face.id, B.face.id],
      faceId,
    });
  }

  return chamfers;
}

/**
 * Finds a point on the intersection line of two planes using a linear solver.
 * Represented as P = c1*n1 + c2*n2
 */
function findPlaneIntersectionPoint(n1: Vec3, o1: Vec3, n2: Vec3, o2: Vec3): Vec3 {
  const d1 = dot(o1, n1);
  const d2 = dot(o2, n2);
  const n11 = dot(n1, n1);
  const n12 = dot(n1, n2);
  const n22 = dot(n2, n2);

  const det = n11 * n22 - n12 * n12;
  if (Math.abs(det) < 1e-9) {
    return [0, 0, 0];
  }

  const c1 = (d1 * n22 - d2 * n12) / det;
  const c2 = (d2 * n11 - d1 * n12) / det;

  return [
    c1 * n1[0] + c2 * n2[0],
    c1 * n1[1] + c2 * n2[1],
    c1 * n1[2] + c2 * n2[2],
  ];
}

// Vector math utilities
function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
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

function isParallel(a: Vec3, b: Vec3, tolerance = PARALLEL_TOLERANCE): boolean {
  return Math.abs(1 - Math.abs(dot(normalize(a), normalize(b)))) < tolerance;
}

function isOrthogonal(a: Vec3, b: Vec3, tolerance = ORTHOGONAL_TOLERANCE): boolean {
  return Math.abs(dot(normalize(a), normalize(b))) < tolerance;
}
