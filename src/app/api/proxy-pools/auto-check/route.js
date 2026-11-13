import { NextResponse } from "next/server";
import { updateSettings } from "@/lib/localDb";
import {
  getProxyAutoCheckStatus,
  runProxyAutoCheckCycle,
  configureProxyPoolAutoCheck,
} from "@/shared/services/proxyPoolAutoCheck";

export const dynamic = "force-dynamic";

// GET /api/proxy-pools/auto-check - scheduler status for the proxy pools page
export async function GET() {
  try {
    const status = await getProxyAutoCheckStatus();
    return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Error reading proxy auto-check status:", error);
    return NextResponse.json({ error: "Failed to read auto-check status" }, { status: 500 });
  }
}

// POST /api/proxy-pools/auto-check - toggle / reconfigure / run now
export async function POST(request) {
  try {
    let body = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const updates = {};
    if (body.enabled !== undefined) {
      if (typeof body.enabled !== "boolean") {
        return NextResponse.json({ error: "enabled must be a boolean" }, { status: 400 });
      }
      updates.proxyAutoCheckEnabled = body.enabled;
    }
    if (body.intervalMinutes !== undefined) {
      const n = Number(body.intervalMinutes);
      if (!Number.isFinite(n) || n < 1 || n > 1440) {
        return NextResponse.json({ error: "intervalMinutes must be 1-1440" }, { status: 400 });
      }
      updates.proxyAutoCheckIntervalMinutes = Math.round(n);
    }
    if (body.activeOnly !== undefined) {
      if (typeof body.activeOnly !== "boolean") {
        return NextResponse.json({ error: "activeOnly must be a boolean" }, { status: 400 });
      }
      updates.proxyAutoCheckActiveOnly = body.activeOnly;
    }

    if (Object.keys(updates).length > 0) {
      await updateSettings(updates);
      await configureProxyPoolAutoCheck({ immediate: true });
    }

    let startedRun = false;
    if (body.runNow === true) {
      // Fire and forget: the sweep can take minutes on a large pool list, and
      // the page polls status for progress.
      startedRun = true;
      runProxyAutoCheckCycle({ force: true }).catch((error) =>
        console.error("Manual proxy auto-check failed:", error?.message || error)
      );
    }

    const status = await getProxyAutoCheckStatus();
    return NextResponse.json({ ...status, startedRun });
  } catch (error) {
    console.error("Error updating proxy auto-check:", error);
    return NextResponse.json({ error: "Failed to update auto-check" }, { status: 500 });
  }
}
