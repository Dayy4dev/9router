/**
 * Periodic liveness sweep for saved proxy pools.
 *
 * The manual Health Check runs one request per pool from a dashboard job; this
 * service is the unattended version. Only pools the runtime can actually pick
 * (isActive) are probed, with a small concurrency cap and a short timeout, so a
 * sweep of a few thousand entries stays cheap and never overlaps itself.
 *
 * A pool is disabled after DISABLE_AFTER_FAILURES consecutive failures, not
 * after one: a single timeout during a network blip must not take a healthy
 * proxy out of rotation. Any successful probe resets the counter.
 */

import { getSettings, getProxyPools, updateProxyPool } from "@/lib/localDb";
import { testProxyUrl } from "@/lib/network/proxyTest";
import { makeKv } from "@/lib/db/helpers/kvStore.js";

const CONCURRENCY = 4;
const PROBE_TIMEOUT_MS = 6000;
const DISABLE_AFTER_FAILURES = 2;
const RELAY_TYPES = new Set(["vercel", "cloudflare", "deno", "netlify"]);
const BOOT_DELAY_MS = 60 * 1000;
const TOGGLE_DELAY_MS = 5 * 1000;
const DEFAULT_INTERVAL_MINUTES = 15;

const kv = makeKv("proxyAutoCheck");

// Survive Next.js hot reload: one scheduler per server process.
const g = (global.__proxyPoolAutoCheck ??= {
  timer: null,
  running: false,
  lastRunAt: null,
  lastResult: null,
  hydrated: false,
  scheduledFor: null,
});

export const __test__ = { CONCURRENCY, DISABLE_AFTER_FAILURES, DEFAULT_INTERVAL_MINUTES, withHardTimeout };

function normalizeInterval(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_INTERVAL_MINUTES;
  return Math.min(1440, Math.max(1, Math.round(n)));
}

async function hydrateLastRun() {
  if (g.hydrated) return;
  g.hydrated = true;
  try {
    const stored = await kv.get("lastRun", null);
    if (stored) {
      g.lastRunAt = stored.at || null;
      g.lastResult = stored.result || null;
    }
  } catch {
    // A missing kv row must not stop the scheduler from starting.
  }
}

