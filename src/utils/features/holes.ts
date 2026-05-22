import {
  findFacesByClass,
  type FaceClass,
  type TopologyGraph,
} from "../topology";
import {
  isOuterEnvelopeDiameter,
  type FeatureDetectionContext,
} from "./context";

export type HoleKind = "through" | "blind" | "counterbore" | "countersink";

export interface Hole {
  kind: HoleKind;
  diameter: number;
  depth: number;
  axisOrigin: Vec3;
  axisDirection: Vec3;
  faceIds: string[];
  shoulderDiameter?: number;
}

type Vec3 = [number, number, number];
type CylinderClass = Extract<FaceClass, { kind: "cylinder" }>;
type ConeClass = Extract<FaceClass, { kind: "cone" }>;
type PlaneClass = Extract<FaceClass, { kind: "plane" }>;

interface AxisLine {
  origin: Vec3;
  direction: Vec3;
}

interface CoaxialGroup {
  axis: AxisLine;
  cylinders: CylinderClass[];
  cones: ConeClass[];
}

const AXIS_PARALLEL_TOLERANCE = 0.001;
const AXIS_OFFSET_TOLERANCE_MM = 0.01;
const PARTIAL_SPAN_THRESHOLD_RAD = Math.PI * 1.9;
const PLANE_PARALLEL_TOLERANCE = 0.01;

export function detectHoles(
  graph: TopologyGraph | undefined,
  context?: FeatureDetectionContext,
): Hole[] {
  if (!graph) return [];

  let cylinders = findFacesByClass(graph, "cylinder").filter(isClosedEnough);
  let cones = findFacesByClass(graph, "cone").filter(isClosedEnough);

  // A hole is an interior cylindrical void. Drop any cylinder or cone that
  // coincides with the body's outer cross-section — the stock rim / outer
  // side wall and rim chamfers are not holes, and merging them into a
  // coaxial group otherwise fabricates a body-diameter counterbore.
  const env = context?.bodyEnvelope;
  if (env) {
    cylinders = cylinders.filter(
      (c) => !isOuterEnvelopeDiameter(c.radius * 2, env),
    );
    cones = cones.filter(
      (c) => !isOuterEnvelopeDiameter((c.maxRadius ?? c.minRadius ?? 0) * 2, env),
    );
  }

  if (cylinders.length === 0) return [];
  const planes = findFacesByClass(graph, "plane");

  const faceToEdges = new Map<string, Set<string>>();
  for (const [faceId, edgeIds] of graph.adjacency.entries()) {
    faceToEdges.set(faceId, new Set(edgeIds));
  }

  const groups = groupByAxis(cylinders, cones);

  const holes: Hole[] = [];
  for (const group of groups) {
    const hole = classifyGroup(group, planes, faceToEdges);
    if (hole) holes.push(hole);
  }
  return holes;
}

function groupByAxis(
  cylinders: CylinderClass[],
  cones: ConeClass[],
): CoaxialGroup[] {
  const groups: CoaxialGroup[] = [];

  for (const cyl of cylinders) {
    const axis = makeAxis(cyl.axisOrigin, cyl.axisDirection);
    const existing = groups.find((g) => isSameAxis(g.axis, axis));
    if (existing) existing.cylinders.push(cyl);
    else groups.push({ axis, cylinders: [cyl], cones: [] });
  }

  for (const cone of cones) {
    const axis = makeAxis(cone.axisOrigin, cone.axisDirection);
    const existing = groups.find((g) => isSameAxis(g.axis, axis));
    if (existing) existing.cones.push(cone);
  }

  return groups;
}

function classifyGroup(
  group: CoaxialGroup,
  planes: PlaneClass[],
  faceToEdges: Map<string, Set<string>>,
): Hole | null {
  const { axis, cylinders, cones } = group;

  const sortedCyls = [...cylinders].sort(
    (a, b) =>
      projectAxialPos(a.axisOrigin, axis) -
      projectAxialPos(b.axisOrigin, axis),
  );

  const cylFaceIds = new Set(sortedCyls.map((c) => c.face.id));
  const coneFaceIds = new Set(cones.map((c) => c.face.id));

  const axialPlanes = planes.filter((p) =>
    isParallel(p.normal, axis.direction),
  );

  const shoulderPlanes = axialPlanes.filter((p) =>
    sharesEdgeWithCount(p, cylFaceIds, faceToEdges) >= 2,
  );

  const capPlanes = axialPlanes.filter((p) => {
    const sharedWithCyls = sharesEdgeWithCount(p, cylFaceIds, faceToEdges);
    const sharedWithCones = sharesEdgeWithCount(p, coneFaceIds, faceToEdges);
    return sharedWithCyls + sharedWithCones === 1;
  });

  if (cones.length > 0 && sortedCyls.length >= 1) {
    return makeCountersink(sortedCyls, cones, axis);
  }

  if (sortedCyls.length >= 2 && shoulderPlanes.length >= 1) {
    return makeCounterbore(sortedCyls, axis);
  }

  if (sortedCyls.length >= 1) {
    const radius = Math.max(...sortedCyls.map((c) => c.radius));
    const depth = sortedCyls.reduce((sum, c) => sum + (c.length ?? 0), 0);
    const faceIds = sortedCyls.map((c) => c.face.id);
    if (capPlanes.length === 0) {
      return {
        kind: "through",
        diameter: radius * 2,
        depth,
        axisOrigin: sortedCyls[0].axisOrigin,
        axisDirection: normalize(axis.direction),
        faceIds,
      };
    }
    return {
      kind: "blind",
      diameter: radius * 2,
      depth,
      axisOrigin: sortedCyls[0].axisOrigin,
      axisDirection: normalize(axis.direction),
      faceIds: [...faceIds, ...capPlanes.map((p) => p.face.id)],
    };
  }

  return null;
}

