import type { BodyBoundingBox } from "../topology";

/**
 * Shared context handed to every feature detector. It lets detectors reject
 * surfaces that belong to the outer body envelope — the stock rim, outer
 * side wall, and end faces — instead of mistaking them for machined
 * features. Feature recognition stays fully separate from raw-material
 * logic: this only describes the geometric envelope of the analyzed body.
 */
export interface FeatureDetectionContext {
  /** Axis-aligned bounding box of the body being analyzed, when known. */
  bodyEnvelope?: BodyBoundingBox;
}

type Vec3 = [number, number, number];

/** Absolute extents [|dx|, |dy|, |dz|] of an axis-aligned envelope. */
export function envelopeExtents(env: BodyBoundingBox): Vec3 {
  return [
    Math.abs(env.max[0] - env.min[0]),
    Math.abs(env.max[1] - env.min[1]),
    Math.abs(env.max[2] - env.min[2]),
  ];
}

/**
 * True when a circular feature of the given diameter coincides with the
 * body's outer cross-section — i.e. it is the stock rim / outer side wall
 * of a round body, not an interior bore. A genuine hole is always
 * meaningfully smaller than the body's second-largest extent (for a round
 * body that extent is the outer diameter).
 */
export function isOuterEnvelopeDiameter(
  diameter: number,
  env: BodyBoundingBox,
): boolean {
  const sorted = envelopeExtents(env).sort((a, b) => b - a);
  const crossSection = sorted[1]; // second-largest extent
  if (crossSection <= 0) return false;
  const tol = Math.max(0.5, 0.03 * crossSection);
  return diameter >= crossSection - tol;
}

/**
 * True when a planar face lies on the body envelope boundary — one of the
 * stock's outer end faces. Such a face is never a pocket floor: a real
 * pocket floor is recessed inside the body, not on its outer surface.
 */
export function isEnvelopeBoundaryPlane(
  origin: Vec3,
  normal: Vec3,
  env: BodyBoundingBox,
): boolean {
  // Dominant axis of the (assumed axis-aligned) plane normal.
  let axis = 0;
  let best = Math.abs(normal[0]);
  for (let i = 1; i < 3; i += 1) {
    const m = Math.abs(normal[i]);
    if (m > best) {
      best = m;
      axis = i;
    }
  }
  if (best < 0.9) return false; // not axis-aligned — cannot judge confidently

  const pos = origin[axis];
  const ext = envelopeExtents(env)[axis];
  const tol = Math.max(0.5, 0.02 * ext);
  return (
    Math.abs(pos - env.min[axis]) <= tol ||
    Math.abs(pos - env.max[axis]) <= tol
  );
}
