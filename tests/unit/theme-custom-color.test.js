import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "../..");
const read = (p) => readFileSync(resolve(root, p), "utf8");

describe("theme: custom theme color feature", () => {
  it("GET /api/theme includes themeColor", () => {
    const route = read("src/app/api/theme/route.js");
    expect(route).toContain("themeColor: settings.themeColor || null");
  });

  it("POST /api/theme supports updating and validating themeColor", () => {
    const route = read("src/app/api/theme/route.js");
    expect(route).toContain("body.themeColor !== undefined");
    expect(route).toMatch(/#\(\[0-9a-fA-F\]\{3\}\|\[0-9a-fA-F\]\{6\}\)/);
  });

  it("themeStore exports applyThemeColor and setThemeColor", () => {
    const store = read("src/store/themeStore.js");
    expect(store).toContain("export function applyThemeColor");
    expect(store).toContain("setThemeColor:");
    expect(store).toContain("themeColor: null");
  });

  it("ThemeModal provides COLOR_PRESETS and color picker input", () => {
    const modal = read("src/shared/components/ThemeModal.js");
    expect(modal).toContain("COLOR_PRESETS");
    expect(modal).toContain('type="color"');
    expect(modal).toContain("setThemeColor");
    expect(modal).toContain("Theme Accent Color");
  });

  it("settingsRepo initializes themeColor in default settings", () => {
    const repo = read("src/lib/db/repos/settingsRepo.js");
    expect(repo).toMatch(/themeColor:\s*null/);
  });

  it("ProviderTopology syncs active cable beam and router glow with theme primary color", () => {
    const topo = read("src/app/(dashboard)/dashboard/usage/components/ProviderTopology.js");
    expect(topo).toContain("var(--color-primary, #22d3ee)");
    expect(topo).toContain("var(--color-primary, #f59e0b)");
    expect(topo).toContain("topology-router-core border-primary");
    expect(topo).toContain("router-node-icon-grad");
    expect(topo).toContain("var(--color-primary, #10B981)");
  });

  it("globals.css connects text selection highlight to theme primary color tokens", () => {
    const css = read("src/app/globals.css");
    expect(css).toContain("var(--color-primary-rgb, 6, 182, 212)");
    expect(css).toContain("var(--color-brand-200, #ffffff)");
  });

  it("themeStore derives harmonious secondary color and sets secondary tokens", () => {
    const store = read("src/store/themeStore.js");
    expect(store).toContain("deriveSecondaryColor");
    expect(store).toContain("--color-secondary");
    expect(store).toContain("--color-secondary-hover");
    expect(store).toContain("--shadow-glow");
  });

  it("globals.css includes multi-tier semantic tokens and dynamic aurora glass background", () => {
    const css = read("src/app/globals.css");
    expect(css).toContain("--color-secondary: var(--color-secondary)");
    expect(css).toContain("--color-danger-bg: var(--color-danger-bg)");
    expect(css).toContain("--color-success-bg: var(--color-success-bg)");
    expect(css).toContain("--color-warning-bg: var(--color-warning-bg)");
    expect(css).toContain("--color-info-bg: var(--color-info-bg)");
    expect(css).toContain("color-mix(in srgb, var(--color-secondary, #6366f1) 40%, transparent)");
  });

  it("charts utilize dynamic theme and harmonic color tokens", () => {
    const usage = read("src/app/(dashboard)/dashboard/usage/components/UsageChart.js");
    expect(usage).toContain("var(--color-primary, #6366f1)");
    expect(usage).toContain("var(--color-secondary, #14b8a6)");

    const topModels = read("src/app/(dashboard)/dashboard/usage/components/TopModelsChart.js");
    expect(topModels).toContain("HARMONIC_COLORS");
    expect(topModels).toContain("var(--color-primary, #6366f1)");
  });

  it("settingsRepo preserves persisted theme mode without forcing glass", () => {
    const repo = read("src/lib/db/repos/settingsRepo.js");
    expect(repo).toContain('raw?.theme === "dark" ? "dark" : (raw?.theme === "glass" ? "glass" : DEFAULT_SETTINGS.theme)');
  });

  it("BellMenu permits page scrolling without a full-screen blocking overlay", () => {
    const menu = read("src/shared/components/BellMenu.js");
    expect(menu).not.toContain('<div className="fixed inset-0 z-40"');
    expect(menu).toContain("pointerdown");
  });

  it("globals.css styles elevated glass overlays for high contrast and readability", () => {
    const css = read("src/app/globals.css");
    expect(css).toContain('.dark.glass [role="dialog"]');
    expect(css).toContain(".dark.glass [aria-modal=\"true\"]");
    expect(css).toContain("backdrop-filter: blur(28px)");
  });
});
