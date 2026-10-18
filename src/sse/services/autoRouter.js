/**
 * In-Memory Dynamic Scoring Engine & Auto-Routing Manager for 9router
 * Provides < 1ms hot-path decision making for virtual model prefix: `auto`, `auto/*`
 */

import { getProviderConnections, getCustomModels } from "../../lib/localDb.js";
import { getDisabledModels } from "../../lib/disabledModelsDb.js";
import { getProviderModels } from "open-sse/config/providerModels.js";
import { getCapabilitiesForModel } from "open-sse/providers/capabilities.js";
import { getPricingForModel, isFreeModel } from "open-sse/providers/pricing.js";
import { resolveProviderAlias } from "open-sse/services/model.js";
import { isOpenAICompatibleProvider, isAnthropicCompatibleProvider, getProviderAlias } from "../../shared/constants/providers.js";

// Canonical auto model variants
export const AUTO_MODEL_VARIANTS = [
  { id: "auto", name: "Auto (Balanced LKGP)", desc: "Balanced smart routing across all active providers" },
  { id: "auto/coding", name: "Auto Coding", desc: "Prioritizes coding specialists (Claude, Codex, Qwen, DeepSeek)" },
  { id: "auto/fast", name: "Auto Fast", desc: "Prioritizes lowest latency & highest throughput models" },
  { id: "auto/cheap", name: "Auto Cheap", desc: "Prioritizes free tiers & low cost providers" },
  { id: "auto/offline", name: "Auto Offline / Max Quota", desc: "Prioritizes local providers or accounts with max quota" },
];

export const AUTO_MODEL_IDS = new Set(AUTO_MODEL_VARIANTS.map((v) => v.id));

export function isAutoModel(modelStr) {
  if (!modelStr || typeof modelStr !== "string") return false;
  const clean = modelStr.trim().toLowerCase();
  return clean === "auto" || clean.startsWith("auto/");
}

/**
 * In-memory provider/model metric state
 * key: `${provider}/${model}`
 * {
 *   latencyAvg: number,
 *   samples: number,
 *   lastSuccessAt: number,
 *   lastErrorAt: number,
 *   cooldownUntil: number,
 *   consecutiveErrors: number
 * }
 */
const metricsMap = new Map();

/**
 * Session stickiness cache (sessionKey -> { model: string, assignedAt: number, lastUsedAt: number })
 * Max TTL: 30 minutes idle
 */
const sessionStickinessMap = new Map();
const SESSION_TTL_MS = 30 * 60 * 1000;

function cleanOldSessions() {
  const now = Date.now();
  for (const [key, sess] of sessionStickinessMap.entries()) {
    if (now - sess.lastUsedAt > SESSION_TTL_MS) {
      sessionStickinessMap.delete(key);
    }
  }
}

// Clean sessions periodically
if (typeof setInterval !== "undefined") {
  setInterval(cleanOldSessions, 5 * 60 * 1000).unref?.();
}

/**
 * Record model execution result into in-memory engine
 */
export function recordAutoMetrics(fullModel, { latencyMs = 0, success = true, status = 200 } = {}) {
  if (!fullModel) return;
  const now = Date.now();
  const current = metricsMap.get(fullModel) || {
    latencyAvg: 1000,
    samples: 0,
    lastSuccessAt: 0,
    lastErrorAt: 0,
    cooldownUntil: 0,
    consecutiveErrors: 0,
  };

  if (success) {
    // Exponential moving average for latency
    const alpha = 0.25;
    const lat = Number.isFinite(latencyMs) && latencyMs > 0 ? latencyMs : 500;
    current.latencyAvg = current.samples === 0 ? lat : (1 - alpha) * current.latencyAvg + alpha * lat;
    current.samples += 1;
    current.lastSuccessAt = now;
    current.consecutiveErrors = 0;
    current.cooldownUntil = 0;
  } else {
    current.lastErrorAt = now;
    current.consecutiveErrors += 1;
    // Cooldown backoff based on status: 429/5xx cooldown for 15s - 120s
    const baseCooldown = (status === 429 || status === 409) ? 60000 : 20000;
    const multiplier = Math.min(4, Math.max(1, current.consecutiveErrors));
    current.cooldownUntil = now + (baseCooldown * multiplier);
  }

  metricsMap.set(fullModel, current);
}

