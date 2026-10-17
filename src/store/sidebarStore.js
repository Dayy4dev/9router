import { create } from "zustand";

export const useSidebarStore = create((set) => ({
  collapsed: false,
  toggle: () =>
    set((state) => {
      const next = !state.collapsed;
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("9router_sidebar_collapsed", next ? "1" : "0");
        } catch (_) {}
      }
      return { collapsed: next };
    }),
  setCollapsed: (collapsed) => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("9router_sidebar_collapsed", collapsed ? "1" : "0");
      } catch (_) {}
    }
    set({ collapsed });
  },
  initFromStorage: () => {
    if (typeof window !== "undefined") {
      try {
        const val = localStorage.getItem("9router_sidebar_collapsed");
        if (val !== null) {
          set({ collapsed: val === "1" });
        }
      } catch (_) {}
    }
  },
}));
