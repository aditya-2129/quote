import { describe, it, expect } from "vitest";
import { buildTopologyGraph } from "../topology";
import type { TopologyPayload } from "@/types/topology";
import { detectChamfers } from "./chamfers";

describe("detectChamfers", () => {
  it("returns empty when topology is absent", () => {
    expect(detectChamfers(undefined)).toEqual([]);
  });

  it("returns empty when no chamfers are present (only regular planes)", () => {
    const graph = buildTopologyGraph({
      faces: [
        planeFace("plane1", [0, 0, 10], [0, 0, 1]),
        planeFace("plane2", [10, 0, 0], [1, 0, 0]),
      ],
      edges: [edge("e1")],
      adjacency: [
        { face_id: "plane1", adjacent_edge_ids: ["e1"] },
        { face_id: "plane2", adjacent_edge_ids: ["e1"] },
      ],
    });
    expect(detectChamfers(graph)).toEqual([]);
  });

  it("detects a constant width 45° chamfer", () => {
    // 45° chamfer C:
    // normal_c = [0.7071, 0, 0.7071]
    // origin_c = [9.5, 5, 9.5]
    // Adjacent face A: normal = [0, 0, 1], origin = [0, 10, 10]
    // Adjacent face B: normal = [1, 0, 0], origin = [10, 0, 0]
    const graph = buildTopologyGraph({
      faces: [
        planeFace("chamfer_c", [9.5, 5, 9.5], [1 / Math.sqrt(2), 0, 1 / Math.sqrt(2)]),
        planeFace("plane_a", [0, 10, 10], [0, 0, 1]),
        planeFace("plane_b", [10, 0, 0], [1, 0, 0]),
      ],
      edges: [edge("e1"), edge("e2")],
      adjacency: [
        { face_id: "chamfer_c", adjacent_edge_ids: ["e1", "e2"] },
        { face_id: "plane_a", adjacent_edge_ids: ["e1"] },
        { face_id: "plane_b", adjacent_edge_ids: ["e2"] },
      ],
    });

    const chamfers = detectChamfers(graph);
    expect(chamfers).toHaveLength(1);
    expect(chamfers[0]).toMatchObject({
      angleDeg: 45.0,
      lengthMm: 10.0,
      faceId: "chamfer_c",
    });
    expect(chamfers[0].widthMm).toBeCloseTo(Math.sqrt(2), 2);
    expect(chamfers[0].adjacentFaceIds).toContain("plane_a");
    expect(chamfers[0].adjacentFaceIds).toContain("plane_b");
  });

  it("detects a non-45° chamfer", () => {
    // 30°/60° chamfer C:
    // normal_c = [0.5, 0, 0.8660254]
    // origin_c = [9, 5, 10]
    // Adjacent face A: normal = [0, 0, 1], origin = [0, 10, 10]
    // Adjacent face B: normal = [1, 0, 0], origin = [10, 0, 0]
    const graph = buildTopologyGraph({
      faces: [
        planeFace("chamfer_c", [9, 5, 10], [0.5, 0, Math.sqrt(3) / 2]),
        planeFace("plane_a", [0, 10, 10], [0, 0, 1]),
        planeFace("plane_b", [10, 0, 0], [1, 0, 0]),
      ],
      edges: [edge("e1"), edge("e2")],
      adjacency: [
        { face_id: "chamfer_c", adjacent_edge_ids: ["e1", "e2"] },
        { face_id: "plane_a", adjacent_edge_ids: ["e1"] },
        { face_id: "plane_b", adjacent_edge_ids: ["e2"] },
      ],
    });

    const chamfers = detectChamfers(graph);
    expect(chamfers).toHaveLength(1);
    expect(chamfers[0]).toMatchObject({
      angleDeg: 30.0,
      lengthMm: 10.0,
      faceId: "chamfer_c",
    });
    expect(chamfers[0].widthMm).toBeCloseTo(2 / Math.sqrt(3), 2);
  });

  it("handles 50 chamfers under 100ms", () => {
    const faces: TopologyPayload["faces"] = [];
    const edges: TopologyPayload["edges"] = [];
    const adjacency: TopologyPayload["adjacency"] = [];

    for (let i = 0; i < 50; i++) {
      const cId = `chamfer_${i}`;
      const p1Id = `p1_${i}`;
      const p2Id = `p2_${i}`;
      const e1Id = `e1_${i}`;
      const e2Id = `e2_${i}`;

      // 45° chamfers shifted along the Y axis to avoid overlap if needed, though they are in their own graphs/IDs anyway
      faces.push(planeFace(cId, [9.5, 5, 9.5], [1 / Math.sqrt(2), 0, 1 / Math.sqrt(2)]));
      faces.push(planeFace(p1Id, [0, 10, 10], [0, 0, 1]));
      faces.push(planeFace(p2Id, [10, 0, 0], [1, 0, 0]));
      edges.push(edge(e1Id), edge(e2Id));
      adjacency.push(
        { face_id: cId, adjacent_edge_ids: [e1Id, e2Id] },
        { face_id: p1Id, adjacent_edge_ids: [e1Id] },
        { face_id: p2Id, adjacent_edge_ids: [e2Id] }
      );
    }

    const graph = buildTopologyGraph({ faces, edges, adjacency });

    const start = performance.now();
    const chamfers = detectChamfers(graph);
    const elapsed = performance.now() - start;

    expect(chamfers).toHaveLength(50);
    expect(elapsed).toBeLessThan(100);
  });
});

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
