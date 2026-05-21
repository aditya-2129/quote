import type { Hole } from "../features/holes";
import type { Pocket } from "../features/pockets";
import type { Slot } from "../features/slots";
import type { Fillet } from "../features/fillets";
import type { Chamfer } from "../features/chamfers";
import type { Thread } from "../features/threads";
import type { Boss } from "../features/bosses";

export type PartFeature =
  | { type: "hole"; data: Hole }
  | { type: "pocket"; data: Pocket }
  | { type: "slot"; data: Slot }
  | { type: "fillet"; data: Fillet }
  | { type: "chamfer"; data: Chamfer }
  | { type: "thread"; data: Thread }
  | { type: "boss"; data: Boss };

export interface PartAccessibility {
  maxAxisRequirement: 'lathe' | '3-axis' | '4-axis' | '5-axis' | 'mill-turn' | 'not-machinable';
  setupCount: number;
  inaccessibleFeatures: { featureIndex: number; reason: string }[];
  approachDirectionsPerFeature: Vec3[][];
}

type Vec3 = [number, number, number];

// Vector helper functions
function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function scale(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

function length(v: Vec3): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

function normalize(v: Vec3): Vec3 {
  const n = length(v);
  if (n === 0) return [0, 0, 1];
  return [v[0] / n, v[1] / n, v[2] / n];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/**
 * Normalizes a list of features to support both wrapped `{ type, data }` and direct `{ kind, ... }` union styles.
 */
function normalizeFeature(feat: any): { type: string; data: any } | null {
  if (!feat || typeof feat !== "object") return null;

  if ("type" in feat && "data" in feat) {
    return { type: feat.type, data: feat.data };
  }

  // Direct union style: guess the type from the object's unique properties
  let guessedType = "";
  if ("designation" in feat || "gender" in feat || "pitch" in feat) {
    guessedType = "thread";
  } else if ("angleDeg" in feat) {
    guessedType = "chamfer";
  } else if ("concavity" in feat) {
    guessedType = "fillet";
  } else if ("baseFaceId" in feat || "height" in feat) {
    guessedType = "boss";
  } else if (
    "axisDirection" in feat ||
    (typeof feat.kind === "string" && ["through", "blind", "counterbore", "countersink"].includes(feat.kind))
  ) {
    guessedType = "hole";
  } else if ("footprintAreaMm2" in feat || "accessDirections" in feat || "wallCount" in feat) {
    guessedType = "pocket";
  } else if ("lengthMm" in feat || "widthMm" in feat || "depthMm" in feat || "axis" in feat) {
    guessedType = "slot";
  }

  if (guessedType) {
    return { type: guessedType, data: feat };
  }

  return null;
}

/**
 * Infers the open tool-approach direction perpendicular to a slot's length axis,
 * using other features in the part or coordinate axes.
 */
function inferSlotAboveDirection(slotAxis: Vec3, normalizedFeatures: { type: string; data: any }[]): Vec3 {
  const slotAxisNorm = normalize(slotAxis);

  // Try to find another feature that is perpendicular to the slot axis and use its access direction
  for (const feat of normalizedFeatures) {
    let possibleAccess: Vec3 | null = null;
    if (feat.type === "pocket" && feat.data.accessDirections && feat.data.accessDirections.length > 0) {
      possibleAccess = feat.data.accessDirections[0];
    } else if (feat.type === "hole" && feat.data.axisDirection) {
      possibleAccess = feat.data.axisDirection;
    } else if (feat.type === "boss" && feat.data.axisDirection) {
      possibleAccess = feat.data.axisDirection;
    }

    if (possibleAccess) {
      const normAccess = normalize(possibleAccess);
      // Perpendicular check: angle ~ 90 deg (dot product ~ 0)
      if (Math.abs(dot(slotAxisNorm, normAccess)) < 0.05) {
        return normAccess;
      }
    }
  }

  // Fallback: use coordinate axes
  // If slot axis is not parallel to Z, Z-axis is a good candidate for "above"
  if (Math.abs(slotAxisNorm[2]) < 0.95) {
    const z: Vec3 = [0, 0, 1];
    const d = dot(z, slotAxisNorm);
    const proj: Vec3 = [
      z[0] - d * slotAxisNorm[0],
      z[1] - d * slotAxisNorm[1],
      z[2] - d * slotAxisNorm[2],
    ];
    return normalize(proj);
  } else {
    // Slot axis is parallel to Z, so X-axis is a good choice for "above"
    const x: Vec3 = [1, 0, 0];
    const d = dot(x, slotAxisNorm);
    const proj: Vec3 = [
      x[0] - d * slotAxisNorm[0],
      x[1] - d * slotAxisNorm[1],
      x[2] - d * slotAxisNorm[2],
    ];
    return normalize(proj);
  }
}

/**
 * Computes manufacturing accessibility for a CAD part based on its detected BREP features.
 */
export function analyzeAccessibility(features: PartFeature[]): PartAccessibility {
  const normalizedFeatures = features
    .map(normalizeFeature)
    .filter((f): f is { type: string; data: any } => f !== null);

  const inaccessibleFeatures: { featureIndex: number; reason: string }[] = [];
  const approachDirectionsPerFeature: Vec3[][] = [];
  const clusterableVectors: Vec3[] = [];
  
  // Keep track of non-fillet/non-chamfer approach directions for fillet/chamfer fallback hints
  const nonHintApproaches: Vec3[] = [];

  // Phase 1: Extract approach directions and reachability
  for (let i = 0; i < normalizedFeatures.length; i++) {
    const feat = normalizedFeatures[i];
    const { type, data } = feat;
    let directions: Vec3[] = [];
    let shouldCluster = true;

    if (type === "hole") {
      const axis = normalize(data.axisDirection || [0, 0, 1]);
      if (data.kind === "through") {
        directions = [axis, scale(axis, -1)];
      } else {
        // blind, counterbore, countersink approached from the open end
        directions = [axis];
      }
    } else if (type === "pocket") {
      if (data.kind === "closed") {
        inaccessibleFeatures.push({
          featureIndex: i,
          reason: "enclosed pocket",
        });
        shouldCluster = false;
      } else if (!data.accessDirections || data.accessDirections.length === 0) {
        inaccessibleFeatures.push({
          featureIndex: i,
          reason: "no accessible approach direction",
        });
        shouldCluster = false;
      } else {
        directions = data.accessDirections.map((v: Vec3) => normalize(v));
      }
    } else if (type === "slot") {
      if (data.depthMm <= 0) {
        inaccessibleFeatures.push({
          featureIndex: i,
          reason: "enclosed slot",
        });
        shouldCluster = false;
      } else {
        const slotAxis = normalize(data.axis || [1, 0, 0]);
        const aboveDir = inferSlotAboveDirection(slotAxis, normalizedFeatures);
        // Approach from above (inverse floor normal), and along length ends
        directions = [aboveDir, slotAxis, scale(slotAxis, -1)];
      }
    } else if (type === "thread") {
      // Find parent hole axis
      let threadAxis: Vec3 | null = null;
      let parentHoleKind = "blind";
      
      const parentHole = normalizedFeatures.find(
        (f) =>
          f.type === "hole" &&
          f.data.faceIds &&
          f.data.faceIds.some((id: string) => data.faceIds && data.faceIds.includes(id))
      );

      if (parentHole) {
        threadAxis = normalize(parentHole.data.axisDirection);
        parentHoleKind = parentHole.data.kind;
      } else if (data.axisDirection) {
        threadAxis = normalize(data.axisDirection);
      }

      if (threadAxis) {
        if (parentHoleKind === "through" || data.isThrough) {
          directions = [threadAxis, scale(threadAxis, -1)];
        } else {
          directions = [threadAxis];
        }
      } else {
        directions = [[0, 0, 1]];
      }
    } else if (type === "boss") {
      const axis = normalize(data.axisDirection || [0, 0, 1]);
      directions = [axis];
    } else if (type === "fillet" || type === "chamfer") {
      // Fillets and chamfers are hints and are excluded from clustering
      shouldCluster = false;
      
      if (data.adjacentFaceNormals && data.adjacentFaceNormals.length > 0) {
        directions = data.adjacentFaceNormals.map((v: Vec3) => normalize(v));
      } else if (data.normals && data.normals.length > 0) {
        directions = data.normals.map((v: Vec3) => normalize(v));
      } else {
        // Fallback placeholder will be filled in a second pass when all non-hint approaches are resolved
      }
    }

    approachDirectionsPerFeature.push(directions);

    if (shouldCluster) {
      clusterableVectors.push(...directions);
      nonHintApproaches.push(...directions);
    }
  }

  // Second pass: Populate fillets/chamfers that had no explicit normals with fallback hints
  const uniqueNonHintApproaches = Array.from(
    new Map(nonHintApproaches.map((v) => [v.join(","), v])).values()
  );

  for (let i = 0; i < normalizedFeatures.length; i++) {
    const feat = normalizedFeatures[i];
    if (feat.type === "fillet" || feat.type === "chamfer") {
      if (approachDirectionsPerFeature[i].length === 0) {
        if (uniqueNonHintApproaches.length > 0) {
          approachDirectionsPerFeature[i] = [...uniqueNonHintApproaches];
        } else {
          // Absolute fallback
          approachDirectionsPerFeature[i] = [
            [0, 0, 1],
            [0, 1, 0],
            [1, 0, 0],
            [0, 0, -1],
            [0, -1, 0],
            [-1, 0, 0],
          ];
        }
      }
    }
  }

  // Phase 2: Setup Grouping / Clustering (Greedy Set Cover for minimum setups)
  interface ClusterableFeatureInfo {
    featureIndex: number;
    directions: Vec3[];
  }

  const clusterableFeatures: ClusterableFeatureInfo[] = [];
  const allCandidates: Vec3[] = [];

  for (let i = 0; i < normalizedFeatures.length; i++) {
    const feat = normalizedFeatures[i];
    const { type } = feat;
    const isClusterable = type === "hole" || type === "pocket" || type === "slot" || type === "thread" || type === "boss";
    const dirs = approachDirectionsPerFeature[i];
    const isAccessible = !inaccessibleFeatures.some(inf => inf.featureIndex === i);

    if (isClusterable && isAccessible && dirs.length > 0) {
      clusterableFeatures.push({ featureIndex: i, directions: dirs });
      allCandidates.push(...dirs);
    }
  }

  // Find unique candidates to reduce redundancy
  const candidates: Vec3[] = [];
  for (const c of allCandidates) {
    let matched = false;
    for (const existing of candidates) {
      if (dot(c, existing) >= 0.99619) {
        matched = true;
        break;
      }
    }
    if (!matched) {
      candidates.push(c);
    }
  }

  const chosenSetups: Vec3[] = [];
  const uncovered = new Set(clusterableFeatures.map(f => f.featureIndex));

  while (uncovered.size > 0) {
    let bestCandidate: Vec3 | null = null;
    let maxCoveredCount = -1;
    let bestCoveredIndices: number[] = [];

    for (const c of candidates) {
      const covered: number[] = [];
      for (const feat of clusterableFeatures) {
        if (uncovered.has(feat.featureIndex)) {
          const isCovered = feat.directions.some(d => dot(d, c) >= 0.99619);
          if (isCovered) {
            covered.push(feat.featureIndex);
          }
        }
      }

      if (covered.length > maxCoveredCount) {
        maxCoveredCount = covered.length;
        bestCandidate = c;
        bestCoveredIndices = covered;
      }
    }

    if (!bestCandidate || maxCoveredCount <= 0) {
      break;
    }

    chosenSetups.push(bestCandidate);
    for (const idx of bestCoveredIndices) {
      uncovered.delete(idx);
    }
  }

  const setupCount = chosenSetups.length;

  // Phase 3: Axis Requirement Classification
  let maxAxisRequirement: PartAccessibility["maxAxisRequirement"];

  if (inaccessibleFeatures.length > 0) {
    maxAxisRequirement = "not-machinable";
  } else if (normalizedFeatures.length === 0) {
    maxAxisRequirement = "3-axis";
  } else {
    // Group all approach vectors into parallel axis lines
    // Two vectors lie on the same axis line if Math.abs(dot(u, v)) >= 0.99619
    const axisLines: Vec3[] = [];
    for (const v of clusterableVectors) {
      let matched = false;
      for (const axis of axisLines) {
        if (Math.abs(dot(v, axis)) >= 0.99619) {
          matched = true;
          break;
        }
      }
      if (!matched) {
        axisLines.push(v);
      }
    }

    const uniqueAxisLineCount = axisLines.length;

    // 1. Group all lathe-symmetric features (holes, threads, round bosses) by their axis line to detect lathe suitability
    const coaxialGroups = new Map<string, { axis: Vec3; count: number }>();
    for (const feat of normalizedFeatures) {
      if (feat.type === "hole" || feat.type === "thread" || (feat.type === "boss" && feat.data.kind === "round")) {
        let axis: Vec3 = [0, 0, 1];
        if (feat.type === "hole") {
          axis = normalize(feat.data.axisDirection);
        } else if (feat.type === "boss") {
          axis = normalize(feat.data.axisDirection || [0, 0, 1]);
        }
        
        let found = false;
        for (const group of coaxialGroups.values()) {
          if (Math.abs(dot(axis, group.axis)) >= 0.99619) {
            group.count++;
            found = true;
            break;
          }
        }
        if (!found) {
          coaxialGroups.set(axis.join(","), { axis, count: 1 });
        }
      }
    }

    let hasLatheSymmetry = false;
    let primaryAxis: Vec3 = [0, 0, 1];
    const roundBosses = normalizedFeatures.filter(f => f.type === "boss" && f.data.kind === "round");
    for (const group of coaxialGroups.values()) {
      if (group.count >= 2 || roundBosses.length > 0) {
        hasLatheSymmetry = true;
        primaryAxis = group.axis;
        break;
      }
    }

    const hasMillingOnlyFeatures = normalizedFeatures.some(
      (f) => f.type === "pocket" || f.type === "slot" || (f.type === "boss" && f.data.kind === "rectangular")
    );

    // 2. Check if all approach vectors are parallel or perpendicular to each other
    let allOrthogonal = true;
    for (let i = 0; i < clusterableVectors.length; i++) {
      for (let j = i + 1; j < clusterableVectors.length; j++) {
        const d = Math.abs(dot(clusterableVectors[i], clusterableVectors[j]));
        // Must be either parallel (d >= 0.99619) or perpendicular (d <= 0.05)
        if (d < 0.99619 && d > 0.05) {
          allOrthogonal = false;
          break;
        }
      }
      if (!allOrthogonal) break;
    }

    // 3. Check coplanarity for non-parallel axis lines
    let isCoplanar = false;
    if (uniqueAxisLineCount === 2) {
      isCoplanar = true;
    } else if (uniqueAxisLineCount > 2) {
      const a0 = axisLines[0];
      let a1: Vec3 | null = null;
      for (let k = 1; k < axisLines.length; k++) {
        if (Math.abs(dot(a0, axisLines[k])) < 0.99619) {
          a1 = axisLines[k];
          break;
        }
      }

      if (a1) {
        const R = normalize(cross(a0, a1));
        isCoplanar = axisLines.every((axis) => Math.abs(dot(axis, R)) < 0.05);
      } else {
        isCoplanar = true;
      }
    }

    // 4. Now classify axis requirement
    if (uniqueAxisLineCount <= 1 && hasLatheSymmetry && !hasMillingOnlyFeatures) {
      maxAxisRequirement = "lathe";
    } else {
      // Check Mill-Turn
      let isMillTurn = false;
      if (hasLatheSymmetry) {
        const hasCrossAxisFeature = clusterableVectors.some((v) => {
          return Math.abs(dot(v, primaryAxis)) < 0.05; // perpendicular approach
        });
        if (hasCrossAxisFeature) {
          isMillTurn = true;
        }
      }

      if (isMillTurn) {
        maxAxisRequirement = "mill-turn";
      } else if (uniqueAxisLineCount <= 1) {
        maxAxisRequirement = "3-axis";
      } else {
        // If they are all orthogonal, can we do it on a 3-axis machine with setups?
        // Yes, if we have milling features, it's a standard multi-sided 3-axis part!
        // But if it's purely holes (e.g. radial holes in a block), or not orthogonal, it's N-axis.
        const hasMilling = normalizedFeatures.some(f => f.type === "pocket" || f.type === "slot");
        if (hasMilling && allOrthogonal) {
          maxAxisRequirement = "3-axis";
        } else if (isCoplanar) {
          maxAxisRequirement = "4-axis";
        } else {
          maxAxisRequirement = "5-axis";
        }
      }
    }
  }

  return {
    maxAxisRequirement,
    setupCount,
    inaccessibleFeatures,
    approachDirectionsPerFeature,
  };
}
