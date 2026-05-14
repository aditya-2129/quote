import type { MaterialPreset, QuoteCalculation, StorageResult } from "../types";

const recentQuotesKey = "step-quote:recent-quotes";
const materialPresetsKey = "step-quote:material-presets";
const defaultRecentLimit = 20;

export const defaultMaterialPresets: MaterialPreset[] = [
  {
    id: "aluminum-6061",
    name: "Aluminum 6061",
    densityKgPerM3: 2_700,
    costPerKg: 5.5,
    currency: "USD",
    markupPercent: 15,
  },
  {
    id: "stainless-304",
    name: "Stainless Steel 304",
    densityKgPerM3: 8_000,
    costPerKg: 4.2,
    currency: "USD",
    markupPercent: 18,
  },
  {
    id: "mild-steel",
    name: "Mild Steel",
    densityKgPerM3: 7_850,
    costPerKg: 1.4,
    currency: "USD",
    markupPercent: 12,
  },
];

function storageAvailable(): boolean {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function readJson<T>(key: string, fallback: T): StorageResult<T> {
  if (!storageAvailable()) {
    return { ok: false, value: fallback, error: "localStorage unavailable" };
  }

  try {
    const raw = window.localStorage.getItem(key);

    if (!raw) {
      return { ok: true, value: fallback };
    }

    return { ok: true, value: JSON.parse(raw) as T };
  } catch (error) {
    return {
      ok: false,
      value: fallback,
      error: error instanceof Error ? error.message : "Unable to read storage",
    };
  }
}

function writeJson<T>(key: string, value: T): StorageResult<T> {
  if (!storageAvailable()) {
    return { ok: false, value, error: "localStorage unavailable" };
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value));

    return { ok: true, value };
  } catch (error) {
    return {
      ok: false,
      value,
      error: error instanceof Error ? error.message : "Unable to write storage",
    };
  }
}

export function getRecentQuotes(): StorageResult<QuoteCalculation[]> {
  return readJson<QuoteCalculation[]>(recentQuotesKey, []);
}

export function saveRecentQuote(
  quote: QuoteCalculation,
  limit = defaultRecentLimit,
): StorageResult<QuoteCalculation[]> {
  const current = getRecentQuotes().value;
  const next = [quote, ...current.filter((item) => item.id !== quote.id)].slice(
    0,
    Math.max(1, limit),
  );

  return writeJson(recentQuotesKey, next);
}

export function clearRecentQuotes(): StorageResult<QuoteCalculation[]> {
  return writeJson(recentQuotesKey, []);
}

export function getMaterialPresets(): StorageResult<MaterialPreset[]> {
  return readJson<MaterialPreset[]>(materialPresetsKey, defaultMaterialPresets);
}

export function saveMaterialPreset(
  preset: MaterialPreset,
): StorageResult<MaterialPreset[]> {
  const current = getMaterialPresets().value;
  const next = [preset, ...current.filter((item) => item.id !== preset.id)];

  return writeJson(materialPresetsKey, next);
}

export function saveMaterialPresets(
  presets: MaterialPreset[],
): StorageResult<MaterialPreset[]> {
  return writeJson(materialPresetsKey, presets);
}
