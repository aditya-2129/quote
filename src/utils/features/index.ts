import type { TopologyGraph } from "../topology";
import { detectHoles, type Hole } from "./holes";
import { detectThreads, type Thread } from "./threads";
import { detectPockets, type Pocket } from "./pockets";
import { detectSlots, type Slot } from "./slots";
import { detectFillets, type Fillet } from "./fillets";
import { detectChamfers, type Chamfer } from "./chamfers";
import { detectBosses, type Boss } from "./bosses";
import type { FeatureDetectionContext } from "./context";

export type {
  Hole,
  Thread,
  Pocket,
  Slot,
  Fillet,
  Chamfer,
  Boss,
  FeatureDetectionContext,
};
export {
  detectHoles,
  detectThreads,
  detectPockets,
  detectSlots,
  detectFillets,
  detectChamfers,
  detectBosses,
};

export type CadFeatureType =
  | "hole"
  | "thread"
  | "pocket"
  | "slot"
  | "fillet"
  | "chamfer"
  | "boss";

/** One machining feature normalized into a UI-friendly shape. */
export interface DetectedCadFeature {
  type: CadFeatureType;
  /** Human label, e.g. "Through hole", "Internal thread". */
  label: string;
  /** Primary dimension string, e.g. "Ø 10.00 mm". */
  primary: string;
  /** Optional secondary dimension string, e.g. "Depth 20.00 mm". */
  secondary?: string;
  /** Key identifying features that are equivalent for grouping/counting. */
  groupKey: string;
  /** Topology face IDs backing this feature. */
  faceIds: string[];
}

/** One row of the per-type count summary, e.g. "3 Holes". */
export interface CadFeatureGroup {
  type: CadFeatureType;
  /** Display label including the count, e.g. "3 Holes". */
  label: string;
  count: number;
}

export interface CadFeatureSummary {
  total: number;
  groups: CadFeatureGroup[];
  byType: Record<CadFeatureType, number>;
}

const TYPE_ORDER: CadFeatureType[] = [
  "hole",
  "thread",
  "pocket",
  "slot",
  "fillet",
  "chamfer",
  "boss",
];

const TYPE_LABELS: Record<CadFeatureType, [singular: string, plural: string]> = {
  hole: ["Hole", "Holes"],
  thread: ["Thread", "Threads"],
  pocket: ["Pocket", "Pockets"],
  slot: ["Slot", "Slots"],
  fillet: ["Fillet", "Fillets"],
  chamfer: ["Chamfer", "Chamfers"],
  boss: ["Boss", "Bosses"],
};

function mm(value: number): string {
  return value.toFixed(2);
}

function normalizeHole(hole: Hole): DetectedCadFeature {
  const label =
    hole.kind === "through"
      ? "Through hole"
      : hole.kind === "blind"
        ? "Blind hole"
        : hole.kind === "counterbore"
          ? "Counterbore"
          : "Countersink";

  const hasShoulder =
    hole.shoulderDiameter !== undefined &&
    (hole.kind === "counterbore" || hole.kind === "countersink");

  const primary = hasShoulder
    ? `Ø ${mm(hole.diameter)} / shoulder Ø ${mm(hole.shoulderDiameter as number)}`
    : `Ø ${mm(hole.diameter)} mm`;

  return {
    type: "hole",
    label,
    primary,
    secondary: hole.depth > 0 ? `Depth ${mm(hole.depth)} mm` : undefined,
    groupKey: `hole:${hole.kind}:${hole.diameter.toFixed(1)}`,
    faceIds: hole.faceIds,
  };
}

function formatThreadDesignation(designation: string): string {
  const xIndex = designation.toLowerCase().indexOf("x");
  if (xIndex === -1) return designation;
  const major = designation.slice(0, xIndex);
  const pitchRaw = designation.slice(xIndex + 1);
  const pitchNum = Number.parseFloat(pitchRaw);
  const pitch = Number.isFinite(pitchNum) ? String(pitchNum) : pitchRaw;
  return `${major} × ${pitch}`;
}

function normalizeThread(thread: Thread): DetectedCadFeature {
  const label = thread.gender === "internal" ? "Internal thread" : "External thread";
  const primary =
    thread.designation === "unknown"
      ? `Ø ${mm(thread.diameter)} mm`
      : formatThreadDesignation(thread.designation);

  return {
    type: "thread",
    label,
    primary,
    secondary: thread.length > 0 ? `Depth ${mm(thread.length)} mm` : undefined,
    groupKey: `thread:${thread.gender}:${thread.designation}`,
    faceIds: thread.faceIds,
  };
}

function normalizePocket(pocket: Pocket): DetectedCadFeature {
  const label = pocket.kind === "closed" ? "Closed pocket" : "Open pocket";
  return {
    type: "pocket",
    label,
    primary: `Depth ${mm(pocket.depth)} mm`,
    secondary:
      pocket.footprintAreaMm2 > 0
        ? `${Math.round(pocket.footprintAreaMm2)} mm² floor`
        : undefined,
    groupKey: `pocket:${pocket.kind}`,
    faceIds: pocket.faceIds,
  };
}

