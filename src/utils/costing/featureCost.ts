/**
 * Feature-based cycle-time estimation.
 *
 * Each manufacturing feature contributes an incremental machining time
 * (in minutes) derived from its geometry. The constants below are
 * conservative mid-range values for mild-steel / aluminium with HSS or
 * carbide tooling.  They are intentionally simple — a single scalar per
 * feature family — so that the costing engine remains deterministic and
 * auditable without a full CAM simulation.
 */

import type { PartFeatureData } from "../../db/schema/part_features";
import type { Hole } from "../features/holes";
import type { Pocket } from "../features/pockets";
import type { Slot } from "../features/slots";
import type { Fillet } from "../features/fillets";
import type { Chamfer } from "../features/chamfers";
import type { Thread } from "../features/threads";

// ---------------------------------------------------------------------------
// Machining rate constants  (all per-minute)
// ---------------------------------------------------------------------------

/** Volumetric drill rate for twist-drill in mild steel (mm³/min). */
export const DRILL_RATE_MM3_PER_MIN = 800;

/** Linear tapping feed rate (mm/min). */
export const TAP_RATE_MM_PER_MIN = 50;

/** Volumetric pocket-clearing rate for carbide end-mill (mm³/min). */
export const POCKET_MILL_RATE_MM3_PER_MIN = 2000;

/** Volumetric slotting rate — constrained chip evacuation (mm³/min). */
export const SLOT_MILL_RATE_MM3_PER_MIN = 1500;

/** Linear finishing-pass rate for fillets and chamfers (mm/min). */
export const FILLET_CHAMFER_RATE_MM_PER_MIN = 300;

// ---------------------------------------------------------------------------
// Per-feature time functions
// ---------------------------------------------------------------------------

/** Drill time for a single hole (minutes). */
function holeDrillMin(hole: Hole): number {
  const r = hole.diameter / 2;
  const volume = Math.PI * r * r * hole.depth; // mm³
  return volume / DRILL_RATE_MM3_PER_MIN;
}

/** Tap time for a threaded hole — additive on top of drill (minutes). */
function threadTapMin(thread: Thread): number {
  return thread.length / TAP_RATE_MM_PER_MIN;
}

/** Pocket-clearing time from volume proxy depth × footprint (minutes). */
function pocketMillMin(pocket: Pocket): number {
  const volume = pocket.depth * pocket.footprintAreaMm2; // mm³
  return volume / POCKET_MILL_RATE_MM3_PER_MIN;
}

/** Slot-milling time from L × W × D volume (minutes). */
function slotMillMin(slot: Slot): number {
  const volume = slot.lengthMm * slot.widthMm * slot.depthMm; // mm³
  return volume / SLOT_MILL_RATE_MM3_PER_MIN;
}

/** Fillet finishing-pass time from tool-path length (minutes). */
function filletMin(fillet: Fillet): number {
  return fillet.lengthMm / FILLET_CHAMFER_RATE_MM_PER_MIN;
}

/** Chamfer finishing-pass time from tool-path length (minutes). */
function chamferMin(chamfer: Chamfer): number {
  return chamfer.lengthMm / FILLET_CHAMFER_RATE_MM_PER_MIN;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Input shape matching StoredPartFeature without importing the DB layer. */
export interface FeatureInput {
  featureType: string;
  featureData: PartFeatureData;
}

/**
 * Total additional cycle-time (minutes) contributed by all features on a
 * single part.  Returns 0 when features is empty or undefined, preserving
 * byte-identical output for legacy parts.
 */
export function featureCycleMinutes(features: readonly FeatureInput[] | undefined): number {
  if (!features || features.length === 0) return 0;

  let total = 0;

  for (const f of features) {
    switch (f.featureType) {
      case "hole":
        total += holeDrillMin(f.featureData as Hole);
        break;
      case "thread": {
        // Thread implies a pre-drilled hole + tapping pass
        const thread = f.featureData as Thread;
        // Drill volume uses the thread's actual diameter
        const r = thread.diameter / 2;
        const drillVol = Math.PI * r * r * thread.length;
        total += drillVol / DRILL_RATE_MM3_PER_MIN;
        total += threadTapMin(thread);
        break;
      }
      case "pocket":
        total += pocketMillMin(f.featureData as Pocket);
        break;
      case "slot":
        total += slotMillMin(f.featureData as Slot);
        break;
      case "fillet":
        total += filletMin(f.featureData as Fillet);
        break;
      case "chamfer":
        total += chamferMin(f.featureData as Chamfer);
        break;
      case "boss":
        // Bosses are absorbed in stock-minus-part volume — no direct cost
        break;
      default:
        // Unknown feature types contribute nothing
        break;
    }
  }

  return total;
}
