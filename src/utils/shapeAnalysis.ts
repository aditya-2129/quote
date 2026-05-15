import * as THREE from "three";

export type ShapeAnalysis =
  | { kind: "cylinder"; outerDiaMm: number; innerDiaMm: number | null; lengthMm: number }
  | { kind: "hex"; afMm: number; lengthMm: number }
  | { kind: "box"; xMm: number; yMm: number; zMm: number };

type TriangleData = {
  n: [number, number, number];  // unit normal (x, y, z)
  c: [number, number, number];  // centroid relative to bbCenter (x, y, z)
  area: number;
};

type SideFace = {
  angle: number;     // normal direction in cross-section plane (atan2)
  perpDist: number;  // signed perpendicular distance from axis to face plane along normal
  area: number;
};

const PI2 = Math.PI * 2;
const AXIS_KEYS = ["x", "y", "z"] as const;
type AxisKey = (typeof AXIS_KEYS)[number];
type AxisIdx = 0 | 1 | 2;

function axisIdx(k: AxisKey): AxisIdx {
  return (k === "x" ? 0 : k === "y" ? 1 : 2) as AxisIdx;
}

export function analyzeShape(geo: THREE.BufferGeometry): ShapeAnalysis {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const size = new THREE.Vector3();
  bb.getSize(size);
  const bbCenter = new THREE.Vector3();
  bb.getCenter(bbCenter);

  const sizeArr: [number, number, number] = [size.x, size.y, size.z];
  const boxFallback: ShapeAnalysis = { kind: "box", xMm: size.x, yMm: size.y, zMm: size.z };

  const pos = geo.attributes.position;
  const idx = geo.index;
  if (!pos || pos.count === 0) return boxFallback;
  const triCount = idx ? Math.floor(idx.count / 3) : Math.floor(pos.count / 3);
  if (triCount < 8) return boxFallback;

  const tris = extractTriangleData(pos, idx, triCount, bbCenter);
  if (tris.length < 8) return boxFallback;

  // Try each axis as the candidate main (cylinder/hex) axis; pick the best classification.
  // Important: a flat disc's cylinder axis is the SHORTEST dim, not the longest, so we
  // can't shortcut by picking the longest bbox dim — we evaluate all three.
  let bestResult: ShapeAnalysis = boxFallback;
  let bestScore = 0;

  for (const mainKey of AXIS_KEYS) {
    const mAx = axisIdx(mainKey);
    const [u1Key, u2Key] = mainKey === "x" ? (["y", "z"] as const)
                       : mainKey === "y" ? (["x", "z"] as const)
                       : (["x", "y"] as const);
    const u1 = axisIdx(u1Key);
    const u2 = axisIdx(u2Key);

    const sides = collectSideFaces(tris, mAx, u1, u2);
    if (sides.length < 16) continue;

    const result = classifyFromSides(sides, sizeArr[mAx]);
    if (!result) continue;

    const score = scoreResult(result, sides.length);
    if (score > bestScore) {
      bestScore = score;
      bestResult = result;
    }
  }

  return bestResult;
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
    const a = idx ? idx.getX(t * 3)     : t * 3;
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

function collectSideFaces(tris: TriangleData[], mAx: AxisIdx, u1: AxisIdx, u2: AxisIdx): SideFace[] {
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

function classifyFromSides(sides: SideFace[], lengthMm: number): ShapeAnalysis | null {
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
      if (sm[(i - k + BINS) % BINS] > cur + 1e-9 || sm[(i + k) % BINS] > cur + 1e-9) {
        isPeak = false;
        break;
      }
    }
    if (isPeak) peakBins.push(i);
  }
  // Merge close peaks (within ~16°), including wrap-around
  const merged: number[] = [];
  for (const p of peakBins) {
    if (merged.length === 0 || p - merged[merged.length - 1] > 8) merged.push(p);
  }
  if (merged.length >= 2) {
    const wrapGap = (BINS - merged[merged.length - 1]) + merged[0];
    if (wrapGap <= 8) merged.pop();
  }

  // ── Cylinder: angular distribution roughly uniform ──
  if (peakiness < 4) {
    return classifyAsCylinder(sides, lengthMm);
  }
  // ── Hex: 5-7 evenly-spaced peaks (~60° apart) ──
  if (merged.length >= 5 && merged.length <= 7 && hasEvenSpacing(merged, BINS, 6, 0.35)) {
    return classifyAsHex(sides, merged, BINS, lengthMm);
  }
  return null;
}

function classifyAsCylinder(sides: SideFace[], lengthMm: number): ShapeAnalysis | null {
  const outer: number[] = [];
  const inner: number[] = [];
  for (const f of sides) {
    if (f.perpDist > 0) outer.push(f.perpDist);
    else if (f.perpDist < 0) inner.push(-f.perpDist);
  }
  if (outer.length === 0) return null;
  outer.sort((a, b) => a - b);
  const outerR = outer[Math.floor(outer.length * 0.5)];
  if (outerR < 0.01) return null;

  let innerDiaMm: number | null = null;
  if (inner.length > sides.length * 0.15) {
    inner.sort((a, b) => a - b);
    const innerR = inner[Math.floor(inner.length * 0.5)];
    if (innerR > outerR * 0.05 && innerR < outerR * 0.95) innerDiaMm = innerR * 2;
  }
  return { kind: "cylinder", outerDiaMm: outerR * 2, innerDiaMm, lengthMm };
}

function classifyAsHex(sides: SideFace[], peaks: number[], BINS: number, lengthMm: number): ShapeAnalysis | null {
  const inradii: number[] = [];
  for (const pBin of peaks) {
    const target = (pBin / BINS) * PI2 - Math.PI;
    let sumW = 0, sum = 0;
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
  return { kind: "hex", afMm: inradius * 2, lengthMm };
}

function hasEvenSpacing(peaks: number[], BINS: number, expected: number, tolerance: number): boolean {
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
  // Higher = more confident. Box never produced here (we return null instead).
  // Slightly prefer axes with more side-face coverage as a tiebreaker.
  const coverage = Math.min(sideCount, 500) * 0.02;
  if (r.kind === "cylinder") return 100 + (r.innerDiaMm != null ? 25 : 0) + coverage;
  if (r.kind === "hex")      return 100 + coverage;
  return 0;
}
