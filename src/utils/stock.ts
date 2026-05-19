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

export { SHAPES, normalizeStock, fmtStockDims };
