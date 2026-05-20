import { describe, it, expect } from "vitest";
import * as path from "path";
import process from "process";
import { loadStepFixture } from "./__testHelpers__/loadStepFixture";
import { analyzeShape, type ShapeAnalysis } from "./shapeAnalysis";

const FIXTURES_DIR = path.resolve(process.cwd(), "tests/fixtures/step");

interface ExpectedCylinder {
  kind: "cylinder";
  outerDiaMm: number;
  innerDiaMm: number | null;
  lengthMm: number;
}
interface ExpectedHex {
  kind: "hex";
  afMm: number;
  lengthMm: number;
}
interface ExpectedBox {
  kind: "box";
  xMm: number;
  yMm: number;
  zMm: number;
}
type ExpectedShape = ExpectedCylinder | ExpectedHex | ExpectedBox;

/**
 * Curated ground truth for single-body STEP fixtures, locked to actual
 * production-pipeline behavior. All values were captured via analyzeShape probe
 * on 2026-05-21 using the same OCCT tessellation settings the production loader
 * uses (linearDeflection 0.001, bounding_box_ratio, angularDeflection 0.5).
 *
 * IMPORTANT: self_hex_bar.step is recorded as "box" because OCCT produces only
 * 20 triangles for a solid hex prism with these tessellation settings — fewer
 * than analyzeShape's 16-side-face threshold. This is a real algorithm
 * limitation worth tracking. Hex prisms with bores (self_hex_nut, self_hex_standoff)
 * pick up enough side-face triangles from the bore wall to cross the threshold.
 * Do NOT add a subdivision hack to force "hex" on the bar — that would mask the
 * limitation rather than characterize it.
 */
const SHAPE_GROUND_TRUTH: Record<string, ExpectedShape> = {
  "self_round_shaft.step": {
    kind: "cylinder",
    outerDiaMm: 29.935767783737962,
    innerDiaMm: null,
    lengthMm: 140,
  },
  "self_round_shaft_through_hole.step": {
    kind: "cylinder",
    outerDiaMm: 39.94133675476049,
    innerDiaMm: 7.941671050874065,
    lengthMm: 100,
  },
  "self_round_tube.step": {
    kind: "cylinder",
    outerDiaMm: 43.93077969850593,
    innerDiaMm: 25.93375492558118,
    lengthMm: 120,
  },
  "self_stepped_shoulder_shaft.step": {
    kind: "cylinder",
    outerDiaMm: 23.942509031829193,
    innerDiaMm: null,
    lengthMm: 195,
  },
  "self_filleted_cylinder.step": {
    kind: "cylinder",
    outerDiaMm: 29.912160780981566,
    innerDiaMm: null,
    lengthMm: 50,
  },
  "self_hex_bar.step": {
    // Documented limitation: 20-triangle tessellation falls below the 16
    // side-face threshold; algorithm falls back to box. Bounding box reflects
    // hex oriented with vertex along +X (vertex-to-vertex = AF / cos30°).
    kind: "box",
    xMm: 30,
    yMm: 25.980762481689453,
    zMm: 120,
  },
  "self_hex_nut.step": {
    kind: "hex",
    afMm: 17,
    lengthMm: 8,
  },
  "self_hex_standoff.step": {
    kind: "hex",
    afMm: 20,
    lengthMm: 25,
  },
  "self_simple_plate.step": { kind: "box", xMm: 100, yMm: 60, zMm: 10 },
  "self_counterbored_plate.step": { kind: "box", xMm: 110, yMm: 70, zMm: 18 },
  "self_deep_pocket.step": { kind: "box", xMm: 90, yMm: 60, zMm: 35 },
  "self_fillet_chamfer_block.step": { kind: "box", xMm: 70, yMm: 45, zMm: 18 },
  "self_multi_hole_bracket.step": { kind: "box", xMm: 120, yMm: 70, zMm: 70 },
  "self_near_duplicate_slot_a.step": { kind: "box", xMm: 80, yMm: 50, zMm: 20 },
  "self_near_duplicate_slot_b.step": { kind: "box", xMm: 80, yMm: 50, zMm: 20 },
  "self_thin_wall_box.step": { kind: "box", xMm: 90, yMm: 60, zMm: 40 },
};

