import { NextRequest } from "next/server";
import { resolverEscopoDoAgente } from "@/lib/agent-admin-scope";
import { ok, badRequest, unauthorized, serverError } from "@/lib/api-response";
import { CRMService } from "@/services/crm/CRMService";
import { z } from "zod";
import type { AutomationTrigger } from "@prisma/client";

const VALID_TRIGGERS: AutomationTrigger[] = ["REACTIVATION", "BIRTHDAY", "POST_ORDER"];

const bodySchema = z.object({
  /** Só admin: de quem é o restaurante. Lojista com tenant ignora este campo. */
  restaurantId:            z.string().optional(),
  isEnabled:               z.boolean().optional(),
  messageTemplate:         z.string().max(2000).optional(),
  triggerAfterDays:        z.number().int().min(0).max(365).optional(),
  oncePerCustomerLifetime: z.boolean().optional(),
  discountType:            z.enum(["PERCENTAGE", "FIXED"]).nullable().optional(),
  discountValue:           z.number().min(0).nullable().optional(),
  scheduleConfig:          z.object({
    sendTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    sendDays: z.array(z.number().int().min(0).max(6)).optional(),
    timezone: z.string().optional(),
  }).nullable().optional(),
});

type Params = { params: Promise<{ trigger: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { trigger } = await params;
    if (!VALID_TRIGGERS.includes(trigger as AutomationTrigger)) {
      return badRequest("Trigger inválido");
    }

    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return badRequest("Dados inválidos", parsed.error.flatten());

    const escopo = resolverEscopoDoAgente(req, parsed.data.restaurantId);
    if (!escopo) return unauthorized();

    const { restaurantId: _ignorado, ...campos } = parsed.data;
    const result = await CRMService.upsertAutomation(
      escopo.restaurantId,
      trigger as AutomationTrigger,
      campos
    );
    if (!result.ok) return serverError(result.error);

    return ok(result.data);
  } catch (err) {
    console.error("[PATCH /api/crm/automations/[trigger]]", err);
    return serverError();
  }
}
