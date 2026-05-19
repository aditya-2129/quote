import { memo } from "react";
import { useCatalog } from "@context/CatalogContext";
import { fmtINR, fmtMin } from "@utils/format";
import type { Bop, ExtraCost, Part } from "@utils/quoteTypes";
import {
  calculateConfiguredQuoteRollup,
  operationRate as calculateOperationRate,
  partMaterialCost as calculatePartMaterialCost,
  partQuantity,
} from "../../utils/quoteCosting";

const partQty = (p: Part, asmQty: number) => partQuantity(p, asmQty);

export const CostPanel = memo(function CostPanel({ parts, asmQty, commercial, bops, extraCosts }: {
  parts: Part[];
  asmQty: number;
  commercial: { marginPct: number; taxPct: number };
  bops: Bop[];
  extraCosts: ExtraCost[];
}) {
  const { materialCosts, machineCosts, opMachineLabel } = useCatalog();

  const r = calculateConfiguredQuoteRollup(
    parts, asmQty, commercial,
    materialCosts, machineCosts,
    { bops, extraCosts },
  );

  /* ---- cost category totals ---- */
  const cat = { material: 0, machine: 0, setup: 0, finish: 0 };
  parts.forEach(p => {
    if (!p.included) return;
    const qty = partQty(p, asmQty);
    cat.material += calculatePartMaterialCost(p, asmQty, materialCosts);
    (p.operations || []).forEach(op => {
      const rate = calculateOperationRate(op, machineCosts);
      cat.setup += (op.setupMin / 60) * rate;
      cat.machine += (op.cycleMin / 60) * rate * qty;
    });
  });

  /* ---- machine utilization breakdown ---- */
  const machineBreakdown: Record<string, { cost: number; mins: number; label: string }> = {};
  parts.forEach(p => {
    if (!p.included) return;
    const qty = partQty(p, asmQty);
    (p.operations || []).forEach(op => {
      const rate = calculateOperationRate(op, machineCosts);
      const cost = (op.setupMin / 60) * rate + (op.cycleMin / 60) * rate * qty;
      const mins = op.setupMin + op.cycleMin * qty;
      machineBreakdown[op.machine] = machineBreakdown[op.machine] || { cost: 0, mins: 0, label: opMachineLabel(op) };
      machineBreakdown[op.machine].cost += cost;
      machineBreakdown[op.machine].mins += mins;
    });
  });
  const machineRows = Object.entries(machineBreakdown).sort((a, b) => b[1].cost - a[1].cost);

  /* ---- margin bar segments ---- */
  const segs = [
    { k: "Material",  v: cat.material, c: "#5d80c9" },
    { k: "Machining", v: cat.machine,  c: "#7b95c0" },
    { k: "Setup",     v: cat.setup,    c: "#9aabc7" },
    { k: "Margin",    v: r.margin,     c: "#5fa05f" },
  ];
  const segsTotal = segs.reduce((a, s) => a + s.v, 0) || 1;

  return (
    <div className="panel cost-panel">
      <div className="panel-head">
        <span className="title">Cost breakdown</span>
        <span className="sub">Subtotal {fmtINR(r.subtotal)} · Margin {fmtINR(r.margin)}</span>
      </div>

      <div className="margin-bar">
        {segs.map(s => (
          <span key={s.k} style={{ width: `${(s.v / segsTotal) * 100}%`, background: s.c }} />
        ))}
      </div>

      <div className="margin-legend">
        {segs.map(s => (
          <span key={s.k}>
            <span className="dot" style={{ background: s.c }} />
            {s.k}
            <span className="v">{fmtINR(s.v)}</span>
          </span>
        ))}
      </div>

      <div className="cost-grid">
        <div className="cost-row left"><span className="k">Parts subtotal</span><span className="v">{fmtINR(r.partsCost)}</span></div>
        <div className="cost-row right"><span className="k">BOP subtotal</span><span className="v">{fmtINR(r.bopCost)}</span></div>
        <div className="cost-row left"><span className="k">Margin · {commercial.marginPct}%</span><span className="v">{fmtINR(r.margin)}</span></div>
        <div className="cost-row right"><span className="k">Tax</span><span className="v">{fmtINR(r.tax)}</span></div>
        <div className="cost-row left"><span className="k">Extra costs</span><span className="v">{fmtINR(r.extraCost)}</span></div>
        <div className="cost-row right"><span className="k">Total</span><span className="v">{fmtINR(r.total)}</span></div>
      </div>

      {machineRows.length > 0 && (
        <>
          <div style={{ padding: "10px 14px 4px", borderTop: "1px solid var(--divider)" }}>
            <div className="eyebrow">Machine utilization</div>
          </div>
          <div style={{ padding: "0 14px 16px" }}>
            {machineRows.map(([m, info]) => {
              const pct = r.partsCost > 0 ? (info.cost / r.partsCost) * 100 : 0;
              return (
                <div key={m} style={{ display: "grid", gridTemplateColumns: "120px 1fr 80px 80px", alignItems: "center", gap: 10, padding: "6px 0", fontSize: 12 }}>
                  <span style={{ color: "var(--text-2)" }}>{info.label}</span>
                  <div style={{ height: 6, background: "var(--panel-3)", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: "var(--accent)" }} />
                  </div>
                  <span className="mono muted" style={{ textAlign: "right", fontSize: 11 }}>{fmtMin(info.mins)} min</span>
                  <span className="mono" style={{ textAlign: "right", fontSize: 12 }}>{fmtINR(info.cost)}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
});
