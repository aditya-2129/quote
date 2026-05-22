import * as THREE from "three";
import {
  findFacesByClass,
  type FaceClass,
  type TopologyGraph,
} from "./topology";

export type ShapeAnalysis =
  | {
      kind: "cylinder";
      outerDiaMm: number;
      innerDiaMm: number | null;
      lengthMm: number;
    }
  | { kind: "hex"; afMm: number; lengthMm: number }
  | { kind: "box"; xMm: number; yMm: number; zMm: number }
  | { kind: "complex"; xMm: number; yMm: number; zMm: number };

type StockConfidence = "high" | "medium" | "low";

// Raw material blank a body should be cut from. This is inferred from the body
// envelope, NOT from finished-part complexity: a body with bores, pockets, or
// other machined features can still be round/hex/rect raw stock.
export type RawStockAnalysis =
  | {
      shape: "round";
      dims: { D: number; L: number };
      confidence: StockConfidence;
      reason: string;
    }
  | {
      shape: "hex";
      dims: { AF: number; L: number };
      confidence: StockConfidence;
      reason: string;
    }
  | {
      shape: "rect";
      dims: { L: number; W: number; H: number };
      confidence: StockConfidence;
      reason: string;
    }
  | {
      shape: "unknown";
      dims: { xMm: number; yMm: number; zMm: number };
      confidence: "low";
      reason: string;
    };

// Two independent answers for a CAD body: what blank to buy (rawStock) and what
// the imported body looks like after machining (finishedBody). These must not
// fight each other — a "complex" finished body can have rect or round raw stock.
export type CadBodyAnalysis = {
  envelope: { xMm: number; yMm: number; zMm: number };
  rawStock: RawStockAnalysis;
  finishedBody: ShapeAnalysis;
};

type TriangleData = {
  n: [number, number, number]; // unit normal (x, y, z)
  c: [number, number, number]; // centroid relative to bbCenter (x, y, z)
  area: number;
};

type SideFace = {
  angle: number; // normal direction in cross-section plane (atan2)
  perpDist: number; // signed perpendicular distance from axis to face plane along normal
  area: number;
};

const PI2 = Math.PI * 2;
const AXIS_KEYS = ["x", "y", "z"] as const;
type AxisKey = (typeof AXIS_KEYS)[number];
type AxisIdx = 0 | 1 | 2;

function axisIdx(k: AxisKey): AxisIdx {
  return (k === "x" ? 0 : k === "y" ? 1 : 2) as AxisIdx;
}

export type MeshStats = {
  volumeMm3: number;
  surfaceAreaMm2: number;
  boundingBoxMm: { x: number; y: number; z: number };
  vertexCount: number;
  triangleCount: number;
};

export function computeMeshStats(geo: THREE.BufferGeometry): MeshStats {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const size = new THREE.Vector3();
  bb.getSize(size);

  const pos = geo.attributes.position;
  const idx = geo.index;
  const triCount = pos
    ? idx
      ? Math.floor(idx.count / 3)
      : Math.floor(pos.count / 3)
    : 0;

  let surfaceAreaMm2 = 0;
  let volumeMm3 = 0;

  const v0 = new THREE.Vector3();
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const cross = new THREE.Vector3();

  for (let t = 0; t < triCount; t++) {
    const a = idx ? idx.getX(t * 3) : t * 3;
    const b = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
    const c = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
    v0.fromBufferAttribute(pos, a);
    v1.fromBufferAttribute(pos, b);
    v2.fromBufferAttribute(pos, c);
    cross.crossVectors(v1.clone().sub(v0), v2.clone().sub(v0));
    surfaceAreaMm2 += cross.length() * 0.5;
    // Signed volume contribution via divergence theorem
    volumeMm3 += v0.dot(v1.clone().cross(v2)) / 6;
  }

  return {
    volumeMm3: Math.abs(volumeMm3),
    surfaceAreaMm2,
    boundingBoxMm: { x: size.x, y: size.y, z: size.z },
    vertexCount: pos?.count ?? 0,
    triangleCount: triCount,
  };
}

// Minimum fraction of total surface area that must be axis-aligned planar
// faces for a body to classify as "box". Bodies below this threshold that
// also fail cylinder/hex become "complex".
// Empirical: genuine boxes ≥ 90.9%, complex tooling parts ≤ 73.0%.
const BOX_PLANARITY_MIN = 0.80;

// Cosine of the maximum angular deviation from a principal axis for a
// triangle to count as axis-aligned (15° → cos ≈ 0.966).
const AXIS_ALIGN_COS = Math.cos((15 * Math.PI) / 180);

// Minimum side triangles needed to classify a prismatic body. A simple hex bar
// can arrive from OCCT with only two triangles per side face, so this must be
// low enough to recognize genuine planar prisms instead of calling them complex.
const PRISM_SIDE_TRIANGLE_MIN = 6;

// Tight-fit ratio: outer diameter must be at least this fraction of the smaller
// bbox cross-section dim for a body to claim whole-body cylinder under the
// default rule. A clean shaft, tube, or coin-stock disc satisfies this trivially.
const CYLINDER_TIGHT_FIT_MIN = 0.85;

