import {
  findFacesByClass,
  neighborsOf,
  type FaceClass,
  type TopologyGraph,
} from "../topology";
import {
  isEnvelopeBoundaryPlane,
  type FeatureDetectionContext,
} from "./context";

export interface Pocket {
  kind: "open" | "closed";
  depth: number;
  footprintAreaMm2: number;
  accessDirections: [number, number, number][];
  wallCount: number;
  faceIds: string[];
}

type Vec3 = [number, number, number];

interface AABB {
  min: Vec3;
  max: Vec3;
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scale(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

function length(v: Vec3): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

function normalize(v: Vec3): Vec3 {
  const len = length(v);
  if (len === 0) return [0, 0, 1];
  return [v[0] / len + 0, v[1] / len + 0, v[2] / len + 0];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function getRepresentativePoints(fc: FaceClass): Vec3[] {
  const pts: Vec3[] = [];
  if (fc.kind === "plane") {
    pts.push(fc.origin);
  } else if (fc.kind === "cylinder") {
    pts.push(fc.axisOrigin);
    if (fc.length !== undefined) {
      const len = fc.length;
      pts.push([
        fc.axisOrigin[0] + fc.axisDirection[0] * len,
        fc.axisOrigin[1] + fc.axisDirection[1] * len,
        fc.axisOrigin[2] + fc.axisDirection[2] * len,
      ]);
    }
  } else if (fc.kind === "cone") {
    pts.push(fc.axisOrigin);
    if (fc.length !== undefined) {
      const len = fc.length;
      pts.push([
        fc.axisOrigin[0] + fc.axisDirection[0] * len,
        fc.axisOrigin[1] + fc.axisDirection[1] * len,
        fc.axisOrigin[2] + fc.axisDirection[2] * len,
      ]);
    }
  } else if (fc.kind === "sphere") {
    pts.push(fc.center);
  } else if (fc.kind === "torus") {
    pts.push(fc.axisOrigin);
  }
  return pts;
}

function computeAABB(graph: TopologyGraph): AABB {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (const fc of graph.faceClasses.values()) {
    const pts = getRepresentativePoints(fc);
    for (const p of pts) {
      if (p[0] < minX) minX = p[0];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
      if (p[2] < minZ) minZ = p[2];
      if (p[2] > maxZ) maxZ = p[2];
    }
  }

  if (minX === Infinity) {
    return { min: [0, 0, 0], max: [0, 0, 0] };
  }

  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}

function isPointInsideAABB(pt: Vec3, aabb: AABB, tolerance: number = 0.01): boolean {
  return (
    pt[0] >= aabb.min[0] - tolerance &&
    pt[0] <= aabb.max[0] + tolerance &&
    pt[1] >= aabb.min[1] - tolerance &&
    pt[1] <= aabb.max[1] + tolerance &&
    pt[2] >= aabb.min[2] - tolerance &&
    pt[2] <= aabb.max[2] + tolerance
  );
}

export function detectPockets(
  graph: TopologyGraph | undefined,
  context?: FeatureDetectionContext,
): Pocket[] {
  if (!graph) return [];

  const planes = findFacesByClass(graph, "plane");
  if (planes.length === 0) return [];

  const aabb = computeAABB(graph);
  const pockets: Pocket[] = [];

  for (const floorFace of planes) {
    const O_floor = floorFace.origin;
    const N_floor = normalize(floorFace.normal);

    // A pocket floor is recessed inside the body. A plane lying on the body
    // envelope boundary is an outer end face of the stock — not a pocket
    // floor — and pairing it with a rim chamfer otherwise fabricates a
    // shallow closed pocket.
    if (
      context?.bodyEnvelope &&
      isEnvelopeBoundaryPlane(O_floor, N_floor, context.bodyEnvelope)
    ) {
      continue;
    }

    // Find the outer wire of the floor face
    const outerWire = floorFace.face.wires.find((w) => w.is_outer) || floorFace.face.wires[0];
    if (!outerWire) continue;

    const outerEdgeIds = new Set(outerWire.edge_ids);
    if (outerEdgeIds.size === 0) continue;

    // Get all neighboring faces sharing edges with the outer wire
    const neighbors = neighborsOf(graph, floorFace.face.id).filter((neighbor) => {
      const neighborEdges = graph.adjacency.get(neighbor.id) || [];
      return neighborEdges.some((eId) => outerEdgeIds.has(eId));
    });

    if (neighbors.length === 0) continue;

    // 1. Check closed wire boundary requirement:
    // Every edge of the outer wire must be shared with at least one neighboring face
    let allEdgesShared = true;
    for (const edgeId of outerEdgeIds) {
      const isShared = neighbors.some((neighbor) => {
        const neighborEdges = graph.adjacency.get(neighbor.id) || [];
        return neighborEdges.includes(edgeId);
      });
      if (!isShared) {
        allEdgesShared = false;
        break;
      }
    }

    if (!allEdgesShared) continue;

    // Resolve FaceClass objects for neighbors
    const sideFaces = neighbors
      .map((n) => graph.faceClasses.get(n.id))
      .filter((fc): fc is FaceClass => !!fc);

    // 2. Distinguish pockets from holes:
    // If there is only one side face and it is a cylinder, it's a hole, not a pocket!
    if (sideFaces.length === 1 && sideFaces[0].kind === "cylinder") {
      continue;
    }

    // 3. Check concavity & perpendicularity rules for side faces
    let isPocket = true;
    for (const side of sideFaces) {
      if (side.kind === "plane") {
        const N_side = normalize(side.normal);
        // Perpendicularity check: wall normal must be perpendicular to floor normal
        if (Math.abs(dot(N_floor, N_side)) >= 0.2) {
          isPocket = false;
          break;
        }

        // Concavity check: side face normal must point towards the interior of the pocket (away from the solid)
        const V = sub(O_floor, side.origin);
        if (dot(N_side, V) < -0.1) {
          isPocket = false;
          break;
        }
      } else if (side.kind === "cylinder") {
        // Cylindrical wall axis must be parallel to the floor normal
        const axisDir = normalize(side.axisDirection);
        if (Math.abs(1 - Math.abs(dot(N_floor, axisDir))) >= 0.2) {
          isPocket = false;
          break;
        }
      }
    }

    if (!isPocket) continue;

    // Access direction is the inverse of the floor normal
    const accessDirection = [
      -N_floor[0] + 0,
      -N_floor[1] + 0,
      -N_floor[2] + 0,
    ] as Vec3;

    // 4. Open/Closed check
    let kind: "open" | "closed" = "open";
    for (const otherFace of planes) {
      if (otherFace.face.id === floorFace.face.id) continue;

      const otherNormal = normalize(otherFace.normal);
      const denom = dot(accessDirection, otherNormal);
      if (Math.abs(denom) > 1e-6) {
        const t = dot(sub(otherFace.origin, O_floor), otherNormal) / denom;
        if (t > 0.01) {
          const intersectPt = add(O_floor, scale(accessDirection, t));
          if (isPointInsideAABB(intersectPt, aabb)) {
            kind = "closed";
            break;
          }
        }
      }
    }

    // 5. Depth calculation: Max distance of side face representative points along access direction
    let maxDist = 0;
    for (const side of sideFaces) {
      const pts = getRepresentativePoints(side);
      for (const p of pts) {
        const dist = dot(sub(p, O_floor), accessDirection);
        if (dist > maxDist) {
          maxDist = dist;
        }
      }
    }

    // 6. Footprint area approximation
    let footprintAreaMm2 = 0;
    let isCircular = false;
    let circularRadius = 0;

    for (const side of sideFaces) {
      if (side.kind === "cylinder") {
        const dotAxis = dot(N_floor, normalize(side.axisDirection));
        if (Math.abs(1 - Math.abs(dotAxis)) < 0.2) {
          isCircular = true;
          circularRadius = side.radius;
          break;
        }
      }
    }

    if (isCircular) {
      footprintAreaMm2 = Math.PI * circularRadius * circularRadius;
    } else {
      // Find 2D bounding rectangle in the floor plane
      let U: Vec3;
      if (Math.abs(N_floor[0]) > 0.9) {
        U = normalize(cross(N_floor, [0, 1, 0]));
      } else {
        U = normalize(cross(N_floor, [1, 0, 0]));
      }
      const V = normalize(cross(N_floor, U));

      let minU = Infinity, maxU = -Infinity;
      let minV = Infinity, maxV = -Infinity;

      for (const side of sideFaces) {
        const pts = getRepresentativePoints(side);
        for (const p of pts) {
          const relative = sub(p, O_floor);
          const u = dot(relative, U);
          const v = dot(relative, V);
          if (u < minU) minU = u;
          if (u > maxU) maxU = u;
          if (v < minV) minV = v;
          if (v > maxV) maxV = v;
        }
      }

      if (minU !== Infinity) {
        footprintAreaMm2 = (maxU - minU) * (maxV - minV);
      }
    }

    // Collect face IDs (floor + side walls)
    const faceIds = [floorFace.face.id, ...sideFaces.map((s) => s.face.id)];

    pockets.push({
      kind,
      depth: maxDist,
      footprintAreaMm2,
      accessDirections: [accessDirection],
      wallCount: sideFaces.length,
      faceIds,
    });
  }

  return pockets;
}
