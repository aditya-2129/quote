type IconProps = { size?: number; className?: string };

// Cube vertices — fills 90% of a 20×20 viewBox with correct isometric proportions
//   T=(10,1)  TL=(1,5)  TR=(19,5)  C=(10,9)  BL=(1,13)  BR=(19,13)  B=(10,17)
const p = (arr: number[][]) => arr.map(r => r.join(",")).join(" ");

const topPts   = p([[10,1],[1,5],[10,9],[19,5]]);
const leftPts  = p([[1,5],[1,13],[10,17],[10,9]]);
const rightPts = p([[10,9],[19,5],[19,13],[10,17]]);

// All 9 visible wireframe edges
function Wire({ sw = 1.2, col = "currentColor" }: { sw?: number; col?: string }) {
  return (
    <g stroke={col} strokeWidth={sw} fill="none" strokeLinejoin="round" strokeLinecap="round">
      <polygon points={topPts} />
      <polygon points={leftPts} />
      <polygon points={rightPts} />
      {/* shared internal edges (already drawn by polygons, this just boldens centre) */}
    </g>
  );
}

// Filled cube with 3 shaded faces
function Solid({ top = "#7dd3fc", left = "#0369a1", right = "#0284c7", stroke = "#01406b" }: {
  top?: string; left?: string; right?: string; stroke?: string;
}) {
  return (
    <g strokeLinejoin="round" strokeWidth={0.6} stroke={stroke}>
      <polygon points={topPts}   fill={top}   />
      <polygon points={leftPts}  fill={left}  />
      <polygon points={rightPts} fill={right} />
    </g>
  );
}

// ── View orientation icons ────────────────────────────────────────────────────

export function IsoViewIcon({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Wire />
    </svg>
  );
}

export function FrontViewIcon({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Wire sw={0.7} />
      <polygon points={leftPts} fill="currentColor" opacity={0.3} />
      <polygon points={leftPts} stroke="currentColor" strokeWidth={1.6} fill="none" strokeLinejoin="round" />
    </svg>
  );
}

export function TopViewIcon({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Wire sw={0.7} />
      <polygon points={topPts} fill="currentColor" opacity={0.3} />
      <polygon points={topPts} stroke="currentColor" strokeWidth={1.6} fill="none" strokeLinejoin="round" />
    </svg>
  );
}

export function RightViewIcon({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Wire sw={0.7} />
      <polygon points={rightPts} fill="currentColor" opacity={0.3} />
      <polygon points={rightPts} stroke="currentColor" strokeWidth={1.6} fill="none" strokeLinejoin="round" />
    </svg>
  );
}

// ── Display mode icons ────────────────────────────────────────────────────────

export function ShadedIcon({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Solid />
    </svg>
  );
}

export function WireframeIcon({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Wire sw={1.2} />
      {/* hidden back edges dashed */}
      <line x1="10" y1="1"  x2="10" y2="9"  stroke="currentColor" strokeWidth={0.7} strokeDasharray="1.6 1.1" opacity={0.45} />
      <line x1="1"  y1="5"  x2="10" y2="9"  stroke="currentColor" strokeWidth={0.7} strokeDasharray="1.6 1.1" opacity={0.45} />
      <line x1="19" y1="5"  x2="10" y2="9"  stroke="currentColor" strokeWidth={0.7} strokeDasharray="1.6 1.1" opacity={0.45} />
    </svg>
  );
}

export function EdgesIcon({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Solid top="#e2e8f0" left="#94a3b8" right="#cbd5e1" stroke="#64748b" />
      <Wire sw={1.3} />
    </svg>
  );
}

// ── Tool icons ────────────────────────────────────────────────────────────────

export function FitViewIcon({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none"
      stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      {/* corner frame brackets */}
      <polyline points="1,5 1,1 5,1"   strokeWidth={1.4} />
      <polyline points="15,1 19,1 19,5" strokeWidth={1.4} />
      <polyline points="1,15 1,19 5,19" strokeWidth={1.4} />
      <polyline points="19,15 19,19 15,19" strokeWidth={1.4} />
      {/* mini cube centred inside */}
      <polygon points={p([[10,5],[5,7.5],[10,10],[15,7.5]])} strokeWidth={0.85} />
      <polygon points={p([[5,7.5],[5,13],[10,15],[10,10]])} strokeWidth={0.85} />
      <polygon points={p([[10,10],[15,7.5],[15,13],[10,15]])} strokeWidth={0.85} />
    </svg>
  );
}

