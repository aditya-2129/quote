import { describe, it, expect } from "vitest";
import { buildTopologyGraph } from "../topology";
import type { TopologyPayload } from "@/types/topology";
import { detectCadFeatures, summarizeCadFeatures } from "./index";

type Vec3 = [number, number, number];
type Face = TopologyPayload["faces"][number];

function cylinderFace(
  id: string,
  radius: number,
  length: number,
  axisOrigin: Vec3 = [0, 0, 0],
  axisDirection: Vec3 = [0, 0, 1],
  angularSpan = Math.PI * 2,
): Face {
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

function planeFace(id: string, origin: Vec3, normal: Vec3): Face {
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

/**
 * A solid rectangular plate spanning [0,0,0]..[lx,ly,lz] with four
 * through holes — the geometry of button_9 Part 12.
 */
function plateWithHoles(lx: number, ly: number, lz: number): TopologyPayload {
  const holeCenters: Vec3[] = [
    [lx * 0.2, ly * 0.2, 0],
    [lx * 0.8, ly * 0.2, 0],
    [lx * 0.2, ly * 0.8, 0],
    [lx * 0.8, ly * 0.8, 0],
  ];
  return {
    faces: [
      planeFace("bottom", [lx / 2, ly / 2, 0], [0, 0, -1]),
      planeFace("top", [lx / 2, ly / 2, lz], [0, 0, 1]),
      planeFace("xm", [0, ly / 2, lz / 2], [-1, 0, 0]),
      planeFace("xp", [lx, ly / 2, lz / 2], [1, 0, 0]),
      planeFace("ym", [lx / 2, 0, lz / 2], [0, -1, 0]),
      planeFace("yp", [lx / 2, ly, lz / 2], [0, 1, 0]),
      ...holeCenters.map((c, i) =>
        cylinderFace(`hole${i}`, 3, lz, c, [0, 0, 1]),
      ),
    ],
    edges: [
      "e_top_xm", "e_top_xp", "e_top_ym", "e_top_yp",
      "e_bot_xm", "e_bot_xp", "e_bot_ym", "e_bot_yp",
      "e_xm_ym", "e_xm_yp", "e_xp_ym", "e_xp_yp",
    ].map(edge),
    adjacency: [
      { face_id: "top", adjacent_edge_ids: ["e_top_xm", "e_top_xp", "e_top_ym", "e_top_yp"] },
      { face_id: "bottom", adjacent_edge_ids: ["e_bot_xm", "e_bot_xp", "e_bot_ym", "e_bot_yp"] },
      { face_id: "xm", adjacent_edge_ids: ["e_top_xm", "e_bot_xm", "e_xm_ym", "e_xm_yp"] },
      { face_id: "xp", adjacent_edge_ids: ["e_top_xp", "e_bot_xp", "e_xp_ym", "e_xp_yp"] },
      { face_id: "ym", adjacent_edge_ids: ["e_top_ym", "e_bot_ym", "e_xm_ym", "e_xp_ym"] },
      { face_id: "yp", adjacent_edge_ids: ["e_top_yp", "e_bot_yp", "e_xm_yp", "e_xp_yp"] },
    ],
  };
}

describe("detectCadFeatures", () => {
  it("returns empty for undefined topology", () => {
    expect(detectCadFeatures(undefined)).toEqual([]);
  });

  it("returns empty for empty topology", () => {
    const graph = buildTopologyGraph({ faces: [], edges: [], adjacency: [] });
    expect(detectCadFeatures(graph)).toEqual([]);
  });

  it("aggregates mixed holes, threads, and fillets", () => {
    const graph = buildTopologyGraph({
      faces: [
        // Plain through hole, Ø 7.2 — no standard thread match.
        cylinderFace("hole1", 3.6, 20, [0, 0, 0]),
        // Tapped hole, Ø 5.0 — drill diameter for M6, detected as hole + thread.
        cylinderFace("tap1", 2.5, 12, [50, 0, 0]),
        // Partial-span cylinder with a neighbour — a fillet, not a hole.
        cylinderFace("fillet1", 2, 10, [0, 0, 0], [0, 0, 1], Math.PI / 2),
        planeFace("p_fillet", [2, 0, 5], [1, 0, 0]),
      ],
      edges: [edge("e_f")],
      adjacency: [
        { face_id: "fillet1", adjacent_edge_ids: ["e_f"] },
        { face_id: "p_fillet", adjacent_edge_ids: ["e_f"] },
      ],
    });

    const features = detectCadFeatures(graph);
    const summary = summarizeCadFeatures(features);

    expect(summary.byType.hole).toBe(2);
    expect(summary.byType.thread).toBe(1);
    expect(summary.byType.fillet).toBe(1);
    expect(summary.total).toBe(4);

    const thread = features.find((f) => f.type === "thread");
    expect(thread?.label).toBe("Internal thread");
    expect(thread?.primary).toBe("M6 × 1");
  });

  it("preserves cross-detector overlap (a tapped hole is hole + thread)", () => {
    const graph = buildTopologyGraph({
      faces: [cylinderFace("tap1", 2.5, 12)],
      edges: [],
      adjacency: [],
    });

    const features = detectCadFeatures(graph);
    const onTap1 = features.filter((f) => f.faceIds.includes("tap1"));

    expect(onTap1.map((f) => f.type).sort()).toEqual(["hole", "thread"]);
  });

  it("collapses exact duplicates of the same type and face set", () => {
    // Two identical full-span coaxial cylinder segments merge into one hole
    // inside detectHoles, so the aggregate must not double-count them.
    const graph = buildTopologyGraph({
      faces: [
        cylinderFace("seg1", 4, 5, [0, 0, 0]),
        cylinderFace("seg2", 4, 5, [0, 0, 5]),
      ],
      edges: [],
      adjacency: [],
    });

    const features = detectCadFeatures(graph);
    expect(features.filter((f) => f.type === "hole")).toHaveLength(1);
  });

  it("does not report a slot for a flat plate with holes (button_9 Part 12)", () => {
    // Regression: local_test_button_9_cavity.stp Part 12 is a flat
    // 200 x 200 x 12 plate with four holes. Its own box faces were
    // misread as a 200 x 12 x 200 rectangular slot.
    const graph = buildTopologyGraph(plateWithHoles(200, 200, 12));
    const envelope = { min: [0, 0, 0] as const, max: [200, 200, 12] as const };

    const summary = summarizeCadFeatures(
      detectCadFeatures(graph, { bodyEnvelope: envelope }),
    );

    expect(summary.byType.hole).toBe(4);
    expect(summary.byType.slot).toBe(0);
  });

  it("normalizes a through hole into label + primary + secondary", () => {
    const graph = buildTopologyGraph({
      faces: [cylinderFace("hole1", 3.6, 20)],
      edges: [],
      adjacency: [],
    });

    const hole = detectCadFeatures(graph).find((f) => f.type === "hole");
    expect(hole).toMatchObject({
      type: "hole",
      label: "Through hole",
      primary: "Ø 7.20 mm",
      secondary: "Depth 20.00 mm",
    });
  });
});

describe("summarizeCadFeatures", () => {
  it("returns no groups for an empty feature list", () => {
    const summary = summarizeCadFeatures([]);
    expect(summary).toEqual({
      total: 0,
      groups: [],
      byType: {
        hole: 0,
        thread: 0,
        pocket: 0,
        slot: 0,
        fillet: 0,
        chamfer: 0,
        boss: 0,
      },
    });
  });

  it("pluralizes group labels by count", () => {
    const graph = buildTopologyGraph({
      faces: [
        cylinderFace("hole1", 3.6, 20, [0, 0, 0]),
        cylinderFace("hole2", 3.6, 20, [50, 0, 0]),
      ],
      edges: [],
      adjacency: [],
    });

    const summary = summarizeCadFeatures(detectCadFeatures(graph));
    const holeGroup = summary.groups.find((g) => g.type === "hole");
    expect(holeGroup?.label).toBe("2 Holes");
  });
});
