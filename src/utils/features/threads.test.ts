import { describe, it, expect } from "vitest";
import { buildTopologyGraph } from "../topology";
import type { TopologyPayload } from "@/types/topology";
import { detectThreads } from "./threads";

describe("detectThreads", () => {
  it("returns empty when topology is absent", () => {
    expect(detectThreads(undefined)).toEqual([]);
  });

  it("returns empty when no cylinders are present", () => {
    const graph = buildTopologyGraph({
      faces: [planeFace("f1", [0, 0, 0], [0, 0, 1])],
      edges: [],
      adjacency: [],
    });
    expect(detectThreads(graph)).toEqual([]);
  });

  it("rejects a smooth bore hole", () => {
    // 6.0 mm internal hole is a standard M6 clearance hole, not a thread
    const graph = buildTopologyGraph({
      faces: [
        cylinderFace("cyl", 3.0, 15), // diameter = 6.0 mm
        planeFace("cap", [0, 0, 15], [0, 0, -1]), // concave normal
      ],
      edges: [edge("e1")],
      adjacency: [
        { face_id: "cyl", adjacent_edge_ids: ["e1"] },
        { face_id: "cap", adjacent_edge_ids: ["e1"] },
      ],
    });

    const threads = detectThreads(graph);
    expect(threads).toHaveLength(0);
  });

  it("detects internal threads (M6, M8) correctly", () => {
    // M6 tapped hole: modeled at drill diameter 5.0 mm (radius 2.5 mm)
    // M8 tapped hole: modeled at drill diameter 6.8 mm (radius 3.4 mm)
    const graph = buildTopologyGraph({
      faces: [
        cylinderFace("m6_cyl", 2.5, 12),
        planeFace("m6_cap", [0, 0, 12], [0, 0, -1]),
        cylinderFace("m8_cyl", 3.4, 16, [50, 0, 0]),
        planeFace("m8_cap", [50, 0, 16], [0, 0, -1]),
      ],
      edges: [edge("e_m6"), edge("e_m8")],
      adjacency: [
        { face_id: "m6_cyl", adjacent_edge_ids: ["e_m6"] },
        { face_id: "m6_cap", adjacent_edge_ids: ["e_m6"] },
        { face_id: "m8_cyl", adjacent_edge_ids: ["e_m8"] },
        { face_id: "m8_cap", adjacent_edge_ids: ["e_m8"] },
      ],
    });

    const threads = detectThreads(graph);
    expect(threads).toHaveLength(2);

    const m6 = threads.find((t) => t.faceIds.includes("m6_cyl"));
    expect(m6).toBeDefined();
    expect(m6).toMatchObject({
      designation: "M6x1.0",
      pitch: 1.0,
      length: 12,
      gender: "internal",
    });

    const m8 = threads.find((t) => t.faceIds.includes("m8_cyl"));
    expect(m8).toBeDefined();
    expect(m8).toMatchObject({
      designation: "M8x1.25",
      pitch: 1.25,
      length: 16,
      gender: "internal",
    });
  });

  it("detects external threads (1/4-20, M6 shaft) correctly", () => {
    // 1/4-20 shaft: modeled at major diameter 6.35 mm (radius 3.175 mm)
    // M6 shaft: modeled at major diameter 6.0 mm (radius 3.0 mm)
    const graph = buildTopologyGraph({
      faces: [
        cylinderFace("1/4_shaft", 3.175, 20),
        planeFace("1/4_shoulder", [0, 0, 20], [0, 0, 1]), // convex normal
        cylinderFace("m6_shaft", 3.0, 15, [50, 0, 0]),
        planeFace("m6_shoulder", [50, 0, 15], [0, 0, 1]), // convex normal
      ],
      edges: [edge("e_1/4"), edge("e_m6")],
      adjacency: [
        { face_id: "1/4_shaft", adjacent_edge_ids: ["e_1/4"] },
        { face_id: "1/4_shoulder", adjacent_edge_ids: ["e_1/4"] },
        { face_id: "m6_shaft", adjacent_edge_ids: ["e_m6"] },
        { face_id: "m6_shoulder", adjacent_edge_ids: ["e_m6"] },
      ],
    });

    const threads = detectThreads(graph);
    expect(threads).toHaveLength(2);

    const imp = threads.find((t) => t.faceIds.includes("1/4_shaft"));
    expect(imp).toBeDefined();
    expect(imp).toMatchObject({
      designation: "1/4-20",
      pitch: 1.27,
      length: 20,
      gender: "external",
    });

    const m6 = threads.find((t) => t.faceIds.includes("m6_shaft"));
    expect(m6).toBeDefined();
    expect(m6).toMatchObject({
      designation: "M6x1.0",
      pitch: 1.0,
      length: 15,
      gender: "external",
    });
  });

  it("returns unknown for non-standard diameter explicit thread", () => {
    const graph = buildTopologyGraph({
      faces: [
        cylinderFace("custom_thread", 7.5, 25), // diameter = 15.0 mm (non-standard)
        planeFace("shoulder", [0, 0, 25], [0, 0, 1]), // convex normal
      ],
      edges: [edge("e1")],
      adjacency: [
        { face_id: "custom_thread", adjacent_edge_ids: ["e1"] },
        { face_id: "shoulder", adjacent_edge_ids: ["e1"] },
      ],
    });

    const threads = detectThreads(graph);
    expect(threads).toHaveLength(1);
    expect(threads[0]).toMatchObject({
      designation: "unknown",
      pitch: "unknown",
      length: 25,
      gender: "external",
      diameter: 15.0,
    });
  });

  it("handles 50 threads under 100ms", () => {
    const faces: TopologyPayload["faces"] = [];
    const edges: TopologyPayload["edges"] = [];
    const adjacency: TopologyPayload["adjacency"] = [];

    for (let i = 0; i < 50; i++) {
      const cylId = `cyl_${i}`;
      const capId = `cap_${i}`;
      const edgeId = `e_${i}`;

      // 5.0 mm diameter is M6 drill dia, so it will be recognized as standard thread
      faces.push(cylinderFace(cylId, 2.5, 10, [i * 20, 0, 0]));
      faces.push(planeFace(capId, [i * 20, 0, 10], [0, 0, -1]));
      edges.push(edge(edgeId));

      adjacency.push({ face_id: cylId, adjacent_edge_ids: [edgeId] });
      adjacency.push({ face_id: capId, adjacent_edge_ids: [edgeId] });
    }

    const graph = buildTopologyGraph({ faces, edges, adjacency });

    const start = performance.now();
    const threads = detectThreads(graph);
    const elapsed = performance.now() - start;

    expect(threads).toHaveLength(50);
    expect(elapsed).toBeLessThan(100);
  });
});

// Helper functions for test payload creation
function cylinderFace(
  id: string,
  radius: number,
  length: number,
  axisOrigin: [number, number, number] = [0, 0, 0],
  axisDirection: [number, number, number] = [0, 0, 1],
): TopologyPayload["faces"][number] {
  return {
    id,
    index: 1,
    surface: {
      kind: "cylinder",
      axis_origin: axisOrigin,
      axis_direction: axisDirection,
      radius,
      length,
      angular_span: Math.PI * 2,
    },
    wires: [],
  };
}

function planeFace(
  id: string,
  origin: [number, number, number],
  normal: [number, number, number],
): TopologyPayload["faces"][number] {
  return {
    id,
    index: 1,
    surface: { kind: "plane", origin, normal },
    wires: [],
  };
}

function edge(id: string): TopologyPayload["edges"][number] {
  return { id, index: 1 };
}
