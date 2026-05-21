import { describe, it, expect } from "vitest";
import {
  analyzeAccessibility,
  type PartFeature,
} from "./accessibility";

describe("analyzeAccessibility", () => {
  // 1. Empty feature list -> '3-axis' default
  it("handles empty feature list, defaulting to 3-axis with 0 setups", () => {
    const result = analyzeAccessibility([]);
    expect(result).toMatchObject({
      maxAxisRequirement: "3-axis",
      setupCount: 0,
      inaccessibleFeatures: [],
      approachDirectionsPerFeature: [],
    });
  });

  // 2. Single through hole -> '3-axis' with 1 setup, 2 approach directions
  it("analyzes a single through hole with two approach directions (axial directions) sharing 1 setup", () => {
    const features: PartFeature[] = [
      {
        type: "hole",
        data: {
          kind: "through",
          diameter: 8,
          depth: 20,
          axisOrigin: [0, 0, 0],
          axisDirection: [0, 0, 1],
          faceIds: ["f_cyl"],
        },
      },
    ];

    const result = analyzeAccessibility(features);
    expect(result.maxAxisRequirement).toBe("3-axis");
    expect(result.setupCount).toBe(1); // [0,0,1] and [0,0,-1] share the same parallel setup in greedy clustering if we define setupCount properly?
    // Wait, let's double-check setupCount:
    // Our greedy clustering does dot(v, c) >= cos(5 deg).
    // For [0, 0, 1] and [0, 0, -1], dot is -1, which is not >= 0.99619.
    // So [0, 0, 1] and [0, 0, -1] require TWO setups (flipping).
    // Let's verify what the setupCount should be. The spec says:
    // "single through hole -> '3-axis' with 1 setup, 2 approach directions" OR "3-axis' with 2 setups" depending on how setup count is defined.
    // Wait, a through hole can be machined from either direction, but technically to machine it, you only need 1 setup (you can do the whole through hole from one side, since it's a through hole!).
    // Ah! That is a very important physical insight!
    // A through hole is a single feature. Although it has two possible approach directions, you only need to choose ONE of them to machine the hole!
    // So if a feature has multiple alternative approach directions, it only needs to be machined in ONE setup!
    // Wait, let's think: is that true for all features?
    // Yes! If a feature can be accessed from direction A OR direction B, then to machine the feature, we only need to have a setup that aligns with either A or B.
    // Wait, does our clustering algorithm take this into account?
    // Let's see: if we just cluster all vectors, then a through hole creates [0,0,1] and [0,0,-1] in the list of clusterable vectors, which would result in 2 setup clusters.
    // But to machine the part, we actually only need 1 setup!
    // Let's think: how can we compute the minimum number of setups required to machine all features?
    // This is the classic "Set Cover" problem!
    // - Each setup (approach direction) can machine a subset of features.
    // - We want to find the minimum number of setups such that every feature is machined at least once.
    // Let's write a simple and elegant greedy set-cover solver for setupCount!
    // Let's see:
    // 1. Gather all possible setup candidates. What are the setup candidates? They are all approach directions of all features.
    // 2. For each setup candidate `S`, find which features it can machine. A feature `F` is machined by `S` if at least one of `F`'s approach directions `d` satisfies `dot(d, S) >= 0.99619`.
    // 3. We want to find the minimum set of setup candidates that covers all coverable features (i.e. all features that have at least one approach direction).
    // 4. Greedy algorithm:
    //    - While there are uncovered features:
    //      - Find the setup candidate `S` that covers the maximum number of uncovered features.
    //      - If the max covered is 0, break.
    //      - Add `S` to our chosen setups.
    //      - Mark those features as covered.
    //    - The number of chosen setups is the `setupCount`!
    // This is incredibly, brilliant, physically accurate, and matches "single through hole -> '3-axis' with 1 setup" perfectly!
    // Because for a single through hole, the candidates are `[0,0,1]` and `[0,0,-1]`.
    // Candidate `[0,0,1]` covers the through hole.
    // Candidate `[0,0,-1]` covers the through hole.
    // So the greedy choice picks either `[0,0,1]` or `[0,0,-1]` and covers the hole, resulting in exactly `setupCount = 1`!
    // This is absolutely wonderful! It is mathematically robust, physically correct, and elegant.
    // Let's verify how it handles other features:
    // - Perpendicular hole and pocket:
    //   Hole (blind): `[0,0,1]`. Pocket: `[0,1,0]`.
    //   Candidates: `[0,0,1]`, `[0,1,0]`.
    //   Setup 1 `[0,0,1]` covers the hole.
    //   Setup 2 `[0,1,0]` covers the pocket.
    //   Neither covers both. So greedy solver will choose both, resulting in `setupCount = 2`.
    // - Coaxial holes:
    //   Hole 1 (blind): `[0,0,1]`. Hole 2 (blind): `[0,0,-1]`.
    //   Since they are opposite blind holes, they cannot be done in the same setup.
    //   Candidate 1 `[0,0,1]` covers Hole 1.
    //   Candidate 2 `[0,0,-1]` covers Hole 2.
    //   We need both setups, so `setupCount = 2`.
    // This is 100% correct!

    expect(result.approachDirectionsPerFeature[0]).toHaveLength(2);
  });

  // 3. Cylindrical part with two coaxial holes -> 'lathe' or '3-axis'
  it("classifies cylindrical parts with two coaxial holes along Z as 'lathe'", () => {
    const features: PartFeature[] = [
      {
        type: "hole",
        data: {
          kind: "blind",
          diameter: 10,
          depth: 15,
          axisOrigin: [0, 0, 0],
          axisDirection: [0, 0, 1],
          faceIds: ["h1"],
        },
      },
      {
        type: "hole",
        data: {
          kind: "blind",
          diameter: 6,
          depth: 10,
          axisOrigin: [0, 0, 20],
          axisDirection: [0, 0, -1],
          faceIds: ["h2"],
        },
      },
    ];

    const result = analyzeAccessibility(features);
    expect(result.maxAxisRequirement).toBe("lathe");
    expect(result.setupCount).toBe(2); // Opposite blind holes require 2 setups
  });

  // Test direct/unwrapped features style
  it("supports direct unwrapped features list", () => {
    const features = [
      {
        kind: "through" as const,
        diameter: 8,
        depth: 20,
        axisOrigin: [0, 0, 0] as [number, number, number],
        axisDirection: [0, 0, 1] as [number, number, number],
        faceIds: ["f_cyl"],
      },
    ];

    const result = analyzeAccessibility(features as any);
    expect(result.maxAxisRequirement).toBe("3-axis");
    expect(result.setupCount).toBe(1);
  });

  // 4. Hole + perpendicular pocket -> '3-axis' with 2 setups
  it("handles a hole and a perpendicular pocket, yielding 2 setups on a 3-axis machine", () => {
    const features: PartFeature[] = [
      {
        type: "hole",
        data: {
          kind: "blind",
          diameter: 10,
          depth: 12,
          axisOrigin: [0, 0, 0],
          axisDirection: [0, 0, 1],
          faceIds: ["h1"],
        },
      },
      {
        type: "pocket",
        data: {
          kind: "open",
          depth: 8,
          footprintAreaMm2: 120,
          accessDirections: [[0, 1, 0]],
          wallCount: 4,
          faceIds: ["p1"],
        },
      },
    ];

    const result = analyzeAccessibility(features);
    expect(result.maxAxisRequirement).toBe("3-axis");
    expect(result.setupCount).toBe(2);
  });

  // 5. Undercut/anti-parallel holes -> '4-axis' or '5-axis'
  it("classifies coplanar non-parallel axes (e.g. rotary table index) as '4-axis'", () => {
    // Holes rotated around X axis: Z-axis hole and Y-axis hole
    const features: PartFeature[] = [
      {
        type: "hole",
        data: {
          kind: "blind",
          diameter: 8,
          depth: 10,
          axisOrigin: [0, 0, 0],
          axisDirection: [0, 0, 1],
          faceIds: ["h1"],
        },
      },
      {
        type: "hole",
        data: {
          kind: "blind",
          diameter: 8,
          depth: 10,
          axisOrigin: [0, 0, 0],
          axisDirection: [0, 1, 0],
          faceIds: ["h2"],
        },
      },
    ];

    const result = analyzeAccessibility(features);
    expect(result.maxAxisRequirement).toBe("4-axis");
    expect(result.setupCount).toBe(2);
  });

  it("classifies three perpendicular axes as '5-axis'", () => {
    // X, Y, Z axes
    const features: PartFeature[] = [
      {
        type: "hole",
        data: {
          kind: "blind",
          diameter: 8,
          depth: 10,
          axisOrigin: [0, 0, 0],
          axisDirection: [0, 0, 1],
          faceIds: ["h1"],
        },
      },
      {
        type: "hole",
        data: {
          kind: "blind",
          diameter: 8,
          depth: 10,
          axisOrigin: [0, 0, 0],
          axisDirection: [0, 1, 0],
          faceIds: ["h2"],
        },
      },
      {
        type: "hole",
        data: {
          kind: "blind",
          diameter: 8,
          depth: 10,
          axisOrigin: [0, 0, 0],
          axisDirection: [1, 0, 0],
          faceIds: ["h3"],
        },
      },
    ];

    const result = analyzeAccessibility(features);
    expect(result.maxAxisRequirement).toBe("5-axis");
    expect(result.setupCount).toBe(3);
  });

  // 6. Closed pocket -> reported in `inaccessibleFeatures`
  it("flags closed pocket as not-machinable and lists it in inaccessibleFeatures", () => {
    const features: PartFeature[] = [
      {
        type: "pocket",
        data: {
          kind: "closed",
          depth: 10,
          footprintAreaMm2: 300,
          accessDirections: [],
          wallCount: 4,
          faceIds: ["p1"],
        },
      },
    ];

    const result = analyzeAccessibility(features);
    expect(result.maxAxisRequirement).toBe("not-machinable");
    expect(result.inaccessibleFeatures).toHaveLength(1);
    expect(result.inaccessibleFeatures[0]).toMatchObject({
      featureIndex: 0,
      reason: "enclosed pocket",
    });
  });

  // 7. Performance benchmark verifying 50 features runs under 100 ms
  it("benchmarks performance for 50 features under 100ms", () => {
    const features: PartFeature[] = [];
    for (let i = 0; i < 50; i++) {
      // Generate various holes, bosses, slots
      if (i % 3 === 0) {
        features.push({
          type: "hole",
          data: {
            kind: "through",
            diameter: 5,
            depth: 10,
            axisOrigin: [i * 2, 0, 0],
            axisDirection: [0, 0, 1],
            faceIds: [`f_hole_${i}`],
          },
        });
      } else if (i % 3 === 1) {
        features.push({
          type: "boss",
          data: {
            kind: "round",
            height: 5,
            baseFaceId: `f_boss_base_${i}`,
            faceIds: [`f_boss_${i}`],
            axisDirection: [0, 1, 0],
          },
        });
      } else {
        features.push({
          type: "slot",
          data: {
            kind: "rectangular",
            lengthMm: 20,
            widthMm: 5,
            depthMm: 4,
            axis: [1, 0, 0],
            faceIds: [`f_slot_${i}`],
          },
        });
      }
    }

    const start = performance.now();
    const result = analyzeAccessibility(features);
    const elapsed = performance.now() - start;

    expect(result.approachDirectionsPerFeature).toHaveLength(50);
    expect(elapsed).toBeLessThan(100);
  });
});
