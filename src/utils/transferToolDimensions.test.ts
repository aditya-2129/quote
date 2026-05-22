/**
 * Raw-stock dimension contract.
 *
 * The app must answer two independent questions for every CAD body:
 *   - rawStock:     what material blank to buy/cut, with dimensions.
 *   - finishedBody: what the imported body looks like after machining.
 *
 * Finished-part complexity (bores, pockets, grooves) must NOT suppress a
 * correct raw-stock shape. A "complex" finished body can still be round or
 * rect raw stock.
 *
 * Blocking fixtures:
 *   - local_ps_220129_single_cavity_transfer_tool.stp — 6 round blanks.
 *   - local_ps_1250_fixture_blocks.stp — 2 rectangular blanks.
 */

import { describe, expect, it } from "vitest";
import * as path from "path";
import process from "process";
import { loadStepFixture } from "./__testHelpers__/loadStepFixture";
import { analyzeCadBody } from "./shapeAnalysis";

const TRANSFER_TOOL = path.resolve(
  process.cwd(),
  "tests/fixtures/step/local_ps_220129_single_cavity_transfer_tool.stp",
);
const FIXTURE_BLOCKS = path.resolve(
  process.cwd(),
  "tests/fixtures/step/local_ps_1250_fixture_blocks.stp",
);

const TOL = 0.5; // mm

function expectClose(actual: number, expected: number, label: string) {
  const diff = Math.abs(actual - expected);
  if (diff > TOL) {
    expect.fail(
      `${label}: expected ${expected.toFixed(2)} mm, got ${actual.toFixed(2)} mm (Δ=${diff.toFixed(3)} mm, budget=${TOL} mm)`,
    );
  }
}

// Raw stock D/L per body, derived from the body envelope. Feature diameters
// (bores, bosses, pocket walls) must never replace these values.
const EXPECTED_ROUND_STOCK = [
  { label: "Part 1", D: 100.0, L: 49.93, legacyFeatureDia: 24.86 },
  { label: "Part 2", D: 100.0, L: 46.6, legacyFeatureDia: 99.89 },
  { label: "Part 3", D: 100.0, L: 29.02, legacyFeatureDia: 59.58 },
  { label: "Part 4", D: 100.0, L: 50.0, legacyFeatureDia: 69.98 },
  { label: "Part 5", D: 39.47, L: 30.7, legacyFeatureDia: 33.27 },
  { label: "Part 6", D: 18.22, L: 32.12, legacyFeatureDia: 13.66 },
];

describe("transfer-tool raw-stock contract", () => {
  it("imports exactly 6 bodies", async () => {
    const meshes = await loadStepFixture(TRANSFER_TOOL);
    expect(meshes.length).toBe(6);
  });

  it.each(EXPECTED_ROUND_STOCK.map((e, i) => [e.label, i, e] as const))(
    "%s infers round raw stock from the envelope diameter",
    async (_label, index, expected) => {
      const meshes = await loadStepFixture(TRANSFER_TOOL);
      const { rawStock } = analyzeCadBody(meshes[index].geometry);

      expect(
        rawStock.shape,
        `${expected.label} raw stock should be round, got ${rawStock.shape}`,
      ).toBe("round");
      if (rawStock.shape !== "round") return;

      expectClose(rawStock.dims.D, expected.D, `${expected.label}.D`);
      expectClose(rawStock.dims.L, expected.L, `${expected.label}.L`);

      // The envelope diameter must win; a feature-derived diameter must not.
      const matchesLegacy =
        Math.abs(rawStock.dims.D - expected.legacyFeatureDia) <= TOL;
      const legacyIsAlsoEnvelope =
        Math.abs(expected.legacyFeatureDia - expected.D) <= TOL;
      if (!legacyIsAlsoEnvelope) {
        expect(
          matchesLegacy,
          `${expected.label}.D=${rawStock.dims.D} matched legacy feature diameter ${expected.legacyFeatureDia} instead of envelope ${expected.D}`,
        ).toBe(false);
      }
    },
  );

  it("Part 3 raw stock is exactly D100 x L29.02", async () => {
    const meshes = await loadStepFixture(TRANSFER_TOOL);
    const { rawStock } = analyzeCadBody(meshes[2].geometry);
    expect(rawStock.shape).toBe("round");
    if (rawStock.shape !== "round") return;
    expectClose(rawStock.dims.D, 100.0, "Part 3.D");
    expectClose(rawStock.dims.L, 29.02, "Part 3.L");
  });

  it("every transfer-tool body resolves to round raw stock", async () => {
    const meshes = await loadStepFixture(TRANSFER_TOOL);
    for (let i = 0; i < meshes.length; i++) {
      const { rawStock } = analyzeCadBody(meshes[i].geometry);
      expect(rawStock.shape, `Part ${i + 1} raw stock shape`).toBe("round");
    }
  });
});

describe("fixture-blocks raw-stock contract", () => {
  // Per-body raw blanks: rectangular even though the finished bodies carry
  // holes and circular cutouts.
  const EXPECTED_RECT_STOCK = [
    { label: "Part 1", L: 200, W: 88.94, H: 80 },
    { label: "Part 2", L: 200, W: 125, H: 88.94 },
  ];

  it("imports exactly 2 bodies", async () => {
    const meshes = await loadStepFixture(FIXTURE_BLOCKS);
    expect(meshes.length).toBe(2);
  });

  it.each(EXPECTED_RECT_STOCK.map((e, i) => [e.label, i, e] as const))(
    "%s infers rect raw stock even though the finished body is complex",
    async (_label, index, expected) => {
      const meshes = await loadStepFixture(FIXTURE_BLOCKS);
      const { rawStock, finishedBody } = analyzeCadBody(
        meshes[index].geometry,
      );

      expect(
        rawStock.shape,
        `${expected.label} raw stock should be rect, got ${rawStock.shape}`,
      ).toBe("rect");
      if (rawStock.shape !== "rect") return;

      // Stock dims sorted L >= W >= H.
      expect(rawStock.dims.L).toBeGreaterThanOrEqual(rawStock.dims.W);
      expect(rawStock.dims.W).toBeGreaterThanOrEqual(rawStock.dims.H);
      expectClose(rawStock.dims.L, expected.L, `${expected.label}.L`);
      expectClose(rawStock.dims.W, expected.W, `${expected.label}.W`);
      expectClose(rawStock.dims.H, expected.H, `${expected.label}.H`);

      // Finished body carries machined features — must not block rect stock.
      expect(finishedBody.kind).not.toBe("cylinder");
    },
  );
});
