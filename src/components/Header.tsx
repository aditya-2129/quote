import { Search, Bell, Maximize2, Minus, X } from "lucide-react";

export function Header() {
  const handleMinimize = async () => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().minimize();
    } catch { /* browser */ }
  };

  const handleMaximize = async () => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().toggleMaximize();
    } catch { /* browser */ }
  };

  const handleClose = async () => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().close();
    } catch { /* browser */ }
  };

  return (
    <header className="topbar" data-tauri-drag-region>
      <div className="hd-brand">
        <div className="mark">Q</div>
        <div className="hd-brand-text">
          <div className="wordmark">Quote</div>
          <div className="hd-eyebrow">Locus Manufacturing</div>
        </div>
      </div>

      <div className="topbar-divider" />

      <div className="search">
        <Search size={13} className="ic" />
        <input type="text" placeholder="Search…" />
        <kbd>⌘K</kbd>
      </div>

      <div className="top-actions">
        <button className="icon-btn">
          <Bell size={15} />
          <span className="dot" />
        </button>
      </div>

      <div className="win-controls">
        <button className="win-btn" onClick={handleMinimize}><Minus size={14} /></button>
        <button className="win-btn" onClick={handleMaximize}><Maximize2 size={14} /></button>
        <button className="win-btn close" onClick={handleClose}><X size={14} /></button>
      </div>
    </header>
  );
}