/**
 * Invalidate session stickiness if a provider fails
 */
export function invalidateAutoSession(sessionKey, failedModel) {
  if (!sessionKey) return;
  const sess = sessionStickinessMap.get(sessionKey);
  if (sess && (!failedModel || sess.model === failedModel)) {
    sessionStickinessMap.delete(sessionKey);
  }
}

/**
 * Cache for active provider connections to avoid DB lookups in the sub-millisecond hot path
 */
let connectionsCache = {
  data: [],
  lastFetchedAt: 0,
};
const CONN_CACHE_TTL = 3000; // 3 seconds

async function getCachedActiveConnections() {
  const now = Date.now();
  if (now - connectionsCache.lastFetchedAt < CONN_CACHE_TTL && connectionsCache.data.length > 0) {
    return connectionsCache.data;
  }
  try {
    const all = await getProviderConnections();
    const active = all.filter((c) => c.isActive !== false);
    connectionsCache = {
      data: active,
      lastFetchedAt: now,
    };
    return active;
  } catch {
    return connectionsCache.data;
  }
}

/**
 * Coding affinity check
 */
function isCodingSpecialist(provider, model) {
  const m = String(model).toLowerCase();
  const p = String(provider).toLowerCase();
  if (m.includes("coder") || m.includes("coding") || m.includes("code") || m.includes("codex") || m.includes("dev")) return true;
  if (m.includes("claude-3-7") || m.includes("claude-3-5") || m.includes("sonnet") || m.includes("opus")) return true;
  if (m.includes("qwen-2.5-coder") || m.includes("deepseek-coder") || m.includes("deepseek-reasoner") || m.includes("deepseek-chat")) return true;
  if (p.includes("cline") || p.includes("codex") || p.includes("qoder")) return true;
  return false;
}

/**
 * Cheap / free tier rating
 * Tier 0: Free / Local
 * Tier 1: Cheap (< $1 / 1M tokens)
 * Tier 2: Subscription / Flat rate
 * Tier 3: Standard Commercial
 */
function getPricingTier(provider, model) {
  const p = String(provider).toLowerCase();
  if (p.includes("ollama") || p.includes("local") || p.includes("free") || p.includes("opencode")) return 0;
  if (isFreeModel(model)) return 0;

  const pricing = getPricingForModel(provider, model);
  if (!pricing) return 2;
  const cost1M = (pricing.input || 0) + (pricing.output || 0);
  if (cost1M <= 0) return 0;
  if (cost1M < 2.0) return 1;
  return 3;
}

/**
 * Build dynamic ordered fallback chain for an auto variant
 * @param {string} autoModel - e.g. "auto", "auto/coding", "auto/fast", "auto/cheap", "auto/offline"
 * @param {object} options - { sessionKey, requiredCapabilities }
 * @returns {Promise<string[]>}
 */