export function SectionIcon({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      {/* dim cube */}
      <Wire sw={0.8} col="currentColor" />
      {/* cutting plane — vertical line through cube centre */}
      <line x1="10" y1="1" x2="10" y2="17"
        stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
      {/* hatch on left-cut section */}
      <line x1="10" y1="6.5" x2="6"  y2="9"   stroke="currentColor" strokeWidth={0.75} opacity={0.65} />
      <line x1="10" y1="9"   x2="6"  y2="11.5" stroke="currentColor" strokeWidth={0.75} opacity={0.65} />
      <line x1="10" y1="11.5" x2="6" y2="14"   stroke="currentColor" strokeWidth={0.75} opacity={0.65} />
    </svg>
  );
}

export function MeasureIcon({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none"
      stroke="currentColor" strokeLinecap="round">
      {/* ruler body */}
      <rect x="1" y="6.5" width="18" height="7" rx="1.2" strokeWidth={1.2} />
      {/* major tick (centre) */}
      <line x1="10" y1="6.5" x2="10" y2="10"  strokeWidth={1.1} />
      {/* minor ticks */}
      <line x1="5"  y1="6.5" x2="5"  y2="9"   strokeWidth={1} />
      <line x1="7.5" y1="6.5" x2="7.5" y2="8.5" strokeWidth={0.85} />
      <line x1="12.5" y1="6.5" x2="12.5" y2="8.5" strokeWidth={0.85} />
      <line x1="15" y1="6.5" x2="15" y2="9"   strokeWidth={1} />
    </svg>
  );
}

export function OpenFileIcon({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none"
      stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round">
      {/* folder back */}
      <path d="M2,5.5 L2,16 Q2,17 3,17 L17,17 Q18,17 18,16 L18,8 Q18,7 17,7 L9.5,7 L8,5 Q7.5,4 6.5,4 L3,4 Q2,4 2,5.5 Z" />
      {/* open flap */}
      <path d="M2,8 L18,8" strokeWidth={1} opacity={0.5} />
    </svg>
  );
}

export function ScreenshotIcon({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none"
      stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round">
      {/* camera body */}
      <rect x="2" y="6" width="16" height="11" rx="1.5" />
      {/* lens */}
      <circle cx="10" cy="11.5" r="3" />
      {/* viewfinder bump */}
      <path d="M7,6 L7.8,3.5 Q8,3 8.5,3 L11.5,3 Q12,3 12.2,3.5 L13,6" />
      {/* flash dot */}
      <circle cx="15.5" cy="9" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ExplodeIcon({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      {/* top face shifted up */}
      <polygon points={p([[10,1],[3,4],[10,7],[17,4]])}
        fill="currentColor" fillOpacity={0.2} stroke="currentColor" strokeWidth={0.9} strokeLinejoin="round" />
      {/* left face shifted left */}
      <polygon points={p([[1,7],[1,14],[8,17],[8,10]])}
        fill="currentColor" fillOpacity={0.2} stroke="currentColor" strokeWidth={0.9} strokeLinejoin="round" />
      {/* right face shifted right */}
      <polygon points={p([[12,10],[19,7],[19,14],[12,17]])}
        fill="currentColor" fillOpacity={0.2} stroke="currentColor" strokeWidth={0.9} strokeLinejoin="round" />
      {/* small arrows indicating explosion */}
      <line x1="10" y1="8.5" x2="10" y2="5.5" stroke="currentColor" strokeWidth={0.7} opacity={0.5} strokeDasharray="1.2 0.8" />
      <line x1="8.5" y1="11" x2="5.5" y2="11" stroke="currentColor" strokeWidth={0.7} opacity={0.5} strokeDasharray="1.2 0.8" />
      <line x1="11.5" y1="11" x2="14.5" y2="11" stroke="currentColor" strokeWidth={0.7} opacity={0.5} strokeDasharray="1.2 0.8" />
    </svg>
  );
}
