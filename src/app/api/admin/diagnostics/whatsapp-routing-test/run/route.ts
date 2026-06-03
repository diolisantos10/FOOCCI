/**
 * POST /api/admin/diagnostics/whatsapp-routing-test/run
 *
 * Runs the WhatsApp Routing Test Lab. Pure simulation — NO Evolution sends,
 * NO DB mutation, NO LLM, NO campaigns. Admin-only (ADMIN_SECRET).
 *
 * Body:
 *   mode: "quick" | "full" | "custom"
 *   customEvent?: SimulatedRoutingEvent   (required when mode = "custom")
 *
 * Response:
 *   mode="quick"|"full"  → RoutingTestSummary
 *   mode="custom"        → { mode:"custom", result: ScenarioResult }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkAdminRequest } from "@/lib/admin-auth";
import {
  runRoutingScenarios,
  runCustomEvent,
} from "@/services/whatsapp/testing/WhatsAppRoutingTestService";
import type { SimulatedRoutingEvent } from "@/services/whatsapp/WhatsAppRoutingClassifier";

const customEventSchema = z.object({
  restaurantRef: z.string().optional(),
  instanceName: z.string().optional(),
  remoteJid: z.string().optional(),
  fromPhone: z.string().optional(),
  connectedBusinessPhone: z.string().optional(),
  fromMe: z.boolean().optional(),
  messageText: z.string().min(1).max(2000),
  messageId: z.string().optional(),
  timestamp: z.string().optional(),
  source: z.enum(["WEBHOOK", "MANUAL_OPERATOR", "CARDAPIO", "SYSTEM"]),
  operatorId: z.string().optional(),
  buildOsEnabled: z.boolean().optional(),
  authorizedBuildPhone: z.boolean().optional(),
  agentMode: z.enum(["RECEPTIONIST_ONLY", "HUMAN_ASSISTED", "AI_ORDERING_EXPERIMENTAL"]).optional(),
  aiEnabled: z.boolean().optional(),
  conversationStatus: z.enum(["OPEN", "BOT", "HUMAN", "RESOLVED", "AI_ATENDENDO", "HUMANO_ASSUMIU"]).optional(),
  contextType: z.enum(["CRM_CAMPAIGN", "CRM_AUTOMATION", "CART_RECOVERY", "ORDER_SUPPORT", "HUMAN_SUPPORT"]).nullable().optional(),
  isHistoricalRecord: z.boolean().optional(),
});

const bodySchema = z.object({
  mode: z.enum(["quick", "full", "custom"]).default("quick"),
  customEvent: customEventSchema.optional(),
  slug: z.string().optional(),
});

export async function POST(req: NextRequest) {
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Entrada inválida.", details: parsed.error.flatten() }, { status: 400 });
  }

  const { mode, customEvent } = parsed.data;

  if (mode === "custom") {
    if (!customEvent) {
      return NextResponse.json({ error: "customEvent é obrigatório no modo custom." }, { status: 400 });
    }
    const result = runCustomEvent(customEvent as SimulatedRoutingEvent);
    return NextResponse.json({ mode: "custom", result });
  }

  const summary = runRoutingScenarios(mode);
  return NextResponse.json(summary);
}
