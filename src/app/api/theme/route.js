import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSettings, updateSettings } from "@/lib/localDb";
import { getDashboardAuthSession } from "@/lib/auth/dashboardSession";
import { isTopologyBg } from "@/shared/utils/topologyBackground";

// The site-wide mode. Reading is public on purpose: ThemeProvider applies it to
// every visitor before they sign in, and it is one non-sensitive value.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const settings = await getSettings();
    return NextResponse.json(
      {
        theme: settings.theme === "dark" ? "dark" : "glass",
        themeColor: settings.themeColor || null,
        topologyBg: settings.topologyBg || null,
        topologyBgDim: settings.topologyBgDim ?? 0,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      { theme: "glass", themeColor: null, topologyBg: null, topologyBgDim: 0 },
      { status: 200 }
    );
  }
}

// Writing is the administrator's: a key-signed session is refused here even if
// it somehow reached this route, because the mode is a site-wide setting rather
// than a per-browser preference.
export async function POST(request) {
  try {
    const cookieStore = await cookies();
    const session = await getDashboardAuthSession(cookieStore.get("auth_token")?.value);
    const settings = await getSettings();
    if (settings.requireLogin !== false && !session) {
      return NextResponse.json({ error: "Sign in to change the theme" }, { status: 401 });
    }
    if (session && session.role === "apikey") {
      return NextResponse.json(
        { error: "The theme applies to the whole site and can only be changed from a password sign-in" },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const updates = {};
    if (body.theme !== undefined) {
      updates.theme = body.theme === "dark" ? "dark" : "glass";
    }
    if (body.themeColor !== undefined) {
      if (body.themeColor === null || body.themeColor === "") {
        updates.themeColor = null;
      } else if (typeof body.themeColor === "string" && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(body.themeColor)) {
        updates.themeColor = body.themeColor;
      }
    }
    if (body.topologyBg !== undefined) {
      if (body.topologyBg === null || body.topologyBg === "") {
        updates.topologyBg = null;
      } else {
        const validated = isTopologyBg(body.topologyBg);
        if (validated) {
          updates.topologyBg = validated;
        } else {
          return NextResponse.json({ error: "Invalid topology background format" }, { status: 400 });
        }
      }
    }
    if (body.topologyBgDim !== undefined) {
      const n = Number(body.topologyBgDim);
      updates.topologyBgDim = Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
    }
    await updateSettings(updates);
    const nextSettings = await getSettings();
    return NextResponse.json({
      theme: nextSettings.theme === "dark" ? "dark" : "glass",
      themeColor: nextSettings.themeColor || null,
      topologyBg: nextSettings.topologyBg || null,
      topologyBgDim: nextSettings.topologyBgDim ?? 0,
      ok: true,
    });
  } catch (error) {
    console.log("Error setting theme:", error);
    return NextResponse.json({ error: "Failed to set theme" }, { status: 500 });
  }
}
