/**
 * Issue 004 - Keep quote handoff on raw-material stock dimensions.
 *
 * cadResultToParts must use the corrected stock-dimension contract:
 *   - Cylindrical raw blanks -> round stock with envelope D/L.
 *   - Hex raw blanks -> hex stock with AF/L.
 *   - Box raw blanks -> rect stock with L/W/H.
 *
 * For local_ps_220129_single_cavity_transfer_tool.stp, the visible round
 * blanks must hand off as round stock from the body envelope. Incidental
 * feature diameters must not replace the raw material diameter.
 */

import { describe, expect, it } from "vitest";
import * as path from "path";
import process from "process";
import * as THREE from "three";
import { loadStepFixture } from "./__testHelpers__/loadStepFixture";
import { cadResultToParts } from "./cadHandoff";
import type { CadImportResult } from "./cad";

const FIXTURE_PATH = path.resolve(
  process.cwd(),
  "tests/fixtures/step/local_ps_220129_single_cavity_transfer_tool.stp",
);

const EXPECTED_ROUND_STOCK = [
  { D: 100.0, L: 49.9 },
  { D: 100.0, L: 46.6 },
  { D: 100.0, L: 29.0 },
  { D: 100.0, L: 50.0 },
  { D: 39.5, L: 30.7 },
  { D: 18.2, L: 32.1 },
];

async function fakeImportResult(fixturePath: string): Promise<CadImportResult> {
  const meshes = await loadStepFixture(fixturePath);
  return {
    fileName: path.basename(fixturePath),
    source: "step",
    geometry: {
      fileName: path.basename(fixturePath),
      boundingBoxMm: { x: 100, y: 100, z: 126.07 },
      volumeMm3: 974506.531,
    },
    rootNode: { name: "root", children: [], meshId: undefined },
    meshes: meshes.map((m, i) => ({
      id: m.id,
      name: `Part ${i + 1}`,
      geometry: m.geometry,
      color: "#888888",
      triangleCount: 0,
      vertexCount: 0,
      center: new THREE.Vector3(),
      occtIndex: i,
    })),
  } as unknown as CadImportResult;
}

function expectClose(actual: number, expected: number, label: string) {
  expect(
    Math.abs(actual - expected),
    `${label}: expected ${expected}, got ${actual}`,
  ).toBeLessThanOrEqual(0.2);
}

