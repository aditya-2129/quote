import { useCatalog } from "@context/CatalogContext";
import { fmtINR, fmtMin } from "@utils/format";
import { ChevronDown, ChevronUp, Plus, X } from "lucide-react";
import type { Op } from "@utils/quoteTypes";
import { operationCost as calculateOperationCost, operationRate as calculateOperationRate, partMachineCost as calculatePartMachineCost, partSetupCost as calculatePartSetupCost, operationMinutes as calculateOperationMinutes } from "../../utils/quoteCosting";
import type { OperationsEditorProps } from "./types";

const opId = () => `op-${crypto.randomUUID()}`;

export function OperationsEditor({ part, qty, onChange }: OperationsEditorProps) {
  const { machines, machineCosts, machineLabel } = useCatalog();
  function update(id: string, patch: Partial<Op>) { onChange({ operations: part.operations.map(op => op.id === id ? { ...op, ...patch } : op) }); }
  function remove(id: string) { onChange({ operations: part.operations.filter(op => op.id !== id) }); }
  function move(i: number, dir: number) {
    const list = part.operations.slice();
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    onChange({ operations: list });
  }
  function add() {
    const defaultMachine = Object.keys(machines)[0] ?? "";
    onChange({ operations: [...part.operations, { id: opId(), machine: defaultMachine, machineLabelSnapshot: machineLabel(defaultMachine), setupMin: 5, cycleMin: 1 }] });
  }
  const totalMin = part.operations.reduce((a, op) => a + calculateOperationMinutes(op, qty), 0);
  const totalCost = calculatePartSetupCost(part, machineCosts) + calculatePartMachineCost(part, qty / (part.perAssembly || 1), machineCosts);
  return (
    <div className="ops-panel">
      <div className="op-head">
        <span className="op-col-idx">#</span>
        <span className="op-col-machine">Operation · machine</span>
        <span className="op-col-spacer" />
        <span className="op-col-rate">Rate</span>
        <span className="op-col-setup">Setup</span>
        <span className="op-col-cycle">Cycle</span>
        <span className="op-col-cost">Cost</span>
        <span className="op-col-x" />
      </div>
      {part.operations.length === 0 && <div className="op-empty">No operations - add one to start estimating.</div>}
      {part.operations.map((op, i) => {
        const rate = calculateOperationRate(op, machineCosts);
        const isRateOverride = op.rateOverride != null;
        return (
          <div className="op-row" key={op.id}>
            <span className="op-col-idx">
              <span className="op-reorder">
                <button onClick={() => move(i, -1)} disabled={i === 0} title="Move up"><ChevronUp size={10} /></button>
                <button onClick={() => move(i, +1)} disabled={i === part.operations.length - 1} title="Move down"><ChevronDown size={10} /></button>
              </span>
              <span className="op-idx">{i + 1}</span>
            </span>
            <div className="op-col-machine">
              <select aria-label="Machine" value={op.machine} onChange={e => update(op.id, { machine: e.target.value, machineLabelSnapshot: machineLabel(e.target.value), rateOverride: null })}>
                {Object.entries(machines).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <span className="op-col-spacer" />
            <div className="op-col-rate">
              <div className={`op-num-input ${isRateOverride ? "override" : ""}`} title={isRateOverride ? "Custom rate for this quote - click to reset" : "Click to override rate for this quote"}>
                <input type="number" min="0" step="1" aria-label="Machine rate per hour" value={rate} onChange={e => update(op.id, { rateOverride: +e.target.value || 0 })} />
                <span className="unit">/h</span>
                {isRateOverride && <button className="op-rate-reset" onClick={() => update(op.id, { rateOverride: null })} title="Reset to library rate">↺</button>}
              </div>
            </div>
            <div className="op-col-setup">
              <div className="op-num-input">
                <input type="number" min="0" step="0.5" aria-label="Setup minutes" value={op.setupMin} onChange={e => update(op.id, { setupMin: +e.target.value || 0 })} />
                <span className="unit">min</span>
              </div>
            </div>
            <div className="op-col-cycle">
              <div className="op-num-input">
                <input type="number" min="0" step="0.1" aria-label="Cycle minutes" value={op.cycleMin} onChange={e => update(op.id, { cycleMin: +e.target.value || 0 })} />
                <span className="unit">min</span>
              </div>
            </div>
            <span className="op-col-cost">{fmtINR(calculateOperationCost(op, qty, machineCosts))}</span>
            <button className="op-col-x op-remove" onClick={() => remove(op.id)} title="Remove operation"><X size={12} /></button>
          </div>
        );
      })}
      <div className="op-foot">
        <button className="op-add-btn" onClick={add}><Plus size={12} /> Add operation</button>
        <span className="op-summary"><strong>{fmtMin(totalMin)} min</strong> · {fmtINR(totalCost)} machining</span>
      </div>
    </div>
  );
}
