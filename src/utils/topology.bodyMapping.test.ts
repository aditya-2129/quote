import { describe, it, expect } from "vitest";
import {
  filterTopologyToBody,
  mapTopologyBodiesToMeshes,
  type MeshBodyDescriptor,
} from "./topology";
import type { TopoBody, TopoFace, TopologyPayload } from "@/types/topology";

type Vec3 = [number, number, number];

function cylinderFace(
  id: string,
  radius: number,
  length: number,
  body: number,
  axisOrigin: Vec3 = [0, 0, 0],
): TopoFace {
  return {
    id,
    index: 1,
    body,
    surface: {
      kind: "cylinder",
      axis_origin: axisOrigin,
      axis_direction: [0, 0, 1],
      radius,
      length,
      angular_span: Math.PI * 2,
    },
    wires: [{ edge_ids: [`${id}_e`], is_outer: true }],
  };
}

function makeBody(index: number, min: Vec3, max: Vec3): TopoBody {
  return { index, bbox: { min, max } };
}

/**
 * Two-body topology:
 *   body 0 — a plain Ø7.2 through hole, centred near the origin
 *   body 1 — a tapped Ø5.0 (M6) hole, offset 100 mm along X
 */
function twoBodyTopology(): TopologyPayload {
  return {
    faces: [
      cylinderFace("hole_b0", 3.6, 20, 0, [10, 10, 0]),
      cylinderFace("tap_b1", 2.5, 12, 1, [110, 15, 0]),
    ],
    edges: [
      { id: "hole_b0_e", index: 1 },
      { id: "tap_b1_e", index: 2 },
    ],
    adjacency: [
      { face_id: "hole_b0", adjacent_edge_ids: ["hole_b0_e"] },
      { face_id: "tap_b1", adjacent_edge_ids: ["tap_b1_e"] },
    ],
    bodies: [
      makeBody(0, [0, 0, 0], [50, 50, 20]),
      makeBody(1, [100, 0, 0], [130, 30, 30]),
    ],
  };
}

describe("mapTopologyBodiesToMeshes", () => {
  it("maps each mesh body to the geometrically matching topology body", () => {
    const topology = twoBodyTopology();
    const meshes: MeshBodyDescriptor[] = [
      { id: "m0", box: { min: [0, 0, 0], max: [50, 50, 20] } },
      { id: "m1", box: { min: [100, 0, 0], max: [130, 30, 30] } },
    ];

    const mapping = mapTopologyBodiesToMeshes(topology, meshes);
    expect(mapping.get("m0")).toBe(0);
    expect(mapping.get("m1")).toBe(1);
    expect(mapping.size).toBe(2);
  });

  it("is independent of the order meshes are supplied in", () => {
    const topology = twoBodyTopology();
    const meshes: MeshBodyDescriptor[] = [
      { id: "m1", box: { min: [100, 0, 0], max: [130, 30, 30] } },
      { id: "m0", box: { min: [0, 0, 0], max: [50, 50, 20] } },
    ];

    const mapping = mapTopologyBodiesToMeshes(topology, meshes);
    expect(mapping.get("m0")).toBe(0);
    expect(mapping.get("m1")).toBe(1);
  });

  it("tolerates small tessellation differences in the mesh bounding box", () => {
    const topology = twoBodyTopology();
    // Mesh bbox a few percent smaller than the analytic body box.
    const meshes: MeshBodyDescriptor[] = [
      { id: "m0", box: { min: [0.3, 0.3, 0.2], max: [49.6, 49.5, 19.8] } },
      { id: "m1", box: { min: [100.2, 0.3, 0.1], max: [129.7, 29.6, 29.7] } },
    ];

    const mapping = mapTopologyBodiesToMeshes(topology, meshes);
    expect(mapping.get("m0")).toBe(0);
    expect(mapping.get("m1")).toBe(1);
  });

  it("omits a mesh that has no geometric match (honest unavailable)", () => {
    const topology = twoBodyTopology();
    const meshes: MeshBodyDescriptor[] = [
      { id: "m0", box: { min: [0, 0, 0], max: [50, 50, 20] } },
      // No 200 mm body exists in the topology.
      { id: "stray", box: { min: [500, 500, 500], max: [700, 700, 700] } },
    ];

    const mapping = mapTopologyBodiesToMeshes(topology, meshes);
    expect(mapping.get("m0")).toBe(0);
    expect(mapping.has("stray")).toBe(false);
  });

  it("returns an empty map for topology without body grouping", () => {
    const legacy: TopologyPayload = {
      faces: [cylinderFace("hole_b0", 3.6, 20, 0)],
      edges: [],
      adjacency: [],
    };
    const meshes: MeshBodyDescriptor[] = [
      { id: "m0", box: { min: [0, 0, 0], max: [50, 50, 20] } },
    ];

    expect(mapTopologyBodiesToMeshes(legacy, meshes).size).toBe(0);
    expect(mapTopologyBodiesToMeshes(undefined, meshes).size).toBe(0);
  });
});

describe("filterTopologyToBody", () => {
  it("slices the payload down to one body's faces, edges and adjacency", () => {
    const topology = twoBodyTopology();

    const body0 = filterTopologyToBody(topology, 0);
    expect(body0.faces.map((f) => f.id)).toEqual(["hole_b0"]);
    expect(body0.edges.map((e) => e.id)).toEqual(["hole_b0_e"]);
    expect(body0.adjacency.map((a) => a.face_id)).toEqual(["hole_b0"]);

    const body1 = filterTopologyToBody(topology, 1);
    expect(body1.faces.map((f) => f.id)).toEqual(["tap_b1"]);
    expect(body1.edges.map((e) => e.id)).toEqual(["tap_b1_e"]);
  });

  it("yields an empty payload for an unknown body index", () => {
    const body9 = filterTopologyToBody(twoBodyTopology(), 9);
    expect(body9.faces).toEqual([]);
    expect(body9.edges).toEqual([]);
    expect(body9.adjacency).toEqual([]);
  });
});
