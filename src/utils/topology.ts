import type {
  SurfaceClassification,
  SurfaceKind,
  TopoBody,
  TopoBbox,
  TopoEdge,
  TopoFace,
  TopoWire,
  TopologyPayload,
} from "@/types/topology";

export type { TopologyPayload } from "@/types/topology";

export const TOPOLOGY_SCHEMA_VERSION = 1;

export interface TopologyEnvelope {
  version: typeof TOPOLOGY_SCHEMA_VERSION;
  topology: TopologyPayload;
}

export function wrapTopologyPayload(
  topology: TopologyPayload,
): TopologyEnvelope {
  return {
    version: TOPOLOGY_SCHEMA_VERSION,
    topology,
  };
}

export function parseTopologyEnvelope(json: string): TopologyEnvelope {
  const parsed: unknown = JSON.parse(json);

  if (!isRecord(parsed)) {
    throw new Error("Topology envelope must be an object");
  }
  if (parsed.version !== TOPOLOGY_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported topology schema version ${String(parsed.version)}; expected ${TOPOLOGY_SCHEMA_VERSION}`,
    );
  }
  if (!isRecord(parsed.topology)) {
    throw new Error("Topology envelope is missing topology payload");
  }

  return parsed as unknown as TopologyEnvelope;
}

export function serializeTopologyEnvelope(envelope: TopologyEnvelope): string {
  return JSON.stringify(envelope);
}

export function serializeTopologyPayload(topology: TopologyPayload): string {
  return serializeTopologyEnvelope(wrapTopologyPayload(topology));
}

export type FaceClass =
  | { kind: "plane"; face: TopoFace; origin: Vec3; normal: Vec3 }
  | {
      kind: "cylinder";
      face: TopoFace;
      axisOrigin: Vec3;
      axisDirection: Vec3;
      radius: number;
      length?: number;
      angularSpan?: number;
    }
  | {
      kind: "cone";
      face: TopoFace;
      axisOrigin: Vec3;
      axisDirection: Vec3;
      halfAngle: number;
      minRadius?: number;
      maxRadius?: number;
      length?: number;
      angularSpan?: number;
    }
  | {
      kind: "sphere";
      face: TopoFace;
      center: Vec3;
      radius: number;
      angularSpan?: number;
    }
  | {
      kind: "torus";
      face: TopoFace;
      axisOrigin: Vec3;
      axisDirection: Vec3;
      majorRadius: number;
      minorRadius: number;
      angularSpan?: number;
    }
  | {
      kind: "spline";
      face: TopoFace;
      sourceKind: Extract<SurfaceKind, "b_spline" | "unknown">;
    };

export type EdgeClass =
  | { kind: "linear"; edge: TopoEdge }
  | { kind: "circular"; edge: TopoEdge }
  | { kind: "spline"; edge: TopoEdge };

export interface TopologyGraph {
  faces: ReadonlyMap<string, TopoFace>;
  edges: ReadonlyMap<string, TopoEdge>;
  adjacency: ReadonlyMap<string, readonly string[]>;
  faceClasses: ReadonlyMap<string, FaceClass>;
  edgeClasses: ReadonlyMap<string, EdgeClass>;
}

type Vec3 = [number, number, number];

export function buildTopologyGraph(
  topology: TopologyPayload | undefined | null,
): TopologyGraph | undefined {
  if (!topology) return undefined;

  const faces = new Map(topology.faces.map((face) => [face.id, face] as const));
  const edges = new Map(topology.edges.map((edge) => [edge.id, edge] as const));
  const adjacency = new Map(
    topology.adjacency.map(
      (entry) => [entry.face_id, [...entry.adjacent_edge_ids]] as const,
    ),
  );
  const faceClasses = new Map(
    topology.faces.map((face) => [face.id, classifyFace(face)] as const),
  );
  const edgeClasses = new Map(
    topology.edges.map((edge) => [edge.id, classifyEdge(edge)] as const),
  );

  return {
    faces,
    edges,
    adjacency,
    faceClasses,
    edgeClasses,
  };
}

export function findFacesByClass<K extends FaceClass["kind"]>(
  graph: TopologyGraph | undefined,
  kind: K,
): Extract<FaceClass, { kind: K }>[] {
  if (!graph) return [];

  const matches: Extract<FaceClass, { kind: K }>[] = [];
  for (const faceClass of graph.faceClasses.values()) {
    if (faceClass.kind === kind) {
      matches.push(faceClass as Extract<FaceClass, { kind: K }>);
    }
  }
  return matches;
}

export function neighborsOf(
  graph: TopologyGraph | undefined,
  faceId: string,
): TopoFace[] {
  if (!graph) return [];

  const edgeIds = graph.adjacency.get(faceId);
  if (!edgeIds) return [];

  const edgeSet = new Set(edgeIds);
  const neighbors: TopoFace[] = [];
  for (const [candidateFaceId, candidateEdgeIds] of graph.adjacency.entries()) {
    if (candidateFaceId === faceId) continue;
    if (candidateEdgeIds.some((edgeId) => edgeSet.has(edgeId))) {
      const face = graph.faces.get(candidateFaceId);
      if (face) neighbors.push(face);
    }
  }

  return neighbors;
}

export function wireLoopsOf(
  graph: TopologyGraph | undefined,
  faceId: string,
): readonly TopoWire[] {
  return graph?.faces.get(faceId)?.wires ?? [];
}

export function classifyFace(face: TopoFace): FaceClass {
  const surface = face.surface;
  switch (surface.kind) {
    case "plane":
      return {
        kind: "plane",
        face,
        origin: requiredVec3(surface.origin, "plane origin"),
        normal: requiredVec3(surface.normal, "plane normal"),
      };
    case "cylinder":
      return {
        kind: "cylinder",
        face,
        axisOrigin: requiredVec3(surface.axis_origin, "cylinder axis origin"),
        axisDirection: requiredVec3(
          surface.axis_direction,
          "cylinder axis direction",
        ),
        radius: requiredNumber(surface.radius, "cylinder radius"),
        length: surface.length,
        angularSpan: surface.angular_span,
      };
    case "cone":
      return {
        kind: "cone",
        face,
        axisOrigin: requiredVec3(surface.axis_origin, "cone axis origin"),
        axisDirection: requiredVec3(
          surface.axis_direction,
          "cone axis direction",
        ),
        halfAngle: requiredNumber(surface.half_angle, "cone half angle"),
        minRadius: surface.min_radius,
        maxRadius: surface.max_radius,
        length: surface.length,
        angularSpan: surface.angular_span,
      };
    case "sphere":
      return {
        kind: "sphere",
        face,
        center: requiredVec3(surface.center, "sphere center"),
        radius: requiredNumber(surface.radius, "sphere radius"),
        angularSpan: surface.angular_span,
      };
    case "torus":
      return {
        kind: "torus",
        face,
        axisOrigin: requiredVec3(surface.axis_origin, "torus axis origin"),
        axisDirection: requiredVec3(
          surface.axis_direction,
          "torus axis direction",
        ),
        majorRadius: requiredNumber(surface.major_radius, "torus major radius"),
        minorRadius: requiredNumber(surface.minor_radius, "torus minor radius"),
        angularSpan: surface.angular_span,
      };
    case "b_spline":
    case "unknown":
      return { kind: "spline", face, sourceKind: surface.kind };
    default:
      return assertNever(surface.kind);
  }
}

export function classifyEdge(edge: TopoEdge): EdgeClass {
  return { kind: "spline", edge };
}

// ── Body-to-mesh mapping ───────────────────────────────────────────────
//
// Whole-file BREP topology is extracted as one payload, but the Viewer
// inspects one selected mesh body at a time. These helpers match the
// topology's top-level bodies (solids/shells, each with a bounding box)
// to the imported CAD mesh bodies so feature recognition can run per body.

/** An axis-aligned bounding box, in model space (mm). */
export interface BodyBoundingBox {
  min: readonly [number, number, number];
  max: readonly [number, number, number];
}

/** A CAD mesh body to be matched against topology bodies. */
export interface MeshBodyDescriptor {
  /** Stable mesh ID (`CadMesh.id`). */
  id: string;
  /** Bounding box of the mesh geometry. */
  box: BodyBoundingBox;
}

// Two bodies are size-compatible when no sorted bbox dimension differs by
// more than this fraction. Generous enough to absorb tessellation error
// between an analytic body box and a triangulated mesh box.
const BODY_SIZE_SIGNATURE_GATE = 0.15;

// A size-compatible pair is only accepted if the bbox centres are within
// this fraction of the mesh's bbox diagonal — guards against a coordinate
// frame mismatch silently producing wrong matches.
const BODY_CENTER_ACCEPT_FRACTION = 0.5;

function boxCenter(box: BodyBoundingBox): Vec3 {
  return [
    (box.min[0] + box.max[0]) / 2,
    (box.min[1] + box.max[1]) / 2,
    (box.min[2] + box.max[2]) / 2,
  ];
}

/** Bbox extents sorted descending — an order-independent size signature. */
function boxSizeSignature(box: BodyBoundingBox): Vec3 {
  const dims: Vec3 = [
    Math.abs(box.max[0] - box.min[0]),
    Math.abs(box.max[1] - box.min[1]),
    Math.abs(box.max[2] - box.min[2]),
  ];
  return [...dims].sort((a, b) => b - a) as Vec3;
}

function sizeSignatureDiff(a: Vec3, b: Vec3): number {
  let worst = 0;
  for (let i = 0; i < 3; i += 1) {
    const denom = Math.max(a[i], b[i], 1e-6);
    worst = Math.max(worst, Math.abs(a[i] - b[i]) / denom);
  }
  return worst;
}

function vecDistance(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/**
 * Match topology bodies to imported mesh bodies by bounding-box geometry.
 *
 * Returns a `meshId → bodyIndex` map. A mesh is omitted from the map when
 * no topology body is a confident geometric match — the caller should then
 * surface an honest "could not map" state rather than guessing.
 */
export function mapTopologyBodiesToMeshes(
  topology: TopologyPayload | undefined | null,
  meshes: readonly MeshBodyDescriptor[],
): Map<string, number> {
  const result = new Map<string, number>();
  const bodies = topology?.bodies;
  if (!bodies || bodies.length === 0 || meshes.length === 0) return result;

  const bodyInfo = bodies
    .filter((body): body is TopoBody & { bbox: TopoBbox } =>
      body.bbox !== undefined,
    )
    .map((body) => ({
      index: body.index,
      center: boxCenter(body.bbox),
      size: boxSizeSignature(body.bbox),
    }));
  if (bodyInfo.length === 0) return result;

  const meshInfo = meshes.map((mesh) => {
    const size = boxSizeSignature(mesh.box);
    return {
      id: mesh.id,
      center: boxCenter(mesh.box),
      size,
      diagonal: Math.hypot(size[0], size[1], size[2]),
    };
  });

  // Build size-compatible candidate pairs, then greedily assign 1:1 from
  // the closest bbox centres outward. Distinct solids occupy distinct
  // space, so centre proximity is an almost-unique key; the size gate
  // disambiguates nested parts that share a centroid.
  interface Pair {
    meshId: string;
    bodyIndex: number;
    centerDist: number;
    meshDiagonal: number;
  }
  const pairs: Pair[] = [];
  for (const mesh of meshInfo) {
    for (const body of bodyInfo) {
      if (sizeSignatureDiff(mesh.size, body.size) > BODY_SIZE_SIGNATURE_GATE) {
        continue;
      }
      pairs.push({
        meshId: mesh.id,
        bodyIndex: body.index,
        centerDist: vecDistance(mesh.center, body.center),
        meshDiagonal: mesh.diagonal,
      });
    }
  }
  pairs.sort((a, b) => a.centerDist - b.centerDist);

  const usedBodies = new Set<number>();
  for (const pair of pairs) {
    if (result.has(pair.meshId) || usedBodies.has(pair.bodyIndex)) continue;
    if (pair.meshDiagonal <= 0) continue;
    if (pair.centerDist > pair.meshDiagonal * BODY_CENTER_ACCEPT_FRACTION) {
      continue;
    }
    result.set(pair.meshId, pair.bodyIndex);
    usedBodies.add(pair.bodyIndex);
  }
  return result;
}

/**
 * Slice a whole-file topology payload down to a single body, keeping only
 * its faces, their edges, and their adjacency. The result is a self-contained
 * payload that feeds `buildTopologyGraph` for per-body feature recognition.
 */
export function filterTopologyToBody(
  topology: TopologyPayload,
  bodyIndex: number,
): TopologyPayload {
  const faces = topology.faces.filter((face) => face.body === bodyIndex);
  const faceIds = new Set(faces.map((face) => face.id));
  const adjacency = topology.adjacency.filter((entry) =>
    faceIds.has(entry.face_id),
  );

  const edgeIds = new Set<string>();
  for (const entry of adjacency) {
    for (const edgeId of entry.adjacent_edge_ids) edgeIds.add(edgeId);
  }
  for (const face of faces) {
    for (const wire of face.wires) {
      for (const edgeId of wire.edge_ids) edgeIds.add(edgeId);
    }
  }
  const edges = topology.edges.filter((edge) => edgeIds.has(edge.id));

  return { faces, edges, adjacency, bodies: topology.bodies };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredVec3(
  value: SurfaceClassification[keyof SurfaceClassification],
  label: string,
): Vec3 {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new Error(`Missing ${label}`);
  }
  const [x, y, z] = value;
  if (typeof x !== "number" || typeof y !== "number" || typeof z !== "number") {
    throw new Error(`Invalid ${label}`);
  }
  return [x, y, z];
}

function requiredNumber(value: number | undefined, label: string): number {
  if (typeof value !== "number") {
    throw new Error(`Missing ${label}`);
  }
  return value;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled topology class: ${String(value)}`);
}
