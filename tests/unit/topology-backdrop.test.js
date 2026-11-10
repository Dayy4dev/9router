import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isTopologyBg, MAX_TOPO_SOURCE_BYTES } from "@/shared/utils/topologyBackground";

const root = resolve(__dirname, "../..");
const read = (p) => readFileSync(resolve(root, p), "utf8");

describe("topology backdrop feature", () => {
  it("isTopologyBg validates safe data URLs and http/https URLs", () => {
    // Valid data url
    const validDataUrl = "data:image/webp;base64,UklGRkAAAABXRUJQVlA4IDQAAADwAQCdASoBAAEAAQAcJaACdLoAAP7/2QAA";
    expect(isTopologyBg(validDataUrl)).toBe(validDataUrl);

    // Valid http/https URL
    const validHttp = "https://example.com/assets/backdrop.webp";
    expect(isTopologyBg(validHttp)).toBe(validHttp);

    // Reject malicious CSS injection attempts
    expect(isTopologyBg('https://example.com/bad"onload="alert(1)')).toBe(null);
    expect(isTopologyBg('https://example.com/test); background: red;')).toBe(null);
    expect(isTopologyBg('javascript:alert(1)')).toBe(null);

    // Reject non-string / empty
    expect(isTopologyBg("")).toBe(null);
    expect(isTopologyBg("   ")).toBe(null);
    expect(isTopologyBg(null)).toBe(null);
    expect(isTopologyBg(undefined)).toBe(null);
    expect(isTopologyBg(123)).toBe(null);
  });

  it("MAX_TOPO_SOURCE_BYTES is set to 8MB", () => {
    expect(MAX_TOPO_SOURCE_BYTES).toBe(8 * 1024 * 1024);
  });

  it("GET and POST /api/theme support topologyBg and topologyBgDim", () => {
    const route = read("src/app/api/theme/route.js");
    expect(route).toContain("topologyBg: settings.topologyBg || null");
    expect(route).toContain("topologyBgDim: settings.topologyBgDim ?? 0");
    expect(route).toContain("body.topologyBg !== undefined");
    expect(route).toContain("body.topologyBgDim !== undefined");
  });

  it("settingsRepo initializes topologyBg and topologyBgDim", () => {
    const repo = read("src/lib/db/repos/settingsRepo.js");
    expect(repo).toMatch(/topologyBg:\s*null/);
    expect(repo).toMatch(/topologyBgDim:\s*0/);
  });

  it("themeStore exposes topologyBg, topologyBgDim, setTopologyBg, and setTopologyBgDim", () => {
    const store = read("src/store/themeStore.js");
    expect(store).toContain("topologyBg: null");
    expect(store).toContain("topologyBgDim: 0");
    expect(store).toContain("setTopologyBg:");
    expect(store).toContain("setTopologyBgDim:");
  });

  it("ThemeModal renders TopologyBackdropPicker with dim slider and upload/url controls", () => {
    const modal = read("src/shared/components/ThemeModal.js");
    expect(modal).toContain("TopologyBackdropPicker");
    expect(modal).toContain("Topology Backdrop");
    expect(modal).toContain("Dim Backdrop Intensity");
    expect(modal).toContain("readTopologyBgFile");
  });

  it("ProviderTopology binds custom background and dim layers", () => {
    const topo = read("src/app/(dashboard)/dashboard/usage/components/ProviderTopology.js");
    expect(topo).toContain("useThemeStore((state) => state.topologyBg)");
    expect(topo).toContain("useThemeStore((state) => state.topologyBgDim)");
    expect(topo).toContain("isTopologyBg");
    expect(topo).toContain("validatedBg");
    expect(topo).toContain("dimOpacity");
  });
});
