import { memo, type Dispatch, type SetStateAction } from "react";
import { fmtINR } from "@utils/format";
import { Layers } from "lucide-react";
import type { ExtraCost } from "@utils/quoteTypes";

export const ExtraCostsSection = memo(function ExtraCostsSection({ extraCosts, setExtraCosts }: {
  extraCosts: ExtraCost[];
  setExtraCosts: Dispatch<SetStateAction<ExtraCost[]>>;
}) {
  const subtotal = extraCosts.reduce((s, r) => s + Math.max(0, r.amount), 0);

  const updateAmount = (code: ExtraCost["code"], amount: number) =>
    setExtraCosts(prev => prev.map(r => r.code === code ? { ...r, amount } : r));

  return (
    <div className="panel extra-costs-section">
      <div className="panel-head bop-head">
        <div className="bop-head-main">
          <span className="title"><Layers size={13} /> Extra Costs</span>
          <span className="sub">Added after tax · Subtotal {fmtINR(subtotal)}</span>
        </div>
      </div>

      <table className="parts-table extra-costs-table">
        <colgroup>
          <col />
          <col style={{ width: "22%", minWidth: 140 }} />
        </colgroup>
        <thead>
          <tr>
            <th>Description</th>
            <th className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {extraCosts.map(row => (
            <tr key={row.code}>
              <td>{row.label}</td>
              <td className="num">
                <input
                  className="qty-input"
                  type="number"
                  min={0}
                  step={0.01}
                  value={row.amount}
                  onChange={e => updateAmount(row.code, Math.max(0, Number(e.target.value) || 0))}
                />
              </td>
            </tr>
          ))}
          <tr className="totals">
            <td>Extra costs subtotal</td>
            <td className="num">{fmtINR(subtotal)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
});
