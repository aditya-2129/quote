import { useCatalog } from "@context/CatalogContext";
import { fmtINR } from "@utils/format";
import { ShapeIcon } from "@components/ShapeIcon";
import { Percent, TriangleAlert } from "lucide-react";
import { SHAPES, normalizeStock, convertStockShape } from "@utils/stock";
import { partNetMassKg as calculatePartNetMassKg, effectivePartRate, stockMassKg as calculateStockMassKg } from "../../utils/quoteCosting";
import type { StockPanelProps } from "./types";

export function StockPanel({ part, qty, onChange }: StockPanelProps) {
  const { materials, materialCosts, materialLabel } = useCatalog();
  const stock = normalizeStock(part.stock) || { shape: "rect", dims: { L: 80, W: 50, H: 25 } };
  const cfg = SHAPES[stock.shape] || SHAPES.rect;
  const rate = effectivePartRate(part, materialCosts);
  const sm = calculateStockMassKg(stock, part.material, materialCosts);
  const materialCost = sm * rate * qty;
  const netMass = calculatePartNetMassKg(part, materialCosts);
  const util = sm > 0 ? (netMass / sm) * 100 : 0;
  // Utilization is bounded 0–100%: the finished part cannot weigh more than
  // the blank it is cut from. A higher net than stock means the stock
  // dimensions are too small to contain the part — flag it instead of
  // showing an impossible percentage (and an under-quoted material cost).
  const stockTooSmall = sm > 0 && netMass > sm * 1.001;
  const utilClass = stockTooSmall
    ? "bad"
    : util >= 50
      ? "good"
      : util >= 25
        ? "warn"
        : "poor";
  const isOverride = part.materialRateOverride != null;

  function updateShape(newShape: string) {
    if (newShape === stock.shape) return;
    onChange({
      stock: convertStockShape(stock, newShape),
      materialRateOverride: null,
    });
  }
  function updateDim(k: string, v: number) {
    onChange({ stock: { ...stock, dims: { ...stock.dims, [k]: v } } });
  }
  function updateMaterial(newMat: string) {
    onChange({ material: newMat, materialLabelSnapshot: materialLabel(newMat), materialRateOverride: null });
  }
  function updateRate(v: number) {
    onChange({ materialRateOverride: v });
  }
  function resetRate() {
    onChange({ materialRateOverride: null });
  }

  return (
    <div className="stock-panel">
      <div className="sp-row">
        <span className="sp-eyebrow">Material</span>
        <select className="sp-mat-select" aria-label="Material" value={part.material} onChange={e => updateMaterial(e.target.value)}>
          {!materials[part.material] && <option value="">Select material…</option>}
          {Object.entries(materials).filter(([, m]) => m.isActive && !m.isPurchased).map(([k, m]) => (
            <option key={k} value={k}>{m.label}</option>
          ))}
        </select>
        <div className={`sp-rate-edit ${isOverride ? "override" : ""}`} title={isOverride ? "Custom rate for this quote - click to reset to library rate" : "Click to override rate for this quote"}>
          <span className="muted">Rate ₹</span>
          <input type="number" min="0" step="0.01" aria-label="Material rate per kg" value={Number.isFinite(rate) ? rate : 0} onChange={e => updateRate(+e.target.value || 0)} />
          <span className="muted">/kg</span>
          {isOverride && <button className="sp-rate-reset" onClick={resetRate} title="Reset to library rate">↺</button>}
        </div>
      </div>
      <div className="sp-row">
        <span className="sp-eyebrow">Shape</span>
        <div className="sp-shape-chips">
          {Object.entries(SHAPES).map(([k, s]) => (
            <button key={k} className={`sp-shape-chip ${stock.shape === k ? "on" : ""}`} onClick={() => updateShape(k)}>
              <span className="shape-ic"><ShapeIcon shape={k} size={12} /></span>
              {s.label}
            </button>
          ))}
        </div>
        <span
          className={`util-pill ${utilClass}`}
          title={
            stockTooSmall
              ? "Raw stock is smaller than the finished part — increase the stock dimensions."
              : "Material utilization: finished part weight ÷ raw stock weight."
          }
        >
          {stockTooSmall ? (
            <><TriangleAlert size={10} /> Stock too small</>
          ) : (
            <><Percent size={10} /> {util.toFixed(0)}% util</>
          )}
        </span>
      </div>
      <div className={`sp-dims dims-${cfg.dims.length}`}>
        {cfg.dims.map(k => (
          <label className="sp-field" key={k}>
            <span>{k}</span>
            <div className="suffix">
              <input type="number" min="0" aria-label={`Stock dimension ${k} (mm)`} value={stock.dims?.[k] ?? 0} onChange={e => updateDim(k, +e.target.value || 0)} />
              <span className="unit">mm</span>
            </div>
          </label>
        ))}
      </div>
      <div className="sp-foot">
        <span className="sp-summary">
          <strong>{sm.toFixed(3)} kg</strong> stock - {netMass.toFixed(3)} kg net - {Math.max(0, sm - netMass).toFixed(3)} kg waste
        </span>
        <span className="sp-total">{fmtINR(materialCost)} material</span>
      </div>
    </div>
  );
}
