/* global React, Icon */
const { useState: useState_v } = React;

/* -----------------------------------------------------------
   The CAD viewport — placeholder "exploded assembly"
   built only from quadrilateral primitives (isometric cuboids).
   ----------------------------------------------------------- */
function ViewerCanvasPlaceholder({ theme }) {
  // Three cuboids stacked along Y, with a small explode offset.
  // Each cuboid drawn as: top quad + left quad + right quad.
  // Isometric angle: 30° — vectors (cos30, sin30) and (-cos30, sin30).
  const c30 = Math.cos(Math.PI / 6);
  const s30 = Math.sin(Math.PI / 6);

  const dark = theme === "dark";
  const top    = dark ? "#3b485d" : "#cfd7e2";
  const left   = dark ? "#2a3445" : "#b6c0cf";
  const right  = dark ? "#1f2734" : "#9fa9b8";
  const edge   = dark ? "#0a0d14" : "#1e2734";
  const accent = "#2f4f7d";

  function cuboid(cx, cy, w, h, d, fillScale = 1) {
    // half extents projected
    const hx = (w / 2) * c30;
    const hy = (w / 2) * s30;
    const dx = (d / 2) * c30;
    const dy = (d / 2) * s30;

    // top face corners
    const t1 = [cx,           cy - hy - dy];
    const t2 = [cx + hx + dx, cy - hy + dy + (hy - hy)]; // careful
    const t3 = [cx,           cy + hy + dy - (hy + dy - hy)]; // careful

    // recompute cleanly
    const front = [cx + hx, cy + hy];
    const back  = [cx - hx, cy - hy];
    const tBack = [back[0] + dx, back[1] - dy];
    const tFront= [front[0] + dx, front[1] - dy];
    const tFR   = [cx + hx + dx, cy + hy - dy];
    const tBL   = [cx - hx + dx, cy - hy - dy];
    const tBR   = back; const tFL = front;

    // bottom corners
    const bFL = front;
    const bBL = back;
    const bBR = [back[0] + 2*dx, back[1] - 2*dy + 2*hy*0]; // unused

    // Simpler: define 8 corners explicitly.
    const half = { x: (w/2)*c30, y: (w/2)*s30 };
    const dep  = { x: (d/2)*c30, y: -(d/2)*s30 };
    const ht   = h / 2;

    // base (top face plane at y=cy-ht), 4 corners
    const A = [cx - half.x - dep.x, cy - ht - half.y - dep.y];
    const B = [cx + half.x - dep.x, cy - ht + half.y - dep.y];
    const C = [cx + half.x + dep.x, cy - ht + half.y + dep.y];
    const D = [cx - half.x + dep.x, cy - ht - half.y + dep.y];
    // bottom face
    const A2 = [A[0], A[1] + h];
    const B2 = [B[0], B[1] + h];
    const C2 = [C[0], C[1] + h];
    const D2 = [D[0], D[1] + h];

    const poly = (pts, fill) => (
      <polygon points={pts.map(p => p.join(",")).join(" ")} fill={fill} stroke={edge} strokeWidth="0.6" strokeLinejoin="round" />
    );
    return (
      <g>
        {poly([B2, C2, D2, A2].slice().reverse(), left)} {/* dummy not used */}
        {poly([A, B, C, D], top)}        {/* top */}
        {poly([A, B, B2, A2], left)}     {/* left front face */}
        {poly([B, C, C2, B2], right)}    {/* right front face */}
      </g>
    );
  }

  return (
    <svg viewBox="0 0 480 340" width="100%" height="100%" style={{ maxWidth: 420, maxHeight: 300 }}>
      <defs>
        <filter id="ds" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="6" stdDeviation="8" floodColor="#000" floodOpacity={dark ? "0.5" : "0.10"} />
        </filter>
      </defs>
      <g filter="url(#ds)">
        {/* base plate */}
        {cuboid(240, 235, 220, 22, 110)}
        {/* mid block (slightly exploded up + offset right) */}
        {cuboid(255, 175, 130, 30, 70)}
        {/* top piece (most exploded) */}
        {cuboid(270, 110, 70, 22, 38)}
        {/* selection highlight on top piece */}
        <rect x="226" y="92" width="98" height="38" rx="2" fill="none" stroke={accent} strokeWidth="1.2" strokeDasharray="4 3" opacity="0.7" />
      </g>
    </svg>
  );
}

