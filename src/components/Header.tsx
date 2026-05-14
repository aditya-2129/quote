import { Search, Bell, Maximize2, Minus, X } from "lucide-react";
import { useState } from "react";

export function Header() {
  const [searchFocused, setSearchFocused] = useState(false);

  const handleMinimize = async () => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().minimize();
    } catch {
      // Running in browser, not Tauri
    }
  };

  const handleMaximize = async () => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().toggleMaximize();
    } catch {
      // Running in browser, not Tauri
    }
  };

  const handleClose = async () => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().close();
    } catch {
      // Running in browser, not Tauri
    }
  };

  return (
    <header
      data-tauri-drag-region
      className="flex items-center justify-between border-b px-5"
      style={{
        height: "var(--spacing-header)",
        minHeight: "var(--spacing-header)",
        backgroundColor: "var(--color-bg-secondary)",
        borderColor: "var(--color-border-secondary)",
      }}
    >
      {/* Left Section - Breadcrumb */}
      <div className="flex items-center gap-2">
        <span
          className="text-sm font-medium"
          style={{ color: "var(--color-text-primary)" }}
        >
          Dashboard
        </span>
        <span style={{ color: "var(--color-text-muted)" }}>/</span>
        <span
          className="text-sm"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          Overview
        </span>
      </div>

      {/* Center - Search */}
      <div className="flex flex-1 justify-center px-8">
        <div
          className="relative flex w-full max-w-md items-center transition-all duration-300"
          style={{
            maxWidth: searchFocused ? "32rem" : "24rem",
          }}
        >
          <Search
            size={14}
            className="absolute left-3"
            style={{ color: "var(--color-text-muted)" }}
          />
          <input
            type="text"
            placeholder="Search projects, quotes, parts..."
            className="w-full rounded-lg border py-1.5 pr-4 pl-9 text-sm transition-all duration-300 outline-none"
            style={{
              backgroundColor: searchFocused
                ? "var(--color-bg-tertiary)"
                : "var(--color-bg-primary)",
              borderColor: searchFocused
                ? "var(--color-accent-primary)"
                : "var(--color-border-primary)",
              color: "var(--color-text-primary)",
              boxShadow: searchFocused ? "var(--shadow-glow)" : "none",
            }}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
          />
          <kbd
            className="absolute right-3 hidden rounded px-1.5 py-0.5 text-[10px] font-medium sm:block"
            style={{
              backgroundColor: "var(--color-bg-surface)",
              color: "var(--color-text-muted)",
              border: "1px solid var(--color-border-primary)",
            }}
          >
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-1">
        {/* Notifications */}
        <button
          className="relative rounded-lg p-2 transition-colors duration-200"
          style={{ color: "var(--color-text-secondary)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "var(--color-bg-hover)";
            e.currentTarget.style.color = "var(--color-text-primary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
            e.currentTarget.style.color = "var(--color-text-secondary)";
          }}
        >
          <Bell size={16} />
          <span
            className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full"
            style={{
              backgroundColor: "var(--color-status-error)",
              boxShadow: "0 0 6px var(--color-status-error)",
            }}
          />
        </button>

        {/* Divider */}
        <div
          className="mx-2 h-5 w-px"
          style={{ backgroundColor: "var(--color-border-primary)" }}
        />

        {/* Window Controls */}
        <button
          onClick={handleMinimize}
          className="rounded p-1.5 transition-colors duration-150"
          style={{ color: "var(--color-text-muted)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "var(--color-bg-hover)";
            e.currentTarget.style.color = "var(--color-text-secondary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
            e.currentTarget.style.color = "var(--color-text-muted)";
          }}
        >
          <Minus size={14} />
        </button>
        <button
          onClick={handleMaximize}
          className="rounded p-1.5 transition-colors duration-150"
          style={{ color: "var(--color-text-muted)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "var(--color-bg-hover)";
            e.currentTarget.style.color = "var(--color-text-secondary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
            e.currentTarget.style.color = "var(--color-text-muted)";
          }}
        >
          <Maximize2 size={14} />
        </button>
        <button
          onClick={handleClose}
          className="rounded p-1.5 transition-colors duration-150"
          style={{ color: "var(--color-text-muted)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "#e53935";
            e.currentTarget.style.color = "white";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
            e.currentTarget.style.color = "var(--color-text-muted)";
          }}
        >
          <X size={14} />
        </button>
      </div>
    </header>
  );
}