export async function resolveAutoModelChain(autoModel = "auto", options = {}) {
  const variant = (autoModel.trim().toLowerCase()) || "auto";
  const { sessionKey, requiredCapabilities } = options;
  const now = Date.now();

  const connections = await getCachedActiveConnections();
  const activeProviders = new Set(connections.map((c) => resolveProviderAlias(c.provider)));

  // If local ollama exists or free providers exist, ensure they're included
  activeProviders.add("opencode");

  // Load disabled models to exclude retired / operator-disabled models
  let disabledByAlias = {};
  try {
    disabledByAlias = await getDisabledModels();
  } catch { /* fail open */ }
  const isModelDisabled = (pAlias, mId) => {
    return Array.isArray(disabledByAlias[pAlias]) && disabledByAlias[pAlias].includes(mId);
  };

  // Collect candidate models from active providers and custom providers
  const candidates = [];
  const seenCandidates = new Set();

  const evaluateCandidate = (provider, modelId) => {
    if (!modelId || !provider) return;
    const fullModel = `${provider}/${modelId}`;
    if (seenCandidates.has(fullModel)) return;
    if (isModelDisabled(provider, modelId)) return;
    seenCandidates.add(fullModel);

    // Check required capabilities if requested
    if (requiredCapabilities && requiredCapabilities.size > 0) {
      const caps = getCapabilitiesForModel(provider, modelId);
      for (const req of requiredCapabilities) {
        if (!caps[req]) return;
      }
    }

    const metrics = metricsMap.get(fullModel) || {
      latencyAvg: 1200,
      samples: 0,
      lastSuccessAt: 0,
      lastErrorAt: 0,
      cooldownUntil: 0,
      consecutiveErrors: 0,
    };

    // In cooldown?
    const isCoolingDown = metrics.cooldownUntil > now;

    // Base score calculation (higher is better)
    let score = 1000;

    // Penalize cooldown heavily
    if (isCoolingDown) score -= 5000;

    // Penalize consecutive errors
    score -= (metrics.consecutiveErrors * 500);

    // Reward LKGP (Last Known Good Provider)
    if (metrics.lastSuccessAt > 0 && now - metrics.lastSuccessAt < 3600000) {
      score += 300;
    }

    // Latency penalty: 1ms = 0.2 points
    const lat = metrics.latencyAvg || 1000;
    score -= Math.min(800, lat * 0.2);

    // Variant specific weights
    if (variant === "auto/coding") {
      if (isCodingSpecialist(provider, modelId)) score += 600;
      else score -= 400;
    } else if (variant === "auto/fast") {
      score -= (lat * 0.5);
      if (lat < 800) score += 400;
    } else if (variant === "auto/cheap") {
      const tier = getPricingTier(provider, modelId);
      if (tier === 0) score += 800; // Free
      else if (tier === 1) score += 400; // Cheap
      else score -= 500;
    } else if (variant === "auto/offline") {
      const p = provider.toLowerCase();
      if (p.includes("ollama") || p.includes("local")) score += 1000;
      else score += 100;
    } else {
      const tier = getPricingTier(provider, modelId);
      if (tier === 0) score += 150;
      if (isCodingSpecialist(provider, modelId)) score += 100;
    }

    candidates.push({
      fullModel,
      provider,
      modelId,
      score,
      isCoolingDown,
    });
  };

  for (const provider of activeProviders) {
    const provModels = getProviderModels(provider);
    if (!Array.isArray(provModels) || provModels.length === 0) continue;

    for (const m of provModels) {
      const modelId = typeof m === "string" ? m : m.id;
      evaluateCandidate(provider, modelId);
    }
  }

  // Include Custom Providers & their enabled models
  for (const conn of connections) {
    const rawProvider = conn.provider;
    if (isOpenAICompatibleProvider(rawProvider) || isAnthropicCompatibleProvider(rawProvider)) {
      const alias = (conn.providerSpecificData?.prefix || getProviderAlias(rawProvider) || rawProvider).trim();
      const enabled = conn.providerSpecificData?.enabledModels;
      if (Array.isArray(enabled)) {
        for (const mId of enabled) {
          evaluateCandidate(alias, mId);
        }
      }
    }
  }

  // Include Custom Models saved in DB
  try {
    const customModels = await getCustomModels();
    if (Array.isArray(customModels)) {
      for (const cm of customModels) {
        if (cm?.providerAlias && cm?.id && (!cm.type || cm.type === "llm")) {
          evaluateCandidate(cm.providerAlias, cm.id);
        }
      }
    }
  } catch { /* fail open */ }

  // Sort candidates by score descending
  candidates.sort((a, b) => b.score - a.score);

  const sortedModels = candidates.map((c) => c.fullModel);

  // Check Session Stickiness
  if (sessionKey && sortedModels.length > 0) {
    const existing = sessionStickinessMap.get(sessionKey);
    if (existing && sortedModels.includes(existing.model)) {
      const stickyMetrics = metricsMap.get(existing.model);
      const isHealthy = !stickyMetrics || stickyMetrics.cooldownUntil <= now;
      if (isHealthy) {
        existing.lastUsedAt = now;
        // Float sticky model to index 0
        const index = sortedModels.indexOf(existing.model);
        if (index > 0) {
          sortedModels.splice(index, 1);
          sortedModels.unshift(existing.model);
        }
        return sortedModels;
      }
    }

    // Set new sticky winner
    if (sortedModels[0]) {
      sessionStickinessMap.set(sessionKey, {
        model: sortedModels[0],
        assignedAt: now,
        lastUsedAt: now,
      });
    }
  }

  // Fallback defaults if no connections are configured
  if (sortedModels.length === 0) {
    return [
      "opencode/muse-spark-1.3-contributor-free",
      "opencode/union-alpha",
    ];
  }

  return sortedModels;
}
