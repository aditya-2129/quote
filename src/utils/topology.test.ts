import { describe, expect, it } from "vitest";

import {
  buildTopologyGraph,
  classifyFace,
  findFacesByClass,
  neighborsOf,
  parseTopologyEnvelope,
  serializeTopologyEnvelope,
  serializeTopologyPayload,
  TOPOLOGY_SCHEMA_VERSION,
  wireLoopsOf,
  wrapTopologyPayload,
} from "./topology";
import type { SurfaceKind, TopologyPayload } from "@/types/topology";

const sampleTopology: TopologyPayload = {
  faces: [
    {
      id: "f_1",
      index: 1,
      surface: {
        kind: "cylinder",
        axis_origin: [0, 0, 0],
        axis_direction: [0, 0, 1],
        radius: 15,
        length: 140,
        angular_span: Math.PI * 2,
      },
      wires: [
        {
          edge_ids: ["e_1"],
          is_outer: true,
        },
      ],
    },
    {
      id: "f_2",
      index: 2,
      surface: {
        kind: "plane",
        origin: [0, 0, 140],
        normal: [0, 0, 1],
      },
      wires: [
        {
          edge_ids: ["e_1", "e_2"],
          is_outer: true,
        },
      ],
    },
    {
      id: "f_3",
      index: 3,
      surface: {
        kind: "b_spline",
      },
      wires: [],
    },
  ],
  edges: [
    {
      id: "e_1",
      index: 1,
    },
    {
      id: "e_2",
      index: 2,
    },
  ],
  adjacency: [
    {
      face_id: "f_1",
      adjacent_edge_ids: ["e_1"],
    },
    {
      face_id: "f_2",
      adjacent_edge_ids: ["e_1", "e_2"],
    },
    {
      face_id: "f_3",
      adjacent_edge_ids: [],
    },
  ],
};

describe("topology wire format", () => {
  it("serializes and parses the versioned envelope", () => {
    const json = serializeTopologyPayload(sampleTopology);
    const parsed = parseTopologyEnvelope(json);

    expect(parsed.version).toBe(TOPOLOGY_SCHEMA_VERSION);
    expect(parsed.topology).toEqual(sampleTopology);
  });

  it("preserves unknown future fields through JS parse and serialize", () => {
    const envelope = wrapTopologyPayload(sampleTopology);
    const withFutureFields = {
      ...envelope,
      future_root: { ignored: true },
      topology: {
        ...envelope.topology,
        future_topology_field: "ignored",
      },
    };

    const parsed = parseTopologyEnvelope(JSON.stringify(withFutureFields));
    const serialized = serializeTopologyEnvelope(parsed);
    const reparsed = JSON.parse(serialized);

    expect(reparsed.future_root).toEqual({ ignored: true });
    expect(reparsed.topology.future_topology_field).toBe("ignored");
    expect(reparsed.topology.faces).toEqual(sampleTopology.faces);
  });

  it("rejects unsupported schema versions", () => {
    expect(() =>
      parseTopologyEnvelope(
        JSON.stringify({
          version: 999,
          topology: sampleTopology,
        }),
      ),
    ).toThrow("Unsupported topology schema version");
  });
});

describe("TopologyGraph", () => {
  it("builds face and edge lookup maps", () => {
    const graph = buildTopologyGraph(sampleTopology);

    expect(graph?.faces.get("f_1")?.index).toBe(1);
    expect(graph?.edges.get("e_2")?.index).toBe(2);
    expect(graph?.adjacency.get("f_2")).toEqual(["e_1", "e_2"]);
  });

  it("returns undefined or empty arrays when topology is absent", () => {
    expect(buildTopologyGraph(undefined)).toBeUndefined();
    expect(findFacesByClass(undefined, "cylinder")).toEqual([]);
    expect(neighborsOf(undefined, "f_1")).toEqual([]);
    expect(wireLoopsOf(undefined, "f_1")).toEqual([]);
  });

  it("finds faces by discriminated class", () => {
    const graph = buildTopologyGraph(sampleTopology);

    const cylinders = findFacesByClass(graph, "cylinder");
    const planes = findFacesByClass(graph, "plane");
    const splines = findFacesByClass(graph, "spline");

    expect(cylinders).toHaveLength(1);
    expect(cylinders[0]?.radius).toBe(15);
    expect(planes[0]?.normal).toEqual([0, 0, 1]);
    expect(splines[0]?.sourceKind).toBe("b_spline");
  });

  it("returns neighboring faces through shared edges", () => {
    const graph = buildTopologyGraph(sampleTopology);

    expect(neighborsOf(graph, "f_1").map((face) => face.id)).toEqual(["f_2"]);
    expect(neighborsOf(graph, "f_3")).toEqual([]);
  });

  it("returns wire loops for a face", () => {
    const graph = buildTopologyGraph(sampleTopology);

    expect(wireLoopsOf(graph, "f_2")).toEqual([
      {
        edge_ids: ["e_1", "e_2"],
        is_outer: true,
      },
    ]);
    expect(wireLoopsOf(graph, "missing")).toEqual([]);
  });

  it("keeps face class handling exhaustive", () => {
    const coveredKinds: SurfaceKind[] = [
      "plane",
      "cylinder",
      "cone",
      "sphere",
      "torus",
      "b_spline",
      "unknown",
    ];

    for (const kind of coveredKinds) {
      expect(() => classifyFace(faceForKind(kind))).not.toThrow();
    }
  });
});

function faceForKind(kind: SurfaceKind) {
  return {
    id: `f_${kind}`,
    index: 99,
    surface: surfaceForKind(kind),
    wires: [],
  };
}

function surfaceForKind(kind: SurfaceKind) {
  switch (kind) {
    case "plane":
      return { kind, origin: [0, 0, 0], normal: [0, 0, 1] } as const;
    case "cylinder":
      return {
        kind,
        axis_origin: [0, 0, 0],
        axis_direction: [0, 0, 1],
        radius: 1,
      } as const;
    case "cone":
      return {
        kind,
        axis_origin: [0, 0, 0],
        axis_direction: [0, 0, 1],
        half_angle: 0.25,
      } as const;
    case "sphere":
      return { kind, center: [0, 0, 0], radius: 1 } as const;
    case "torus":
      return {
        kind,
        axis_origin: [0, 0, 0],
        axis_direction: [0, 0, 1],
        major_radius: 2,
        minor_radius: 0.25,
      } as const;
    case "b_spline":
    case "unknown":
      return { kind } as const;
    default:
      return exhaustive(kind);
  }
}

function exhaustive(value: never): never {
  throw new Error(`Unhandled test surface kind: ${String(value)}`);
}