async function probeRelay(relayUrl, timeoutMs = PROBE_TIMEOUT_MS) {
  const controller = new AbortController();
  const startedAt = Date.now();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const { fetch: undiciFetch } = await import("undici");
    const res = await undiciFetch(relayUrl, {
      method: "GET",
      headers: {
        "x-relay-target": "https://httpbin.org",
        "x-relay-path": "/get",
      },
      signal: controller.signal,
    });
    return { ok: res.ok, status: res.status, elapsedMs: Date.now() - startedAt };
  } catch (err) {
    return {
      ok: false,
      status: 500,
      error: err?.name === "AbortError" ? "Relay test timed out" : (err?.message || String(err)),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function probePool(pool) {
  if (RELAY_TYPES.has(pool?.type)) return probeRelay(pool.proxyUrl);
  return testProxyUrl({ proxyUrl: pool.proxyUrl, timeoutMs: PROBE_TIMEOUT_MS });
}

// A probe resolves on its own timeout, but a wedged socket can still sit in
// the resolver (e.g. a stalled dispatcher teardown). Race it so one bad pool
// can never block the rest of the sweep.
function withHardTimeout(promise, ms = PROBE_TIMEOUT_MS + 4000) {
  let timer;
  return Promise.race([
    promise,
    new Promise((resolve) => {
      timer = setTimeout(() => resolve({ ok: false, status: 500, error: "Probe timed out" }), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

async function applyResult(pool, result) {
  const now = new Date().toISOString();
  if (result.ok) {
    await updateProxyPool(pool.id, {
      testStatus: "active",
      lastTestedAt: now,
      lastError: null,
      elapsedMs: result.elapsedMs || 0,
      failCount: 0,
      isActive: pool.isActive !== false,
    });
    return "alive";
  }

  const failCount = (Number(pool.failCount) || 0) + 1;
  const disable = failCount >= DISABLE_AFTER_FAILURES;
  await updateProxyPool(pool.id, {
    testStatus: "error",
    lastTestedAt: now,
    lastError: result.error || `Proxy test failed with status ${result.status}`,
    elapsedMs: result.elapsedMs || 0,
    failCount,
    ...(disable ? { isActive: false } : {}),
  });
  return disable ? "disabled" : "dead";
}

/**
 * One sweep. Serialised through g.running so a manual run and a timer tick can
 * never double-probe the same pool.
 */
export async function runProxyAutoCheckCycle({ force = false } = {}) {
  if (g.running) return { skipped: true, reason: "already running" };
  const settings = await getSettings().catch(() => ({}));
  if (!force && !settings.proxyAutoCheckEnabled) {
    return { skipped: true, reason: "disabled" };
  }

  const activeOnly = settings.proxyAutoCheckActiveOnly !== false;
  let pools = await getProxyPools(activeOnly ? { isActive: true } : {});
  pools = pools.filter((p) => p?.proxyUrl);
  if (pools.length === 0) {
    await finish({ total: 0, alive: 0, dead: 0, disabled: 0, durationMs: 0 });
    return { total: 0, alive: 0, dead: 0, disabled: 0 };
  }

  g.running = true;
  const startedAt = Date.now();
  let alive = 0;
  let dead = 0;
  let disabled = 0;
  let cursor = 0;

  const worker = async () => {
    for (;;) {
      const idx = cursor++;
      if (idx >= pools.length) return;
      const pool = pools[idx];
      try {
        const outcome = await applyResult(pool, await withHardTimeout(probePool(pool)));
        if (outcome === "alive") alive += 1;
        else if (outcome === "disabled") { dead += 1; disabled += 1; }
        else dead += 1;
      } catch {
        dead += 1;
      }
    }
  };

  try {
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, pools.length) }, worker)
    );
  } catch {
    // Worker errors are already counted per pool; a sweep never aborts here.
  }

  const result = {
    total: pools.length,
    alive,
    dead,
    disabled,
    durationMs: Date.now() - startedAt,
  };
  // Publish the result BEFORE clearing `running`: a status poll that observes
  // running=false must never see a stale lastRunAt next to it, or the page
  // re-arms its slow interval and shows the old sweep until the next one.
  await finish(result);
  g.running = false;
  return result;
}

async function finish(result) {
  g.lastRunAt = new Date().toISOString();
  g.lastResult = result;
  try {
    await kv.set("lastRun", { at: g.lastRunAt, result });
  } catch {
    // Durability is a nicety; the in-memory copy still drives the UI.
  }
}

function clearTimer() {
  if (g.timer) clearTimeout(g.timer);
  g.timer = null;
  g.scheduledFor = null;
}

function schedule(delayMs, intervalMs) {
  clearTimer();
  g.scheduledFor = Date.now() + delayMs;
  g.timer = setTimeout(async () => {
    g.timer = null;
    try {
      await runProxyAutoCheckCycle();
    } catch {
      // A failed sweep never kills the schedule.
    }
    // Chain the next tick only after this one settles, so a slow sweep can
    // never pile runs up behind itself.
    schedule(intervalMs, intervalMs);
  }, delayMs);
  if (g.timer.unref) g.timer.unref();
}

/**
 * (Re)configure the scheduler from the current settings. Safe to call often:
 * it only resets the timer and is what the settings writer calls after a
 * toggle so the change applies without a restart.
 */
export async function configureProxyPoolAutoCheck({ immediate = false } = {}) {
  await hydrateLastRun();
  const settings = await getSettings().catch(() => ({}));

  if (!settings.proxyAutoCheckEnabled) {
    clearTimer();
    return { enabled: false };
  }

  const intervalMs = normalizeInterval(settings.proxyAutoCheckIntervalMinutes) * 60 * 1000;
  // A fresh enable gets a quick first sweep (operator feedback); a config tweak
  // on an already-running timer just re-arms it without an extra sweep.
  const hadTimer = g.timer !== null;
  const delay = immediate && !hadTimer ? TOGGLE_DELAY_MS : BOOT_DELAY_MS;
  schedule(delay, intervalMs);
  return { enabled: true, intervalMinutes: normalizeInterval(settings.proxyAutoCheckIntervalMinutes) };
}

export async function getProxyAutoCheckStatus() {
  await hydrateLastRun();
  const settings = await getSettings().catch(() => ({}));
  return {
    enabled: settings.proxyAutoCheckEnabled === true,
    intervalMinutes: normalizeInterval(settings.proxyAutoCheckIntervalMinutes),
    activeOnly: settings.proxyAutoCheckActiveOnly !== false,
    running: g.running,
    lastRunAt: g.lastRunAt,
    lastResult: g.lastResult,
  };
}

export function stopProxyPoolAutoCheck() {
  clearTimer();
}
