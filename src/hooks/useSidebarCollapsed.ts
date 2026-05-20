import { useState } from "react";

export function useSidebarCollapsed(): [boolean, () => void, (val: boolean) => void] {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("quote:sidebar-collapsed");
      if (stored !== null) {
        return stored === "true";
      }
    }
    return false;
  });

  const toggle = () => {
    setCollapsed(prev => {
      const next = !prev;
      if (typeof window !== "undefined") {
        localStorage.setItem("quote:sidebar-collapsed", String(next));
      }
      return next;
    });
  };

  const setValue = (val: boolean) => {
    setCollapsed(val);
    if (typeof window !== "undefined") {
      localStorage.setItem("quote:sidebar-collapsed", String(val));
    }
  };

  return [collapsed, toggle, setValue];
}
