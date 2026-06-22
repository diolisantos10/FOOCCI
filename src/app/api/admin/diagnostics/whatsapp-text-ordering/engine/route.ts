/**
 * GET /api/admin/diagnostics/whatsapp-text-ordering/engine
 *
 * Brain engine health for the WhatsApp order-taking agent. Admin-only.
 * Runs IN PRODUCTION, so it reports the real production state that can't be read
 * from a dev sandbox: is the AI pilot actually ON (OPENAI_API_KEY present) or is
 * the agent falling back to the deterministic regex machine?
 *
 * Read-only. No WhatsApp send, no order, no Pix.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { selectEngine, configuredProviders } from "@/services/brain/engines/AIEngineRouter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const providers = configuredProviders();
  const engine = selectEngine("whatsapp");
  const openaiConfigured = providers.includes("OPENAI");

  return NextResponse.json({
    brain: {
      provider: engine.provider, // "OPENAI" | "MOCK"
      model: engine.model,
      reasoning: engine.provider === "OPENAI" ? "LLM" : "FALLBACK",
      openaiConfigured,
      reason: engine.reason,
    },
    flags: {
      frontDoorEnabled: process.env.WHATSAPP_BRAIN_ENABLED !== "false",
      orderBrainEnabled: process.env.WHATSAPP_ORDER_BRAIN_ENABLED !== "false",
    },
    providersConfigured: providers,
  });
}
