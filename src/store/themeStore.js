"use client";

import { create } from "zustand";
import { THEME_CONFIG } from "@/shared/constants/config";

// Two modes, both dark-based: glass is the default (a glassmorphism variant
// that keeps the exact same palette while surfaces turn translucent), and solid
// dark stays as the fallback.
export const THEME_IDS = ["glass", "dark"];

// The mode belongs to the installation, not to one browser. It is stored in
// settings.theme, written only by a password session, and mirrored into the
// document for every visitor, so switching it changes the whole site at once
// instead of quietly applying to whoever happened to click.
function normalize(theme) {
  return THEME_IDS.includes(theme) ? theme : "glass";
}

function hexToRgb(hex) {
  if (!hex) return null;
  const clean = hex.replace("#", "");
  const num = parseInt(clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean, 16);
  if (isNaN(num)) return null;
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function rgbToHex(r, g, b) {
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return "#" + [clamp(r), clamp(g), clamp(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: Math.round(h * 360), s, l };
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  if (s === 0) return { r: Math.round(l * 255), g: Math.round(l * 255), b: Math.round(l * 255) };
  const hue2rgb = (p, q, t) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  };
}

function deriveSecondaryColor(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return "#e5cb4a";
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const secHsl = {
    h: (hsl.h + 38) % 360,
    s: Math.max(0.68, hsl.s),
    l: Math.max(0.48, Math.min(0.60, hsl.l)),
  };
  const secRgb = hslToRgb(secHsl.h, secHsl.s, secHsl.l);
  return rgbToHex(secRgb.r, secRgb.g, secRgb.b);
}

function adjustColor(hex, factor) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const { r, g, b } = rgb;
  if (factor > 0) {
    return rgbToHex(r + (255 - r) * factor, g + (255 - g) * factor, b + (255 - b) * factor);
  }
  return rgbToHex(r * (1 + factor), g * (1 + factor), b * (1 + factor));
}

export function applyThemeColor(color) {
  if (typeof window === "undefined") return;
  const root = document.documentElement;
  if (!root?.style) return;
  if (!color || typeof color !== "string") {
    root.style.removeProperty("--color-primary");
    root.style.removeProperty("--color-primary-hover");
    root.style.removeProperty("--color-primary-rgb");
    root.style.removeProperty("--color-secondary");
    root.style.removeProperty("--color-secondary-hover");
    root.style.removeProperty("--color-secondary-rgb");
    root.style.removeProperty("--color-secondary-subtle");
    root.style.removeProperty("--color-accent");
    root.style.removeProperty("--color-brand-100");
    root.style.removeProperty("--color-brand-200");
    root.style.removeProperty("--color-brand-300");
    root.style.removeProperty("--color-brand-400");
    root.style.removeProperty("--color-brand-500");
    root.style.removeProperty("--color-brand-600");
    root.style.removeProperty("--color-brand-700");
    root.style.removeProperty("--shadow-warm");
    root.style.removeProperty("--shadow-focus");
    root.style.removeProperty("--shadow-glow");
    try {
      localStorage.removeItem("themeColor");
    } catch {}
    return;
  }

  const rgb = hexToRgb(color);
  if (!rgb) return;

  const hoverColor = adjustColor(color, -0.12);
  const color100 = adjustColor(color, +0.40);
  const color200 = adjustColor(color, +0.28);
  const color300 = adjustColor(color, +0.18);
  const color400 = adjustColor(color, +0.10);
  const color600 = hoverColor;
  const color700 = adjustColor(color, -0.28);

  const secColor = deriveSecondaryColor(color);
  const secRgb = hexToRgb(secColor) || { r: 229, g: 203, b: 74 };
  const secHover = adjustColor(secColor, -0.12);
  const secSubtle = adjustColor(secColor, +0.35);

  root.style.setProperty("--color-primary", color);
  root.style.setProperty("--color-primary-hover", hoverColor);
  root.style.setProperty("--color-primary-rgb", `${rgb.r}, ${rgb.g}, ${rgb.b}`);
  root.style.setProperty("--color-secondary", secColor);
  root.style.setProperty("--color-secondary-hover", secHover);
  root.style.setProperty("--color-secondary-rgb", `${secRgb.r}, ${secRgb.g}, ${secRgb.b}`);
  root.style.setProperty("--color-secondary-subtle", secSubtle);
  root.style.setProperty("--color-accent", color);
  root.style.setProperty("--color-brand-100", color100);
  root.style.setProperty("--color-brand-200", color200);
  root.style.setProperty("--color-brand-300", color300);
  root.style.setProperty("--color-brand-400", color400);
  root.style.setProperty("--color-brand-500", color);
  root.style.setProperty("--color-brand-600", color600);
  root.style.setProperty("--color-brand-700", color700);
  root.style.setProperty("--shadow-warm", `0 4px 16px -2px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.32)`);
  root.style.setProperty("--shadow-focus", `0 0 0 3px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.22)`);
  root.style.setProperty("--shadow-glow", `0 0 24px -2px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.45)`);

  try {
    localStorage.setItem("themeColor", color);
  } catch {}
}

