import { useEffect } from "react";
import { X } from "lucide-react";

export function KbdOverlay({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const groups = [
    { name: "Navigation", items: [{ keys: ["V"], label: "Switch to Viewer" }, { keys: ["Q"], label: "Switch to Quote" }, { keys: ["/"], label: "Focus search" }, { keys: ["?"], label: "Toggle cheatsheet" }, { keys: ["Esc"], label: "Close overlays" }] },
    { name: "Quote actions", items: [{ keys: ["S"], label: "Save quote" }, { keys: ["E"], label: "Export PDF" }, { keys: ["A"], label: "Add operation" }, { keys: ["D"], label: "Duplicate part" }] },
    { name: "Viewer", items: [{ keys: ["F"], label: "Fit to view" }, { keys: ["1"], label: "Isometric" }, { keys: ["2"], label: "Front" }, { keys: ["W"], label: "Toggle wireframe" }] },
    { name: "Parts", items: [{ keys: ["↑"], label: "Select previous part" }, { keys: ["↓"], label: "Select next part" }, { keys: ["Space"], label: "Toggle include" }] },
  ];

  return (
    <div className="kbd-overlay" onClick={onClose}>
      <div className="kbd-card" onClick={e => e.stopPropagation()}>
        <div className="head">
          <span className="title">Keyboard shortcuts</span>
          <button className="close" onClick={onClose}><X size={15} /></button>
        </div>
        <div className="kbd-body">
          {groups.map(g => (
            <div className="kbd-group" key={g.name}>
              <h5>{g.name}</h5>
              {g.items.map((it, i) => (
                <div className="kbd-row" key={i}>
                  <span>{it.label}</span>
                  <span className="kbd-keys">{it.keys.map((k, j) => <span className="kbd-key" key={j}>{k}</span>)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
