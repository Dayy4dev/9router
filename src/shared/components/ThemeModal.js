"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import PropTypes from "prop-types";
import { cn } from "@/shared/utils/cn";
import useThemeStore, { THEME_IDS } from "@/store/themeStore";

export const COLOR_PRESETS = [
  { id: "default", label: "Coral", hex: "#E56A4A", isDefault: true },
  { id: "blue", label: "Blue", hex: "#3B82F6" },
  { id: "emerald", label: "Emerald", hex: "#10B981" },
  { id: "purple", label: "Purple", hex: "#8B5CF6" },
  { id: "rose", label: "Rose", hex: "#EC4899" },
  { id: "amber", label: "Amber", hex: "#F59E0B" },
  { id: "cyan", label: "Cyan", hex: "#06B6D4" },
  { id: "indigo", label: "Indigo", hex: "#6366F1" },
];

const MODES = [
  {
    id: "dark",
    icon: "dark_mode",
    label: "Dark",
    desc: "Solid dark panels on a neutral warm base",
    // Preview swatches mirror the real tokens: .dark surface / surface-2 / base.
    swatches: ["#1a1a1a", "#262626", "#303030", "#333333"],
  },
  {
    id: "glass",
    icon: "blur_on",
    label: "Glass",
    desc: "Frosted translucent panels over a soft aurora backdrop",
    swatches: ["#0b0e14", "#171b24", "#2a2118", "#1b2030"],
  },
];

/**
 * Theme picker rendered as a centered modal, matching Change Log.
 *
 * The previous version expanded inline inside the grid menu, which pushed the
 * account rows downward and read as a dropdown rather than a destination. The
 * portal/overlay/animation here are the same ones ChangelogModal uses so the
 * two feel identical.
 */
