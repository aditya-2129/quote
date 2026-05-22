import { describe, it, expect } from "vitest";
import { resolveBodyFeatureState } from "./featureState";
import type { TopoFace, TopologyPayload } from "@/types/topology";

type Vec3 = [number, number, number];

function cylinderFace(
  id: string,
  radius: number,
  length: number,
  body: number,
  axisOrigin: Vec3 = [0, 0, 0],
): TopoFace {
  return {
    id,
    index: 1,
    body,
    surface: {
      kind: "cylinder",
      axis_origin: axisOrigin,
      axis_direction: [0, 0, 1],
      radius,
      length,
      angular_span: Math.PI * 2,
    },
    wires: [],
  };
}

/** body 0 — plain Ø7.2 through hole; body 1 — tapped Ø5.0 (M6) hole. */
function twoBodyTopology(): TopologyPayload {
  return {
    faces: [
      cylinderFace("hole_b0", 3.6, 20, 0, [10, 10, 0]),
      cylinderFace("tap_b1", 2.5, 12, 1, [110, 15, 0]),
    ],
    edges: [],
    adjacency: [],
    bodies: [
      { index: 0, bbox: { min: [0, 0, 0], max: [50, 50, 20] } },
      { index: 1, bbox: { min: [100, 0, 0], max: [130, 30, 30] } },
    ],
  };
}

const LEGACY_MULTI_BODY_MESSAGE =
  "Topology-to-body mapping is not available for multi-body files";

describe("resolveBodyFeatureState", () => {
  it("reports a desktop-specific reason when no topology was extracted", () => {
    const state = resolveBodyFeatureState({
      topology: undefined,
      meshCount: 3,
      selectedMeshId: "m0",
      bodyMapping: null,
      isTauri: true,
    });
    expect(state).toEqual({
      status: "unavailable",
      reason: "BREP topology extraction returned no data for this file",
    });
  });

  it("reports the browser/no-Tauri reason when running without the desktop runtime", () => {
    const state = resolveBodyFeatureState({
      topology: undefined,
      meshCount: 3,
      selectedMeshId: "m0",
      bodyMapping: null,
      isTauri: false,
    });
    expect(state).toEqual({
      status: "unavailable",
      reason: "Open in desktop runtime to extract BREP topology",
    });
  });

  it("detects features on the whole topology for a single-body file", () => {
    const topology: TopologyPayload = {
      faces: [cylinderFace("hole", 3.6, 20, 0)],
      edges: [],
      adjacency: [],
      bodies: [{ index: 0, bbox: { min: [0, 0, 0], max: [50, 50, 20] } }],
    };

    const state = resolveBodyFeatureState({
      topology,
      meshCount: 1,
      selectedMeshId: "only",
      bodyMapping: null,
      isTauri: true,
    });

    expect(state.status).toBe("ok");
    if (state.status !== "ok") throw new Error("expected ok");
    expect(state.summary.byType.hole).toBe(1);
  });

  it("detects per-body features for a mapped multi-body selection", () => {
    const topology = twoBodyTopology();
    const bodyMapping = new Map([
      ["m0", 0],
      ["m1", 1],
    ]);

    const body0 = resolveBodyFeatureState({
      topology,
      meshCount: 2,
      selectedMeshId: "m0",
      bodyMapping,
      isTauri: true,
    });
    expect(body0.status).toBe("ok");
    if (body0.status !== "ok") throw new Error("expected ok");
    // The plain hole body has a hole and no thread.
    expect(body0.summary.byType.hole).toBe(1);
    expect(body0.summary.byType.thread).toBe(0);

    const body1 = resolveBodyFeatureState({
      topology,
      meshCount: 2,
      selectedMeshId: "m1",
      bodyMapping,
      isTauri: true,
    });
    expect(body1.status).toBe("ok");
    if (body1.status !== "ok") throw new Error("expected ok");
    // The tapped hole body is detected as both a hole and an M6 thread.
    expect(body1.summary.byType.hole).toBe(1);
    expect(body1.summary.byType.thread).toBe(1);
  });

  it("never returns the legacy multi-body unavailable message when a body maps", () => {
    const state = resolveBodyFeatureState({
      topology: twoBodyTopology(),
      meshCount: 2,
      selectedMeshId: "m0",
      bodyMapping: new Map([["m0", 0]]),
      isTauri: true,
    });
    expect(state.status).toBe("ok");
  });

  it("surfaces an honest mapping-failure reason when a body cannot be mapped", () => {
    const state = resolveBodyFeatureState({
      topology: twoBodyTopology(),
      meshCount: 2,
      selectedMeshId: "unmapped",
      bodyMapping: new Map(),
      isTauri: true,
    });
    expect(state).toEqual({
      status: "unavailable",
      reason: "Could not map BREP topology to this selected body.",
    });
    expect(state.status === "unavailable" && state.reason).not.toBe(
      LEGACY_MULTI_BODY_MESSAGE,
    );
  });
});
