/**
 * GET /api/admin/brain/free-form/diagnose?restaurantId=..&phone=..
 *
 * Diagnóstico ao vivo do porquê de o Brain responder (ou não) uma mensagem de
 * texto no WhatsApp. Read-only. Mostra, na ordem exata do webhook:
 *  1. agentMode (whatsAppAgentConfig) — se MENU_ONLY, o Brain nem é chamado.
 *  2. WHATSAPP_BRAIN_ENABLED (env) — se "false", o Brain é pulado.
 *  3. free-form config (mode/allowlistCount/paused).
 *  4. resolveFreeFormAccess(restaurantId, phone) — allowed + motivo p/ o número.
 *
 * Assim dá pra ver, sem chutar, qual portão barrou o número de teste.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { getFreeFormConfig, resolveFreeFormAccess } from "@/services/brain/runtime/BrainFreeFormConfigService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const restaurantId = req.nextUrl.searchParams.get("restaurantId");
  const phone = req.nextUrl.searchParams.get("phone") ?? "";
  if (!restaurantId) {
    return NextResponse.json({ ok: false, error: "restaurantId é obrigatório." }, { status: 400 });
  }

  const agentCfg = await prisma.whatsAppAgentConfig
    .findUnique({ where: { restaurantId }, select: { agentMode: true } })
    .catch(() => null);
  const agentMode = agentCfg?.agentMode ?? "RECEPTIONIST_ONLY";

  const brainEnv = process.env.WHATSAPP_BRAIN_ENABLED ?? "(unset → ligado)";
  const brainFrontDoorWouldRun = agentMode !== "MENU_ONLY" && process.env.WHATSAPP_BRAIN_ENABLED !== "false";

  const freeFormConfig = await getFreeFormConfig(restaurantId);
  const access = phone ? await resolveFreeFormAccess(restaurantId, phone) : null;

  // Veredito legível.
  let verdict: string;
  if (!brainFrontDoorWouldRun) {
    verdict = agentMode === "MENU_ONLY"
      ? "Brain NÃO roda: agentMode = MENU_ONLY (troque para RECEPTIONIST_ONLY)."
      : "Brain NÃO roda: WHATSAPP_BRAIN_ENABLED = false.";
  } else if (!access) {
    verdict = "Brain roda para TEXTO. Passe &phone=... para testar o acesso do número.";
  } else if (access.allowed) {
    verdict = `Brain RESPONDE este número (${access.reason}). Se ainda cair no recepcionista, é o crítico (confiança < ${access.minConfidence} ou incoerência) — a trava de segurança.`;
  } else {
    verdict = `Brain roda, mas NÃO responde este número: ${access.reason}.`;
  }

  return NextResponse.json({
    ok: true,
    restaurantId,
    phone: phone || null,
    agentMode,
    brainEnv,
    brainFrontDoorWouldRun,
    freeFormConfig,
    access,
    verdict,
    runtimeTouched: false,
  });
}
