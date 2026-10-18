import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

const OFFICIAL_URL = "https://raw.githubusercontent.com/decolua/9router/refs/heads/master/CHANGELOG.md";
const SERENHOPE_URL = "https://raw.githubusercontent.com/serenhope/9router/refs/heads/master/CHANGELOG.md";
const DAYY4DEV_URL = "https://raw.githubusercontent.com/Dayy4dev/9router/refs/heads/dev/CHANGELOG_DAYY4DEV.md";

function readLocalChangelog(filename = "CHANGELOG.md") {
  try {
    const text = fs.readFileSync(path.join(process.cwd(), filename), "utf8");
    return text.trim() ? text : null;
  } catch {
    return null;
  }
}

async function fetchRemoteChangelog(url) {
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const text = await res.text();
    return text.trim() ? text : null;
  } catch {
    return null;
  }
}

// GET /api/changelog - { dayy4dev, serenhope, decolua } markdown, served from disk or upstream.
export async function GET() {
  const dayy4dev = readLocalChangelog("CHANGELOG_DAYY4DEV.md") || (await fetchRemoteChangelog(DAYY4DEV_URL));
  const serenhope = (await fetchRemoteChangelog(SERENHOPE_URL)) || readLocalChangelog("CHANGELOG.md");
  const decolua = await fetchRemoteChangelog(OFFICIAL_URL);

  if (!dayy4dev && !serenhope && !decolua) {
    return NextResponse.json({
      ok: false,
      dayy4dev: null,
      serenhope: null,
      decolua: null,
      official: null,
      custom: null,
    });
  }

  return NextResponse.json({
    ok: true,
    dayy4dev,
    serenhope,
    decolua,
    // backward-compat:
    custom: serenhope,
    official: decolua,
  });
}
