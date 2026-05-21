import { describe, expect, it } from "vitest";

import {
  parseTopologyEnvelope,
  serializeTopologyEnvelope,
  serializeTopologyPayload,
  TOPOLOGY_SCHEMA_VERSION,
  wrapTopologyPayload,
} from "./topology";
import type { TopologyPayload } from "@/types/topology";

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
  ],
  edges: [
    {
      id: "e_1",
      index: 1,
    },
  ],
  adjacency: [
    {
      face_id: "f_1",
      adjacent_edge_ids: ["e_1"],
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
