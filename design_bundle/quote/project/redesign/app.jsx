/* global React, ReactDOM, Sidebar, Topbar, ViewerWorkspace, QuoteWorkspace, Icon, KbdOverlay, useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakToggle */
const { useState, useEffect } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "workspace": "quote",
  "theme": "light",
  "denser": false,
  "showStatus": true
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [quoteState, setQuoteState] = useState("draft");
  const [searchQuery, setSearchQuery] = useState("");
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  useEffect(() => { document.documentElement.dataset.theme = t.theme; }, [t.theme]);
  useEffect(() => { document.body.style.fontSize = t.denser ? "12.5px" : "13px"; }, [t.denser]);
  useEffect(() => { if (window.lucide) window.lucide.createIcons({ attrs: { "stroke-width": 1.6 } }); });

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e) {
      // ignore when typing into a field
      const tag = (e.target?.tagName || "").toLowerCase();
      const inField = tag === "input" || tag === "textarea" || tag === "select" || e.target?.isContentEditable;

      // "/" focuses search even when not in field
      if (e.key === "/" && !inField) {
        e.preventDefault();
        window.__focusGlobalSearch?.();
        return;
      }

      // "?" toggles cheatsheet
      if (e.key === "?" && !inField) {
        e.preventDefault();
        setShortcutsOpen(o => !o);
        return;
      }

      if (inField) return;

      switch (e.key.toLowerCase()) {
        case "v": setTweak("workspace", "viewer"); break;
        case "q": setTweak("workspace", "quote"); break;
        case "escape":
          setShortcutsOpen(false);
          break;
        default: return;
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [setTweak]);

  const subText =
    t.workspace === "viewer"
      ? "STEP geometry imported — 7 bodies, 36,118 triangles"
      : `${quoteState === "draft" ? "Draft" : "Quote"} · revision C · ` +
        (searchQuery ? `filter: "${searchQuery}"` : "all parts visible");

  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <Topbar
          searchQuery={searchQuery} setSearchQuery={setSearchQuery}
          quoteState={quoteState} setQuoteState={setQuoteState}
          onShortcuts={() => setShortcutsOpen(true)}
        />

        <div className="page">
          <div className="page-head">
            <div>
              <h1 className="page-title">
                {t.workspace === "viewer" ? "Pump Manifold v3" : "Quote · Pump Manifold v3"}
              </h1>
              {t.showStatus && (
                <div className="page-sub">
                  <span className="status-dot"></span>
                  <span>{subText}</span>
                  <span style={{ color: "var(--text-4)" }}>•</span>
                  <span className="quote-num">RFQ-2026-014</span>
                </div>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button className="btn ghost sm" onClick={() => setShortcutsOpen(true)} title="Keyboard shortcuts">
                <Icon name="command" size={13}/> Shortcuts
              </button>
              <button className="btn sm"><Icon name="share-2" size={13}/> Share</button>
              <div className="seg">
                <button className={t.workspace === "viewer" ? "on" : ""} onClick={() => setTweak("workspace", "viewer")}>
                  <Icon name="box" size={13} /> Viewer
                  <span className="kbd-key" style={{ marginLeft: 6, fontSize: 9, padding: "1px 4px", minWidth: 0 }}>V</span>
                </button>
                <button className={t.workspace === "quote" ? "on" : ""} onClick={() => setTweak("workspace", "quote")}>
                  <Icon name="calculator" size={13} /> Quote
                  <span className="kbd-key" style={{ marginLeft: 6, fontSize: 9, padding: "1px 4px", minWidth: 0 }}>Q</span>
                </button>
              </div>
            </div>
          </div>

          {t.workspace === "viewer"
            ? <ViewerWorkspace theme={t.theme} />
            : <QuoteWorkspace searchQuery={searchQuery} />
          }
        </div>
      </div>

      {shortcutsOpen && <KbdOverlay onClose={() => setShortcutsOpen(false)} />}

      <TweaksPanel title="Tweaks">
        <TweakSection title="Layout">
          <TweakRadio
            label="Workspace"
            value={t.workspace}
            options={[{value:"viewer",label:"Viewer"}, {value:"quote",label:"Quote"}]}
            onChange={(v) => setTweak("workspace", v)}
          />
          <TweakRadio
            label="Theme"
            value={t.theme}
            options={[{value:"light",label:"Light"}, {value:"dark",label:"Dark"}]}
            onChange={(v) => setTweak("theme", v)}
          />
        </TweakSection>
        <TweakSection title="Density">
          <TweakToggle label="Compact mode" value={t.denser} onChange={(v) => setTweak("denser", v)} />
          <TweakToggle label="Show status line" value={t.showStatus} onChange={(v) => setTweak("showStatus", v)} />
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
