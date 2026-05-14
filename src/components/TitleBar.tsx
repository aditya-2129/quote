import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const win = getCurrentWindow();
    win.isMaximized().then(setIsMaximized).catch(() => {});
    const unlisten = win.onResized(() => {
      win.isMaximized().then(setIsMaximized).catch(() => {});
    });
    return () => { unlisten.then((fn) => fn()).catch(() => {}); };
  }, []);

  const win = getCurrentWindow();

  return (
    <div
      className="flex h-9 w-full shrink-0 select-none items-center"
      style={{ background: "#16161f", borderBottom: "1px solid #1e1e2e" }}
      data-tauri-drag-region
    >
      {/* App identity */}
      <div className="flex items-center gap-2 px-4" data-tauri-drag-region>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="shrink-0">
          <rect x="2" y="2" width="9" height="9" rx="1.5" fill="#6366f1" />
          <rect x="13" y="2" width="9" height="9" rx="1.5" fill="#6366f1" opacity="0.6" />
          <rect x="2" y="13" width="9" height="9" rx="1.5" fill="#6366f1" opacity="0.6" />
          <rect x="13" y="13" width="9" height="9" rx="1.5" fill="#6366f1" opacity="0.3" />
        </svg>
        <span className="text-[11px] font-semibold tracking-wide" style={{ color: "#9898b0" }}>
          Quote
        </span>
        <span className="text-[11px]" style={{ color: "#3d3d5c" }}>—</span>
        <span className="text-[11px]" style={{ color: "#686880" }}>
          Industrial Suite
        </span>
      </div>

      {/* Drag region fills remaining space */}
      <div className="flex-1" data-tauri-drag-region />

      {/* Window controls */}
      <div className="flex h-full">
        <WinButton
          title="Minimize"
          onClick={() => win.minimize()}
          icon={
            <svg width="11" height="1" viewBox="0 0 11 1">
              <line x1="0" y1="0.5" x2="11" y2="0.5" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          }
        />
        <WinButton
          title={isMaximized ? "Restore" : "Maximize"}
          onClick={() => win.toggleMaximize()}
          icon={
            isMaximized ? (
              <svg width="11" height="11" viewBox="0 0 11 11">
                <rect x="2" y="0" width="9" height="9" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1.1" />
                <rect x="0" y="2" width="9" height="9" rx="0.5" fill="#16161f" stroke="currentColor" strokeWidth="1.1" />
              </svg>
            ) : (
              <svg width="11" height="11" viewBox="0 0 11 11">
                <rect x="0.5" y="0.5" width="10" height="10" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1.1" />
              </svg>
            )
          }
        />
        <WinButton
          title="Close"
          onClick={() => win.close()}
          close
          icon={
            <svg width="11" height="11" viewBox="0 0 11 11">
              <line x1="0" y1="0" x2="11" y2="11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              <line x1="11" y1="0" x2="0" y2="11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          }
        />
      </div>
    </div>
  );
}

function WinButton({
  title,
  icon,
  close,
  onClick,
}: {
  title: string;
  icon: React.ReactNode;
  close?: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="flex h-full w-[46px] items-center justify-center transition-colors"
      style={{
        color: hovered ? (close ? "#ffffff" : "#e8e8f0") : "#686880",
        background: hovered
          ? close
            ? "#c42b1c"
            : "rgba(255,255,255,0.08)"
          : "transparent",
      }}
    >
      {icon}
    </button>
  );
}