export default function ThemeModal({ isOpen, onClose }) {
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);
  const themeColor = useThemeStore((state) => state.themeColor);
  const setThemeColor = useThemeStore((state) => state.setThemeColor);
  // A key-signed session has no theme control: the site-wide mode is an
  // administrator setting, so the picker is replaced by an explanation.
  const canChangeTheme = useThemeStore((state) => state.canChangeTheme);
  const modalRef = useRef(null);
  const [customHex, setCustomHex] = useState(themeColor || "#E56A4A");

  useEffect(() => {
    setCustomHex(themeColor || "#E56A4A");
  }, [themeColor]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    const onOutside = (e) => {
      if (modalRef.current && !modalRef.current.contains(e.target)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onOutside);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 backdrop-blur-sm" style={{ backgroundColor: "var(--color-scrim)" }} onClick={onClose} />
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="Theme"
        className="relative w-full bg-surface border border-border rounded-xl shadow-2xl animate-in fade-in zoom-in-95 duration-200 max-w-md max-h-[85vh] overflow-y-auto custom-scrollbar"
      >
        <div className="flex items-center justify-between gap-3 p-3 border-b border-border-subtle">
          <h2 className="text-lg font-semibold text-text-main">Theme</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded-lg text-text-muted hover:text-text-main hover:bg-surface-2 transition-all"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {!canChangeTheme && (
          <div className="p-4 text-sm text-text-muted leading-relaxed">
            <span className="flex items-center gap-2 text-text-main font-medium mb-1">
              <span className="material-symbols-outlined text-[18px]">lock</span>
              Administrator setting
            </span>
            The theme applies to the whole site and can only be changed from a password sign-in.
            This session signed in with an API key, so the mode stays as the administrator set it.
          </div>
        )}

        <div className="p-3 flex flex-col gap-2">
          {THEME_IDS.map((id) => {
            const mode = MODES.find((m) => m.id === id);
            if (!mode) return null;
            const active = id === theme;
            return (
              <button
                key={id}
                onClick={() => canChangeTheme && setTheme(id)}
                disabled={!canChangeTheme}
                aria-pressed={active}
                className={cn(
                  "flex items-center gap-3 w-full p-3 rounded-xl border text-left transition-colors",
                  active
                    ? "border-primary/50 bg-primary/10"
                    : "border-border-subtle hover:bg-surface-2",
                  !canChangeTheme && "opacity-60 cursor-not-allowed hover:bg-transparent",
                )}
              >
                {/* Mini preview of the palette so the choice is visible, not just named. */}
                <span className="flex shrink-0 overflow-hidden rounded-[10px] border border-border">
                  {mode.swatches.map((c, i) => (
                    <span key={i} className="block h-9 w-3.5" style={{ backgroundColor: c }} />
                  ))}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "flex items-center gap-2 text-sm font-medium",
                      active ? "text-primary" : "text-text-main",
                    )}
                  >
                    <span className="material-symbols-outlined text-[18px]">{mode.icon}</span>
                    {mode.label}
                  </span>
                  <span className="block mt-0.5 text-xs text-text-muted">{mode.desc}</span>
                </span>
                {active && (
                  <span className="material-symbols-outlined text-[20px] text-primary shrink-0">
                    check
                  </span>
                )}
                {!canChangeTheme && !active && (
                  <span className="material-symbols-outlined text-[18px] text-text-muted shrink-0">
                    lock
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Accent Color Section */}
        <div className="p-3 pt-2 border-t border-border-subtle flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-text-main flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[18px] text-primary">palette</span>
                Theme Accent Color
              </h3>
              <p className="text-xs text-text-muted mt-0.5">
                Choose a curated palette or customize any color freely
              </p>
            </div>
            {themeColor && (
              <button
                type="button"
                onClick={() => {
                  if (canChangeTheme) {
                    setThemeColor(null);
                    setCustomHex("#E56A4A");
                  }
                }}
                disabled={!canChangeTheme}
                className="text-xs text-text-muted hover:text-primary transition-colors disabled:opacity-50"
              >
                Reset default
              </button>
            )}
          </div>

          {/* Color Presets */}
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
            {COLOR_PRESETS.map((preset) => {
              const isSelected = (!themeColor && preset.isDefault) || themeColor?.toLowerCase() === preset.hex.toLowerCase();
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    if (canChangeTheme) {
                      setThemeColor(preset.isDefault ? null : preset.hex);
                      setCustomHex(preset.hex);
                    }
                  }}
                  disabled={!canChangeTheme}
                  title={preset.label}
                  className={cn(
                    "group relative flex flex-col items-center justify-center p-2 rounded-xl border transition-all aspect-square",
                    isSelected
                      ? "border-primary bg-primary/10 shadow-sm"
                      : "border-border-subtle hover:border-border hover:bg-surface-2",
                    !canChangeTheme && "opacity-50 cursor-not-allowed hover:bg-transparent"
                  )}
                >
                  <span
                    className="size-6 rounded-full border border-white/20 shadow-inner flex items-center justify-center transition-transform group-hover:scale-110"
                    style={{ backgroundColor: preset.hex }}
                  >
                    {isSelected && (
                      <span className="material-symbols-outlined text-white text-[14px] drop-shadow-sm font-bold">
                        check
                      </span>
                    )}
                  </span>
                  <span className="text-[10px] text-text-muted mt-1 truncate max-w-full">
                    {preset.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Custom Color Input ("Sesuka Hati") */}
          <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-surface-2/60 border border-border-subtle">
            <label
              className={cn(
                "relative size-9 rounded-lg border border-border overflow-hidden cursor-pointer shrink-0 shadow-inner transition-transform hover:scale-105",
                !canChangeTheme && "cursor-not-allowed opacity-50"
              )}
              style={{ backgroundColor: customHex || "#E56A4A" }}
              title="Click to open color picker"
            >
              <input
                type="color"
                value={customHex || "#E56A4A"}
                disabled={!canChangeTheme}
                onChange={(e) => {
                  const val = e.target.value;
                  setCustomHex(val);
                  if (canChangeTheme) setThemeColor(val);
                }}
                className="opacity-0 absolute inset-0 size-full cursor-pointer disabled:cursor-not-allowed"
              />
            </label>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={customHex}
                  disabled={!canChangeTheme}
                  placeholder="#E56A4A"
                  maxLength={7}
                  onChange={(e) => {
                    let val = e.target.value;
                    if (!val.startsWith("#") && val.length > 0) val = "#" + val;
                    setCustomHex(val);
                    if (/^#[0-9a-fA-F]{6}$/.test(val) && canChangeTheme) {
                      setThemeColor(val);
                    }
                  }}
                  className="w-24 px-2 py-1 text-xs font-mono rounded-md bg-surface border border-border text-text-main focus:outline-none focus:border-primary uppercase"
                />
                <span className="text-xs text-text-muted">Pick or type any hex</span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[11px] text-text-muted font-medium">
                {themeColor ? "Custom Active" : "Default"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

ThemeModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
};