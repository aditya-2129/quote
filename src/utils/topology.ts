import type {
  SurfaceClassification,
  SurfaceKind,
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
