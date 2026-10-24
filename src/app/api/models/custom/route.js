import { NextResponse } from "next/server";
import { getCustomModels, addCustomModel, deleteCustomModel } from "@/models";
import { reconcileAllowedModels } from "@/lib/db/repos/apiKeysRepo";
import { CAPACITY_META, isSttTransport } from "@/shared/constants/models";

export const dynamic = "force-dynamic";

// Whitelist capability keys to boolean values - ignore anything else
function sanitizeCaps(caps) {
  if (!caps || typeof caps !== "object") return null;
  const clean = {};
  for (const key of Object.keys(CAPACITY_META)) {
    if (typeof caps[key] === "boolean") clean[key] = caps[key];
  }
  return Object.keys(clean).length ? clean : null;
}

// Accepted STT transport markers live in the shared whitelist
// (src/shared/constants/models STT_TRANSPORT_META) - the dashboard transport
// select and this validator must agree on one set, so neither owns a copy.
// Unknown or mistyped values are silently dropped, the same policy
// sanitizeCaps applies to capability keys.
function sanitizeTransport(transport, type) {
  if (type !== "stt" || !isSttTransport(transport)) return null;
  return transport.trim();
}

// GET /api/models/custom - List all custom models
export async function GET() {
  try {
    const models = await getCustomModels();
    return NextResponse.json({ models });
  } catch (error) {
    console.log("Error fetching custom models:", error);
    return NextResponse.json({ error: "Failed to fetch custom models" }, { status: 500 });
  }
}

// POST /api/models/custom - Add custom model
// Accepts either a single model or { models: [...] } for a bulk add, so the
// "Active All" action can switch on a whole catalogue in one round trip
// instead of one request per model id.
export async function POST(request) {
  try {
    const body = await request.json();

    if (Array.isArray(body?.models)) {
      let count = 0;
      for (const entry of body.models) {
        if (!entry?.providerAlias || !entry?.id) continue;
        const type = entry.type || "llm";
        const cleanCaps = sanitizeCaps(entry.caps);
        const cleanTransport = sanitizeTransport(entry.transport, type);
        await addCustomModel({
          providerAlias: entry.providerAlias,
          id: entry.id,
          type,
          name: entry.name,
          ownedBy: typeof entry.ownedBy === "string" ? entry.ownedBy.trim() : "",
          ...(cleanCaps ? { caps: cleanCaps } : {}),
          ...(cleanTransport ? { transport: cleanTransport } : {}),
          inputMultiplier: entry.inputMultiplier,
          outputMultiplier: entry.outputMultiplier,
          antiProbe: entry.antiProbe,
        });
        count += 1;
      }
      return NextResponse.json({ success: true, count });
    }

    const { providerAlias, id, type, name, ownedBy, caps, transport, inputMultiplier, outputMultiplier, antiProbe } = body;
    if (!providerAlias || !id) {
      return NextResponse.json({ error: "providerAlias and id required" }, { status: 400 });
    }
    const cleanCaps = sanitizeCaps(caps);
    const cleanTransport = sanitizeTransport(transport, type || "llm");
    const added = await addCustomModel({
      providerAlias,
      id,
      type: type || "llm",
      name,
      // Optional free-form label; blank keeps the provider alias as before.
      ownedBy: typeof ownedBy === "string" ? ownedBy.trim() : "",
      ...(cleanCaps ? { caps: cleanCaps } : {}),
      ...(cleanTransport ? { transport: cleanTransport } : {}),
      inputMultiplier,
      outputMultiplier,
      antiProbe,
    });
    return NextResponse.json({ success: true, added });
  } catch (error) {
    console.log("Error adding custom model:", error);
    return NextResponse.json({ error: "Failed to add custom model" }, { status: 500 });
  }
}

// DELETE /api/models/custom?providerAlias=xxx&id=yyy&type=zzz
export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const providerAlias = searchParams.get("providerAlias");
    const id = searchParams.get("id");
    const type = searchParams.get("type") || "llm";
    if (!providerAlias || !id) {
      return NextResponse.json({ error: "providerAlias and id required" }, { status: 400 });
    }
    await deleteCustomModel({ providerAlias, id, type });
    // Keys pinned to this model now point at nothing. Keys may hold it either
    // bare or provider-qualified, so both spellings are handed over.
    const { emptied } = await reconcileAllowedModels({ removed: [id, `${providerAlias}/${id}`] });
    return NextResponse.json({ success: true, ...(emptied.length ? { keysLeftForReview: emptied } : {}) });
  } catch (error) {
    console.log("Error deleting custom model:", error);
    return NextResponse.json({ error: "Failed to delete custom model" }, { status: 500 });
  }
}
