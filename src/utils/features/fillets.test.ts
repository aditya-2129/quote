import { describe, it, expect } from "vitest";
import { buildTopologyGraph } from "../topology";
import type { TopologyPayload } from "@/types/topology";
import { detectFillets } from "./fillets";

describe("detectFillets", () => {
  it("returns empty when topology is absent", () => {
    expect(detectFillets(undefined)).toEqual([]);
  });

  it("returns empty when no fillets are present (only full cylinders/holes)", () => {
    const graph = buildTopologyGraph({
      faces: [cylinderFace("cyl_hole", 5, 20, Math.PI * 2)],
      edges: [],
      adjacency: [],
    });
    expect(detectFillets(graph)).toEqual([]);
  });

  it("detects a constant-radius concave fillet", () => {
    const graph = buildTopologyGraph({
      faces: [
        cylinderFace("cyl_fillet", 5, 10, Math.PI / 2, [5, 5, 0], [0, 0, 1]),
        planeFace("plane1", [0, 0, 0], [1, 0, 0]),
        planeFace("plane2", [0, 0, 0], [0, 1, 0]),
      ],
      edges: [edge("e1"), edge("e2")],
      adjacency: [
        { face_id: "cyl_fillet", adjacent_edge_ids: ["e1", "e2"] },
        { face_id: "plane1", adjacent_edge_ids: ["e1"] },
        { face_id: "plane2", adjacent_edge_ids: ["e2"] },
      ],
    });

    const fillets = detectFillets(graph);
    expect(fillets).toHaveLength(1);
    expect(fillets[0]).toMatchObject({
      radius: 5,
      lengthMm: 10,
      concavity: "concave",
      faceIds: ["cyl_fillet"],
    });
    expect(fillets[0].adjacentFaceIds).toContain("plane1");
    expect(fillets[0].adjacentFaceIds).toContain("plane2");
  });

  it("detects a constant-radius convex fillet (round)", () => {
    const graph = buildTopologyGraph({
      faces: [
        cylinderFace("cyl_round", 5, 10, Math.PI / 2, [5, 5, 0], [0, 0, 1]),
        planeFace("plane1", [0, 0, 0], [-1, 0, 0]),
        planeFace("plane2", [0, 0, 0], [0, -1, 0]),
      ],
      edges: [edge("e1"), edge("e2")],
      adjacency: [
        { face_id: "cyl_round", adjacent_edge_ids: ["e1", "e2"] },
        { face_id: "plane1", adjacent_edge_ids: ["e1"] },
        { face_id: "plane2", adjacent_edge_ids: ["e2"] },
      ],
    });

    const fillets = detectFillets(graph);
    expect(fillets).toHaveLength(1);
    expect(fillets[0]).toMatchObject({
      radius: 5,
      lengthMm: 10,
      concavity: "convex",
      faceIds: ["cyl_round"],
    });
    expect(fillets[0].adjacentFaceIds).toContain("plane1");
    expect(fillets[0].adjacentFaceIds).toContain("plane2");
  });

  it("detects a constant-radius toroidal fillet", () => {
    const graph = buildTopologyGraph({
      faces: [
        torusFace("torus_fillet", 20, 3, Math.PI / 2, [0, 0, 3], [0, 0, 1]),
        planeFace("plane1", [0, 0, 0], [0, 0, 1]),
      ],
      edges: [edge("e1")],
      adjacency: [
        { face_id: "torus_fillet", adjacent_edge_ids: ["e1"] },
        { face_id: "plane1", adjacent_edge_ids: ["e1"] },
      ],
    });

    const fillets = detectFillets(graph);
    expect(fillets).toHaveLength(1);
    expect(fillets[0]).toMatchObject({
      radius: 3,
      concavity: "concave",
      faceIds: ["torus_fillet"],
    });
    expect(fillets[0].lengthMm).toBeCloseTo(20 * (Math.PI / 2));
  });

  it("detects a variable-radius conical fillet", () => {
    const graph = buildTopologyGraph({
      faces: [
        coneFace("cone_fillet", [5, 5, 0], [0, 0, 1], 3, 6, 10, Math.PI / 2),
        planeFace("plane1", [0, 0, 0], [1, 0, 0]),
      ],
      edges: [edge("e1")],
      adjacency: [
        { face_id: "cone_fillet", adjacent_edge_ids: ["e1"] },
        { face_id: "plane1", adjacent_edge_ids: ["e1"] },
      ],
    });

    const fillets = detectFillets(graph);
    expect(fillets).toHaveLength(1);
    expect(fillets[0]).toMatchObject({
      radius: "variable",
      lengthMm: 10,
      concavity: "concave",
      faceIds: ["cone_fillet"],
    });
  });

  it("handles 50 fillets under 100ms", () => {
    const faces: TopologyPayload["faces"] = [];
    const edges: TopologyPayload["edges"] = [];
    const adjacency: TopologyPayload["adjacency"] = [];

    for (let i = 0; i < 50; i++) {
      const cId = `cyl_${i}`;
      const p1Id = `p1_${i}`;
      const p2Id = `p2_${i}`;
      const e1Id = `e1_${i}`;
      const e2Id = `e2_${i}`;

      faces.push(cylinderFace(cId, 5, 10, Math.PI / 2, [i * 20 + 5, 5, 0], [0, 0, 1]));
      faces.push(planeFace(p1Id, [i * 20, 0, 0], [1, 0, 0]));
      faces.push(planeFace(p2Id, [i * 20, 0, 0], [0, 1, 0]));
      edges.push(edge(e1Id), edge(e2Id));
      adjacency.push(
        { face_id: cId, adjacent_edge_ids: [e1Id, e2Id] },
        { face_id: p1Id, adjacent_edge_ids: [e1Id] },
        { face_id: p2Id, adjacent_edge_ids: [e2Id] }
      );
    }

    const graph = buildTopologyGraph({ faces, edges, adjacency });

    const start = performance.now();
    const fillets = detectFillets(graph);
    const elapsed = performance.now() - start;

    expect(fillets).toHaveLength(50);
    expect(elapsed).toBeLessThan(100);
  });
});

function cylinderFace(
  id: string,
  radius: number,
  length: number,
  angularSpan: number,
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
      angular_span: angularSpan,
    },
    wires: [],
  };
}

function torusFace(
  id: string,
  majorRadius: number,
  minorRadius: number,
  angularSpan: number,
  axisOrigin: [number, number, number] = [0, 0, 0],
  axisDirection: [number, number, number] = [0, 0, 1],
): TopologyPayload["faces"][number] {
  return {
    id,
    index: 1,
    surface: {
      kind: "torus",
      axis_origin: axisOrigin,
      axis_direction: axisDirection,
      major_radius: majorRadius,
      minor_radius: minorRadius,
      angular_span: angularSpan,
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
  angularSpan: number,
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
      angular_span: angularSpan,
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