function normalizeSlot(slot: Slot): DetectedCadFeature {
  const label = slot.kind === "rounded" ? "Rounded slot" : "Rectangular slot";
  return {
    type: "slot",
    label,
    primary: `L ${mm(slot.lengthMm)} × W ${mm(slot.widthMm)} mm`,
    secondary: slot.depthMm > 0 ? `Depth ${mm(slot.depthMm)} mm` : undefined,
    groupKey: `slot:${slot.kind}`,
    faceIds: slot.faceIds,
  };
}

function normalizeFillet(fillet: Fillet): DetectedCadFeature {
  const label = fillet.concavity === "concave" ? "Concave fillet" : "Convex fillet";
  const primary =
    fillet.radius === "variable"
      ? "Variable radius"
      : `R ${mm(fillet.radius)} mm`;
  return {
    type: "fillet",
    label,
    primary,
    secondary: fillet.lengthMm > 0 ? `Length ${mm(fillet.lengthMm)} mm` : undefined,
    groupKey: `fillet:${fillet.concavity}:${
      fillet.radius === "variable" ? "var" : fillet.radius.toFixed(1)
    }`,
    faceIds: fillet.faceIds,
  };
}

function normalizeChamfer(chamfer: Chamfer): DetectedCadFeature {
  return {
    type: "chamfer",
    label: "Chamfer",
    primary: `${mm(chamfer.widthMm)} × ${Math.round(chamfer.angleDeg)}°`,
    secondary:
      chamfer.lengthMm > 0 ? `Length ${mm(chamfer.lengthMm)} mm` : undefined,
    groupKey: `chamfer:${chamfer.widthMm.toFixed(1)}`,
    faceIds: [chamfer.faceId],
  };
}

function normalizeBoss(boss: Boss): DetectedCadFeature {
  const label = boss.kind === "round" ? "Round boss" : "Rectangular boss";
  const primary =
    boss.kind === "round"
      ? `Ø ${mm(boss.diameter ?? 0)} mm`
      : `${mm(boss.length ?? 0)} × ${mm(boss.width ?? 0)} mm`;
  return {
    type: "boss",
    label,
    primary,
    secondary: boss.height > 0 ? `Height ${mm(boss.height)} mm` : undefined,
    groupKey: `boss:${boss.kind}`,
    faceIds: boss.faceIds,
  };
}

/**
 * Run every BREP feature detector over a topology graph and normalize the
 * results into one UI-friendly list.
 *
 * Features sharing face IDs across detectors are preserved intentionally —
 * a tapped hole is legitimately both a hole and a thread. Only exact
 * duplicates (same type + same face set) are collapsed.
 *
 * `context`, when supplied, carries the body envelope so detectors can
 * reject outer stock surfaces (rim, end faces) being misread as holes,
 * threads, pockets, or slots.
 */
export function detectCadFeatures(
  graph: TopologyGraph | undefined,
  context?: FeatureDetectionContext,
): DetectedCadFeature[] {
  if (!graph) return [];

  const raw: DetectedCadFeature[] = [
    ...detectHoles(graph, context).map(normalizeHole),
    ...detectThreads(graph, context).map(normalizeThread),
    ...detectPockets(graph, context).map(normalizePocket),
    ...detectSlots(graph, context?.bodyEnvelope).map(normalizeSlot),
    ...detectFillets(graph).map(normalizeFillet),
    ...detectChamfers(graph).map(normalizeChamfer),
    ...detectBosses(graph).map(normalizeBoss),
  ];

  const seen = new Set<string>();
  const features: DetectedCadFeature[] = [];
  for (const feature of raw) {
    if (feature.faceIds.length > 0) {
      const dedupKey = `${feature.type}|${[...feature.faceIds]
        .sort()
        .join(",")}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);
    }
    features.push(feature);
  }
  return features;
}

/** Build per-type counts and display groups from a normalized feature list. */
export function summarizeCadFeatures(
  features: DetectedCadFeature[],
): CadFeatureSummary {
  const byType: Record<CadFeatureType, number> = {
    hole: 0,
    thread: 0,
    pocket: 0,
    slot: 0,
    fillet: 0,
    chamfer: 0,
    boss: 0,
  };
  for (const feature of features) {
    byType[feature.type] += 1;
  }

  const groups: CadFeatureGroup[] = [];
  for (const type of TYPE_ORDER) {
    const count = byType[type];
    if (count === 0) continue;
    const [singular, plural] = TYPE_LABELS[type];
    groups.push({
      type,
      count,
      label: `${count} ${count === 1 ? singular : plural}`,
    });
  }

  return { total: features.length, groups, byType };
}
