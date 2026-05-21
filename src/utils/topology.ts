import type { TopologyPayload } from "@/types/topology";

export type { TopologyPayload } from "@/types/topology";

export const TOPOLOGY_SCHEMA_VERSION = 1;

export interface TopologyEnvelope {
  version: typeof TOPOLOGY_SCHEMA_VERSION;
  topology: TopologyPayload;
}

export function wrapTopologyPayload(topology: TopologyPayload): TopologyEnvelope {
  return {
    version: TOPOLOGY_SCHEMA_VERSION,
    topology,
  };
}

export function parseTopologyEnvelope(json: string): TopologyEnvelope {
  const parsed: unknown = JSON.parse(json);

  if (!isRecord(parsed)) {
    throw new Error("Topology envelope must be an object");
  }
  if (parsed.version !== TOPOLOGY_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported topology schema version ${String(parsed.version)}; expected ${TOPOLOGY_SCHEMA_VERSION}`,
    );
  }
  if (!isRecord(parsed.topology)) {
    throw new Error("Topology envelope is missing topology payload");
  }

  return parsed as unknown as TopologyEnvelope;
}

export function serializeTopologyEnvelope(envelope: TopologyEnvelope): string {
  return JSON.stringify(envelope);
}

export function serializeTopologyPayload(topology: TopologyPayload): string {
  return serializeTopologyEnvelope(wrapTopologyPayload(topology));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
