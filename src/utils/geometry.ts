import type { GeometrySummary, StepGeometryInput, UnitSystem } from "../types";

const emptyBox = { x: 0, y: 0, z: 0 };

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function positive(value: number | undefined): number {
  return Number.isFinite(value) && value !== undefined && value > 0 ? value : 0;
}

export function summarizeGeometry(input: StepGeometryInput): GeometrySummary {
  const boundingBoxMm = input.boundingBoxMm ?? emptyBox;
  const x = positive(boundingBoxMm.x);
  const y = positive(boundingBoxMm.y);
  const z = positive(boundingBoxMm.z);
  const volumeMm3 = positive(input.volumeMm3);
  const surfaceAreaMm2 = positive(input.surfaceAreaMm2);
  const boundingBoxVolumeMm3 = x * y * z;
  const dimensions = [x, y, z].filter((dimension) => dimension > 0);
  const unitSystem: UnitSystem = input.unitSystem ?? "metric";

  return {
    fileName: input.fileName?.trim() || "Untitled STEP",
    unitSystem,
    boundingBoxMm: { x, y, z },
    volumeMm3: round(volumeMm3, 3),
    surfaceAreaMm2: round(surfaceAreaMm2, 3),
    volumeCm3: round(volumeMm3 / 1_000, 3),
    surfaceAreaCm2: round(surfaceAreaMm2 / 100, 3),
    boundingBoxVolumeMm3: round(boundingBoxVolumeMm3, 3),
    materialUtilizationPercent:
      boundingBoxVolumeMm3 > 0
        ? round((volumeMm3 / boundingBoxVolumeMm3) * 100, 2)
        : 0,
    longestDimensionMm: dimensions.length > 0 ? Math.max(...dimensions) : 0,
    shortestDimensionMm: dimensions.length > 0 ? Math.min(...dimensions) : 0,
    faceCount: Math.trunc(positive(input.faceCount)),
    vertexCount: Math.trunc(positive(input.vertexCount)),
  };
}

export function estimateMassKg(
  geometry: StepGeometryInput | GeometrySummary,
  densityKgPerM3: number,
): number {
  const volumeMm3 = "volumeMm3" in geometry ? positive(geometry.volumeMm3) : 0;
  const volumeM3 = volumeMm3 / 1_000_000_000;

  return round(volumeM3 * positive(densityKgPerM3), 4);
}
