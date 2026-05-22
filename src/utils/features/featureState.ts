import {
  buildTopologyGraph,
  filterTopologyToBody,
  type BodyBoundingBox,
  type TopologyPayload,
} from "../topology";
import {
  detectCadFeatures,
  summarizeCadFeatures,
  type CadFeatureSummary,
  type DetectedCadFeature,
} from "./index";

/** Resolved feature-recognition state for the Viewer inspector. */
export type FeatureState =
  | { status: "ok"; features: DetectedCadFeature[]; summary: CadFeatureSummary }
  | { status: "unavailable"; reason: string };

export interface BodyFeatureStateParams {
  /** Whole-file BREP topology, or undefined when none was extracted. */
  topology: TopologyPayload | undefined;
  /** Number of mesh bodies in the imported file. */
  meshCount: number;
  /** ID of the mesh body currently selected in the Viewer. */
  selectedMeshId: string;
  /**
   * `meshId → bodyIndex` map from `mapTopologyBodiesToMeshes`. May be null
   * for single-body files, where mapping is unnecessary.
   */
  bodyMapping: Map<string, number> | null;
  /** Whether the desktop (Tauri) runtime is active. */
  isTauri: boolean;
}

/**
 * Resolve feature recognition for the selected body.
 *
 * Single-body files run detection on the whole topology, exactly as before
 * body grouping existed. Multi-body files map the selected mesh to its own
 * BREP body and detect features against that slice only. When a body cannot
 * be mapped the result is an honest unavailable state — never a guess.
 */
export function resolveBodyFeatureState(
  params: BodyFeatureStateParams,
): FeatureState {
  const { topology, meshCount, selectedMeshId, bodyMapping, isTauri } = params;

  if (!topology) {
    return {
      status: "unavailable",
      reason: isTauri
        ? "BREP topology extraction returned no data for this file"
        : "Open in desktop runtime to extract BREP topology",
    };
  }

  try {
    let payload: TopologyPayload;
    let bodyIndex: number | undefined;
    if (meshCount <= 1) {
      payload = topology;
      bodyIndex = topology.bodies?.[0]?.index;
    } else {
      bodyIndex = bodyMapping?.get(selectedMeshId);
      if (bodyIndex === undefined) {
        return {
          status: "unavailable",
          reason: "Could not map BREP topology to this selected body.",
        };
      }
      payload = filterTopologyToBody(topology, bodyIndex);
    }

    const graph = buildTopologyGraph(payload);
    const features = detectCadFeatures(graph, {
      bodyEnvelope: bodyEnvelopeOf(topology, bodyIndex),
    });
    return { status: "ok", features, summary: summarizeCadFeatures(features) };
  } catch (err) {
    console.warn("[viewer] feature detection failed", err);
    return {
      status: "unavailable",
      reason: "Feature detection failed for this topology",
    };
  }
}

/**
 * Bounding box of the body being analyzed, used by slot detection to reject
 * the stock outline being misread as a slot. Undefined when the topology
 * predates per-body bounding boxes or the body is degenerate.
 */
function bodyEnvelopeOf(
  topology: TopologyPayload,
  bodyIndex: number | undefined,
): BodyBoundingBox | undefined {
  if (bodyIndex === undefined) return undefined;
  return topology.bodies?.find((body) => body.index === bodyIndex)?.bbox;
}