// Absolute lower-bound on outer-diameter / minCross. Bodies below this are
// definitely not cylinders — the detected radius is a feature, not the body.
const CYLINDER_ABSOLUTE_FLOOR = 0.50;

// Long-shaft exception: a stepped shaft has the median radius below the bbox
// (the bbox tracks the largest step) but is still a true cylindrical body.
// Allow ratio ≥ ABSOLUTE_FLOOR when length/diameter is at least this large.
const CYLINDER_LONG_SHAFT_LD_MIN = 3.0;

// Maximum ratio of the longer to shorter cross-section bbox dimension allowed
// before the cross-section is considered too non-circular to claim cylinder.
const CYLINDER_CROSS_CIRCULARITY_MAX = 1.25;

// Raw round stock should be inferred from the body envelope, not from a bore,
// groove, or other cylindrical feature. This tighter ratio is for the envelope
// cross-section itself: two nearly equal bbox dimensions imply a round blank
// candidate when the side normals also show circular coverage.
const RAW_CYLINDER_ENVELOPE_CIRCULARITY_MAX = 1.03;

// Maximum distinct internal cylindrical-feature clusters a true cylinder body
// can contain. 0 = solid shaft, 1 = single concentric bore (tube / drilled
// shaft). ≥2 implies a complex/tooling body, not stock.
const CYLINDER_MAX_INNER_CLUSTERS = 1;

export function analyzeShape(
  geo: THREE.BufferGeometry,
  topology?: TopologyGraph,
): ShapeAnalysis {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const size = new THREE.Vector3();
  bb.getSize(size);
  const bbCenter = new THREE.Vector3();
  bb.getCenter(bbCenter);

  const sizeArr: [number, number, number] = [size.x, size.y, size.z];
  const complexFallback: ShapeAnalysis = {
    kind: "complex",
    xMm: size.x,
    yMm: size.y,
    zMm: size.z,
  };
  const topologyResult = analyzeTopologyShape(topology, size);
  if (topologyResult) {
    console.debug("[shapeAnalysis] path=topology");
    return topologyResult;
  }
  console.debug("[shapeAnalysis] path=mesh");

  const pos = geo.attributes.position;
  const idx = geo.index;
  if (!pos || pos.count === 0) return complexFallback;
  const triCount = idx ? Math.floor(idx.count / 3) : Math.floor(pos.count / 3);
  if (triCount < 8) return complexFallback;

  const tris = extractTriangleData(pos, idx, triCount, bbCenter);
  if (tris.length < 8) return complexFallback;

  // Try each axis as the candidate main (cylinder/hex) axis; pick the best classification.
  // Important: a flat disc's cylinder axis is the SHORTEST dim, not the longest, so we
  // can't shortcut by picking the longest bbox dim — we evaluate all three.
  let bestResult: ShapeAnalysis = complexFallback;
  let bestScore = 0;

  for (const mainKey of AXIS_KEYS) {
    const mAx = axisIdx(mainKey);
    const [u1Key, u2Key] =
      mainKey === "x"
        ? (["y", "z"] as const)
        : mainKey === "y"
          ? (["x", "z"] as const)
          : (["x", "y"] as const);
    const u1 = axisIdx(u1Key);
    const u2 = axisIdx(u2Key);

    const minCross = Math.min(sizeArr[u1], sizeArr[u2]);
    const maxCross = Math.max(sizeArr[u1], sizeArr[u2]);

    const sides = collectSideFaces(tris, mAx, u1, u2);
    if (sides.length < PRISM_SIDE_TRIANGLE_MIN) continue;

    const rawCylinder = classifyEnvelopeCylinder(
      sides,
      sizeArr[mAx],
      minCross,
      maxCross,
    );
    if (rawCylinder) return rawCylinder;

    const result = classifyFromSides(sides, sizeArr[mAx], minCross, maxCross);
    if (!result) continue;

    const score = scoreResult(result, sides.length);
    if (score > bestScore) {
      bestScore = score;
      bestResult = result;
    }
  }

  // No cylinder/hex found — check if body is genuinely box-like.
  if (bestScore === 0 && isBoxLike(tris)) {
    return { kind: "box", xMm: size.x, yMm: size.y, zMm: size.z };
  }

  return bestResult;
}

// Smallest envelope extent (mm) below which a body is treated as degenerate.
const RAW_STOCK_DEGENERATE_MIN_MM = 1e-4;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function crossAxisKeys(mainKey: AxisKey): readonly [AxisKey, AxisKey] {
  return mainKey === "x"
    ? (["y", "z"] as const)
    : mainKey === "y"
      ? (["x", "z"] as const)
      : (["x", "y"] as const);
}

/**
 * Two independent answers for a CAD body. `rawStock` is the blank to buy,
 * derived from the envelope; `finishedBody` is the machined-part classification
 * from `analyzeShape`. The two are computed separately so finished-part
 * complexity never suppresses a correct raw-stock shape.
 */
export function analyzeCadBody(
  geo: THREE.BufferGeometry,
  topology?: TopologyGraph,
): CadBodyAnalysis {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const size = new THREE.Vector3();
  bb.getSize(size);
  return {
    envelope: { xMm: size.x, yMm: size.y, zMm: size.z },
    rawStock: analyzeRawStock(geo, topology),
    finishedBody: analyzeShape(geo, topology),
  };
}

