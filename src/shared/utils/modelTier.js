import { isFreeOpencodeModel } from "@/app/api/providers/suggested-models/filters.js";

const KNOWN_FREE_PROVIDERS = new Set([
  "opencode",
  "opencode-v2",
  "mimocode",
  "ollama-local",
  "selfhosted-embedding",
  "selfhosted-stt",
  "selfhosted-tts",
]);

const KNOWN_PAID_PROVIDERS = new Set([
  "openai",
  "anthropic",
  "vertex",
  "vertex-partner",
  "codex",
  "cursor",
  "bedrock",
  "bedrock-xai",
  "azure",
  "openrouter",
  "together",
  "sambanova",
  "deepseek",
  "groq",
  "fireworks",
  "mistral",
  "cohere",
  "ai21",
  "replicate",
  "perplexity",
  "moonshot",
]);

/**
 * Resolves whether a model is "free", "paid", or "unknown".
 * @param {string|object} model - Model object or string ID
 * @param {string} [providerId] - Provider ID or alias
 * @param {boolean} [explicitIsFree] - Explicit isFree flag
 * @returns {"free" | "paid" | "unknown"}
 */
export function resolveModelTier(model, providerId = "", explicitIsFree = undefined) {
  if (explicitIsFree === true) return "free";
  if (explicitIsFree === false) return "paid";

  const rawId = typeof model === "string" ? model : (model?.id || model?.value || model?.name || "");
  const lower = String(rawId).toLowerCase();

  if (typeof model === "object" && model !== null) {
    if (model.isFree === true || model.pricing?.prompt === "0" || model.pricing?.isFree === true) {
      return "free";
    }
  }

  if (
    /(^|[-_/:])(free|contributor|community|preview-?free)([-_]|$)/i.test(lower) ||
    lower.includes("big-pickle") ||
    lower.includes("union-alpha") ||
    isFreeOpencodeModel({ id: rawId })
  ) {
    return "free";
  }

  const pid = (providerId || lower.split("/")[0] || "").toLowerCase();

  if (KNOWN_FREE_PROVIDERS.has(pid)) {
    return "free";
  }

  if (
    /(gpt-[456]|claude-(?:sonnet|opus|haiku|fable)|gemini-(?:1|2|3|4|pro|flash)|o1|o3|o4|grok-[1234]|deepseek-(?:v3|r1|v4|pro)|mistral-(?:large|medium)|command-r)/i.test(lower)
  ) {
    return "paid";
  }

  if (KNOWN_PAID_PROVIDERS.has(pid)) {
    return "paid";
  }

  if (typeof model === "object" && model !== null && model.pricing) {
    if (Number(model.pricing.input) > 0 || Number(model.pricing.prompt) > 0) {
      return "paid";
    }
  }

  return "unknown";
}
