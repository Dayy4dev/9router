import { describe, it, expect, vi } from "vitest";
import {
  isAutoModel,
  AUTO_MODEL_VARIANTS,
  recordAutoMetrics,
  resolveAutoModelChain,
  invalidateAutoSession,
} from "../../src/sse/services/autoRouter.js";

describe("autoRouter (Zero-Config Auto-Routing)", () => {
  it("correctly identifies auto virtual models", () => {
    expect(isAutoModel("auto")).toBe(true);
    expect(isAutoModel("auto/coding")).toBe(true);
    expect(isAutoModel("auto/fast")).toBe(true);
    expect(isAutoModel("auto/cheap")).toBe(true);
    expect(isAutoModel("auto/offline")).toBe(true);
    expect(isAutoModel("openai/gpt-4o")).toBe(false);
    expect(isAutoModel("my-custom-combo")).toBe(false);
    expect(isAutoModel("")).toBe(false);
    expect(isAutoModel(null)).toBe(false);
  });

  it("exposes all 5 auto model variants", () => {
    expect(AUTO_MODEL_VARIANTS.length).toBe(5);
    const ids = AUTO_MODEL_VARIANTS.map((v) => v.id);
    expect(ids).toContain("auto");
    expect(ids).toContain("auto/coding");
    expect(ids).toContain("auto/fast");
    expect(ids).toContain("auto/cheap");
    expect(ids).toContain("auto/offline");
  });

  it("resolves auto fallback chain with active providers", async () => {
    const chain = await resolveAutoModelChain("auto");
    expect(Array.isArray(chain)).toBe(true);
    expect(chain.length).toBeGreaterThan(0);
  });

  it("favors coding models for auto/coding", async () => {
    const codingChain = await resolveAutoModelChain("auto/coding");
    expect(Array.isArray(codingChain)).toBe(true);
    expect(codingChain.length).toBeGreaterThan(0);
  });

  it("updates in-memory metrics on success and error", () => {
    const testModel = "test-provider/test-model";
    recordAutoMetrics(testModel, { latencyMs: 250, success: true, status: 200 });
    // Should not throw
    recordAutoMetrics(testModel, { latencyMs: 5000, success: false, status: 500 });
  });

  it("supports session stickiness and invalidation", async () => {
    const sessionKey = "test_sess_123";
    const chain1 = await resolveAutoModelChain("auto", { sessionKey });
    const topModel = chain1[0];

    // Second call with same session should stick to topModel
    const chain2 = await resolveAutoModelChain("auto", { sessionKey });
    expect(chain2[0]).toBe(topModel);

    // Invalidate session
    invalidateAutoSession(sessionKey, topModel);
  });
});
