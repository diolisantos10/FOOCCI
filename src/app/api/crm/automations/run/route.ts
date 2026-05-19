import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, badRequest, unauthorized, serverError } from "@/lib/api-response";
import { AutomationSchedulerService } from "@/services/crm/AutomationSchedulerService";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import type { AutomationTrigger } from "@prisma/client";

const VALID_TRIGGERS: AutomationTrigger[] = ["REACTIVATION", "BIRTHDAY", "POST_ORDER"];

const bodySchema = z.object({
  trigger: z.enum(["REACTIVATION", "BIRTHDAY", "POST_ORDER"]).optional(),
  dryRun: z.boolean().default(false),
});

export async function POST(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const body = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return badRequest("Dados inválidos", parsed.error.flatten());

    const { trigger, dryRun } = parsed.data;

    if (trigger) {
      if (!VALID_TRIGGERS.includes(trigger)) return badRequest("Trigger inválido");

      const automation = await prisma.cRMAutomation.findUnique({
        where: { restaurantId_trigger: { restaurantId: ctx.restaurantId, trigger } },
      });

      if (!automation) return badRequest("Automação não encontrada");

      const result = await AutomationSchedulerService.runSingleAutomation(
        ctx.restaurantId,
        automation,
        dryRun
      );
      return ok({ dryRun, result });
    }

    const result = await AutomationSchedulerService.runEnabledAutomations(ctx.restaurantId, dryRun);
    return ok({ dryRun, result });
  } catch (err) {
    console.error("[POST /api/crm/automations/run]", err);
    return serverError();
  }
}
