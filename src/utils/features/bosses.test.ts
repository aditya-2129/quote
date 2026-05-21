import { describe, it, expect } from "vitest";
import { buildTopologyGraph } from "../topology";
import type { TopologyPayload } from "@/types/topology";
import { detectBosses } from "./bosses";

describe("detectBosses", () => {
  it("returns empty when topology is absent", () => {
    expect(detectBosses(undefined)).toEqual([]);
  });

  it("returns empty when no cylinders or top planes are bosses (regular block or blind hole)", () => {
    // A blind hole going INTO the block (negative direction relative to parent face normal)
    const graph = buildTopologyGraph({
      faces: [
        cylinderFace("cyl", 5, 15, [0, 0, -15], [0, 0, 1]),
        planeFace("base", [0, 0, 0], [0, 0, 1], [{ edge_ids: ["e_entry"], is_outer: false }]),
        planeFace("cap", [0, 0, -15], [0, 0, -1], [{ edge_ids: ["e_bottom"], is_outer: true }]),
      ],
      edges: [edge("e_entry"), edge("e_bottom")],
      adjacency: [
        { face_id: "cyl", adjacent_edge_ids: ["e_entry", "e_bottom"] },
        { face_id: "base", adjacent_edge_ids: ["e_entry"] },
        { face_id: "cap", adjacent_edge_ids: ["e_bottom"] },
      ],
    });

    expect(detectBosses(graph)).toEqual([]);
  });

  it("detects a cylindrical round boss", () => {
    const graph = buildTopologyGraph({
      faces: [
        cylinderFace("cyl", 5, 15, [0, 0, 0], [0, 0, 1]),
        planeFace("base", [0, 0, 0], [0, 0, 1], [{ edge_ids: ["e_base"], is_outer: false }]),
        planeFace("top", [0, 0, 15], [0, 0, 1], [{ edge_ids: ["e_top"], is_outer: true }]),
      ],
      edges: [edge("e_base"), edge("e_top")],
      adjacency: [
        { face_id: "cyl", adjacent_edge_ids: ["e_base", "e_top"] },
        { face_id: "base", adjacent_edge_ids: ["e_base"] },
        { face_id: "top", adjacent_edge_ids: ["e_top"] },
      ],
    });

    const bosses = detectBosses(graph);
    expect(bosses).toHaveLength(1);
    expect(bosses[0]).toMatchObject({
      kind: "round",
      diameter: 10,
      height: 15,
      baseFaceId: "base",
    });
    expect(bosses[0].faceIds).toContain("cyl");
    expect(bosses[0].faceIds).toContain("top");
  });

  it("detects a rectangular boss", () => {
    const graph = buildTopologyGraph({
      faces: [
        planeFace("top", [0, 0, 10], [0, 0, 1]),
        planeFace("base", [0, 0, 0], [0, 0, 1]),
        planeFace("w1", [-5, 0, 5], [-1, 0, 0]),
        planeFace("w2", 	[5, 0, 5], [1, 0, 0]),
        planeFace("w3", [0, -8, 5], [0, -1, 0]),
        planeFace("w4", [0, 8, 5], [0, 1, 0]),
      ],
      edges: [
        edge("e_top1"), edge("e_top2"), edge("e_top3"), edge("e_top4"),
        edge("e_base1"), edge("e_base2"), edge("e_base3"), edge("e_base4")
      ],
      adjacency: [
        { face_id: "top", adjacent_edge_ids: ["e_top1", "e_top2", "e_top3", "e_top4"] },
        { face_id: "base", adjacent_edge_ids: ["e_base1", "e_base2", "e_base3", "e_base4"] },
        { face_id: "w1", adjacent_edge_ids: ["e_top1", "e_base1"] },
        { face_id: "w2", adjacent_edge_ids: ["e_top2", "e_base2"] },
        { face_id: "w3", adjacent_edge_ids: ["e_top3", "e_base3"] },
        { face_id: "w4", adjacent_edge_ids: ["e_top4", "e_base4"] },
      ],
    });

    const bosses = detectBosses(graph);
    expect(bosses).toHaveLength(1);
    expect(bosses[0]).toMatchObject({
      kind: "rectangular",
      width: 10,
      length: 16,
      height: 10,
      baseFaceId: "base",
    });
  });

  it("detects a boss with a concentric hole correctly (co-existing, boss detected)", () => {
    const graph = buildTopologyGraph({
      faces: [
        cylinderFace("cyl_outer", 8, 15, [0, 0, 0], [0, 0, 1]),
        cylinderFace("cyl_inner", 4, 15, [0, 0, 0], [0, 0, 1]),
        planeFace("base", [0, 0, 0], [0, 0, 1], [
          { edge_ids: ["e_base_outer"], is_outer: false },
          { edge_ids: ["e_base_inner"], is_outer: false }
        ]),
        planeFace("top", [0, 0, 15], [0, 0, 1], [
          { edge_ids: ["e_top_outer"], is_outer: true },
          { edge_ids: ["e_top_inner"], is_outer: false }
        ]),
      ],
      edges: [
        edge("e_base_outer"), edge("e_base_inner"),
        edge("e_top_outer"), edge("e_top_inner")
      ],
      adjacency: [
        { face_id: "cyl_outer", adjacent_edge_ids: ["e_base_outer", "e_top_outer"] },
        { face_id: "cyl_inner", adjacent_edge_ids: ["e_base_inner", "e_top_inner"] },
        { face_id: "base", adjacent_edge_ids: ["e_base_outer", "e_base_inner"] },
        { face_id: "top", adjacent_edge_ids: ["e_top_outer", "e_top_inner"] },
      ],
    });

    const bosses = detectBosses(graph);
    expect(bosses).toHaveLength(1);
    expect(bosses[0]).toMatchObject({
      kind: "round",
      diameter: 16,
      height: 15,
      baseFaceId: "base",
    });
  });

  it("handles 50 bosses under 100ms", () => {
    const faces: TopologyPayload["faces"] = [];
    const adjacency: TopologyPayload["adjacency"] = [];
    const edges: TopologyPayload["edges"] = [];

    for (let i = 0; i < 50; i++) {
      const x = i * 50;
      faces.push(cylinderFace(`cyl_${i}`, 5, 10, [x, 0, 0], [0, 0, 1]));
      faces.push(planeFace(`base_${i}`, [x, 0, 0], [0, 0, 1], [{ edge_ids: [`eb_${i}`], is_outer: false }]));
      faces.push(planeFace(`top_${i}`, [x, 0, 10], [0, 0, 1], [{ edge_ids: [`et_${i}`], is_outer: true }]));

      edges.push(edge(`eb_${i}`), edge(`et_${i}`));

      adjacency.push(
        { face_id: `cyl_${i}`, adjacent_edge_ids: [`eb_${i}`, `et_${i}`] },
        { face_id: `base_${i}`, adjacent_edge_ids: [`eb_${i}`] },
        { face_id: `top_${i}`, adjacent_edge_ids: [`et_${i}`] },
      );
    }

    const graph = buildTopologyGraph({ faces, edges, adjacency });

    const start = performance.now();
    const bosses = detectBosses(graph);
    const elapsed = performance.now() - start;

    expect(bosses).toHaveLength(50);
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
      angular_span: Math.PI * 2,
    },
    wires: [],
  };
}

function planeFace(
  id: string,
  origin: [number, number, number],
  normal: [number, number, number],
  wires: TopologyPayload["faces"][number]["wires"] = [],
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
