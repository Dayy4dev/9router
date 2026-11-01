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
  if (!color || typeof color !== "string") {
    root.style.removeProperty("--color-primary");
    root.style.removeProperty("--color-primary-hover");
    root.style.removeProperty("--color-primary-rgb");
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

  root.style.setProperty("--color-primary", color);
  root.style.setProperty("--color-primary-hover", hoverColor);
  root.style.setProperty("--color-primary-rgb", `${rgb.r}, ${rgb.g}, ${rgb.b}`);
  root.style.setProperty("--color-accent", color);
  root.style.setProperty("--color-brand-100", color100);
  root.style.setProperty("--color-brand-200", color200);
  root.style.setProperty("--color-brand-300", color300);
  root.style.setProperty("--color-brand-400", color400);
  root.style.setProperty("--color-brand-500", color);
  root.style.setProperty("--color-brand-600", color600);
  root.style.setProperty("--color-brand-700", color700);
  root.style.setProperty("--shadow-warm", `0 2px 12px -2px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.25)`);
  root.style.setProperty("--shadow-focus", `0 0 0 3px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.2)`);

  try {
    localStorage.setItem("themeColor", color);
  } catch {}
}

const useThemeStore = create((set, get) => ({
  theme: "glass",
  themeColor: null,
  canChangeTheme: false,
  hydrated: false,

  /** Called by the shell with the server value; also used for the SSR default. */
  setServerTheme: (theme, canChange = false, color = null) => {
    const id = normalize(theme);
    set({ theme: id, themeColor: color, canChangeTheme: !!canChange, hydrated: true });
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
