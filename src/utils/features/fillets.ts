import {
  findFacesByClass,
  type TopologyGraph,
  neighborsOf,
} from "../topology";

export interface Fillet {
  radius: number | "variable";
  lengthMm: number;
  adjacentFaceIds: string[];
  concavity: "convex" | "concave";
  faceIds: string[];
}

type Vec3 = [number, number, number];

export function detectFillets(graph: TopologyGraph | undefined): Fillet[] {
  if (!graph) return [];

  const fillets: Fillet[] = [];

  // 1. Detect constant-radius cylindrical fillets
  const cylinders = findFacesByClass(graph, "cylinder");
  for (const cyl of cylinders) {
    // Fillets are partial-span (typically <= pi radians)
    if (cyl.angularSpan === undefined || cyl.angularSpan > Math.PI * 1.05) {
      continue;
    }

    const faceId = cyl.face.id;
    const neighbors = neighborsOf(graph, faceId);
    if (neighbors.length === 0) continue;

    // Find adjacent planes
    const adjacentPlanes: { origin: Vec3; normal: Vec3; id: string }[] = [];
    for (const n of neighbors) {
      const cls = graph.faceClasses.get(n.id);
      if (cls && cls.kind === "plane") {
        adjacentPlanes.push({ origin: cls.origin, normal: cls.normal, id: n.id });
      }
    }

    // Identify planes tangent to the cylinder:
    // - Plane normal is perpendicular to cylinder axis
    // - Distance from cylinder axis to plane is approximately the radius
    const tangentPlanes = adjacentPlanes.filter((plane) => {
      const isParallel = Math.abs(dot(cyl.axisDirection, plane.normal)) < 0.1;
      const dist = Math.abs(dot(sub(cyl.axisOrigin, plane.origin), plane.normal));
      const isTangentDist = Math.abs(dist - cyl.radius) < 0.2;
      return isParallel && isTangentDist;
    });

    let adjacentFaceIds = tangentPlanes.map((p) => p.id);
    if (adjacentFaceIds.length === 0) {
      adjacentFaceIds = neighbors.map((n) => n.id);
    }

    // Determine concavity:
    // For each adjacent plane, compute dot((plane.origin - cyl.axisOrigin), plane.normal)
    // If the axis lies in the empty space (positive side of the outward normals), the dot product is negative -> concave fillet.
    // If the axis lies in the material (negative side of the outward normals), the dot product is positive -> convex round.
    let concavity: "convex" | "concave" = "concave";
    const planesForConcavity = tangentPlanes.length > 0 ? tangentPlanes : adjacentPlanes;
    if (planesForConcavity.length > 0) {
      let sum = 0;
      for (const p of planesForConcavity) {
        sum += dot(sub(p.origin, cyl.axisOrigin), p.normal);
      }
      concavity = sum < 0 ? "concave" : "convex";
    }

    fillets.push({
      radius: cyl.radius,
      lengthMm: cyl.length ?? 0,
      adjacentFaceIds,
      concavity,
      faceIds: [faceId],
    });
  }

  // 2. Detect constant-radius toroidal fillets
  const tori = findFacesByClass(graph, "torus");
  for (const torus of tori) {
    if (torus.angularSpan === undefined || torus.angularSpan > Math.PI * 1.05) {
      continue;
    }

    const faceId = torus.face.id;
    const neighbors = neighborsOf(graph, faceId);
    if (neighbors.length === 0) continue;

    const adjacentPlanes: { origin: Vec3; normal: Vec3; id: string }[] = [];
    for (const n of neighbors) {
      const cls = graph.faceClasses.get(n.id);
      if (cls && cls.kind === "plane") {
        adjacentPlanes.push({ origin: cls.origin, normal: cls.normal, id: n.id });
      }
    }

    const adjacentFaceIds = neighbors.map((n) => n.id);

    // Determine concavity using axisOrigin as a reference
    let concavity: "convex" | "concave" = "concave";
    if (adjacentPlanes.length > 0) {
      let sum = 0;
      for (const p of adjacentPlanes) {
        sum += dot(sub(p.origin, torus.axisOrigin), p.normal);
      }
      concavity = sum < 0 ? "concave" : "convex";
    }

    const span = torus.angularSpan ?? Math.PI / 2;
    const lengthMm = torus.majorRadius * span;

    fillets.push({
      radius: torus.minorRadius,
      lengthMm,
      adjacentFaceIds,
      concavity,
      faceIds: [faceId],
    });
  }

  // 3. Detect variable-radius conical fillets
  const cones = findFacesByClass(graph, "cone");
  for (const cone of cones) {
    if (cone.angularSpan === undefined || cone.angularSpan > Math.PI * 1.05) {
      continue;
    }

    const faceId = cone.face.id;
    const neighbors = neighborsOf(graph, faceId);
    if (neighbors.length === 0) continue;

    const adjacentPlanes: { origin: Vec3; normal: Vec3; id: string }[] = [];
    for (const n of neighbors) {
      const cls = graph.faceClasses.get(n.id);
      if (cls && cls.kind === "plane") {
        adjacentPlanes.push({ origin: cls.origin, normal: cls.normal, id: n.id });
      }
    }

    const adjacentFaceIds = neighbors.map((n) => n.id);

    let concavity: "convex" | "concave" = "concave";
    if (adjacentPlanes.length > 0) {
      let sum = 0;
      for (const p of adjacentPlanes) {
        sum += dot(sub(p.origin, cone.axisOrigin), p.normal);
      }
      concavity = sum < 0 ? "concave" : "convex";
    }

    fillets.push({
      radius: "variable",
      lengthMm: cone.length ?? 0,
      adjacentFaceIds,
      concavity,
      faceIds: [faceId],
    });
  }

  return fillets;
}

// Vector utility functions
function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