/**
 * Infers the raw material blank from the body envelope. Independent of
 * finished-part features: a body with bores/pockets/grooves can still be
 * round, hex, or rect raw stock. Returns `unknown` only when the envelope
 * itself is degenerate.
 */
export function analyzeRawStock(
  geo: THREE.BufferGeometry,
  topology?: TopologyGraph,
): RawStockAnalysis {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const size = new THREE.Vector3();
  bb.getSize(size);
  const sizeArr: [number, number, number] = [size.x, size.y, size.z];

  if (
    sizeArr.some(
      (d) => !Number.isFinite(d) || d < RAW_STOCK_DEGENERATE_MIN_MM,
    )
  ) {
    return {
      shape: "unknown",
      dims: { xMm: size.x, yMm: size.y, zMm: size.z },
      confidence: "low",
      reason: "Degenerate or invalid bounding box; cannot infer raw stock.",
    };
  }

  const round = detectRoundRawStock(geo, topology, sizeArr);
  if (round) return round;

  // Hex reuses the finished-body classifier's six-side-plane detection. A hex
  // bar/nut/standoff is a hex blank, so a hex finished body implies hex stock.
  const finished = analyzeShape(geo, topology);
  if (finished.kind === "hex") {
    return {
      shape: "hex",
      dims: { AF: round2(finished.afMm), L: round2(finished.lengthMm) },
      confidence: topology ? "high" : "medium",
      reason: "Six evenly-spaced side planes; hex bar stock.",
    };
  }

  // Default solid stock: rectangular envelope, dims sorted L ≥ W ≥ H.
  const sorted = [...sizeArr].sort((a, b) => b - a);
  return {
    shape: "rect",
    dims: {
      L: round2(sorted[0]),
      W: round2(sorted[1]),
      H: round2(sorted[2]),
    },
    confidence: "high",
    reason:
      finished.kind === "complex"
        ? "Rectangular envelope; finished body has machined features but the blank is a block."
        : "Rectangular envelope; no round or hex side coverage.",
  };
}

