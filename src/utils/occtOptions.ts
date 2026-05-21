export const DEFAULT_OCCT_OPTIONS = {
  linearUnit: "millimeter",
  linearDeflectionType: "bounding_box_ratio",
  linearDeflection: 0.001,
  angularDeflection: 0.5,
} as const;

export type OcctImportOptions = typeof DEFAULT_OCCT_OPTIONS;
