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
});
