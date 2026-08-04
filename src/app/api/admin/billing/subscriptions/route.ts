/**
 * GET/POST /api/admin/billing/subscriptions — a carteira de assinaturas.
 * Auth: x-admin-secret header OU cookie de admin (padrão da casa).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkAdminRequest } from "@/lib/admin-auth";
import { PlanSubscriptionService } from "@/services/billing/PlanSubscriptionService";
import { MercadoPagoPlatformBilling, isPlatformBillingConfigured } from "@/services/billing/MercadoPagoPlatformBilling";
import { getNfseConfig } from "@/services/billing/PlanNfseService";

export async function GET(req: NextRequest) {
  if (!checkAdminRequest(req)) return NextResponse.json({ ok: false }, { status: 401 });
  const subscriptions = await PlanSubscriptionService.list();
  return NextResponse.json({
    ok: true,
    subscriptions,
    gateway: { mpConfigured: isPlatformBillingConfigured() },
    nfse: { enabled: !getNfseConfig().reason, reason: getNfseConfig().reason },
  });
}

const createSchema = z.object({
  customerName: z.string().trim().min(2).max(160),
  customerWhatsapp: z.string().trim().min(8).max(30),
  customerCnpj: z.string().trim().max(20).optional().or(z.literal("")),
  customerEmail: z.string().trim().email().max(160).optional().or(z.literal("")),
  plan: z.enum(["STARTER", "GROWTH", "PRO"]),
  cycle: z.enum(["MENSAL", "TRIMESTRAL", "ANUAL"]),
  priceCents: z.number().int().positive().optional(),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});

export async function POST(req: NextRequest) {
  if (!checkAdminRequest(req)) return NextResponse.json({ ok: false }, { status: 401 });
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }

  const sub = await PlanSubscriptionService.create({
    ...parsed.data,
    customerCnpj: parsed.data.customerCnpj || null,
    customerEmail: parsed.data.customerEmail || null,
    notes: parsed.data.notes || null,
  });

  // Tenta criar o link de cobrança já na criação — best-effort: sem gateway ou
  // sem e-mail, a assinatura existe do mesmo jeito e o CEO cobra manualmente.
  let mpError: string | null = null;
  if (isPlatformBillingConfigured() && sub.customerEmail) {
    try {
      // G2: `ensurePreapproval` no lugar do `createPreapproval` cru — um POST
      // reenviado nunca vira uma segunda recorrência no cartão do cliente.
      const pre = await PlanSubscriptionService.ensurePreapproval(sub.id);
      if (!pre.ok) mpError = `Link de cobrança não gerado (${pre.reason}).`;
    } catch (err) {
      mpError = err instanceof Error ? err.message : String(err);
    }
  }

  return NextResponse.json({
    ok: true,
    subscriptionId: sub.id,
    acceptUrl: `https://foocci.com.br/contratar/${sub.acceptToken}`,
    mpError,
  });
}