function makeCounterbore(
  sortedCyls: CylinderClass[],
  axis: AxisLine,
): Hole {
  const radii = sortedCyls.map((c) => c.radius);
  const maxR = Math.max(...radii);
  const minR = Math.min(...radii);
  const totalDepth = sortedCyls.reduce((sum, c) => sum + (c.length ?? 0), 0);
  return {
    kind: "counterbore",
    diameter: maxR * 2,
    shoulderDiameter: minR * 2,
    depth: totalDepth,
    axisOrigin: sortedCyls[0].axisOrigin,
    axisDirection: normalize(axis.direction),
    faceIds: sortedCyls.map((c) => c.face.id),
  };
}

function makeCountersink(
  sortedCyls: CylinderClass[],
  cones: ConeClass[],
  axis: AxisLine,
): Hole {
  const coneMaxR = Math.max(
    ...cones.map((c) => c.maxRadius ?? c.minRadius ?? 0),
  );
  const cylR = sortedCyls[0]?.radius ?? 0;
  const cylDepth = sortedCyls.reduce((sum, c) => sum + (c.length ?? 0), 0);
  const coneDepth = cones.reduce((sum, c) => sum + (c.length ?? 0), 0);
  return {
    kind: "countersink",
    diameter: coneMaxR * 2,
    shoulderDiameter: cylR * 2,
    depth: cylDepth + coneDepth,
    axisOrigin: sortedCyls[0]?.axisOrigin ?? cones[0].axisOrigin,
    axisDirection: normalize(axis.direction),
    faceIds: [
      ...sortedCyls.map((c) => c.face.id),
      ...cones.map((c) => c.face.id),
    ],
  };
}

function sharesEdgeWithCount(
  plane: PlaneClass,
  faceIds: Set<string>,
  faceToEdges: Map<string, Set<string>>,
): number {
  const planeEdges = faceToEdges.get(plane.face.id);
  if (!planeEdges || planeEdges.size === 0) return 0;
  let count = 0;
  for (const id of faceIds) {
    const edges = faceToEdges.get(id);
    if (!edges) continue;
    for (const e of edges) {
      if (planeEdges.has(e)) {
        count++;
        break;
      }
    }
  }
  return count;
}

function isClosedEnough(face: CylinderClass | ConeClass): boolean {
  return (
    face.angularSpan === undefined ||
    face.angularSpan >= PARTIAL_SPAN_THRESHOLD_RAD
  );
}

function makeAxis(origin: Vec3, direction: Vec3): AxisLine {
  return { origin, direction: normalize(direction) };
}

function isSameAxis(a: AxisLine, b: AxisLine): boolean {
  if (!isParallel(a.direction, b.direction)) return false;
  const offset = pointLineDistance(b.origin, a);
  return offset < AXIS_OFFSET_TOLERANCE_MM;
}

function isParallel(a: Vec3, b: Vec3): boolean {
  return Math.abs(1 - Math.abs(dot(normalize(a), normalize(b)))) <
    Math.max(AXIS_PARALLEL_TOLERANCE, PLANE_PARALLEL_TOLERANCE);
}

function projectAxialPos(p: Vec3, axis: AxisLine): number {
  const d = sub(p, axis.origin);
  return dot(d, axis.direction);
}

function pointLineDistance(p: Vec3, line: AxisLine): number {
  const d = sub(p, line.origin);
  const t = dot(d, line.direction);
  const proj: Vec3 = [
    line.origin[0] + line.direction[0] * t,
    line.origin[1] + line.direction[1] * t,
    line.origin[2] + line.direction[2] * t,
  ];
  return length(sub(p, proj));
}

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
