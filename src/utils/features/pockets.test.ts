import { describe, it, expect } from "vitest";
import { buildTopologyGraph } from "../topology";
import type { TopologyPayload } from "@/types/topology";
import { detectPockets } from "./pockets";

describe("detectPockets", () => {
  it("returns empty when topology is absent", () => {
    expect(detectPockets(undefined)).toEqual([]);
  });

  it("returns empty when no floor planes are present", () => {
    const graph = buildTopologyGraph({
      faces: [],
      edges: [],
      adjacency: [],
    });
    expect(detectPockets(graph)).toEqual([]);
  });

  it("detects an open rectangular pocket", () => {
    const graph = buildTopologyGraph({
      faces: [
        planeFace("floor", [10, 5, 10], [0, 0, -1], [
          { edge_ids: ["e1", "e2", "e3", "e4"], is_outer: true }
        ]),
        planeFace("wall_left", [0, 5, 25], [1, 0, 0]),
        planeFace("wall_right", [20, 5, 25], [-1, 0, 0]),
        planeFace("wall_front", [10, 0, 25], [0, 1, 0]),
        planeFace("wall_back", [10, 10, 25], [0, -1, 0]),
      ],
      edges: [edge("e1"), edge("e2"), edge("e3"), edge("e4")],
      adjacency: [
        { face_id: "floor", adjacent_edge_ids: ["e1", "e2", "e3", "e4"] },
        { face_id: "wall_left", adjacent_edge_ids: ["e1"] },
        { face_id: "wall_right", adjacent_edge_ids: ["e2"] },
        { face_id: "wall_front", adjacent_edge_ids: ["e3"] },
        { face_id: "wall_back", adjacent_edge_ids: ["e4"] },
      ],
    });

    const pockets = detectPockets(graph);

    expect(pockets).toHaveLength(1);
    expect(pockets[0]).toMatchObject({
      kind: "open",
      depth: 15,
      footprintAreaMm2: 200,
      wallCount: 4,
      accessDirections: [[0, 0, 1]],
    });
    expect(pockets[0].faceIds).toContain("floor");
    expect(pockets[0].faceIds).toContain("wall_left");
  });

  it("detects a closed rectangular pocket (ceiling face inside envelope)", () => {
    const graph = buildTopologyGraph({
      faces: [
        planeFace("floor", [10, 5, 10], [0, 0, -1], [
          { edge_ids: ["e1", "e2", "e3", "e4"], is_outer: true }
        ]),
        planeFace("wall_left", [0, 5, 25], [1, 0, 0]),
        planeFace("wall_right", [20, 5, 25], [-1, 0, 0]),
        planeFace("wall_front", [10, 0, 25], [0, 1, 0]),
        planeFace("wall_back", [10, 10, 25], [0, -1, 0]),
        // Ceiling plane inside the envelope (AABB)
        planeFace("ceiling", [10, 5, 30], [0, 0, -1]),
      ],
      edges: [edge("e1"), edge("e2"), edge("e3"), edge("e4")],
      adjacency: [
        { face_id: "floor", adjacent_edge_ids: ["e1", "e2", "e3", "e4"] },
        { face_id: "wall_left", adjacent_edge_ids: ["e1"] },
        { face_id: "wall_right", adjacent_edge_ids: ["e2"] },
        { face_id: "wall_front", adjacent_edge_ids: ["e3"] },
        { face_id: "wall_back", adjacent_edge_ids: ["e4"] },
        { face_id: "ceiling", adjacent_edge_ids: [] },
      ],
    });

    const pockets = detectPockets(graph);

    expect(pockets).toHaveLength(1);
    expect(pockets[0]).toMatchObject({
      kind: "closed",
      depth: 15,
      footprintAreaMm2: 200,
      wallCount: 4,
      accessDirections: [[0, 0, 1]],
    });
  });

  it("ignores convex corners or chamfers (negative case)", () => {
    const graph = buildTopologyGraph({
      faces: [
        // A hypothetical floor face
        planeFace("floor", [10, 5, 10], [0, 0, 1], [
          { edge_ids: ["e1", "e2", "e3", "e4"], is_outer: true }
        ]),
        // Wall normals point OUT from the cavity (convex), meaning dot(N_side, floor_to_side) < 0
        planeFace("wall_left", [0, 5, 25], [-1, 0, 0]),
        planeFace("wall_right", [20, 5, 25], [1, 0, 0]),
        planeFace("wall_front", [10, 0, 25], [0, -1, 0]),
        planeFace("wall_back", [10, 10, 25], [0, 1, 0]),
      ],
      edges: [edge("e1"), edge("e2"), edge("e3"), edge("e4")],
      adjacency: [
        { face_id: "floor", adjacent_edge_ids: ["e1", "e2", "e3", "e4"] },
        { face_id: "wall_left", adjacent_edge_ids: ["e1"] },
        { face_id: "wall_right", adjacent_edge_ids: ["e2"] },
        { face_id: "wall_front", adjacent_edge_ids: ["e3"] },
        { face_id: "wall_back", adjacent_edge_ids: ["e4"] },
      ],
    });

    const pockets = detectPockets(graph);
    expect(pockets).toEqual([]);
  });

  it("handles 50 pockets under 200ms", () => {
    const faces: TopologyPayload["faces"] = [];
    const adjacency: TopologyPayload["adjacency"] = [];
    const edges: TopologyPayload["edges"] = [];

    for (let i = 0; i < 50; i++) {
      const offset = i * 50;
      const floorId = `floor_${i}`;
      const wl = `wl_${i}`;
      const wr = `wr_${i}`;
      const wf = `wf_${i}`;
      const wb = `wb_${i}`;

      const e1 = `e1_${i}`;
      const e2 = `e2_${i}`;
      const e3 = `e3_${i}`;
      const e4 = `e4_${i}`;

      faces.push(
        planeFace(floorId, [offset + 10, 5, 10], [0, 0, -1], [
          { edge_ids: [e1, e2, e3, e4], is_outer: true }
        ]),
        planeFace(wl, [offset + 0, 5, 25], [1, 0, 0]),
        planeFace(wr, [offset + 20, 5, 25], [-1, 0, 0]),
        planeFace(wf, [offset + 10, 0, 25], [0, 1, 0]),
        planeFace(wb, [offset + 10, 10, 25], [0, -1, 0])
      );

      edges.push(edge(e1), edge(e2), edge(e3), edge(e4));

      adjacency.push(
        { face_id: floorId, adjacent_edge_ids: [e1, e2, e3, e4] },
        { face_id: wl, adjacent_edge_ids: [e1] },
        { face_id: wr, adjacent_edge_ids: [e2] },
        { face_id: wf, adjacent_edge_ids: [e3] },
        { face_id: wb, adjacent_edge_ids: [e4] }
      );
    }

    const graph = buildTopologyGraph({ faces, edges, adjacency });

    const start = performance.now();
    const pockets = detectPockets(graph);
    const elapsed = performance.now() - start;

    expect(pockets).toHaveLength(50);
    expect(elapsed).toBeLessThan(200);
  });
});

function planeFace(
  id: string,
  origin: [number, number, number],
  normal: [number, number, number],
  wires: { edge_ids: string[]; is_outer: boolean }[] = []
): TopologyPayload["faces"][number] {
  return {
    id,
    index: 1,
    surface: { kind: "plane", origin, normal },
    wires,
  };
}

function edge(id: string): TopologyPayload["edges"][number] {
  return { id, index: 1 };
}
