/* global React */
const { useState, useEffect, useRef } = React;

function Icon({ name, size = 16, strokeWidth = 1.75, className = "", style = {} }) {
  return (
    <i
      data-lucide={name}
      style={{ width: size, height: size, ...style }}
      className={`lucide ${className}`}
      data-stroke-width={strokeWidth}
    ></i>
  );
}

/* -----------------------------------------------------------
   Sidebar
   ----------------------------------------------------------- */

const PRIMARY_NAV = [
  { id: "dashboard", label: "Dashboard", icon: "layout-dashboard" },
  { id: "rfqs",      label: "RFQs",      icon: "inbox",   badge: 8 },
  { id: "quotes",    label: "Quotes",    icon: "file-text", badge: 12, active: true },
  { id: "parts",     label: "Parts",     icon: "package" },
  { id: "customers", label: "Customers", icon: "users" },
  { id: "analytics", label: "Analytics", icon: "bar-chart-3" },
];

const SECONDARY_NAV = [
  { id: "library",  label: "Material library", icon: "gem" },
  { id: "machines", label: "Machines & rates", icon: "settings-2" },
  { id: "team",     label: "Team",             icon: "user-cog" },
];

function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sb-brand">
        <div className="mark">Q</div>
        <div style={{ minWidth: 0, lineHeight: 1.1 }}>
          <div className="wordmark">Quote</div>
          <div className="eyebrow">Locus Manufacturing</div>
        </div>
        <button className="collapse-btn" title="Collapse">
          <Icon name="panel-left-close" size={14} />
        </button>
      </div>

      <div className="sb-section">
        <div className="sb-section-label">Workspace</div>
        <nav className="sb-nav">
          {PRIMARY_NAV.map(it => (
            <a key={it.id} className={`sb-item ${it.active ? "active" : ""}`} href="#">
              <span className="ic"><Icon name={it.icon} size={15} /></span>
              <span className="label">{it.label}</span>
              {it.badge && <span className="badge">{it.badge}</span>}
            </a>
          ))}
        </nav>
      </div>

      <div className="sb-section">
        <div className="sb-section-label">Configure</div>
        <nav className="sb-nav">
          {SECONDARY_NAV.map(it => (
            <a key={it.id} className="sb-item" href="#">
              <span className="ic"><Icon name={it.icon} size={15} /></span>
              <span className="label">{it.label}</span>
            </a>
          ))}
        </nav>
      </div>

      <div className="sb-spacer"></div>
    </aside>
  );
}

/* -----------------------------------------------------------
   Quote state chip (topbar)
   ----------------------------------------------------------- */

const QUOTE_STATES = [
  { id: "draft",  label: "Draft",          icon: "pencil-line",  meta: "saved 2 min ago" },
  { id: "review", label: "Internal review", icon: "user-check",  meta: "waiting on lead" },
  { id: "sent",   label: "Sent to customer", icon: "send",       meta: "today, 11:42" },
  { id: "won",    label: "Accepted (won)",  icon: "trophy",      meta: "PO required" },
  { id: "lost",   label: "Lost",            icon: "x-circle",    meta: "—" },
];

