import { describe, expect, it } from "vitest";
import { OpenCodeZenExecutor, OPENCODE_SESSION_RE } from "../../open-sse/executors/opencode-zen.js";
import { isOpencodeFreeTierModel } from "../../open-sse/providers/models/helpers.js";

function headersFor(model, overrides = {}) {
  const executor = new OpenCodeZenExecutor();
  const credentials = {
    apiKey: overrides.apiKey || "oc_sk_dummy_for_keyed_lane",
    rawHeaders: overrides.rawHeaders || {},
  };
  return executor.buildHeaders(credentials, true, executor.buildUrl(model), model);
}

describe("isOpencodeFreeTierModel", () => {
  it("detects -free suffixed ids", () => {
    expect(isOpencodeFreeTierModel("mimo-v2.6-flash-free")).toBe(true);
    expect(isOpencodeFreeTierModel("deepseek-v4-flash-free")).toBe(true);
    expect(isOpencodeFreeTierModel("glm-4.7-flash-free")).toBe(true);
    expect(isOpencodeFreeTierModel("muse-spark-1.3-contributor-free")).toBe(true);
  });

  it("ignores paid models", () => {
    expect(isOpencodeFreeTierModel("kimi-k2.7-code")).toBe(false);
    expect(isOpencodeFreeTierModel("deepseek-chat")).toBe(false);
    expect(isOpencodeFreeTierModel("deepseek-v3.2")).toBe(false);
  });

  it("strips thinking suffixes and provider prefixes before matching", () => {
    expect(isOpencodeFreeTierModel("mimo-v2.6-flash-free(thinking)")).toBe(true);
    expect(isOpencodeFreeTierModel("opencode-zen/mimo-v2.6-flash-free")).toBe(true);
    expect(isOpencodeFreeTierModel("opencode-zen/mimo-v2.6-flash-free(xhigh)")).toBe(true);
  });
});

describe("OpenCodeZenExecutor free-tier auth and v2 fingerprint", () => {
  it("routes -free models to /inference/v1 and keeps paid models on /zen/v1", () => {
    const executor = new OpenCodeZenExecutor();
    expect(executor.buildUrl("mimo-v2.6-flash-free", true)).toBe(
      "https://opencode.ai/inference/v1/chat/completions",
    );
    expect(executor.buildUrl("muse-spark-1.3-contributor-free", true)).toBe(
      "https://opencode.ai/inference/v1/responses",
    );
    expect(executor.buildUrl("deepseek-chat", true)).toBe(
      "https://opencode.ai/zen/v1/chat/completions",
    );
  });

  it("sends Bearer public + v2 session headers for free-tier models and drops request id", () => {
    const headers = headersFor("mimo-v2.6-flash-free");
    expect(headers["Authorization"]).toBe("Bearer public");
    expect(headers["x-opencode-session"]).toMatch(OPENCODE_SESSION_RE);
    expect(headers["x-opencode-session-id"]).toBe(headers["x-opencode-session"]);
    expect(headers["x-session-affinity"]).toBe(headers["x-opencode-session"]);
    expect(headers["x-session-id"]).toBe(headers["x-opencode-session"]);
    expect(headers["x-opencode-request"]).toBeUndefined();
    expect(headers["x-opencode-client"]).toBe("cli");
    expect(headers["User-Agent"]).toBe("opencode/latest/2.0.26/cli");
  });

  it("does the same for responses-endpoint free models", () => {
    const headers = headersFor("muse-spark-1.3-contributor-free");
    expect(headers["Authorization"]).toBe("Bearer public");
    expect(headers["x-opencode-request"]).toBeUndefined();
  });

  it("keeps the connection key for paid models", () => {
    const headers = headersFor("kimi-k2.7-code", { apiKey: "oc_sk_paid_key" });
    expect(headers["Authorization"]).toBe("Bearer oc_sk_paid_key");
    expect(headers["x-opencode-request"]).toBeUndefined();
  });
});
