import { NextResponse } from "next/server";
import { getProviderConnections, updateProviderConnection } from "@/lib/db/repos/connectionsRepo.js";
import { resolveConnectionProxyConfig } from "@/lib/network/connectionProxy";
import {
  getGlmClaimablePlans,
  claimGlmPlan,
  getGlmBalance,
  ZCODE_START_PLAN_ID,
} from "open-sse/services/usage.js";

export const dynamic = "force-dynamic";

const ZCODE_FAMILY = ["glm", "zcode", "zc"];

function resolveToken(conn) {
  return (
    conn?.providerSpecificData?.zcodeJwtToken ||
    conn?.providerSpecificData?.zaiBusinessToken ||
    conn?.accessToken ||
    conn?.apiKey ||
    ""
  );
}

/**
 * GET /api/providers/glm/bonus
 * Lists available promotional plans (plus Start Plan activation if not yet active)
 * for connected ZCode / GLM accounts.
 */
export async function GET() {
  try {
    const connections = (await getProviderConnections()).filter((c) => ZCODE_FAMILY.includes(c.provider));
    if (!connections || connections.length === 0) {
      return NextResponse.json({
        ok: true,
        hasConnectedAccount: false,
        plans: [],
        message: "No connected ZCode / GLM account found.",
      });
    }

    const results = [];
    for (const conn of connections) {
      const token = resolveToken(conn);
      if (!token) continue;

      const deviceMid = conn.providerSpecificData?.userId || conn.providerSpecificData?.machineId || undefined;
      const proxyOptions = {
        ...(await resolveConnectionProxyConfig(conn.providerSpecificData)),
        strictProxy: false,
      };
      const [claimable, balance] = await Promise.all([
        getGlmClaimablePlans(token, proxyOptions, { deviceMid }).catch(() => ({ plans: [] })),
        getGlmBalance(token, proxyOptions, { deviceMid }).catch(() => null),
      ]);

      const plans = (claimable?.plans || []).map((p) => {
        const grants = (p.entitlements || []).reduce((sum, e) => sum + (Number(e.grantUnits) || 0), 0);
        return { ...p, ...(grants > 0 ? { grants } : {}) };
      });

      const hasStartPlan = (balance?.plans || []).some(
        (p) =>
          (p.plan_id === ZCODE_START_PLAN_ID || p.planId === ZCODE_START_PLAN_ID || /start[- ]?plan/i.test(p.name || "")) &&
          p.status?.toLowerCase() === "active"
      );

      if (!hasStartPlan && !plans.some((p) => p.planId === ZCODE_START_PLAN_ID)) {
        plans.push({
          planId: ZCODE_START_PLAN_ID,
          name: "ZCode Start Plan (8M Free Tier)",
          description: "Activate 8M token free tier (3M GLM-5.3 + 5M GLM-5.3-Flash) via 4-step ZCode handshake.",
          source: "start_plan_handshake",
          claimable: true,
          grants: 8000000,
        });
      }

      if (plans.length > 0) {
        results.push({
          connectionId: conn.id,
          accountName: conn.name || conn.email || "ZCode Account",
          plans,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      hasConnectedAccount: true,
      available: results,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message || "Failed to check ZCode bonuses" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/providers/glm/bonus
 * Claims a specific promotional plan or activates Start Plan for a connected ZCode / GLM account.
 */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { connectionId, planId } = body;

    const connections = (await getProviderConnections()).filter((c) => ZCODE_FAMILY.includes(c.provider));
    const targetConn = connectionId
      ? connections.find((c) => String(c.id) === String(connectionId))
      : connections[0];

    if (!targetConn) {
      return NextResponse.json(
        { ok: false, error: "ZCode connection not found" },
        { status: 404 }
      );
    }

    const token = resolveToken(targetConn);
    if (!token) {
      return NextResponse.json(
        { ok: false, error: "No valid ZCode token on this connection" },
        { status: 400 }
      );
    }

    const deviceMid = targetConn.providerSpecificData?.userId || targetConn.providerSpecificData?.machineId || undefined;
    const proxyOptions = {
      ...(await resolveConnectionProxyConfig(targetConn.providerSpecificData)),
      strictProxy: false,
    };
    const captcha = {
      ...(body?.captchaParam ? { captchaVerifyParam: body.captchaParam } : {}),
      captchaRegion: body?.captchaRegion || "sgp",
      ...(deviceMid ? { deviceMid } : {}),
    };

    const result = await claimGlmPlan(token, planId || ZCODE_START_PLAN_ID, proxyOptions, captcha);

    if (result?.ok) {
      try {
        await updateProviderConnection(targetConn.id, { isActive: true, testStatus: "active" });
      } catch {}
      return NextResponse.json(result, { status: 200 });
    }

    if (String(result?.code) === "3007") {
      return NextResponse.json(
        {
          ...result,
          error: result.message || "Aliyun verification challenge required.",
          verifyRequired: true,
          verifyUrl: `/api/usage/${targetConn.id}/zcode-bridge`,
          appDeepLink: "zcode://",
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { ...result, error: result?.message || "Claim failed" },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message || "Claim request failed" },
      { status: 500 }
    );
  }
}