/* -----------------------------------------------------------
   Viewer Workspace
   ----------------------------------------------------------- */
function ViewerWorkspace({ theme }) {
  const [leftTab, setLeftTab] = useState_v("meshes");
  const [activeId, setActiveId] = useState_v("body-cap");
  const [orientation, setOrient] = useState_v("iso");
  const [display, setDisplay] = useState_v("solid");
  const [edges, setEdges] = useState_v(true);

  const groups = [
    {
      name: "Pump Manifold v3",
      children: [
        { id: "body-base",  name: "Body · base plate",    color: "#7b8a9f" },
        { id: "body-mid",   name: "Body · mid block",     color: "#9ca5b3" },
        { id: "body-cap",   name: "Body · cap (selected)",color: "#2f4f7d" },
      ],
    },
    {
      name: "Fasteners",
      children: [
        { id: "m6x12-1", name: "M6×12 hex socket  ×4", color: "#c0c0c0" },
        { id: "washer",  name: "Flat washer 6.4",     color: "#c0c0c0" },
      ],
    },
    {
      name: "Seals",
      children: [
        { id: "oring-1", name: "O-ring 18×2 NBR", color: "#1f1f1f" },
        { id: "oring-2", name: "O-ring 9×1.5 NBR", color: "#1f1f1f", hidden: true },
      ],
    },
  ];

  return (
    <div className="viewer-grid">
      {/* LEFT */}
      <div className="panel">
        <div className="tabstrip">
          <button className={leftTab === "files" ? "on" : ""} onClick={() => setLeftTab("files")}>
            <span className="ic"><Icon name="file" size={13} /></span> Files
          </button>
          <button className={leftTab === "meshes" ? "on" : ""} onClick={() => setLeftTab("meshes")}>
            <span className="ic"><Icon name="boxes" size={13} /></span> Meshes
          </button>
          <button className={leftTab === "materials" ? "on" : ""} onClick={() => setLeftTab("materials")}>
            <span className="ic"><Icon name="layers" size={13} /></span> Materials
          </button>
        </div>

        <div className="tree-section">
          {leftTab === "meshes" && groups.map((g, gi) => (
            <div className="tree-group" key={gi}>
              <div className="tree-group-head">
                <span className="chev"><Icon name="chevron-down" size={12} /></span>
                <span>{g.name}</span>
                <span className="count">{g.children.length}</span>
              </div>
              {g.children.map(m => (
                <div
                  key={m.id}
                  className={`tree-row ${activeId === m.id ? "sel" : ""} ${m.hidden ? "hidden" : ""}`}
                  onClick={() => setActiveId(m.id)}
                >
                  <span className="swatch" style={{ background: m.color }}></span>
                  <span className="name">{m.name}</span>
                  <span className="eye"><Icon name={m.hidden ? "eye-off" : "eye"} size={12} /></span>
                </div>
              ))}
            </div>
          ))}

          {leftTab === "files" && (
            <div style={{ padding: 6 }}>
              {["Pump Manifold v3.step", "PS_1250_FIXTURE BLOCKS.stp", "TEST BUTTON_9 CAVITY.stp"].map((f, i) => (
                <div key={f} className="tree-row" style={{ paddingLeft: 10 }}>
                  <Icon name="file-text" size={13} style={{ color: i === 0 ? "var(--accent-text)" : "var(--text-3)" }}/>
                  <span className="name" style={{ fontFamily: "var(--font-mono)", fontSize: 11.5 }}>{f}</span>
                  {i === 0 && <span className="chip accent" style={{ height: 18, padding: "0 6px", fontSize: 10 }}><span className="dot"></span>Active</span>}
                </div>
              ))}
            </div>
          )}

          {leftTab === "materials" && (
            <div style={{ padding: "6px 10px" }}>
              {[
                { name: "Steel · machined", hex: "#9ca5b3" },
                { name: "Aluminum · 6061",  hex: "#bfc7d1" },
                { name: "Brass · CW614N",   hex: "#c69f5a" },
                { name: "NBR rubber",       hex: "#1f1f1f" },
                { name: "Cap · powder-coat", hex: "#2f4f7d" },
              ].map(m => (
                <div className="kv" key={m.name} style={{ borderBottom: "1px dashed var(--divider)", padding: "8px 0" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 12, height: 12, background: m.hex, border: "1px solid rgba(0,0,0,0.1)", borderRadius: 3 }}></span>
                    <span style={{ fontSize: 12 }}>{m.name}</span>
                  </div>
                  <span className="v" style={{ fontSize: 10.5, color: "var(--text-3)" }}>{m.hex.toUpperCase()}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="left-foot">
          <div className="file">
            <span className="ic"><Icon name="file-check-2" size={14} /></span>
            <span className="name">Pump Manifold v3.step</span>
            <span className="units">mm</span>
          </div>
        </div>
      </div>

      {/* CENTER */}
      <div className="panel canvas-col">
        <div className="toolbar">
          <div className="tool-group">
            <button className="tool-btn" title="Open file"><Icon name="folder-open" size={15} /></button>
            <button className="tool-btn" title="Export screenshot"><Icon name="image-down" size={15} /></button>
          </div>
          <div className="tool-divider"></div>

          <div className="tool-group">
            <button className="tool-btn" title="Fit"><Icon name="maximize" size={15} /></button>
            <button className={`tool-btn ${orientation==="iso"?"on":""}`} onClick={() => setOrient("iso")} title="Isometric"><Icon name="box" size={15} /></button>
            <button className={`tool-btn ${orientation==="front"?"on":""}`} onClick={() => setOrient("front")} title="Front"><Icon name="square" size={15} /></button>
            <button className={`tool-btn ${orientation==="top"?"on":""}`} onClick={() => setOrient("top")} title="Top"><Icon name="panel-top" size={15} /></button>
            <button className={`tool-btn ${orientation==="right"?"on":""}`} onClick={() => setOrient("right")} title="Right"><Icon name="panel-right" size={15} /></button>
          </div>
          <div className="tool-divider"></div>

          <div className="tool-group">
            <button className={`tool-btn ${display==="solid"?"on":""}`} onClick={() => setDisplay("solid")} title="Solid"><Icon name="square-stack" size={15} /></button>
            <button className={`tool-btn ${display==="wireframe"?"on":""}`} onClick={() => setDisplay("wireframe")} title="Wireframe"><Icon name="grid-3x3" size={15} /></button>
            <button className={`tool-btn ${edges?"on":""}`} onClick={() => setEdges(!edges)} title="Edges"><Icon name="scan-line" size={15} /></button>
          </div>
          <div className="tool-divider"></div>

          <div className="tool-group">
            <button className="tool-btn" title="Section"><Icon name="scissors" size={15} /></button>
            <button className="tool-btn" title="Measure"><Icon name="ruler" size={15} /></button>
            <button className="tool-btn" title="Explode"><Icon name="move-3d" size={15} /></button>
          </div>

          <div className="right">
            <span className="tool-label">mm · ISO</span>
            <div className="theme-toggle">
              <button className="tool-btn on" title="Light" style={{ width: 24, height: 22 }}><Icon name="sun" size={12} /></button>
              <button className="tool-btn" title="Dark" style={{ width: 24, height: 22 }}><Icon name="moon" size={12} /></button>
            </div>
          </div>
        </div>

        <div className="canvas">
          <div className="canvas-grid"></div>
          <div className="canvas-hud-top">
            <span className="pill"><Icon name="box" size={11}/> Pump Manifold v3</span>
            <span className="pill">7 bodies · 2 hidden</span>
            <span className="pill"><Icon name="dot" size={11}/> mm · ISO</span>
          </div>
          <div className="canvas-content">
            <ViewerCanvasPlaceholder theme={theme} />
          </div>

          {/* axes */}
          <svg className="axes" viewBox="0 0 80 80">
            <line x1="10" y1="65" x2="10" y2="25" stroke="#5fa05f" strokeWidth="1.5"/>
            <line x1="10" y1="65" x2="60" y2="65" stroke="#c97c5d" strokeWidth="1.5"/>
            <line x1="10" y1="65" x2="35" y2="78" stroke="#5d80c9" strokeWidth="1.5"/>
            <text x="10" y="18" textAnchor="middle" fontFamily="IBM Plex Mono" fontSize="9" fill="#5fa05f">Y</text>
            <text x="68" y="68" fontFamily="IBM Plex Mono" fontSize="9" fill="#c97c5d">X</text>
            <text x="38" y="78" fontFamily="IBM Plex Mono" fontSize="9" fill="#5d80c9">Z</text>
          </svg>

          <div className="canvas-hud-bot">
            <button className="zoom-btn"><Icon name="minus" size={12}/></button>
            <span className="zoom-val">128%</span>
            <button className="zoom-btn"><Icon name="plus" size={12}/></button>
            <button className="zoom-btn" title="Fit"><Icon name="maximize" size={12}/></button>
          </div>
        </div>
      </div>

      {/* RIGHT */}
      <div className="panel">
        <div className="panel-head">
          <span className="title">Inspector</span>
          <div className="right">
            <button className="tool-btn on" title="Details"><Icon name="align-left" size={14}/></button>
            <button className="tool-btn" title="Display"><Icon name="settings-2" size={14}/></button>
          </div>
        </div>

        <div style={{ overflow: "auto" }}>
          <div className="insp-section">
            <h4>Geometry</h4>
            <div className="insp-tile-row">
              <div className="insp-tile">
                <div className="label">Volume</div>
                <div className="value">186.42 <span className="muted">cm³</span></div>
              </div>
              <div className="insp-tile">
                <div className="label">Surface</div>
                <div className="value">412.7 <span className="muted">cm²</span></div>
              </div>
            </div>
            <div className="kv"><span className="k">Bounding · X</span><span className="v">128.40 mm</span></div>
            <div className="kv"><span className="k">Bounding · Y</span><span className="v">86.20 mm</span></div>
            <div className="kv"><span className="k">Bounding · Z</span><span className="v">42.60 mm</span></div>
            <div className="kv"><span className="k">Material util.</span><span className="v">39.8%</span></div>
          </div>

          <div className="insp-section">
            <h4>Mesh</h4>
            <div className="kv"><span className="k">Bodies</span><span className="v">7</span></div>
            <div className="kv"><span className="k">Vertices</span><span className="v">18,412</span></div>
            <div className="kv"><span className="k">Triangles</span><span className="v">36,118</span></div>
            <div className="kv"><span className="k">Edges</span><span className="v">54,532</span></div>
          </div>

          <div className="insp-section" style={{ paddingBottom: 14 }}>
            <h4>Selection</h4>
          </div>
          <div className="insp-selection">
            <div className="row1">
              <span className="swatch" style={{ background: "#2f4f7d" }}></span>
              <span className="name">Body · cap</span>
              <span className="id">#0042</span>
            </div>
            <div className="grid">
              <span className="k">Vol.</span><span className="v">48.10 cm³</span>
              <span className="k">Mass</span><span className="v">0.130 kg</span>
              <span className="k">Faces</span><span className="v">62</span>
              <span className="k">Tri.</span><span className="v">8,440</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

window.ViewerWorkspace = ViewerWorkspace;
