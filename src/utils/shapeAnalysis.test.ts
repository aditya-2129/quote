import { describe, it, expect, vi } from "vitest";
import * as THREE from "three";
import * as path from "path";
import process from "process";
import { loadStepFixture } from "./__testHelpers__/loadStepFixture";
import {
  analyzeCadBody,
  analyzeRawStock,
  analyzeShape,
  computeMeshStats,
  type ShapeAnalysis,
} from "./shapeAnalysis";
import { buildTopologyGraph } from "./topology";
import type { TopologyPayload } from "@/types/topology";

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
interface ExpectedComplex {
  kind: "complex";
  xMm: number;
  yMm: number;
  zMm: number;
}
type ExpectedShape = ExpectedCylinder | ExpectedHex | ExpectedBox | ExpectedComplex;

/**
 * Curated ground truth for single-body STEP fixtures, locked to actual
 * production-pipeline behavior. All values were captured via analyzeShape probe
 * on 2026-05-21 using the same OCCT tessellation settings the production loader
 * uses (linearDeflection 0.001, bounding_box_ratio, angularDeflection 0.5).
 *
 * IMPORTANT: self_hex_bar.step is a low-tessellation hex prism. The classifier
 * must still identify the whole-body shape from its planar side-face normals
 * instead of falling back to complex just because the mesh has few triangles.
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
    outerDiaMm: 35.97806930541992,
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
    kind: "hex",
    afMm: 25.980762481689453,
    lengthMm: 120,
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
  } else if (expected.kind === "complex" && actual.kind === "complex") {
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
      const meshes = await loadStepFixture(
        path.join(FIXTURES_DIR, fixtureName),
      );
      expect(meshes.length).toBe(1);
      const actual = analyzeShape(meshes[0].geometry);
      expectDimsClose(actual, expected, fixtureName);
    },
  );

  it("classifies self_filleted_cylinder.step as cylinder (filleted-cylinder acceptance)", async () => {
    const fixture = "self_filleted_cylinder.step";
    const meshes = await loadStepFixture(path.join(FIXTURES_DIR, fixture));
    const result = analyzeShape(meshes[0].geometry);
    expect(result.kind, `expected cylinder, got ${result.kind}`).toBe(
      "cylinder",
    );
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

  it("never classifies a complex-shaped fixture as cylinder, hex, or box", async () => {
    const complexFixtures = Object.entries(SHAPE_GROUND_TRUTH)
      .filter(([, exp]) => exp.kind === "complex")
      .map(([name]) => name);

    for (const fixture of complexFixtures) {
      const meshes = await loadStepFixture(path.join(FIXTURES_DIR, fixture));
      const result = analyzeShape(meshes[0].geometry);
      expect(
        result.kind,
        `false positive: ${fixture} classified as ${result.kind}, expected complex`,
      ).toBe("complex");
    }
  });

  it("meets acceptance minimums: ≥3 cylinder, ≥2 hex, ≥5 box fixtures classified", async () => {
    const counts = { cylinder: 0, hex: 0, box: 0, complex: 0 };
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

describe("analyzeShape topology path", () => {
  it("returns exact cylinder dimensions from topology", () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const topology = buildTopologyGraph({
      faces: [cylinderFace("outer", 15, 140), cylinderFace("inner", 4, 140)],
      edges: [],
      adjacency: [],
    });

    const result = analyzeShape(boxGeometry(30, 30, 140), topology);

    expect(result).toEqual({
      kind: "cylinder",
      outerDiaMm: 30,
      innerDiaMm: 8,
      lengthMm: 140,
    });
    expect(debugSpy).toHaveBeenCalledWith("[shapeAnalysis] path=topology");
    debugSpy.mockRestore();
  });

  it("returns exact hex dimensions from topology planes", () => {
    const topology = buildTopologyGraph(hexTopology(20, 25));

    const result = analyzeShape(boxGeometry(23.094, 20, 25), topology);

    expect(result.kind).toBe("hex");
    if (result.kind !== "hex") return;
    expect(result.afMm).toBeCloseTo(20, 2);
    expect(result.lengthMm).toBeCloseTo(25, 2);
  });

  it("falls back to mesh path when topology is absent", () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

    const result = analyzeShape(boxGeometry(10, 20, 30));

    expect(result).toEqual({ kind: "box", xMm: 10, yMm: 20, zMm: 30 });
    expect(debugSpy).toHaveBeenCalledWith("[shapeAnalysis] path=mesh");
    debugSpy.mockRestore();
  });

  it("falls back to mesh path when topology has no cylinder or hex classification", () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const topology = buildTopologyGraph({
      faces: [
        {
          id: "f_spline",
          index: 1,
          surface: { kind: "b_spline" },
          wires: [],
        },
      ],
      edges: [],
      adjacency: [],
    });

    const result = analyzeShape(boxGeometry(12, 24, 36), topology);

    expect(result).toEqual({ kind: "box", xMm: 12, yMm: 24, zMm: 36 });
    expect(debugSpy).toHaveBeenCalledWith("[shapeAnalysis] path=mesh");
    debugSpy.mockRestore();
  });
});

describe("analyzeRawStock raw-material inference", () => {
  it.each(Object.keys(SHAPE_GROUND_TRUTH))(
    "%s: raw-stock shape follows the envelope, not finished complexity",
    async (fixtureName) => {
      const exp = SHAPE_GROUND_TRUTH[fixtureName];
      const meshes = await loadStepFixture(path.join(FIXTURES_DIR, fixtureName));
      const { rawStock } = analyzeCadBody(meshes[0].geometry);
      const expectedShape =
        exp.kind === "cylinder"
          ? "round"
          : exp.kind === "hex"
            ? "hex"
            : "rect";
      expect(rawStock.shape, `${fixtureName} raw stock`).toBe(expectedShape);
    },
  );

  it("round bars use the envelope max diameter and length", async () => {
    for (const name of [
      "self_round_shaft.step",
      "self_round_tube.step",
      "self_stepped_shoulder_shaft.step",
    ]) {
      const meshes = await loadStepFixture(path.join(FIXTURES_DIR, name));
      const stats = computeMeshStats(meshes[0].geometry);
      const dims = [
        stats.boundingBoxMm.x,
        stats.boundingBoxMm.y,
        stats.boundingBoxMm.z,
      ].sort((a, b) => b - a);
      const raw = analyzeRawStock(meshes[0].geometry);
      expect(raw.shape, name).toBe("round");
      if (raw.shape !== "round") continue;
      expect(Math.abs(raw.dims.L - dims[0]), `${name} L`).toBeLessThanOrEqual(
        0.5,
      );
      expect(Math.abs(raw.dims.D - dims[1]), `${name} D`).toBeLessThanOrEqual(
        0.5,
      );
    }
  });

  it("hex bars use across-flats and length", async () => {
    const hexes: Array<[string, number, number]> = [
      ["self_hex_bar.step", 25.980762481689453, 120],
      ["self_hex_nut.step", 17, 8],
      ["self_hex_standoff.step", 20, 25],
    ];
    for (const [name, af, len] of hexes) {
      const meshes = await loadStepFixture(path.join(FIXTURES_DIR, name));
      const raw = analyzeRawStock(meshes[0].geometry);
      expect(raw.shape, name).toBe("hex");
      if (raw.shape !== "hex") continue;
      expect(Math.abs(raw.dims.AF - af), `${name} AF`).toBeLessThanOrEqual(0.5);
      expect(Math.abs(raw.dims.L - len), `${name} L`).toBeLessThanOrEqual(0.5);
    }
  });

  it("plates and blocks use the sorted envelope as rect stock", async () => {
    for (const [name, exp] of Object.entries(SHAPE_GROUND_TRUTH)) {
      if (exp.kind !== "box") continue;
      const meshes = await loadStepFixture(path.join(FIXTURES_DIR, name));
      const stats = computeMeshStats(meshes[0].geometry);
      const dims = [
        stats.boundingBoxMm.x,
        stats.boundingBoxMm.y,
        stats.boundingBoxMm.z,
      ].sort((a, b) => b - a);
      const raw = analyzeRawStock(meshes[0].geometry);
      expect(raw.shape, name).toBe("rect");
      if (raw.shape !== "rect") continue;
      expect(Math.abs(raw.dims.L - dims[0]), `${name} L`).toBeLessThanOrEqual(
        0.5,
      );
      expect(Math.abs(raw.dims.W - dims[1]), `${name} W`).toBeLessThanOrEqual(
        0.5,
      );
      expect(Math.abs(raw.dims.H - dims[2]), `${name} H`).toBeLessThanOrEqual(
        0.5,
      );
    }
  });

  it("degenerate geometry yields unknown raw stock", () => {
    const flat = new THREE.BufferGeometry();
    flat.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [0, 0, 0, 10, 0, 0, 10, 5, 0, 0, 5, 0],
        3,
      ),
    );
    const raw = analyzeRawStock(flat);
    expect(raw.shape).toBe("unknown");
  });

  it("local_single_cavity_transfer_mould.stp Part 5 remains round stock with containment diameter", async () => {
    const fixture = "local_single_cavity_transfer_mould.stp";
    const meshes = await loadStepFixture(path.join(FIXTURES_DIR, fixture));
    // Part 5 is at index 4 (0-indexed)
    const part5 = meshes[4];
    expect(part5, "Part 5 mesh should exist").toBeDefined();

    const raw = analyzeRawStock(part5.geometry);
    expect(raw.shape).toBe("round");
    if (raw.shape !== "round") return;

    const expectClose = (actual: number, expected: number, label: string) => {
      expect(Math.abs(actual - expected), `${label}: expected ${expected}, got ${actual}`).toBeLessThanOrEqual(0.5);
    };

    expectClose(raw.dims.L, 187.66, "Part 5 length L");
    expect(raw.dims.D).toBeGreaterThan(60.00);
    expectClose(raw.dims.D, 81.96, "Part 5 containment diameter D");
  });
});

function cylinderFace(
  id: string,
  radius: number,
  length: number,
): TopologyPayload["faces"][number] {
  return {
    id: `f_${id}`,
    index: radius,
    surface: {
      kind: "cylinder",
      axis_origin: [0, 0, 0],
      axis_direction: [0, 0, 1],
      radius,
      length,
      angular_span: Math.PI * 2,
    },
    wires: [],
  };
}

function hexTopology(afMm: number, lengthMm: number): TopologyPayload {
  const sideFaces: TopologyPayload["faces"] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3;
    const normal: [number, number, number] = [
      Math.cos(angle),
      Math.sin(angle),
      0,
    ];
    sideFaces.push({
      id: `f_side_${i}`,
      index: i + 1,
      surface: {
        kind: "plane",
        origin: [normal[0] * (afMm / 2), normal[1] * (afMm / 2), 0],
        normal,
      },
      wires: [],
    });
  }

  return {
    faces: [
      ...sideFaces,
      {
        id: "f_cap_min",
        index: 7,
        surface: { kind: "plane", origin: [0, 0, 0], normal: [0, 0, -1] },
        wires: [],
      },
      {
        id: "f_cap_max",
        index: 8,
        surface: { kind: "plane", origin: [0, 0, lengthMm], normal: [0, 0, 1] },
        wires: [],
      },
    ],
    edges: [],
    adjacency: [],
  };
}

function boxGeometry(x: number, y: number, z: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(x, y, z);
}
