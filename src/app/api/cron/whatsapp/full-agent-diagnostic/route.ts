/**
 * POST /api/cron/whatsapp/full-agent-diagnostic
 *
 * READ-ONLY consolidated battery across BOTH WhatsApp paths (Text Order +
 * Receptionist) and both phone profiles (allowlisted self-test + synthetic
 * non-allowlisted), with a single PASS/WARNING/FAIL verdict and an operational
 * recommendation. Never sends WhatsApp, never creates an order/Pix,
 * never changes config. Phones are masked. Auth: Bearer {CRON_SECRET}. POST only.
 */

import { NextRequest, NextResponse } from "next/server";
import { runFullAgentDiagnostic } from "@/services/whatsapp/ordering/fullAgentDiagnostic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function checkCronAuth(req: NextRequest): { ok: true } | { ok: false; status: 401 | 503; error: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { ok: false, status: 503, error: "CRON_SECRET is not configured" };
  if ((req.headers.get("authorization") ?? "") !== `Bearer ${secret}`) return { ok: false, status: 401, error: "Unauthorized" };
  return { ok: true };
}

export async function POST(req: NextRequest) {
  const auth = checkCronAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, message: auth.error, runtimeTouched: false }, { status: auth.status });
  }
  try {
    const body = (await req.json().catch(() => ({}))) as {
      restaurantSlug?: string; restaurantId?: string; nonAllowlistedPhone?: string; fieldValidated?: boolean;
    };
    const result = await runFullAgentDiagnostic({
      restaurantSlug:      typeof body.restaurantSlug === "string" ? body.restaurantSlug : undefined,
      restaurantId:        typeof body.restaurantId === "string" ? body.restaurantId : undefined,
      nonAllowlistedPhone: typeof body.nonAllowlistedPhone === "string" ? body.nonAllowlistedPhone : undefined,
      fieldValidated:      body.fieldValidated === true,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 200) : "erro desconhecido";
    return NextResponse.json({ ok: false, message, runtimeTouched: false }, { status: 200 });
  }
}