const useThemeStore = create((set, get) => ({
  theme: "glass",
  themeColor: null,
  topologyBg: null,
  topologyBgDim: 0,
  canChangeTheme: false,
  hydrated: false,

  /** Called by the shell with the server value; also used for the SSR default. */
  setServerTheme: (theme, canChange = false, color = null, serverBg = undefined, serverDim = undefined) => {
    const id = normalize(theme);
    let localBg = null;
    let localDim = null;
    try {
      localBg = localStorage.getItem("topologyBg");
      const d = localStorage.getItem("topologyBgDim");
      if (d !== null) localDim = Number(d);
    } catch {}

    const bg = serverBg !== undefined && serverBg !== null ? serverBg : (localBg || null);
    const dim = serverDim !== undefined && serverDim !== null ? Number(serverDim) : (localDim !== null ? localDim : 0);

    set({
      theme: id,
      themeColor: color,
      topologyBg: bg,
      topologyBgDim: dim,
      canChangeTheme: !!canChange,
      hydrated: true,
    });
    applyTheme(id);
    applyThemeColor(color);
  },

  /**
   * Applies and persists a new mode. Returns false without touching anything
   * when the session is not allowed to change it (an API-key sign-in), so the
   * control can never repaint the site behind the administrator's back.
   */
  setTheme: async (theme) => {
    if (!get().canChangeTheme) return false;
    const id = normalize(theme);
    set({ theme: id });
    applyTheme(id);
    try {
      const res = await fetch("/api/theme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: id }),
      });
      if (!res.ok) throw new Error(await res.text());
      return true;
    } catch (error) {
      // Roll back so the document never shows a mode the server refused.
      const previous = get().theme;
      set({ theme: previous });
      applyTheme(previous);
      console.error("Theme change rejected:", error);
      return false;
    }
  },

  /**
   * Applies and persists a custom theme accent color.
   */
  setThemeColor: async (color) => {
    if (!get().canChangeTheme) return false;
    const previous = get().themeColor;
    set({ themeColor: color });
    applyThemeColor(color);
    try {
      const res = await fetch("/api/theme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ themeColor: color }),
      });
      if (!res.ok) throw new Error(await res.text());
      return true;
    } catch (error) {
      set({ themeColor: previous });
      applyThemeColor(previous);
      console.error("Theme color change rejected:", error);
      return false;
    }
  },

  /**
   * Applies and persists custom topology backdrop.
   */
  setTopologyBg: async (value) => {
    if (!get().canChangeTheme) return false;
    const previous = get().topologyBg;
    set({ topologyBg: value });
    try {
      if (value) localStorage.setItem("topologyBg", value);
      else localStorage.removeItem("topologyBg");
    } catch {}
    try {
      const res = await fetch("/api/theme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topologyBg: value }),
      });
      if (!res.ok) throw new Error(await res.text());
      return true;
    } catch (error) {
      set({ topologyBg: previous });
      try {
        if (previous) localStorage.setItem("topologyBg", previous);
        else localStorage.removeItem("topologyBg");
      } catch {}
      console.error("Topology backdrop change rejected:", error);
      return false;
    }
  },

  /**
   * Applies and persists custom topology backdrop dim intensity (0 - 100).
   */
  setTopologyBgDim: async (dim) => {
    if (!get().canChangeTheme) return false;
    const previous = get().topologyBgDim;
    const n = Math.max(0, Math.min(100, Math.round(Number(dim) || 0)));
    set({ topologyBgDim: n });
    try {
      localStorage.setItem("topologyBgDim", String(n));
    } catch {}
    try {
      const res = await fetch("/api/theme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topologyBgDim: n }),
      });
      if (!res.ok) throw new Error(await res.text());
      return true;
    } catch (error) {
      set({ topologyBgDim: previous });
      try {
        localStorage.setItem("topologyBgDim", String(previous));
      } catch {}
      console.error("Topology backdrop dim change rejected:", error);
      return false;
    }
  },

  toggleTheme: () => get().setTheme(get().theme === "glass" ? "dark" : "glass"),
}));

// Apply theme to document. "dark" always stays on (both modes are dark);
// "glass" adds the frosted-token overrides in globals.css.
export function applyTheme(theme) {
  if (typeof window === "undefined") return;
  const root = document.documentElement;
  root.classList.add("dark");
  root.classList.toggle("glass", normalize(theme) === "glass");
}

export default useThemeStore;
