import { describe, it, expect } from "vitest";
import { buildTopologyGraph } from "../topology";
import type { TopologyPayload } from "@/types/topology";
import { detectSlots } from "./slots";

describe("detectSlots", () => {
  it("returns empty when topology is absent", () => {
    expect(detectSlots(undefined)).toEqual([]);
  });

  it("returns empty when no features are present", () => {
    const graph = buildTopologyGraph({
      faces: [planeFace("f1", [0, 0, 0], [0, 0, 1])],
      edges: [],
      adjacency: [],
    });
    expect(detectSlots(graph)).toEqual([]);
  });

  it("detects a rounded slot (two cylinders + two connecting parallel planar walls)", () => {
    const graph = buildTopologyGraph({
      faces: [
        cylinderFace("cyl1", 5, 12, [0, 0, 0], [0, 0, 1]),
        cylinderFace("cyl2", 5, 12, [30, 0, 0], [0, 0, 1]),
        planeFace("wall1", [15, 5, 0], [0, 1, 0]),
        planeFace("wall2", [15, -5, 0], [0, -1, 0]),
      ],
      edges: [
        edge("e_w1_c1"),
        edge("e_w1_c2"),
        edge("e_w2_c1"),
        edge("e_w2_c2"),
      ],
      adjacency: [
        { face_id: "cyl1", adjacent_edge_ids: ["e_w1_c1", "e_w2_c1"] },
        { face_id: "cyl2", adjacent_edge_ids: ["e_w1_c2", "e_w2_c2"] },
        { face_id: "wall1", adjacent_edge_ids: ["e_w1_c1", "e_w1_c2"] },
        { face_id: "wall2", adjacent_edge_ids: ["e_w2_c1", "e_w2_c2"] },
      ],
    });

    const slots = detectSlots(graph);

    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({
      kind: "rounded",
      lengthMm: 40, // 30 separation + 2 * 5 radius
      widthMm: 10,  // 2 * 5 radius
      depthMm: 12,
      axis: [1, 0, 0], // direction along length
    });
    expect(slots[0].faceIds).toContain("cyl1");
    expect(slots[0].faceIds).toContain("cyl2");
    expect(slots[0].faceIds).toContain("wall1");
    expect(slots[0].faceIds).toContain("wall2");
  });

  it("ignores a rounded pocket if aspect ratio is <= 2.0 (e.g. 1.25)", () => {
    // Radius = 10, separation = 5 -> L = 25, W = 20 -> Aspect = 1.25
    const graph = buildTopologyGraph({
      faces: [
        cylinderFace("cyl1", 10, 12, [0, 0, 0], [0, 0, 1]),
        cylinderFace("cyl2", 10, 12, [5, 0, 0], [0, 0, 1]),
        planeFace("wall1", [2.5, 10, 0], [0, 1, 0]),
        planeFace("wall2", [2.5, -10, 0], [0, -1, 0]),
      ],
      edges: [
        edge("e_w1_c1"),
        edge("e_w1_c2"),
        edge("e_w2_c1"),
        edge("e_w2_c2"),
      ],
      adjacency: [
        { face_id: "cyl1", adjacent_edge_ids: ["e_w1_c1", "e_w2_c1"] },
        { face_id: "cyl2", adjacent_edge_ids: ["e_w1_c2", "e_w2_c2"] },
        { face_id: "wall1", adjacent_edge_ids: ["e_w1_c1", "e_w1_c2"] },
        { face_id: "wall2", adjacent_edge_ids: ["e_w2_c1", "e_w2_c2"] },
      ],
    });

    const slots = detectSlots(graph);
    expect(slots).toHaveLength(0);
  });

  it("detects a rectangular slot (planar floor + 4 walls)", () => {
    const graph = buildTopologyGraph({
      faces: [
        planeFace("floor", [0, 0, 0], [0, 0, 1]),
        planeFace("w_long1", [0, 5, 8], [0, 1, 0]),
        planeFace("w_long2", [0, -5, 8], [0, -1, 0]),
        planeFace("w_short1", [20, 0, 8], [1, 0, 0]),
        planeFace("w_short2", [-20, 0, 8], [-1, 0, 0]),
        planeFace("top", [0, 0, 15], [0, 0, 1]), // for depth calculation: 15 - 0 = 15 depth
      ],
      edges: [
        edge("e_fl_wl1"),
        edge("e_fl_wl2"),
        edge("e_fl_ws1"),
        edge("e_fl_ws2"),
        edge("e_top_wl1"),
      ],
      adjacency: [
        { face_id: "floor", adjacent_edge_ids: ["e_fl_wl1", "e_fl_wl2", "e_fl_ws1", "e_fl_ws2"] },
        { face_id: "w_long1", adjacent_edge_ids: ["e_fl_wl1", "e_top_wl1"] },
        { face_id: "w_long2", adjacent_edge_ids: ["e_fl_wl2"] },
        { face_id: "w_short1", adjacent_edge_ids: ["e_fl_ws1"] },
        { face_id: "w_short2", adjacent_edge_ids: ["e_fl_ws2"] },
        { face_id: "top", adjacent_edge_ids: ["e_top_wl1"] },
      ],
    });

    const slots = detectSlots(graph);

    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({
      kind: "rectangular",
      lengthMm: 40, // distance between short walls (-20 to 20)
      widthMm: 10,  // distance between long walls (-5 to 5)
      depthMm: 15,  // distance between floor (0) and top (15)
      axis: [1, 0, 0], // direction of longer dimension (along length)
    });
    expect(slots[0].faceIds).toContain("floor");
    expect(slots[0].faceIds).toContain("w_long1");
    expect(slots[0].faceIds).toContain("w_long2");
    expect(slots[0].faceIds).toContain("w_short1");
    expect(slots[0].faceIds).toContain("w_short2");
  });

  it("ignores a square pocket (aspect ratio 1:1)", () => {
    const graph = buildTopologyGraph({
      faces: [
        planeFace("floor", [0, 0, 0], [0, 0, 1]),
        planeFace("w1", [0, 10, 5], [0, 1, 0]),
        planeFace("w2", [0, -10, 5], [0, -1, 0]),
        planeFace("w3", [10, 0, 5], [1, 0, 0]),
        planeFace("w4", [-10, 0, 5], [-1, 0, 0]),
      ],
      edges: [
        edge("e_fl_w1"),
        edge("e_fl_w2"),
        edge("e_fl_w3"),
        edge("e_fl_w4"),
      ],
      adjacency: [
        { face_id: "floor", adjacent_edge_ids: ["e_fl_w1", "e_fl_w2", "e_fl_w3", "e_fl_w4"] },
        { face_id: "w1", adjacent_edge_ids: ["e_fl_w1"] },
        { face_id: "w2", adjacent_edge_ids: ["e_fl_w2"] },
        { face_id: "w3", adjacent_edge_ids: ["e_fl_w3"] },
        { face_id: "w4", adjacent_edge_ids: ["e_fl_w4"] },
      ],
    });

    const slots = detectSlots(graph);
    expect(slots).toHaveLength(0);
  });

  it("handles 50 slots under 100ms", () => {
    const faces: TopologyPayload["faces"] = [];
    const edges: TopologyPayload["edges"] = [];
    const adjacency: TopologyPayload["adjacency"] = [];

    // We generate 50 separate rounded slots
    for (let i = 0; i < 50; i++) {
      const offset = i * 100;
      const c1Id = `c1_${i}`;
      const c2Id = `c2_${i}`;
      const w1Id = `w1_${i}`;
      const w2Id = `w2_${i}`;

      faces.push(
        cylinderFace(c1Id, 5, 10, [offset, 0, 0], [0, 0, 1]),
        cylinderFace(c2Id, 5, 10, [offset + 30, 0, 0], [0, 0, 1]),
        planeFace(w1Id, [offset + 15, 5, 0], [0, 1, 0]),
        planeFace(w2Id, [offset + 15, -5, 0], [0, -1, 0]),
      );

      const e1 = `e1_${i}`;
      const e2 = `e2_${i}`;
      const e3 = `e3_${i}`;
      const e4 = `e4_${i}`;

      edges.push(edge(e1), edge(e2), edge(e3), edge(e4));

      adjacency.push(
        { face_id: c1Id, adjacent_edge_ids: [e1, e3] },
        { face_id: c2Id, adjacent_edge_ids: [e2, e4] },
        { face_id: w1Id, adjacent_edge_ids: [e1, e2] },
        { face_id: w2Id, adjacent_edge_ids: [e3, e4] },
      );
    }

    const graph = buildTopologyGraph({ faces, edges, adjacency });

    const start = performance.now();
    const slots = detectSlots(graph);
    const elapsed = performance.now() - start;

    expect(slots).toHaveLength(50);
    expect(elapsed).toBeLessThan(100);
  });
});

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
      angular_span: Math.PI, // Semi-cylinder
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
