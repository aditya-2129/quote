/**
 * TypeScript types matching the Rust TopologyPayload inside the
 * versioned topology envelope.
 *
 * These mirror the serde-serialized Rust structs in
 * src-tauri/src/cad/topology.rs.
 */

/** Complete BREP topology payload. */
export interface TopologyPayload {
  /** All faces in the shape, with wire loops. */
  faces: TopoFace[];
  /** All edges in the shape. */
  edges: TopoEdge[];
  /** Face-edge adjacency: for each face, which edges bound it. */
  adjacency: AdjacencyEntry[];
}

/** A single BREP face with its wire loops. */
export interface TopoFace {
  /** Deterministic ID (stable across re-imports of the same STEP file). */
  id: string;
  /** 1-based index in the OCCT topology map. */
  index: number;
  /** Analytic surface classification for this face. */
  surface: SurfaceClassification;
  /** Wire loops bounding this face (outer + inner/hole loops). */
  wires: TopoWire[];
}

export type SurfaceKind =
  | 'plane'
  | 'cylinder'
  | 'cone'
  | 'sphere'
  | 'torus'
  | 'b_spline'
  | 'unknown';

export interface SurfaceClassification {
  kind: SurfaceKind;
  origin?: [number, number, number];
  normal?: [number, number, number];
  axis_origin?: [number, number, number];
  axis_direction?: [number, number, number];
  center?: [number, number, number];
  radius?: number;
  length?: number;
  angular_span?: number;
  half_angle?: number;
  min_radius?: number;
  max_radius?: number;
  major_radius?: number;
  minor_radius?: number;
}

/** A wire loop — an ordered sequence of edges forming a closed boundary. */
export interface TopoWire {
  /** Ordered edge IDs in this wire loop. */
  edge_ids: string[];
  /** True if this is the outer boundary wire of the face. */
  is_outer: boolean;
}

/** A single BREP edge. */
export interface TopoEdge {
  /** Deterministic ID (stable across re-imports of the same STEP file). */
  id: string;
  /** 1-based index in the OCCT topology map. */
  index: number;
}

/** Face-edge adjacency entry: one face and all edges bounding it. */
export interface AdjacencyEntry {
  /** Face ID. */
  face_id: string;
  /** All edge IDs that bound this face. */
  adjacent_edge_ids: string[];
}
