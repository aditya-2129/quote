import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { buildTopologyGraph } from "../topology";
import type { TopologyPayload } from "@/types/topology";
import { detectHoles } from "./holes";
import { detectThreads } from "./threads";
import { detectPockets } from "./pockets";
import { detectCadFeatures } from "./index";

// Regression for local_locus_machine_fixture.stp Part 4: a Ø100 x 12 round
// disc with a central Ø44.2 counterbore over a Ø8.5 hole, an offset Ø5.1
// blind hole, four edge scallop cutouts, and 45° rim chamfers. Feature
// recognition previously misread the outer rim and rim chamfers as a
// Ø100.41 counterbore, the Ø5.1 bore as an external M5 thread, and the
// disc end faces as shallow closed pockets.
//
// The fixture is the body-3 topology slice extracted by the desktop
// `extract_topology` OCCT command (see src-tauri/src/cad/topology.rs).
const PART4 = "tests/fixtures/topology/locus_machine_fixture_part4.json";
const PART4_BODY_INDEX = 3;

function loadPart4() {
  const payload: TopologyPayload = JSON.parse(readFileSync(PART4, "utf8"));
  const graph = buildTopologyGraph(payload);
  const bodyEnvelope = payload.bodies?.find(
    (b) => b.index === PART4_BODY_INDEX,
  )?.bbox;
  if (!bodyEnvelope) throw new Error("fixture missing Part 4 body envelope");
  return { graph, bodyEnvelope };
}

describe("locus machine fixture Part 4 feature recognition", () => {
  it("the unfiltered detector still trips on the outer rim (fixture is a real trigger)", () => {
    const { graph } = loadPart4();
    // Without the body envelope the rim + rim chamfers fabricate a
    // body-diameter hole — this pins the fixture as a genuine regression.
    expect(detectHoles(graph).some((h) => h.diameter > 90)).toBe(true);
  });

  it("does not report the outer Ø100 rim as a hole", () => {
    const { graph, bodyEnvelope } = loadPart4();
    const holes = detectHoles(graph, { bodyEnvelope });

    expect(holes.every((h) => h.diameter < 90)).toBe(true);
    // The genuine interior holes survive: the central counterbore over the
    // Ø8.5 hole, and the offset Ø5.1 blind hole.
    expect(holes.length).toBeGreaterThan(0);
    expect(holes.some((h) => Math.abs(h.diameter - 5.1) < 0.2)).toBe(true);
  });

  it("does not classify the rim as a thread and reports no external thread", () => {
    const { graph, bodyEnvelope } = loadPart4();
    const threads = detectThreads(graph, { bodyEnvelope });

    // The Ø5.1 bore is an interior feature — never an external M5 shaft.
    expect(threads.some((t) => t.gender === "external")).toBe(false);
    expect(threads.some((t) => t.designation === "M5x0.8")).toBe(false);
    // No thread on the outer body/rim cylinder.
    expect(threads.every((t) => t.diameter < 90)).toBe(true);
  });

  it("does not classify the disc end faces as closed pockets", () => {
    const { graph, bodyEnvelope } = loadPart4();
    const pockets = detectPockets(graph, { bodyEnvelope });

    // The shallow "closed pockets" were the disc top/bottom faces paired
    // with a rim chamfer — outer envelope faces, not pocket floors.
    expect(pockets.some((p) => p.kind === "closed")).toBe(false);
  });

  it("reports no feature at the raw body outer diameter", () => {
    const { graph, bodyEnvelope } = loadPart4();
    const features = detectCadFeatures(graph, { bodyEnvelope });

    // No normalized feature should carry the ~Ø100 stock outer diameter.
    expect(features.some((f) => /\b100\.\d/.test(f.primary))).toBe(false);
  });
});
