import {
  findFacesByClass,
  type TopologyGraph,
  neighborsOf,
} from "../topology";
import {
  isOuterEnvelopeDiameter,
  type FeatureDetectionContext,
} from "./context";

export interface Thread {
  designation: string; // e.g. "M6x1.0", "1/4-20", or "unknown"
  pitch: number | "unknown"; // pitch in mm, or "unknown"
  length: number; // thread/cylinder length
  gender: "internal" | "external";
  diameter: number; // actual cylinder diameter
  faceIds: string[];
}

type Vec3 = [number, number, number];

interface ThreadSpec {
  designation: string;
  drillDia: number;
  majorDia: number;
  pitch: number;
}

const STANDARD_THREADS: ThreadSpec[] = [
  { designation: "M3x0.5", drillDia: 2.5, majorDia: 3.0, pitch: 0.5 },
  { designation: "M4x0.7", drillDia: 3.3, majorDia: 4.0, pitch: 0.7 },
  { designation: "M5x0.8", drillDia: 4.2, majorDia: 5.0, pitch: 0.8 },
  { designation: "M6x1.0", drillDia: 5.0, majorDia: 6.0, pitch: 1.0 },
  { designation: "M8x1.25", drillDia: 6.8, majorDia: 8.0, pitch: 1.25 },
  { designation: "M10x1.5", drillDia: 8.5, majorDia: 10.0, pitch: 1.5 },
  { designation: "M12x1.75", drillDia: 10.2, majorDia: 12.0, pitch: 1.75 },
  { designation: "1/4-20", drillDia: 5.1, majorDia: 6.35, pitch: 1.27 },
  { designation: "1/4-28", drillDia: 5.5, majorDia: 6.35, pitch: 0.907 },
  { designation: "#8-32", drillDia: 3.5, majorDia: 4.166, pitch: 0.794 },
  { designation: "#10-32", drillDia: 4.1, majorDia: 4.826, pitch: 0.794 },
  { designation: "3/8-16", drillDia: 8.0, majorDia: 9.525, pitch: 1.587 },
];

const DIAMETER_TOLERANCE = 0.2; // ±0.2 mm
const PARTIAL_SPAN_THRESHOLD_RAD = Math.PI * 1.9;

export function detectThreads(
  graph: TopologyGraph | undefined,
  context?: FeatureDetectionContext,
): Thread[] {
  if (!graph) return [];

  let cylinders = findFacesByClass(graph, "cylinder").filter(isClosedEnough);

  // Never report a thread on the outer body/rim cylinder of a round body —
  // the stock outer diameter is not a threaded surface.
  const env = context?.bodyEnvelope;
  if (env) {
    cylinders = cylinders.filter(
      (cyl) => !isOuterEnvelopeDiameter(cyl.radius * 2, env),
    );
  }

  if (cylinders.length === 0) return [];

  const threads: Thread[] = [];

  for (const cyl of cylinders) {
    const faceId = cyl.face.id;
    const neighbors = neighborsOf(graph, faceId);

    // Find adjacent planes
    const adjacentPlanes: { origin: Vec3; normal: Vec3; id: string }[] = [];
    for (const n of neighbors) {
      const cls = graph.faceClasses.get(n.id);
      if (cls && cls.kind === "plane") {
        adjacentPlanes.push({ origin: cls.origin, normal: cls.normal, id: n.id });
      }
    }

    // Determine concavity:
    // For each adjacent plane face, compute dot(sub(plane.origin, cyl.axisOrigin), plane.normal)
    // A negative sum is internal (concave), a positive sum is external (convex).
    let concavity: "convex" | "concave" = "concave"; // default to internal
    if (adjacentPlanes.length > 0) {
      let sum = 0;
      for (const p of adjacentPlanes) {
        sum += dot(sub(p.origin, cyl.axisOrigin), p.normal);
      }
      concavity = sum < 0 ? "concave" : "convex";
    }

    // With a known body envelope, every surviving cylinder is an interior
    // bore (outer-envelope cylinders were filtered out above), so its only
    // valid thread is internal. The concavity heuristic is unreliable for
    // real BREP topology and otherwise mislabels bores as external shafts.
    const gender: "internal" | "external" = env
      ? "internal"
      : concavity === "concave"
        ? "internal"
        : "external";
    const diameter = cyl.radius * 2;

    // Check cylinder diameter against the standard lookup table with a tolerance of ±0.2 mm
    let matchedSpec: ThreadSpec | undefined = undefined;
    for (const spec of STANDARD_THREADS) {
      const targetDia = gender === "internal" ? spec.drillDia : spec.majorDia;
      if (Math.abs(diameter - targetDia) <= DIAMETER_TOLERANCE) {
        matchedSpec = spec;
        break;
      }
    }

    // Check if the face is explicitly marked/indicated as a thread (e.g. for non-standard diameter testing)
    const isExplicitThread =
      faceId.toLowerCase().includes("thread") ||
      faceId.toLowerCase().includes("tap");

    // Standard diameter or explicit non-standard thread
    if (matchedSpec) {
      threads.push({
        designation: matchedSpec.designation,
        pitch: matchedSpec.pitch,
        length: cyl.length ?? 0,
        gender,
        diameter,
        faceIds: [faceId],
      });
    } else if (isExplicitThread) {
      threads.push({
        designation: "unknown",
        pitch: "unknown",
        length: cyl.length ?? 0,
        gender,
        diameter,
        faceIds: [faceId],
      });
    }
  }

  return threads;
}

function isClosedEnough(face: Extract<import("../topology").FaceClass, { kind: "cylinder" }>): boolean {
  return (
    face.angularSpan === undefined ||
    face.angularSpan >= PARTIAL_SPAN_THRESHOLD_RAD
  );
}

// Vector math utilities
function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
