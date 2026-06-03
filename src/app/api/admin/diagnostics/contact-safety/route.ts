/**
 * GET /api/admin/diagnostics/contact-safety
 *
 * Read-only diagnostic for the unified CRM ContactSafetyService.
 * For a given restaurant (and optional customer), returns the live
 * ContactSafetyDecision WITHOUT sending anything.
 *
 * Auth: x-admin-secret header OR foocci-admin-token cookie.
 *
 * Query params:
 *   restaurantId — required.
 *   customerId   — optional; evaluate a specific customer's sendability.
 *   limit        — when no customerId, sample up to N contactable customers (default 10, max 50).
 *
 * Safe:
 *   - Read-only. No mutations, no sends.
 *   - Surfaces the safety config + per-customer decisions for auditing.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAdminRequest } from "@/lib/admin-auth";
import { ContactSafetyService } from "@/services/crm/ContactSafetyService";
import { getSafetyConfig } from "@/lib/crm-safety";
import { EvolutionConfigService } from "@/services/evolution/EvolutionConfigService";

export async function GET(req: NextRequest) {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Endpoint disabled — ADMIN_SECRET not configured." }, { status: 403 });
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp           = req.nextUrl.searchParams;
  const restaurantId = sp.get("restaurantId");
  const customerId   = sp.get("customerId") ?? undefined;
  const limit        = Math.min(Number(sp.get("limit") ?? "10"), 50);

  if (!restaurantId) {
    return NextResponse.json({ error: "restaurantId is required" }, { status: 400 });
  }

  try {
    const evoResult         = await EvolutionConfigService.getSnapshot(restaurantId);
    const evolutionAvailable = evoResult.ok;
    const safety            = await getSafetyConfig(restaurantId);

    const context = await ContactSafetyService.buildGlobalContext(restaurantId, {
      evolutionAvailable,
      checkRestaurantOpen: true,
    });

    // Resolve which customers to evaluate.
    const customers = await prisma.customer.findMany({
      where: customerId
        ? { id: customerId, restaurantId }
        : { restaurantId, isGuest: false, isActive: true },
      orderBy: { lastOrderAt: "desc" },
      take:    customerId ? 1 : limit,
      select: {
        id: true, name: true, phone: true,
        hasOptedOut: true, crmContactable: true,
        segment: true, tier: true,
      },
    });

    const evaluations = await Promise.all(
      customers.map(async (c) => {
        const decision = await ContactSafetyService.assertSendable({
          restaurantId,
          customerId:     c.id,
          phone:          c.phone,
          hasOptedOut:    c.hasOptedOut,
          crmContactable: c.crmContactable,
          enforceTimeWindows: true,
          enforceDailyCap:    true,
          context,
        });
        return {
          customerId:  c.id,
          name:        c.name,
          phone:       c.phone ? `***${c.phone.slice(-4)}` : null, // masked
          segment:     c.segment,
          tier:        c.tier,
          hasOptedOut: c.hasOptedOut,
          crmContactable: c.crmContactable,
          sendable:    decision.sendable,
          reason:      decision.reason,
          detail:      decision.detail,
        };
      }),
    );

    return NextResponse.json({
      restaurantId,
      evolutionAvailable,
      restaurantOpen: context.restaurantOpen,
      globalSentToday: context.globalSentToday,
      safety: {
        dailyGlobalCap:        safety.dailyGlobalCap,
        customerCooldownHours: safety.customerCooldownHours,
        maxPerWeekPerCustomer: safety.maxPerWeekPerCustomer,
        quietHoursEnabled:     safety.quietHoursEnabled,
        quietHoursStart:       safety.quietHoursStart,
        quietHoursEnd:         safety.quietHoursEnd,
        sendOnWeekends:        safety.sendOnWeekends,
        timezone:              safety.timezone,
      },
      evaluatedCount: evaluations.length,
      sendableCount:  evaluations.filter((e) => e.sendable).length,
      blockedCount:   evaluations.filter((e) => !e.sendable).length,
      evaluations,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Diagnostic failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