function QuoteStateChip({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onDoc(e) {
      if (open && ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const current = QUOTE_STATES.find(s => s.id === value) || QUOTE_STATES[0];

  return (
    <div className="qs-wrap" ref={ref}>
      <button
        className={`qs-chip s-${current.id}`}
        onClick={() => setOpen(!open)}
        title="Change quote state"
      >
        <span className="dot"></span>
        <span>{current.label}</span>
        <span className="ts">{current.meta}</span>
        <span className="chev"><Icon name="chevron-down" size={12}/></span>
      </button>
      {open && (
        <div className="qs-menu" role="menu">
          {QUOTE_STATES.map(s => (
            <div
              key={s.id}
              className={`opt ${s.id === value ? "active" : ""}`}
              onClick={() => { onChange(s.id); setOpen(false); }}
              role="menuitem"
            >
              <span className={`dot ${`s-${s.id}`}`} style={{
                background:
                  s.id === "draft"  ? "var(--text-3)" :
                  s.id === "review" ? "var(--warning)" :
                  s.id === "sent"   ? "var(--accent)" :
                  s.id === "won"    ? "var(--success)" :
                  "var(--danger)",
              }}></span>
              <span>{s.label}</span>
              <span className="meta">{s.meta}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* -----------------------------------------------------------
   Topbar
   ----------------------------------------------------------- */

function Topbar({ searchQuery, setSearchQuery, quoteState, setQuoteState, onShortcuts }) {
  const inputRef = useRef(null);

  useEffect(() => {
    // expose focus method via window for the shortcut handler
    window.__focusGlobalSearch = () => inputRef.current?.focus();
    return () => { delete window.__focusGlobalSearch; };
  }, []);

  return (
    <header className="topbar">
      <div className="crumbs">
        <span>Quotes</span>
        <span className="sep">/</span>
        <span>2026 Q2</span>
        <span className="sep">/</span>
        <span className="here">RFQ-2026-014 · Pump Manifold v3</span>
      </div>

      <QuoteStateChip value={quoteState} onChange={setQuoteState} />

      <div className="search">
        <span className="ic"><Icon name="search" size={14} /></span>
        <input
          ref={inputRef}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter parts, ops, history…"
        />
        <kbd>/</kbd>
      </div>

      <div className="top-actions">
        <button className="icon-btn" title="Keyboard shortcuts (?)" onClick={onShortcuts}>
          <Icon name="command" size={15} />
        </button>
        <button className="icon-btn" title="Notifications">
          <Icon name="bell" size={15} />
          <span className="dot"></span>
        </button>
        <div className="win-controls">
          <button className="icon-btn" title="Minimize"><Icon name="minus" size={13} /></button>
          <button className="icon-btn" title="Maximize"><Icon name="square" size={11} /></button>
          <button className="icon-btn" title="Close"><Icon name="x" size={13} /></button>
        </div>
      </div>
    </header>
  );
}

/* -----------------------------------------------------------
   Keyboard shortcuts cheatsheet
   ----------------------------------------------------------- */

function KbdOverlay({ onClose }) {
  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const groups = [
    {
      name: "Navigation",
      items: [
        { keys: ["V"], label: "Switch to Viewer workspace" },
        { keys: ["Q"], label: "Switch to Quote workspace" },
        { keys: ["/"], label: "Focus global search" },
        { keys: ["?"], label: "Toggle this cheatsheet" },
        { keys: ["Esc"], label: "Close menus and overlays" },
      ],
    },
    {
      name: "Quote actions",
      items: [
        { keys: ["S"], label: "Save quote" },
        { keys: ["E"], label: "Export PDF" },
        { keys: ["Shift", "S"], label: "Mark as Sent" },
        { keys: ["A"], label: "Add operation to selected part" },
        { keys: ["D"], label: "Duplicate selected part" },
      ],
    },
    {
      name: "Viewer",
      items: [
        { keys: ["F"], label: "Fit to view" },
        { keys: ["1"], label: "Isometric" },
        { keys: ["2"], label: "Front" },
        { keys: ["3"], label: "Top" },
        { keys: ["4"], label: "Right" },
        { keys: ["W"], label: "Toggle wireframe / solid" },
      ],
    },
    {
      name: "Parts",
      items: [
        { keys: ["↑"], label: "Select previous part" },
        { keys: ["↓"], label: "Select next part" },
        { keys: ["Space"], label: "Toggle include on selected" },
        { keys: ["X"], label: "Remove selected operation" },
      ],
    },
  ];

  return (
    <div className="kbd-overlay" onClick={onClose}>
      <div className="kbd-card" onClick={(e) => e.stopPropagation()}>
        <div className="head">
          <span className="title">Keyboard shortcuts</span>
          <button className="close" onClick={onClose} title="Close (Esc)">
            <Icon name="x" size={15}/>
          </button>
        </div>
        <div className="kbd-body">
          {groups.map(g => (
            <div className="kbd-group" key={g.name}>
              <h5>{g.name}</h5>
              {g.items.map((it, i) => (
                <div className="kbd-row" key={i}>
                  <span>{it.label}</span>
                  <span className="kbd-keys">
                    {it.keys.map((k, j) => <span className="kbd-key" key={j}>{k}</span>)}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Icon, Sidebar, Topbar, KbdOverlay });
