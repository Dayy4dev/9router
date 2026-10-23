import { describe, expect, it } from "vitest";
import { resolveModelTier } from "../../src/shared/utils/modelTier.js";
import { applyUsageMultipliers } from "../../open-sse/utils/usageTracking.js";

describe("Model Tier Resolution", () => {
  it("resolves free models correctly", () => {
    expect(resolveModelTier("oc1/beam-free")).toBe("free");
    expect(resolveModelTier("oc2/deepseek-v4.1-flash-free")).toBe("free");
    expect(resolveModelTier("big-pickle")).toBe("free");
    expect(resolveModelTier("union-alpha")).toBe("free");
    expect(resolveModelTier("flint-40b-free")).toBe("free");
    expect(resolveModelTier({ id: "custom-free", isFree: true })).toBe("free");
  });

  it("resolves paid commercial models correctly", () => {
    expect(resolveModelTier("claude-opus-5-5", "anthropic")).toBe("paid");
    expect(resolveModelTier("gpt-4o", "openai")).toBe("paid");
    expect(resolveModelTier("gemini-2.5-pro", "vertex")).toBe("paid");
    expect(resolveModelTier("deepseek-v3", "deepseek")).toBe("paid");
  });

  it("resolves unknown models correctly", () => {
    expect(resolveModelTier("custom-random-slug-99", "custom-node")).toBe("unknown");
    expect(resolveModelTier({ id: "my-selfhosted-model" })).toBe("unknown");
  });
});

describe("Usage Multipliers", () => {
  it("multiplies input and output tokens accurately", () => {
    const rawUsage = {
      prompt_tokens: 100,
      completion_tokens: 200,
      total_tokens: 300,
    };

    const multiplied = applyUsageMultipliers(rawUsage, {
      inputMultiplier: 2,
      outputMultiplier: 5,
    });

    expect(multiplied.prompt_tokens).toBe(200);
    expect(multiplied.completion_tokens).toBe(1000);
    expect(multiplied.total_tokens).toBe(1200);
  });

  it("handles empty or default multipliers cleanly", () => {
    const rawUsage = {
      prompt_tokens: 100,
      completion_tokens: 200,
      total_tokens: 300,
    };

    const unchanged = applyUsageMultipliers(rawUsage, {});
    expect(unchanged.prompt_tokens).toBe(100);
    expect(unchanged.completion_tokens).toBe(200);
  });
});
