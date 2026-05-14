import { useState, useEffect } from "react";

export function useSidebarCollapsed(): [boolean, () => void, (val: boolean) => void] {
  const [collapsed, setCollapsed] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("quote:sidebar-collapsed");
      if (stored !== null) {
        setCollapsed(stored === "true");
      }
    }
  }, []);

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
