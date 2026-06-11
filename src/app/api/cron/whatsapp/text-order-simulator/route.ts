/**
 * POST /api/cron/whatsapp/text-order-simulator
 *
 * Hermetic, self-contained simulation of the WhatsApp "anotador de pedido"
 * journey over a SYNTHETIC catalog + synthetic PaymentSettings + synthetic saved
 * address. Proves the canonical scenarios (pedido livre/dinheiro/Pix/retirada,
 * produto inexistente/ambíguo, 0/menu, atendente, perguntas W8/W9, config
 * perigosa/segura) with PASS/WARNING/FAIL + transcript + comanda + WOULD_*
 * actions + safety flags. Lets the team prove the architecture WITHOUT a phone.
 *
 * Body (JSON, optional): { mode?: "DRY_RUN" | "REPLY_ONLY" | "FULL_TEST" }
 * Auth: Authorization: Bearer {CRON_SECRET}. POST only. Never sends/creates anything.
 */

import { NextRequest, NextResponse } from "next/server";
import { runTextOrderSimulator, type SimMode } from "@/services/whatsapp/ordering/WhatsAppTextOrderSimulatorService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID: SimMode[] = ["DRY_RUN", "REPLY_ONLY", "FULL_TEST"];

function checkCronAuth(req: NextRequest): { ok: true } | { ok: false; status: 401 | 503; error: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { ok: false, status: 503, error: "CRON_SECRET is not configured" };
  if ((req.headers.get("authorization") ?? "") !== `Bearer ${secret}`) return { ok: false, status: 401, error: "Unauthorized" };
  return { ok: true };
}

export async function POST(req: NextRequest) {
  const auth = checkCronAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, status: "FAIL", message: auth.error, runtimeTouched: false }, { status: auth.status });
  }
  try {
    const body = (await req.json().catch(() => ({}))) as { mode?: string };
    const mode = (VALID as string[]).includes(body.mode ?? "") ? (body.mode as SimMode) : "REPLY_ONLY";
    const result = await runTextOrderSimulator(mode);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 200) : "erro desconhecido";
    return NextResponse.json({ ok: false, status: "FAIL", message, runtimeTouched: false }, { status: 200 });
  }
}
