import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let tempDir;
const originalDataDir = process.env.DATA_DIR;

// Mock testProxyUrl so network calls never leave the host
const mockProbeResult = vi.fn();
vi.mock("@/lib/network/proxyTest", () => ({
  testProxyUrl: (...args) => mockProbeResult(...args),
}));

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-proxy-autocheck-"));
  process.env.DATA_DIR = tempDir;
  delete global._dbAdapter;
  delete global.__proxyPoolAutoCheck;
  mockProbeResult.mockReset();
  vi.resetModules();
});

afterEach(() => {
  try {
    const { stopProxyPoolAutoCheck } = require("@/shared/services/proxyPoolAutoCheck.js");
    stopProxyPoolAutoCheck();
  } catch {
    // Ignore
  }
  try { global._dbAdapter?.instance?.close?.(); } catch { /* ignore */ }
  delete global._dbAdapter;
  delete global.__proxyPoolAutoCheck;
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
});

describe("proxyPoolAutoCheck service", () => {
  it("skips run when disabled and not forced", async () => {
    const { runProxyAutoCheckCycle } = await import("@/shared/services/proxyPoolAutoCheck.js");
    const res = await runProxyAutoCheckCycle({ force: false });
    expect(res.skipped).toBe(true);
    expect(mockProbeResult).not.toHaveBeenCalled();
  });

  it("probes active pools, resets failCount on healthy, and marks dead on failure", async () => {
    const { createProxyPool, getProxyPoolById } = await import("@/lib/db/repos/proxyPoolsRepo.js");
    const { runProxyAutoCheckCycle } = await import("@/shared/services/proxyPoolAutoCheck.js");

    const healthy = await createProxyPool({
      name: "healthy-proxy",
      proxyUrl: "http://1.2.3.4:8080",
      isActive: true,
    });

    const dying = await createProxyPool({
      name: "dying-proxy",
      proxyUrl: "http://5.6.7.8:8080",
      isActive: true,
    });

    // createProxyPool only accepts schema fields; failCount is set by a
    // previous sweep through updateProxyPool's data merge.
    const { updateProxyPool } = await import("@/lib/db/repos/proxyPoolsRepo.js");
    await updateProxyPool(healthy.id, { failCount: 1 });
    await updateProxyPool(dying.id, { failCount: 1 }); // Already failed once; second failure will disable it

    mockProbeResult.mockImplementation(async ({ proxyUrl }) => {
      if (proxyUrl.includes("1.2.3.4")) {
        return { ok: true, status: 200, elapsedMs: 50 };
      }
      return { ok: false, status: 500, error: "Connection refused" };
    });

    const summary = await runProxyAutoCheckCycle({ force: true });
    expect(summary.total).toBe(2);
    expect(summary.alive).toBe(1);
    expect(summary.dead).toBe(1);
    expect(summary.disabled).toBe(1);

    const refreshedHealthy = await getProxyPoolById(healthy.id);
    expect(refreshedHealthy.testStatus).toBe("active");
    expect(refreshedHealthy.isActive).toBe(true);
    expect(refreshedHealthy.failCount).toBe(0);

    const refreshedDying = await getProxyPoolById(dying.id);
    expect(refreshedDying.testStatus).toBe("error");
    expect(refreshedDying.isActive).toBe(false); // Disabled after 2nd failure
    expect(refreshedDying.failCount).toBe(2);
    expect(refreshedDying.lastError).toBe("Connection refused");
  });

  it("skips inactive pools when activeOnly is true (optimal mode)", async () => {
    const { createProxyPool } = await import("@/lib/db/repos/proxyPoolsRepo.js");
    const { runProxyAutoCheckCycle } = await import("@/shared/services/proxyPoolAutoCheck.js");
    const { updateSettings } = await import("@/lib/db/repos/settingsRepo.js");

    await updateSettings({ proxyAutoCheckActiveOnly: true });

    await createProxyPool({
      name: "active-one",
      proxyUrl: "http://10.0.0.1:8080",
      isActive: true,
    });

    await createProxyPool({
      name: "disabled-one",
      proxyUrl: "http://10.0.0.2:8080",
      isActive: false,
    });

    mockProbeResult.mockResolvedValue({ ok: true, status: 200, elapsedMs: 30 });

    const summary = await runProxyAutoCheckCycle({ force: true });
    expect(summary.total).toBe(1); // Only the active pool was probed
    expect(mockProbeResult).toHaveBeenCalledTimes(1);
  });

  it("configures scheduler timer and reports status", async () => {
    const { configureProxyPoolAutoCheck, getProxyAutoCheckStatus, stopProxyPoolAutoCheck } = await import(
      "@/shared/services/proxyPoolAutoCheck.js"
    );
    const { updateSettings } = await import("@/lib/db/repos/settingsRepo.js");

    await updateSettings({
      proxyAutoCheckEnabled: true,
      proxyAutoCheckIntervalMinutes: 10,
      proxyAutoCheckActiveOnly: true,
    });

    const conf = await configureProxyPoolAutoCheck({ immediate: false });
    expect(conf.enabled).toBe(true);
    expect(conf.intervalMinutes).toBe(10);

    const status = await getProxyAutoCheckStatus();
    expect(status.enabled).toBe(true);
    expect(status.intervalMinutes).toBe(10);
    expect(status.activeOnly).toBe(true);

    stopProxyPoolAutoCheck();
  });

  it("handles GET and POST on the /api/proxy-pools/auto-check route", async () => {
    const { GET, POST } = await import("@/app/api/proxy-pools/auto-check/route.js");

    const getRes = await GET();
    const getData = await getRes.json();
    expect(getData.enabled).toBe(false);
    expect(getData.intervalMinutes).toBe(15);
    expect(getData.activeOnly).toBe(true);

    const postReq = new Request("http://localhost/api/proxy-pools/auto-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled: true,
        intervalMinutes: 5,
        activeOnly: true,
        runNow: true,
      }),
    });

    const postRes = await POST(postReq);
    const postData = await postRes.json();
    expect(postData.enabled).toBe(true);
    expect(postData.intervalMinutes).toBe(5);
    expect(postData.activeOnly).toBe(true);
    expect(postData.startedRun).toBe(true);

    const { stopProxyPoolAutoCheck } = await import("@/shared/services/proxyPoolAutoCheck.js");
    stopProxyPoolAutoCheck();
  });
});
