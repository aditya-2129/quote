import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import process from "process";
import { groupIdenticalMeshes } from "@utils/meshFingerprint";
import { loadStepFixture } from "./__testHelpers__/loadStepFixture";


const FIXTURES_DIR = path.resolve(process.cwd(), "tests/fixtures/step");

function findStepFixtures() {
  const files = fs.readdirSync(FIXTURES_DIR) as string[];
  return files
    .filter((file) => file.endsWith(".step") || file.endsWith(".stp"))
    .map((file) => {
      const stepPath = path.join(FIXTURES_DIR, file);
      const jsonPath = stepPath.replace(/\.(step|stp)$/, ".expected.json");
      return {
        name: file,
        stepPath,
        jsonPath,
      };
    });
}

const fixtures = findStepFixtures();

describe("meshFingerprint duplicate grouping golden tests", () => {
  // Test 1: Sweep all 25 fixtures dynamically from the fixtures directory
  it.each(fixtures)(
    "matches expected duplicate groups for fixture: $name",
    async ({ stepPath, jsonPath }: { stepPath: string; jsonPath: string }) => {
      const expectedData = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
      const meshes = await loadStepFixture(stepPath);
      const groups = groupIdenticalMeshes(meshes);

      expect(groups.length).toBe(expectedData.expected.duplicateGroupCount);

      const actualSizes = groups.map((g) => g.meshIds.length).sort((a, b) => b - a);
      const expectedSizes = [...expectedData.expected.duplicateGroupSizes].sort((a, b) => b - a);

      expect(actualSizes).toEqual(expectedSizes);
    }

  );

  // Test 2: Dedicated test for mirrored + rotated grouping using self_rotated_mirrored_duplicates.step
  it("groups rotated and mirrored instances of identical bodies together", async () => {
    const stepPath = path.join(FIXTURES_DIR, "self_rotated_mirrored_duplicates.step");
    const meshes = await loadStepFixture(stepPath);
    const groups = groupIdenticalMeshes(meshes);

    // Assert that we have exactly 1 group containing all 3 meshes (original, rotated, and mirrored)
    expect(groups.length).toBe(1);
    expect(groups[0].meshIds.length).toBe(3);

    /**
     * RADIAL-SIGNATURE TOLERANCE POSITIVE CASE (Acceptance / Design Intent):
     * This test demonstrates that near-duplicate-but-same bodies group correctly despite vertex jitter.
     * OCCT import performs per-instance tessellation, which generates slightly different triangulation
     * and minor vertex positions (vertex jitter) for identical shapes under different rigid body poses.
     * The radial-signature method in groupIdenticalMeshes successfully groups them by sorting the radial
     * distance of vertices to their centroid and performing a tolerance-based (RADIAL_TOL_MM = 0.1) comparison
     * with an allowable outlier fraction (1%), ensuring robust grouping invariant to pose, mirror, and jitter.
     */
  });

  // Test 3: Dedicated test for near-duplicate-but-distinct bodies NOT grouped together
  it("does not group near-duplicate-but-distinct slot bodies (outlier tolerance check)", async () => {
    const stepPathA = path.join(FIXTURES_DIR, "self_near_duplicate_slot_a.step");
    const stepPathB = path.join(FIXTURES_DIR, "self_near_duplicate_slot_b.step");

    const meshesA = await loadStepFixture(stepPathA);
    const meshesB = await loadStepFixture(stepPathB);

    // Combine the meshes into a single list and give them unique IDs
    const combinedMeshes = [
      ...meshesA.map((mesh, index) => ({ ...mesh, id: `slot-a-${index}` })),
      ...meshesB.map((mesh, index) => ({ ...mesh, id: `slot-b-${index}` })),
    ];

    const groups = groupIdenticalMeshes(combinedMeshes);

    // These two slot plates differ only in the horizontal placement of their central slot.
    // This minor difference makes them look extremely similar in terms of vertex count and bounding box.
    // However, they are distinct physical parts. Their radial signatures differ beyond the allowable
    // outlier fraction (1%), which correctly prevents them from being grouped together.
    // We expect exactly 2 groups, each of size 1.
    expect(groups.length).toBe(2);
    const sortedSizes = groups.map((g) => g.meshIds.length).sort((a, b) => a - b);
    expect(sortedSizes).toEqual([1, 1]);
  });
});
