import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getFeaturesForPart,
  replaceFeaturesForPart,
  countFeatures,
} from "./part_features";
import * as fallbackModule from "../browserFallback";
import type { PartFeatureInput } from "../schema";

const mockHole: PartFeatureInput = {
  featureType: "hole",
  featureData: {
    kind: "through",
    diameter: 6.0,
    depth: 12.0,
    axisOrigin: [0, 0, 0],
    axisDirection: [0, 0, 1],
    faceIds: ["face1"],
  },
  faceIds: ["face1"],
};

const mockPocket: PartFeatureInput = {
  featureType: "pocket",
  featureData: {
    kind: "closed",
    depth: 10.0,
    footprintAreaMm2: 150.0,
    accessDirections: [[0, 0, 1]],
    wallCount: 4,
    faceIds: ["face2", "face3"],
  },
  faceIds: ["face2", "face3"],
};

const mockSlot: PartFeatureInput = {
  featureType: "slot",
  featureData: {
    kind: "rounded",
    lengthMm: 30.0,
    widthMm: 10.0,
    depthMm: 8.0,
    axis: [1, 0, 0],
    faceIds: ["face4", "face5"],
  },
  faceIds: ["face4", "face5"],
};

const mockFillet: PartFeatureInput = {
  featureType: "fillet",
  featureData: {
    radius: 2.0,
    lengthMm: 45.0,
    adjacentFaceIds: ["face6", "face7"],
    concavity: "concave",
    faceIds: ["face8"],
  },
  faceIds: ["face8"],
};

const mockChamfer: PartFeatureInput = {
  featureType: "chamfer",
  featureData: {
    widthMm: 1.5,
    angleDeg: 45.0,
    lengthMm: 40.0,
    adjacentFaceIds: ["face9", "face10"],
    faceId: "face11",
  },
  faceIds: ["face11"],
};

const mockThread: PartFeatureInput = {
  featureType: "thread",
  featureData: {
    designation: "M6x1.0",
    pitch: 1.0,
    length: 15.0,
    gender: "internal",
    diameter: 5.0,
    faceIds: ["face12"],
  },
  faceIds: ["face12"],
};

const mockBoss: PartFeatureInput = {
  featureType: "boss",
  featureData: {
    kind: "round",
    height: 12.0,
    baseFaceId: "face13",
    faceIds: ["face14", "face15"],
    diameter: 20.0,
  },
  faceIds: ["face14", "face15"],
};

const allMockFeatures = [
  mockHole,
  mockPocket,
  mockSlot,
  mockFillet,
  mockChamfer,
  mockThread,
  mockBoss,
];

describe("part_features queries", () => {
  beforeEach(() => {
    // Clear localStorage to reset mock database state
    if (typeof window !== "undefined") {
      window.localStorage.clear();
    }
  });

  describe("Browser DB Fallback mode", () => {
    it("runs round-trip insert/read for each of the seven feature types", async () => {
      const partId = "part-123";

      // Insert features
      await replaceFeaturesForPart(partId, allMockFeatures);

      // Read features back
      const results = await getFeaturesForPart(partId);
      expect(results).toHaveLength(7);

      // Verify each type matches exactly
      for (const input of allMockFeatures) {
        const matching = results.find((r) => r.featureType === input.featureType);
        expect(matching).toBeDefined();
        expect(matching?.featureData).toEqual(input.featureData);
        expect(matching?.faceIds).toEqual(input.faceIds);
      }
    });

    it("replaceFeaturesForPart deletes existing features before inserting new ones", async () => {
      const partId = "part-999";

      // Insert initial features
      await replaceFeaturesForPart(partId, [mockHole, mockPocket]);
      let initialResults = await getFeaturesForPart(partId);
      expect(initialResults).toHaveLength(2);

      // Replace with new single feature
      await replaceFeaturesForPart(partId, [mockSlot]);
      let replacedResults = await getFeaturesForPart(partId);
      expect(replacedResults).toHaveLength(1);
      expect(replacedResults[0].featureType).toBe("slot");
    });

    it("countFeatures counts features properly, optionally filtering by type", async () => {
      const partId = "part-count-test";

      await replaceFeaturesForPart(partId, [mockHole, mockPocket, mockSlot, mockFillet]);

      const totalCount = await countFeatures(partId);
      expect(totalCount).toBe(4);

      const holeCount = await countFeatures(partId, "hole");
      expect(holeCount).toBe(1);

      const chamferCount = await countFeatures(partId, "chamfer");
      expect(chamferCount).toBe(0);
    });
  });

  describe("SQL Drizzle client mode (mocked db)", () => {
    it("delegates to the custom passed-in db object correctly", async () => {
      const spy = vi
        .spyOn(fallbackModule, "isBrowserDbFallback")
        .mockReturnValue(false);

      const mockDb = {
        delete: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({}),
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        transaction: vi.fn(async (cb) => cb(mockDb)),
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue([]),
      };

      const partId = "part-drizzle";

      // Run replace with custom db object
      await replaceFeaturesForPart(partId, [mockHole], mockDb);

      expect(mockDb.delete).toHaveBeenCalled();
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.values).toHaveBeenCalled();
      expect(mockDb.run).toHaveBeenCalled();

      // Run get with custom db object
      await getFeaturesForPart(partId, mockDb);
      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.from).toHaveBeenCalled();
      expect(mockDb.all).toHaveBeenCalled();

      // Run count with custom db object
      await countFeatures(partId, undefined, mockDb);
      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.from).toHaveBeenCalled();
      expect(mockDb.all).toHaveBeenCalled();

      spy.mockRestore();
    });
  });
});
