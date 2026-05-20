import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, badRequest, unauthorized, serverError } from "@/lib/api-response";
import { CRMService } from "@/services/crm/CRMService";
import { z } from "zod";
import type { AutomationTrigger } from "@prisma/client";

const VALID_TRIGGERS: AutomationTrigger[] = ["REACTIVATION", "BIRTHDAY", "POST_ORDER"];

const bodySchema = z.object({
  isEnabled:        z.boolean().optional(),
  messageTemplate:  z.string().max(1000).optional(),
  triggerAfterDays: z.number().int().min(0).max(365).optional(),
  discountType:     z.enum(["PERCENTAGE", "FIXED"]).nullable().optional(),
  discountValue:    z.number().min(0).nullable().optional(),
  scheduleConfig:   z.object({
    sendTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    sendDays: z.array(z.number().int().min(0).max(6)).optional(),
    timezone: z.string().optional(),
  }).nullable().optional(),
});

type Params = { params: Promise<{ trigger: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const { trigger } = await params;
    if (!VALID_TRIGGERS.includes(trigger as AutomationTrigger)) {
      return badRequest("Trigger inválido");
    }

    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return badRequest("Dados inválidos", parsed.error.flatten());

    const result = await CRMService.upsertAutomation(
      ctx.restaurantId,
      trigger as AutomationTrigger,
      parsed.data
    );
    if (!result.ok) return serverError(result.error);

    return ok(result.data);
  } catch (err) {
    console.error("[PATCH /api/crm/automations/[trigger]]", err);
    return serverError();
  }
}