describe("cadResultToParts quote handoff (Issue 004)", () => {
  it("produces 6 parts for the transfer-tool fixture", async () => {
    const cad = await fakeImportResult(FIXTURE_PATH);
    const parts = cadResultToParts(cad);
    expect(parts.length).toBe(6);
  });

  it("every transfer-tool body hands off as envelope-derived round stock", async () => {
    const cad = await fakeImportResult(FIXTURE_PATH);
    const parts = cadResultToParts(cad);

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      expect(part.stock.shape, `Part ${i + 1} stock shape`).toBe("round");
      if (part.stock.shape !== "round") continue;
      const dims = part.stock.dims as { D: number; L: number };
      expectClose(dims.D, EXPECTED_ROUND_STOCK[i].D, `Part ${i + 1}.D`);
      expectClose(dims.L, EXPECTED_ROUND_STOCK[i].L, `Part ${i + 1}.L`);
    }
  });

  it("Part 3 hands off as D100 x L29 round stock", async () => {
    const cad = await fakeImportResult(FIXTURE_PATH);
    const parts = cadResultToParts(cad);
    expect(parts[2].stock.shape).toBe("round");
    if (parts[2].stock.shape !== "round") return;
    const dims = parts[2].stock.dims as { D: number; L: number };
    expectClose(dims.D, 100.0, "Part 3.D");
    expectClose(dims.L, 29.0, "Part 3.L");
  });

  it("rectangular fixture blocks hand off as rect stock despite finished features", async () => {
    const meshes = await loadStepFixture(
      path.resolve(
        process.cwd(),
        "tests/fixtures/step/local_ps_1250_fixture_blocks.stp",
      ),
    );
    const cad = {
      fileName: "local_ps_1250_fixture_blocks.stp",
      source: "step",
      geometry: {
        fileName: "local_ps_1250_fixture_blocks.stp",
        boundingBoxMm: { x: 160, y: 88.94, z: 200 },
        volumeMm3: 2102528.959,
      },
      rootNode: { name: "root", children: [], meshId: undefined },
      meshes: meshes.map((m, i) => ({
        id: m.id,
        name: `Part ${i + 1}`,
        geometry: m.geometry,
        color: "#888",
        triangleCount: 0,
        vertexCount: 0,
        center: new THREE.Vector3(),
        occtIndex: i,
      })),
    } as unknown as CadImportResult;

    const parts = cadResultToParts(cad);
    expect(parts.length).toBe(2);
    for (const part of parts) {
      expect(part.stock.shape).toBe("rect");
      if (part.stock.shape !== "rect") continue;
      const dims = part.stock.dims as { L: number; W: number; H: number };
      expect(dims.L).toBeGreaterThanOrEqual(dims.W);
      expect(dims.W).toBeGreaterThanOrEqual(dims.H);
    }

    const byLargest = parts
      .map((p) => p.stock!.dims as { L: number; W: number; H: number })
      .sort((a, b) => a.W - b.W);
    expectClose(byLargest[0].L, 200, "Part 1.L");
    expectClose(byLargest[0].W, 88.94, "Part 1.W");
    expectClose(byLargest[0].H, 80, "Part 1.H");
    expectClose(byLargest[1].L, 200, "Part 2.L");
    expectClose(byLargest[1].W, 125, "Part 2.W");
    expectClose(byLargest[1].H, 88.94, "Part 2.H");
  });

  describe("true stock-shaped bodies still produce correct stock types (Issue 003)", () => {
    it("a round shaft produces round stock with the shaft's diameter", async () => {
      const meshes = await loadStepFixture(
        path.resolve(process.cwd(), "tests/fixtures/step/self_round_shaft.step"),
      );
      const cad = {
        fileName: "self_round_shaft.step",
        source: "step",
        geometry: {
          fileName: "self_round_shaft.step",
          boundingBoxMm: { x: 30, y: 30, z: 140 },
          volumeMm3: 98677,
        },
        rootNode: { name: "root", children: [], meshId: undefined },
        meshes: [
          {
            id: "m0",
            name: "Part 1",
            geometry: meshes[0].geometry,
            color: "#888",
            triangleCount: 0,
            vertexCount: 0,
            center: new THREE.Vector3(),
            occtIndex: 0,
          },
        ],
      } as unknown as CadImportResult;
      const parts = cadResultToParts(cad);
      expect(parts.length).toBe(1);
      expect(parts[0].stock.shape).toBe("round");
      if (parts[0].stock.shape !== "round") return;
      const dims = parts[0].stock.dims as { D: number; L: number };
      expect(dims.D).toBeGreaterThan(25);
      expect(dims.D).toBeLessThan(35);
      expect(dims.L).toBeGreaterThan(130);
    });

    it("a hex standoff produces hex stock", async () => {
      const meshes = await loadStepFixture(
        path.resolve(process.cwd(), "tests/fixtures/step/self_hex_standoff.step"),
      );
      const cad = {
        fileName: "self_hex_standoff.step",
        source: "step",
        geometry: {
          fileName: "self_hex_standoff.step",
          boundingBoxMm: { x: 23.1, y: 20, z: 25 },
          volumeMm3: 0,
        },
        rootNode: { name: "root", children: [], meshId: undefined },
        meshes: [
          {
            id: "m0",
            name: "Part 1",
            geometry: meshes[0].geometry,
            color: "#888",
            triangleCount: 0,
            vertexCount: 0,
            center: new THREE.Vector3(),
            occtIndex: 0,
          },
        ],
      } as unknown as CadImportResult;
      const parts = cadResultToParts(cad);
      expect(parts[0].stock.shape).toBe("hex");
    });

    it("a stepped shoulder shaft produces round stock from max envelope diameter", async () => {
      const meshes = await loadStepFixture(
        path.resolve(
          process.cwd(),
          "tests/fixtures/step/self_stepped_shoulder_shaft.step",
        ),
      );
      const cad = {
        fileName: "self_stepped_shoulder_shaft.step",
        source: "step",
        geometry: {
          fileName: "self_stepped_shoulder_shaft.step",
          boundingBoxMm: { x: 35.96, y: 35.98, z: 195 },
          volumeMm3: 110060,
        },
        rootNode: { name: "root", children: [], meshId: undefined },
        meshes: [
          {
            id: "m0",
            name: "Part 1",
            geometry: meshes[0].geometry,
            color: "#888",
            triangleCount: 0,
            vertexCount: 0,
            center: new THREE.Vector3(),
            occtIndex: 0,
          },
        ],
      } as unknown as CadImportResult;
      const parts = cadResultToParts(cad);
      expect(parts[0].stock.shape).toBe("round");
      if (parts[0].stock.shape !== "round") return;
      expectClose(parts[0].stock.dims.D, 36.0, "stepped shaft D");
    });

    it("local_single_cavity_transfer_mould.stp Part 5 hands off round stock with corrected containment diameter", async () => {
      const fixturePath = path.resolve(
        process.cwd(),
        "tests/fixtures/step/local_single_cavity_transfer_mould.stp",
      );
      const meshes = await loadStepFixture(fixturePath);
      const cad = {
        fileName: "local_single_cavity_transfer_mould.stp",
        source: "step",
        geometry: {
          fileName: "local_single_cavity_transfer_mould.stp",
          boundingBoxMm: { x: 150, y: 225.55, z: 135.07 },
          volumeMm3: 3434879.424,
        },
        rootNode: { name: "root", children: [], meshId: undefined },
        meshes: meshes.map((m, i) => ({
          id: m.id,
          name: `Part ${i + 1}`,
          geometry: m.geometry,
          color: "#888",
          triangleCount: 0,
          vertexCount: 0,
          center: new THREE.Vector3(),
          occtIndex: i,
        })),
      } as unknown as CadImportResult;

      const parts = cadResultToParts(cad);
      // Part 5 is at index 4 (0-indexed)
      const part5 = parts[4];
      expect(part5).toBeDefined();
      expect(part5.stock.shape).toBe("round");
      if (part5.stock.shape !== "round") return;
      const dims = part5.stock.dims as { D: number; L: number };
      expectClose(dims.L, 187.66, "Part 5 L");
      expect(dims.D).toBeGreaterThan(60.00);
      expectClose(dims.D, 82.26, "Part 5 containment diameter D");
    });
  });
});
