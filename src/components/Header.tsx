import { useState, useEffect } from "react";
import { Search, Bell, Minimize2, Maximize2, Minus, X, Command } from "lucide-react";
import { KbdOverlay } from "./KbdOverlay";
import brandLogo from "../assets/quote-logo.svg";

export function Header() {
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    async function check() {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const maximized = await getCurrentWindow().isMaximized();
        setIsMaximized(maximized);
      } catch {
        /* browser */
      }
    }
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      const inField = tag === "input" || tag === "textarea" || tag === "select" || (e.target as HTMLElement)?.isContentEditable;
      if (e.key === "?" && !inField) {
        e.preventDefault();
        setShortcutsOpen(o => !o);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const handleMinimize = async () => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().minimize();
    } catch {
      /* browser */
    }
  };

  const handleMaximize = async () => {
    setIsMaximized(prev => !prev);
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().toggleMaximize();
    } catch {
      /* browser */
    }
  };

  const handleClose = async () => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().close();
    } catch {
      /* browser */
    }
  };

  return (
    <>
      <header className="topbar" data-tauri-drag-region>
        <div className="hd-brand">
          <img className="brand-logo" src={brandLogo} alt="Quote" />
        </div>

        <div className="topbar-divider" />

        <div className="search">
          <Search size={13} className="ic" />
          <input type="text" placeholder="Search…" />
          <kbd>⌘K</kbd>
        </div>

        <div className="top-actions">
          <button className="icon-btn" onClick={() => setShortcutsOpen(o => !o)} title="Keyboard shortcuts (?)">
            <Command size={15} />
          </button>
          <button className="icon-btn">
            <Bell size={15} />
            <span className="dot" />
          </button>
        </div>

        <div className="win-controls">
          <button className="win-btn" onClick={handleMinimize}>
            <Minus size={14} />
          </button>
          <button className="win-btn" onClick={handleMaximize}>
            {isMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <button className="win-btn close" onClick={handleClose}>
            <X size={14} />
          </button>
        </div>
      </header>
      {shortcutsOpen && <KbdOverlay onClose={() => setShortcutsOpen(false)} />}
    </>
  );
}
