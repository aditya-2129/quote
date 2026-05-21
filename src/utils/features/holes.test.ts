import { describe, it, expect } from "vitest";
import { buildTopologyGraph } from "../topology";
import type { TopologyPayload } from "@/types/topology";
import { detectHoles } from "./holes";

describe("detectHoles", () => {
  it("returns empty when topology is absent", () => {
    expect(detectHoles(undefined)).toEqual([]);
  });

  it("returns empty when no cylinders are present", () => {
    const graph = buildTopologyGraph({
      faces: [planeFace("f1", [0, 0, 0], [0, 0, 1])],
      edges: [],
      adjacency: [],
    });
    expect(detectHoles(graph)).toEqual([]);
  });

  it("detects a through hole (cylinder, no axial caps)", () => {
    const graph = buildTopologyGraph({
      faces: [cylinderFace("cyl", 4, 20)],
      edges: [edge("e1")],
      adjacency: [{ face_id: "cyl", adjacent_edge_ids: ["e1"] }],
    });

    const holes = detectHoles(graph);

    expect(holes).toHaveLength(1);
    expect(holes[0]).toMatchObject({
      kind: "through",
      diameter: 8,
      depth: 20,
      axisDirection: [0, 0, 1],
    });
  });

  it("detects a blind hole (cylinder with one axial cap)", () => {
    const graph = buildTopologyGraph({
      faces: [
        cylinderFace("cyl", 5, 15),
        planeFace("cap", [0, 0, 15], [0, 0, 1]),
        planeFace("side", [10, 0, 0], [1, 0, 0]),
      ],
      edges: [edge("e_cap"), edge("e_side")],
      adjacency: [
        { face_id: "cyl", adjacent_edge_ids: ["e_cap"] },
        { face_id: "cap", adjacent_edge_ids: ["e_cap"] },
        { face_id: "side", adjacent_edge_ids: ["e_side"] },
      ],
    });

    const holes = detectHoles(graph);

    expect(holes).toHaveLength(1);
    expect(holes[0]).toMatchObject({
      kind: "blind",
      diameter: 10,
      depth: 15,
    });
    expect(holes[0].faceIds).toContain("cap");
  });

  it("detects a counterbore (two coaxial cylinders + shoulder plane)", () => {
    const graph = buildTopologyGraph({
      faces: [
        cylinderFace("c_big", 8, 5, [0, 0, 0]),
        cylinderFace("c_small", 4, 20, [0, 0, 5]),
        planeFace("shoulder", [0, 0, 5], [0, 0, 1]),
      ],
      edges: [edge("e_big_shoulder"), edge("e_small_shoulder")],
      adjacency: [
        { face_id: "c_big", adjacent_edge_ids: ["e_big_shoulder"] },
        { face_id: "c_small", adjacent_edge_ids: ["e_small_shoulder"] },
        {
          face_id: "shoulder",
          adjacent_edge_ids: ["e_big_shoulder", "e_small_shoulder"],
        },
      ],
    });

    const holes = detectHoles(graph);

    expect(holes).toHaveLength(1);
    expect(holes[0]).toMatchObject({
      kind: "counterbore",
      diameter: 16,
      shoulderDiameter: 8,
      depth: 25,
    });
  });

  it("detects a countersink (cylinder + coaxial cone)", () => {
    const graph = buildTopologyGraph({
      faces: [
        cylinderFace("cyl", 3, 15),
        coneFace("cone", [0, 0, 15], [0, 0, 1], 3, 6, 3),
      ],
      edges: [],
      adjacency: [],
    });

    const holes = detectHoles(graph);

    expect(holes).toHaveLength(1);
    expect(holes[0]).toMatchObject({
      kind: "countersink",
      diameter: 12,
      shoulderDiameter: 6,
    });
  });

  it("merges three colinear cylinder segments into one hole", () => {
    const graph = buildTopologyGraph({
      faces: [
        cylinderFace("seg1", 4, 5, [0, 0, 0]),
        cylinderFace("seg2", 4, 5, [0, 0, 5]),
        cylinderFace("seg3", 4, 5, [0, 0, 10]),
      ],
      edges: [],
      adjacency: [],
    });

    const holes = detectHoles(graph);

    expect(holes).toHaveLength(1);
    expect(holes[0].kind).toBe("through");
    expect(holes[0].faceIds).toHaveLength(3);
  });

  it("treats non-coaxial cylinders as separate holes", () => {
    const graph = buildTopologyGraph({
      faces: [
        cylinderFace("a", 3, 10, [0, 0, 0], [0, 0, 1]),
        cylinderFace("b", 3, 10, [50, 0, 0], [0, 0, 1]),
      ],
      edges: [],
      adjacency: [],
    });

    const holes = detectHoles(graph);

    expect(holes).toHaveLength(2);
  });

  it("ignores partial cylinders (likely fillets, not holes)", () => {
    const graph = buildTopologyGraph({
      faces: [
        {
          id: "fillet",
          index: 1,
          surface: {
            kind: "cylinder",
            axis_origin: [0, 0, 0],
            axis_direction: [0, 0, 1],
            radius: 2,
            length: 10,
            angular_span: Math.PI / 2,
          },
          wires: [],
        },
      ],
      edges: [],
      adjacency: [],
    });

    expect(detectHoles(graph)).toEqual([]);
  });

  it("handles 50 holes under 100ms", () => {
    const faces: TopologyPayload["faces"] = [];
    for (let i = 0; i < 50; i++) {
      faces.push(cylinderFace(`h${i}`, 3, 10, [i * 20, 0, 0], [0, 0, 1]));
    }
    const graph = buildTopologyGraph({ faces, edges: [], adjacency: [] });

    const start = performance.now();
    const holes = detectHoles(graph);
    const elapsed = performance.now() - start;

    expect(holes).toHaveLength(50);
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

function coneFace(
  id: string,
  axisOrigin: [number, number, number],
  axisDirection: [number, number, number],
  minRadius: number,
  maxRadius: number,
  length: number,
): TopologyPayload["faces"][number] {
  return {
    id,
    index: 1,
    surface: {
      kind: "cone",
      axis_origin: axisOrigin,
      axis_direction: axisDirection,
      half_angle: Math.atan2(maxRadius - minRadius, length),
      min_radius: minRadius,
      max_radius: maxRadius,
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
