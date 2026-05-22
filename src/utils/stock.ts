import type { Stock } from "./quoteTypes";

const SHAPES: Record<string, { label: string; dims: string[] }> = {
  rect: { label: "Rect", dims: ["L", "W", "H"] },
  round: { label: "Round", dims: ["D", "L"] },
  hex: { label: "Hex", dims: ["AF", "L"] },
};

function normalizeStock(stock: Stock | null): Stock | null {
  if (!stock) return null;
  const s = stock.shape;
  if (s === "rect" || s === "round" || s === "hex") return stock;
  const d = stock.dims || {};
  if (s === "plate" || s === "block") return { shape: "rect", dims: { L: d.L ?? 80, W: d.W ?? 50, H: d.H ?? 25 } };
  if (s === "round-bar") return { shape: "round", dims: { D: d.D ?? 30, L: d.L ?? 80 } };
  if (s === "tube") return { shape: "round", dims: { D: d.OD ?? d.D ?? 30, L: d.L ?? 80 } };
  if (s === "square-bar") return { shape: "hex", dims: { AF: d.side ?? 24, L: d.L ?? 80 } };
  return { shape: "rect", dims: { L: 80, W: 50, H: 25 } };
}

// Last-resort dimensions, only used when a stock has no usable size at all.
const STOCK_DIM_FALLBACK: Record<string, number> = { L: 80, W: 50, H: 25, D: 30, AF: 24 };

/**
 * Representative cross-section size (mm) of a stock blank, perpendicular to
 * its length: diameter for round, across-flats for hex, the larger of the
 * two cross dimensions for rect.
 */
function crossSectionMm(stock: Stock): number {
  const d = stock.dims || {};
  switch (stock.shape) {
    case "round":
      return d.D ?? 0;
    case "hex":
      return d.AF ?? 0;
    case "rect":
      return Math.max(d.W ?? 0, d.H ?? 0);
    default:
      return 0;
  }
}

/**
 * Convert a stock blank to a different shape.
 *
 * Rect (L/W/H), round (D/L) and hex (AF/L) use distinct dimension keys
 * apart from the shared axial length L, so every dimension the blank has
 * ever carried is kept untouched. Toggling to another shape and back
 * therefore restores the original values exactly — and any value the user
 * edited stays edited. Only a dimension the new shape needs but has never
 * had is derived: sized from the current cross-section so the blank keeps
 * roughly the same volume, never a small hardcoded guess that would shrink
 * the stock below the finished part.
 */
function convertStockShape(stock: Stock, newShape: string): Stock {
  const cfg = SHAPES[newShape] ?? SHAPES.rect;
  // Carry every dimension forward — values for other shapes ride along
  // invisibly so a later switch back restores them.
  const dims: Record<string, number> = { ...(stock.dims || {}) };
  const cross = crossSectionMm(stock);
  // round D, hex AF, and rect W/H all carry the cross-section size.
  const derived: Record<string, number> = {
    L: dims.L ?? 0,
    W: cross,
    H: cross,
    D: cross,
    AF: cross,
  };

  // Fill in only the dimensions the new shape needs but has never had.
  for (const key of cfg.dims) {
    const existing = dims[key];
    if (typeof existing === "number" && existing > 0) continue;
    dims[key] = derived[key] > 0 ? derived[key] : STOCK_DIM_FALLBACK[key] ?? 0;
  }
  return { shape: newShape, dims };
}

function fmtStockDims(stock: Stock): string {
  const d = stock.dims || {};
  const r = (n: number) => Math.round(n).toString();
  switch (stock.shape) {
    case "rect":
      return `${r(d.L || 0)}×${r(d.W || 0)}×${r(d.H || 0)} mm`;
    case "round":
      return `⌀${r(d.D || 0)}×${r(d.L || 0)} mm`;
    case "hex":
      return `AF ${r(d.AF || 0)}×${r(d.L || 0)} mm`;
    default:
      return "";
  }
}

export { SHAPES, normalizeStock, fmtStockDims, convertStockShape };