function detectRoundRawStock(
  geo: THREE.BufferGeometry,
  topology: TopologyGraph | undefined,
  sizeArr: [number, number, number],
): RawStockAnalysis | null {
  for (const lenKey of AXIS_KEYS) {
    const lenIdx = axisIdx(lenKey);
    const [u1Key, u2Key] = crossAxisKeys(lenKey);
    const u1 = axisIdx(u1Key);
    const u2 = axisIdx(u2Key);
    const minC = Math.min(sizeArr[u1], sizeArr[u2]);
    const maxC = Math.max(sizeArr[u1], sizeArr[u2]);
    if (minC < RAW_STOCK_DEGENERATE_MIN_MM) continue;
    // Round candidate: the two cross-section extents must be nearly equal.
    if (maxC / minC > RAW_CYLINDER_ENVELOPE_CIRCULARITY_MAX) continue;

    const evidence = roundEvidence(geo, topology, lenIdx, u1, u2, maxC);
    if (!evidence) continue;

    // Project mesh vertices onto the cross-section plane (u1, u2)
    const pos = geo.attributes.position;
    if (!pos) continue;

    const uniquePoints: Point2D[] = [];
    const seen = new Set<string>();
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const valU1 = u1 === 0 ? v.x : u1 === 1 ? v.y : v.z;
      const valU2 = u2 === 0 ? v.x : u2 === 1 ? v.y : v.z;
      // Round to 3 decimal places (0.001 mm) for deduplication
      const key = `${Math.round(valU1 * 1000)},${Math.round(valU2 * 1000)}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniquePoints.push({ x: valU1, y: valU2 });
      }
    }

    const circle = getMinEnclosingCircle(uniquePoints);
    const enclosingCircleDiameter = circle.r * 2;
    const reason = `${evidence.reason} Diameter computed from full projected geometry containment.`;

    return {
      shape: "round",
      dims: { D: round2(enclosingCircleDiameter), L: round2(sizeArr[lenIdx]) },
      confidence: evidence.confidence,
      reason,
    };
  }
  return null;
}

// A near-square envelope cross-section is necessary but not sufficient for round
// stock — a square block also has equal cross-section extents. Round stock must
// also show circular side coverage (mesh) or a spanning cylindrical face
// (topology) around the length axis.
function roundEvidence(
  geo: THREE.BufferGeometry,
  topology: TopologyGraph | undefined,
  lenIdx: AxisIdx,
  u1: AxisIdx,
  u2: AxisIdx,
  envelopeDiaMm: number,
): { confidence: StockConfidence; reason: string } | null {
  if (topology && topologyHasSpanningCylinder(topology, lenIdx, envelopeDiaMm)) {
    return {
      confidence: "high",
      reason: "Outer cylindrical face spans the envelope diameter.",
    };
  }
  if (meshHasCircularCoverage(geo, lenIdx, u1, u2)) {
    return {
      confidence: "medium",
      reason: "Circular side-face coverage around the length axis.",
    };
  }
  return null;
}

function topologyHasSpanningCylinder(
  topology: TopologyGraph,
  lenIdx: AxisIdx,
  envelopeDiaMm: number,
): boolean {
  for (const cyl of findFacesByClass(topology, "cylinder")) {
    if (cyl.radius <= 0) continue;
    if (Math.abs(cyl.axisDirection[lenIdx]) < 0.9) continue;
    if (Math.abs(cyl.radius * 2 - envelopeDiaMm) <= envelopeDiaMm * 0.1)
      return true;
  }
  return false;
}

function meshHasCircularCoverage(
  geo: THREE.BufferGeometry,
  lenIdx: AxisIdx,
  u1: AxisIdx,
  u2: AxisIdx,
): boolean {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const bbCenter = new THREE.Vector3();
  bb.getCenter(bbCenter);

  const pos = geo.attributes.position;
  const idx = geo.index;
  if (!pos || pos.count === 0) return false;
  const triCount = idx ? Math.floor(idx.count / 3) : Math.floor(pos.count / 3);
  if (triCount < 8) return false;

  const tris = extractTriangleData(pos, idx, triCount, bbCenter);
  if (tris.length < 8) return false;

  const sides = collectSideFaces(tris, lenIdx, u1, u2);
  if (sides.length < PRISM_SIDE_TRIANGLE_MIN) return false;
  return hasCircularSideCoverage(sides);
}

function analyzeTopologyShape(
  topology: TopologyGraph | undefined,
  bbSize: THREE.Vector3,
): ShapeAnalysis | null {
  if (!topology) return null;

  let hasFeatureCylinders = false;

  const cylinders = findFacesByClass(topology, "cylinder")
    .filter((face) => face.radius > 0)
    .sort((a, b) => cylinderScore(b) - cylinderScore(a));
  if (cylinders.length > 0) {
    const dominant = cylinders[0];

    // Conservative: the dominant cylinder must span the body, not just be a feature.
    const [c1, c2] = bbCrossSectionDims(bbSize, dominant.axisDirection);
    const minCross = Math.min(c1, c2);
    const maxCross = Math.max(c1, c2);
    const dominantDia = dominant.radius * 2;
    const lengthMm = dominant.length && dominant.length > 0 ? dominant.length : 0;
    const crossIsCircular = maxCross / minCross <= CYLINDER_CROSS_CIRCULARITY_MAX;
    const fillRatio = dominantDia / minCross;
    const ld = lengthMm > 0 && dominantDia > 0 ? lengthMm / dominantDia : 0;
    const fillsBody =
      fillRatio >= CYLINDER_TIGHT_FIT_MIN ||
      (fillRatio >= CYLINDER_ABSOLUTE_FLOOR && ld >= CYLINDER_LONG_SHAFT_LD_MIN);

    // Count distinct internal cylindrical-feature radii. A true cylinder body
    // has at most one concentric bore.
    const internalCylinders = cylinders
      .slice(1)
      .filter((face) => face.radius < dominant.radius * 0.95);
    const distinctInnerRadii = countDistinctRadii(
      internalCylinders.map((f) => f.radius),
      dominant.radius,
    );

    if (
      crossIsCircular &&
      fillsBody &&
      distinctInnerRadii <= CYLINDER_MAX_INNER_CLUSTERS
    ) {
      const inner = internalCylinders.sort((a, b) => b.radius - a.radius)[0];
      return {
        kind: "cylinder",
        outerDiaMm: dominantDia,
        innerDiaMm: inner ? inner.radius * 2 : null,
        lengthMm,
      };
    }
    // Dominant cylinder is a feature, not the whole body.
    hasFeatureCylinders = true;
  }

  const hex = classifyTopologyHex(topology, bbSize);
  if (hex) return hex;

  // Topology found cylindrical features that aren't the whole body — this is
  // a complex/tooling body, not simple stock.  Return complex directly so the
  // mesh heuristic cannot re-classify it as a misleading "box".
  if (hasFeatureCylinders) {
    return { kind: "complex", xMm: bbSize.x, yMm: bbSize.y, zMm: bbSize.z };
  }

  return null;
}

// Returns the two bbox extents perpendicular to the given axis direction.
function bbCrossSectionDims(
  bbSize: THREE.Vector3,
  axisDir: [number, number, number],
): [number, number] {
  const [ax, ay, az] = axisDir.map(Math.abs);
  if (ax >= ay && ax >= az) return [bbSize.y, bbSize.z];
  if (ay >= az) return [bbSize.x, bbSize.z];
  return [bbSize.x, bbSize.y];
}

function cylinderScore(face: Extract<FaceClass, { kind: "cylinder" }>): number {
  return face.radius * Math.max(face.length ?? 1, 1);
}

function countDistinctRadii(radii: number[], referenceR: number): number {
  if (radii.length === 0) return 0;
  const binWidth = Math.max(referenceR * 0.05, 0.5);
  const bins = new Set<number>();
  for (const r of radii) bins.add(Math.floor(r / binWidth));
  const sorted = [...bins].sort((a, b) => a - b);
  let clusters = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i - 1] > 2) clusters++;
  }
  return clusters;
}

function classifyTopologyHex(
  topology: TopologyGraph,
  bbSize: THREE.Vector3,
): ShapeAnalysis | null {
  const planes = findFacesByClass(topology, "plane");
  if (planes.length < 6) return null;

  for (const axis of AXIS_KEYS) {
    const axisIndex = axisIdx(axis);
    const [u1Key, u2Key] =
      axis === "x"
        ? (["y", "z"] as const)
        : axis === "y"
          ? (["x", "z"] as const)
          : (["x", "y"] as const);
    const u1 = axisIdx(u1Key);
    const u2 = axisIdx(u2Key);
    const sidePlanes = planes.filter(
      (plane) => Math.abs(plane.normal[axisIndex]) < 0.25,
    );
    if (sidePlanes.length < 6) continue;

    const angles = sidePlanes
      .map((plane) => Math.atan2(plane.normal[u2], plane.normal[u1]))
      .sort((a, b) => a - b);
    if (!hasSixEvenTopologyAngles(angles)) continue;

    const afMm = topologyAcrossFlats(sidePlanes);
    if (afMm == null) continue;

    // Conservative: AF must be consistent with the body's cross-section envelope.
    // AF is always ≤ circumscribed diameter, so allow a slightly looser ratio (0.70).
    const [hexC1, hexC2] =
      axis === "x"
        ? ([bbSize.y, bbSize.z] as const)
        : axis === "y"
          ? ([bbSize.x, bbSize.z] as const)
          : ([bbSize.x, bbSize.y] as const);
    const minCross = Math.min(hexC1, hexC2);
    const maxCross = Math.max(hexC1, hexC2);
    if (maxCross / minCross > CYLINDER_CROSS_CIRCULARITY_MAX) continue;
    // Hex AF is always less than the circumscribed diameter (≈ AF/cos30° ≈ 1.155·AF);
    // 0.70 leaves headroom for that geometric difference while still rejecting
    // a small internal hex pocket from being mistaken for the whole body.
    if (afMm < minCross * 0.70) continue;

    return {
      kind: "hex",
      afMm,
      lengthMm: topologyLengthFromPlaneCaps(planes, axisIndex) ?? afMm,
    };
  }

  return null;
}

function hasSixEvenTopologyAngles(angles: number[]): boolean {
  const unique: number[] = [];
  for (const angle of angles) {
    if (
      unique.every(
        (existing) => angularDistance(existing, angle) > (10 * Math.PI) / 180,
      )
    ) {
      unique.push(angle);
    }
  }
  if (unique.length !== 6) return false;

  const sorted = unique.sort((a, b) => a - b);
  const expectedGap = PI2 / 6;
  for (let i = 0; i < sorted.length; i++) {
    const next = i + 1 < sorted.length ? sorted[i + 1] : sorted[0] + PI2;
    if (Math.abs(next - sorted[i] - expectedGap) > expectedGap * 0.25)
      return false;
  }
  return true;
}

function topologyAcrossFlats(
  planes: Extract<FaceClass, { kind: "plane" }>[],
): number | null {
  const widths: number[] = [];
  for (let i = 0; i < planes.length; i++) {
    for (let j = i + 1; j < planes.length; j++) {
      const a = planes[i];
      const b = planes[j];
      if (dot3(a.normal, b.normal) > -0.95) continue;
      widths.push(
        Math.abs(dot3(a.origin, a.normal) - dot3(b.origin, a.normal)),
      );
    }
  }
  return median(widths.filter((value) => value > 0.01));
}

function topologyLengthFromPlaneCaps(
  planes: Extract<FaceClass, { kind: "plane" }>[],
  axisIndex: AxisIdx,
): number | null {
  const capDistances = planes
    .filter((plane) => Math.abs(plane.normal[axisIndex]) > 0.9)
    .map((plane) => plane.origin[axisIndex]);
  if (capDistances.length < 2) return null;

  return Math.max(...capDistances) - Math.min(...capDistances);
}

function dot3(
  a: [number, number, number],
  b: [number, number, number],
): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function angularDistance(a: number, b: number): number {
  const diff = Math.abs(a - b);
  return diff > Math.PI ? PI2 - diff : diff;
}

// ──────────────────────────────────────────────────────────────────────────────

function extractTriangleData(
  pos: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  idx: THREE.BufferAttribute | null,
  triCount: number,
  bbCenter: THREE.Vector3,
): TriangleData[] {
  const out: TriangleData[] = [];
  const v0 = new THREE.Vector3();
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const nrm = new THREE.Vector3();

  for (let t = 0; t < triCount; t++) {
    const a = idx ? idx.getX(t * 3) : t * 3;
    const b = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
    const c = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
    v0.fromBufferAttribute(pos, a);
    v1.fromBufferAttribute(pos, b);
    v2.fromBufferAttribute(pos, c);
    e1.subVectors(v1, v0);
    e2.subVectors(v2, v0);
    nrm.crossVectors(e1, e2);
    const cross = nrm.length();
    if (cross < 1e-8) continue;
    const area = cross * 0.5;
    nrm.divideScalar(cross);

    out.push({
      n: [nrm.x, nrm.y, nrm.z],
      c: [
        (v0.x + v1.x + v2.x) / 3 - bbCenter.x,
        (v0.y + v1.y + v2.y) / 3 - bbCenter.y,
        (v0.z + v1.z + v2.z) / 3 - bbCenter.z,
      ],
      area,
    });
  }
  return out;
}

function collectSideFaces(
  tris: TriangleData[],
  mAx: AxisIdx,
  u1: AxisIdx,
  u2: AxisIdx,
): SideFace[] {
  const sides: SideFace[] = [];
  for (const t of tris) {
    // Reject end-cap-like faces whose normal aligns with the candidate main axis
    if (Math.abs(t.n[mAx]) > 0.25) continue;
    const nU = t.n[u1];
    const nV = t.n[u2];
    const nMag = Math.hypot(nU, nV);
    if (nMag < 0.05) continue;
    const cU = t.c[u1];
    const cV = t.c[u2];
    sides.push({
      angle: Math.atan2(nV, nU),
      perpDist: (cU * nU + cV * nV) / nMag,
      area: t.area,
    });
  }
  return sides;
}

function classifyFromSides(
  sides: SideFace[],
  lengthMm: number,
  minCrossDim: number,
  maxCrossDim: number,
): ShapeAnalysis | null {
  let totalArea = 0;
  for (const f of sides) totalArea += f.area;
  if (totalArea <= 0) return null;

  // Area-weighted angle histogram, 2° per bin
  const BINS = 180;
  const hist = new Float64Array(BINS);
  for (const f of sides) {
    const bin = Math.floor(((f.angle + Math.PI) / PI2) * BINS) % BINS;
    hist[bin] += f.area;
  }
  // 3-bin moving average smoothing (wrap-around)
  const sm = new Float64Array(BINS);
  for (let i = 0; i < BINS; i++) {
    sm[i] = (hist[(i - 1 + BINS) % BINS] + hist[i] + hist[(i + 1) % BINS]) / 3;
  }

  const meanArea = totalArea / BINS;
  let maxArea = 0;
  for (let i = 0; i < BINS; i++) if (sm[i] > maxArea) maxArea = sm[i];
  const peakiness = maxArea / meanArea;

  // Peaks: local maxima above 2.5× mean, dominating their ±4 neighbours
  const peakBins: number[] = [];
  for (let i = 0; i < BINS; i++) {
    const cur = sm[i];
    if (cur < meanArea * 2.5) continue;
    let isPeak = true;
    for (let k = 1; k <= 4; k++) {
      if (
        sm[(i - k + BINS) % BINS] > cur + 1e-9 ||
        sm[(i + k) % BINS] > cur + 1e-9
      ) {
        isPeak = false;
        break;
      }
    }
    if (isPeak) peakBins.push(i);
  }
  // Merge close peaks (within ~16°), including wrap-around
  const merged: number[] = [];
  for (const p of peakBins) {
    if (merged.length === 0 || p - merged[merged.length - 1] > 8)
      merged.push(p);
  }
  if (merged.length >= 2) {
    const wrapGap = BINS - merged[merged.length - 1] + merged[0];
    if (wrapGap <= 8) merged.pop();
  }

  // ── Cylinder: angular distribution roughly uniform ──
  if (peakiness < 4) {
    return classifyAsCylinder(sides, lengthMm, minCrossDim, maxCrossDim);
  }
  // ── Hex: 5-7 evenly-spaced peaks (~60° apart) ──
  if (
    merged.length >= 5 &&
    merged.length <= 7 &&
    hasEvenSpacing(merged, BINS, 6, 0.35)
  ) {
    return classifyAsHex(sides, merged, BINS, lengthMm, minCrossDim, maxCrossDim);
  }
  return null;
}

function classifyEnvelopeCylinder(
  sides: SideFace[],
  lengthMm: number,
  minCrossDim: number,
  maxCrossDim: number,
): ShapeAnalysis | null {
  if (maxCrossDim / minCrossDim > RAW_CYLINDER_ENVELOPE_CIRCULARITY_MAX)
    return null;
  if (!hasCircularSideCoverage(sides)) return null;
  const outerR = maxCrossDim / 2;
  const inner: { r: number; area: number }[] = [];
  for (const f of sides) {
    if (f.perpDist < 0) inner.push({ r: -f.perpDist, area: f.area });
  }
  const innerDiaMm = estimateSingleInnerDia(inner, outerR);
  return {
    kind: "cylinder",
    outerDiaMm: maxCrossDim,
    innerDiaMm,
    lengthMm,
  };
}

function hasCircularSideCoverage(sides: SideFace[]): boolean {
  let totalArea = 0;
  for (const f of sides) totalArea += f.area;
  if (totalArea <= 0) return false;

  const BINS = 36;
  const hist = new Float64Array(BINS);
  for (const f of sides) {
    const bin = Math.floor(((f.angle + Math.PI) / PI2) * BINS) % BINS;
    hist[bin] += f.area;
  }

  let occupied = 0;
  let maxArea = 0;
  const minArea = totalArea * 0.003;
  for (let i = 0; i < BINS; i++) {
    if (hist[i] > minArea) occupied++;
    if (hist[i] > maxArea) maxArea = hist[i];
  }
  const meanArea = totalArea / BINS;

  return occupied >= 24 && maxArea / meanArea < 4.5;
}

function estimateSingleInnerDia(
  inner: { r: number; area: number }[],
  outerR: number,
): number | null {
  const innerClusters = countInnerClusters(inner, outerR);
  if (innerClusters !== 1) return null;
  const significant = inner.filter((x) => x.r > outerR * 0.05 && x.r < outerR * 0.95);
  if (significant.length === 0) return null;
  significant.sort((a, b) => a.r - b.r);
  return significant[Math.floor(significant.length * 0.5)].r * 2;
}

function classifyAsCylinder(
  sides: SideFace[],
  lengthMm: number,
  minCrossDim: number,
  maxCrossDim: number,
): ShapeAnalysis | null {
  const outer: number[] = [];
  const inner: { r: number; area: number }[] = [];
  for (const f of sides) {
    if (f.perpDist > 0) outer.push(f.perpDist);
    else if (f.perpDist < 0) inner.push({ r: -f.perpDist, area: f.area });
  }
  if (outer.length === 0) return null;
  outer.sort((a, b) => a - b);
  const outerR = outer[Math.floor(outer.length * 0.5)];
  if (outerR < 0.01) return null;
  const outerDiaMm = outerR * 2;

  // Cross-section circularity: a non-circular envelope cannot be a cylinder body.
  if (maxCrossDim / minCrossDim > CYLINDER_CROSS_CIRCULARITY_MAX) return null;

  // Body-fill guard: the detected outer diameter must be consistent with the
  // body's envelope. A tight-fit cylinder (shaft, tube, disc stock) passes
  // CYLINDER_TIGHT_FIT_MIN directly. A long stepped shaft falls below the
  // tight-fit threshold because the median radius is an intermediate step, but
  // its length/diameter ratio is large enough that we still accept it down to
  // the absolute floor.
  const fillRatio = outerDiaMm / minCrossDim;
  if (fillRatio < CYLINDER_ABSOLUTE_FLOOR) return null;
  if (fillRatio < CYLINDER_TIGHT_FIT_MIN) {
    const ld = lengthMm / outerDiaMm;
    if (ld < CYLINDER_LONG_SHAFT_LD_MIN) return null;
  }

  // Internal-feature guard: a true cylinder body has at most one concentric
  // internal cylindrical surface (a bore in a tube or drilled shaft). Two or
  // more distinct internal radii indicate a feature-rich complex body, not
  // round stock.
  const innerClusters = countInnerClusters(inner, outerR);
  if (innerClusters > CYLINDER_MAX_INNER_CLUSTERS) return null;

  let innerDiaMm: number | null = null;
  if (inner.length > sides.length * 0.15) {
    inner.sort((a, b) => a.r - b.r);
    const innerR = inner[Math.floor(inner.length * 0.5)].r;
    if (innerR > outerR * 0.05 && innerR < outerR * 0.95)
      innerDiaMm = innerR * 2;
  }
  return { kind: "cylinder", outerDiaMm, innerDiaMm, lengthMm };
}

// Bin internal radii at 5% of outerR and count groups of adjacent significant
// bins. "Significant" means at least 5% of total internal surface area, so we
// ignore tiny faces from chamfers/fillets near a single bore.
function countInnerClusters(
  inner: { r: number; area: number }[],
  outerR: number,
): number {
  if (inner.length === 0) return 0;
  const total = inner.reduce((s, x) => s + x.area, 0);
  if (total <= 0) return 0;
  const binWidth = Math.max(outerR * 0.05, 0.5);
  const bins = new Map<number, number>();
  for (const x of inner) {
    const k = Math.floor(x.r / binWidth);
    bins.set(k, (bins.get(k) ?? 0) + x.area);
  }
  const sig = [...bins.entries()]
    .filter(([, area]) => area > total * 0.05)
    .map(([k]) => k)
    .sort((a, b) => a - b);
  if (sig.length === 0) return 0;
  let clusters = 1;
  for (let i = 1; i < sig.length; i++) {
    if (sig[i] - sig[i - 1] > 2) clusters++;
  }
  return clusters;
}

function classifyAsHex(
  sides: SideFace[],
  peaks: number[],
  BINS: number,
  lengthMm: number,
  minCrossDim: number,
  maxCrossDim: number,
): ShapeAnalysis | null {
  const inradii: number[] = [];
  for (const pBin of peaks) {
    const target = (pBin / BINS) * PI2 - Math.PI;
    let sumW = 0,
      sum = 0;
    for (const f of sides) {
      if (f.perpDist <= 0) continue;
      let da = Math.abs(f.angle - target);
      if (da > Math.PI) da = PI2 - da;
      if (da < (10 * Math.PI) / 180) {
        sum += f.perpDist * f.area;
        sumW += f.area;
      }
    }
    if (sumW > 0) inradii.push(sum / sumW);
  }
  if (inradii.length === 0) return null;
  inradii.sort((a, b) => a - b);
  const inradius = inradii[Math.floor(inradii.length * 0.5)];
  if (inradius < 0.01) return null;

  // Body-level hex guard: AF must be consistent with envelope cross-section.
  if (maxCrossDim / minCrossDim > CYLINDER_CROSS_CIRCULARITY_MAX) return null;
  if (inradius * 2 < minCrossDim * 0.70) return null;

  return { kind: "hex", afMm: inradius * 2, lengthMm };
}

function hasEvenSpacing(
  peaks: number[],
  BINS: number,
  expected: number,
  tolerance: number,
): boolean {
  if (peaks.length < expected - 1 || peaks.length > expected + 1) return false;
  const expectedGap = BINS / expected;
  const sorted = [...peaks].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i++) {
    const nextRaw = i + 1 < sorted.length ? sorted[i + 1] : sorted[0] + BINS;
    const gap = nextRaw - sorted[i];
    if (Math.abs(gap - expectedGap) > expectedGap * tolerance) return false;
  }
  return true;
}

function scoreResult(r: ShapeAnalysis, sideCount: number): number {
  // Higher = more confident. Box/complex never produced here (we return null instead).
  // Slightly prefer axes with more side-face coverage as a tiebreaker.
  const coverage = Math.min(sideCount, 500) * 0.02;
  if (r.kind === "cylinder")
    return 100 + (r.innerDiaMm != null ? 25 : 0) + coverage;
  if (r.kind === "hex") return 100 + coverage;
  return 0;
}

/**
 * A body is "box-like" when the majority of its surface area comes from
 * axis-aligned planar faces (normals within 15° of ±X, ±Y, or ±Z).
 * Bodies that fail this check after also failing cylinder/hex detection
 * are classified as "complex" instead of "box".
 */
function isBoxLike(tris: TriangleData[]): boolean {
  let totalArea = 0;
  let alignedArea = 0;
  for (const t of tris) {
    totalArea += t.area;
    const [nx, ny, nz] = t.n;
    if (
      Math.abs(nx) >= AXIS_ALIGN_COS ||
      Math.abs(ny) >= AXIS_ALIGN_COS ||
      Math.abs(nz) >= AXIS_ALIGN_COS
    ) {
      alignedArea += t.area;
    }
  }
  return totalArea > 0 && alignedArea / totalArea >= BOX_PLANARITY_MIN;
}

interface Point2D {
  x: number;
  y: number;
}

interface Circle2D {
  x: number;
  y: number;
  r: number;
}

function distSq(p1: Point2D, p2: Point2D): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return dx * dx + dy * dy;
}

function isPointInCircle(p: Point2D, c: Circle2D): boolean {
  return distSq(p, c) <= c.r * c.r + 1e-9;
}

function makeCircle2(p1: Point2D, p2: Point2D): Circle2D {
  const cx = (p1.x + p2.x) / 2;
  const cy = (p1.y + p2.y) / 2;
  const r = Math.sqrt(distSq(p1, p2)) / 2;
  return { x: cx, y: cy, r };
}

function makeCircle3(p1: Point2D, p2: Point2D, p3: Point2D): Circle2D {
  const d = 2 * (p1.x * (p2.y - p3.y) + p2.x * (p3.y - p1.y) + p3.x * (p1.y - p2.y));
  if (Math.abs(d) < 1e-9) {
    // Collinear points, find the pair with max distance
    const d12 = distSq(p1, p2);
    const d23 = distSq(p2, p3);
    const d31 = distSq(p3, p1);
    if (d12 >= d23 && d12 >= d31) return makeCircle2(p1, p2);
    if (d23 >= d12 && d23 >= d31) return makeCircle2(p2, p3);
    return makeCircle2(p3, p1);
  }
  const ux =
    ((p1.x * p1.x + p1.y * p1.y) * (p2.y - p3.y) +
      (p2.x * p2.x + p2.y * p2.y) * (p3.y - p1.y) +
      (p3.x * p3.x + p3.y * p3.y) * (p1.y - p2.y)) /
    d;
  const uy =
    ((p1.x * p1.x + p1.y * p1.y) * (p3.x - p2.x) +
      (p2.x * p2.x + p2.y * p2.y) * (p1.x - p3.x) +
      (p3.x * p3.x + p3.y * p3.y) * (p2.x - p1.x)) /
    d;
  const r = Math.sqrt((ux - p1.x) * (ux - p1.x) + (uy - p1.y) * (uy - p1.y));
  return { x: ux, y: uy, r };
}

function b_minidisk_with_2_points(
  P: Point2D[],
  n: number,
  q1: Point2D,
  q2: Point2D,
): Circle2D {
  let D = makeCircle2(q1, q2);
  for (let i = 0; i < n; i++) {
    if (!isPointInCircle(P[i], D)) {
      D = makeCircle3(q1, q2, P[i]);
    }
  }
  return D;
}

function b_minidisk_with_1_point(P: Point2D[], n: number, q: Point2D): Circle2D {
  let D = makeCircle2(P[0], q);
  for (let i = 1; i < n; i++) {
    if (!isPointInCircle(P[i], D)) {
      D = b_minidisk_with_2_points(P, i, q, P[i]);
    }
  }
  return D;
}

function getMinEnclosingCircle(points: Point2D[]): Circle2D {
  if (points.length === 0) return { x: 0, y: 0, r: 0 };
  if (points.length === 1) return { x: points[0].x, y: points[0].y, r: 0 };

  const P = [...points];
  // Fisher-Yates shuffle
  for (let i = P.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = P[i];
    P[i] = P[j];
    P[j] = temp;
  }

  let D = makeCircle2(P[0], P[1]);
  for (let i = 2; i < P.length; i++) {
    if (!isPointInCircle(P[i], D)) {
      D = b_minidisk_with_1_point(P, i, P[i]);
    }
  }
  return D;
}