function expectDimsClose(
  actual: ShapeAnalysis,
  expected: ExpectedShape,
  fixture: string,
) {
  expect(
    actual.kind,
    `shapeAnalysis kind mismatch on ${fixture}: expected ${expected.kind}, got ${actual.kind}`,
  ).toBe(expected.kind);

  const checkClose = (
    actualVal: number | null,
    expectedVal: number | null,
    fieldName: string,
  ) => {
    if (actualVal === null || expectedVal === null) {
      expect(
        actualVal,
        `${fixture}.${fieldName}: expected ${expectedVal}, got ${actualVal}`,
      ).toBe(expectedVal);
      return;
    }
    const diff = Math.abs(actualVal - expectedVal);
    if (diff > 0.5) {
      expect.fail(
        `${fixture}.${fieldName}: expected ${expectedVal}, got ${actualVal} (Δ=${diff.toFixed(3)} mm, budget=0.5)`,
      );
    }
  };

  if (expected.kind === "cylinder" && actual.kind === "cylinder") {
    checkClose(actual.outerDiaMm, expected.outerDiaMm, "outerDiaMm");
    checkClose(actual.innerDiaMm, expected.innerDiaMm, "innerDiaMm");
    checkClose(actual.lengthMm, expected.lengthMm, "lengthMm");
  } else if (expected.kind === "hex" && actual.kind === "hex") {
    checkClose(actual.afMm, expected.afMm, "afMm");
    checkClose(actual.lengthMm, expected.lengthMm, "lengthMm");
  } else if (expected.kind === "box" && actual.kind === "box") {
    checkClose(actual.xMm, expected.xMm, "xMm");
    checkClose(actual.yMm, expected.yMm, "yMm");
    checkClose(actual.zMm, expected.zMm, "zMm");
  }
}

describe("analyzeShape golden classification sweep", () => {
  it.each(Object.keys(SHAPE_GROUND_TRUTH))(
    "matches expected kind and dimensions for %s",
    async (fixtureName) => {
      const expected = SHAPE_GROUND_TRUTH[fixtureName];
      const meshes = await loadStepFixture(path.join(FIXTURES_DIR, fixtureName));
      expect(meshes.length).toBe(1);
      const actual = analyzeShape(meshes[0].geometry);
      expectDimsClose(actual, expected, fixtureName);
    },
  );

  it("classifies self_filleted_cylinder.step as cylinder (filleted-cylinder acceptance)", async () => {
    const fixture = "self_filleted_cylinder.step";
    const meshes = await loadStepFixture(path.join(FIXTURES_DIR, fixture));
    const result = analyzeShape(meshes[0].geometry);
    expect(result.kind, `expected cylinder, got ${result.kind}`).toBe("cylinder");
    expectDimsClose(result, SHAPE_GROUND_TRUTH[fixture], fixture);
  });

  it("never classifies a box-shaped fixture as cylinder or hex (false-positive guard)", async () => {
    const boxFixtures = Object.entries(SHAPE_GROUND_TRUTH)
      .filter(([, exp]) => exp.kind === "box")
      .map(([name]) => name);

    for (const fixture of boxFixtures) {
      const meshes = await loadStepFixture(path.join(FIXTURES_DIR, fixture));
      const result = analyzeShape(meshes[0].geometry);
      expect(
        result.kind,
        `false positive: ${fixture} classified as ${result.kind}, expected box`,
      ).toBe("box");
    }
  });

  it("meets acceptance minimums: ≥3 cylinder, ≥2 hex, ≥5 box fixtures classified", async () => {
    const counts = { cylinder: 0, hex: 0, box: 0 };
    for (const fixture of Object.keys(SHAPE_GROUND_TRUTH)) {
      const meshes = await loadStepFixture(path.join(FIXTURES_DIR, fixture));
      const result = analyzeShape(meshes[0].geometry);
      counts[result.kind]++;
    }
    expect(counts.cylinder, "cylinder count below 3").toBeGreaterThanOrEqual(3);
    expect(counts.hex, "hex count below 2").toBeGreaterThanOrEqual(2);
    expect(counts.box, "box count below 5").toBeGreaterThanOrEqual(5);
  });
});
