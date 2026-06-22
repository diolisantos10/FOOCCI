/**
 * CrmWeeklyNotificationService — proactive WhatsApp touchpoints for the owner.
 *
 * Closes the co-pilot loop: instead of hoping the lojista opens the dashboard,
 * the agent pings them on their own WhatsApp when the weekly plan is ready, and
 * sends a results digest for the previous week ("12 frios voltaram = R$ 840").
 *
 * Delivery reuses the same Evolution client the campaigns use. Every method is
 * best-effort and self-guarding: a missing owner number or unconfigured WhatsApp
 * returns { sent:false, reason } instead of throwing, so it never breaks the cron.
 */

import { startOfWeek } from "date-fns";
import { prisma } from "@/lib/prisma";
import { EvolutionConfigService } from "@/services/evolution/EvolutionConfigService";
import { EvolutionClient } from "@/lib/evolution/EvolutionClient";
import { normalizePhoneForEvolution, isValidEvolutionPhone } from "@/lib/crm/normalizePhone";
import { getPublicBaseUrl } from "@/lib/public-base-url";

export interface NotifyOutcome {
  sent: boolean;
  reason?: string;
}

interface OwnerContext {
  restaurantName: string;
  firstName: string | null;
  phone: string;
  dashboardUrl: string | null;
}

const BRL = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;

export class CrmWeeklyNotificationService {
  /** "Plano da semana pronto" — sent after a COPILOT plan is generated. */
  static async notifyPlanReady(
    restaurantId: string,
    plan: { items: { status: string }[]; summary: { totalAudience?: number; totalEstimatedRevenue?: number } | null },
  ): Promise<NotifyOutcome> {
    const proposed = plan.items.filter((i) => i.status === "PROPOSED").length;
    if (proposed === 0) return { sent: false, reason: "no-proposed-items" };

    const ctx = await this.ownerContext(restaurantId);
    if (!ctx) return { sent: false, reason: "owner-contact-missing" };

    const audience = plan.summary?.totalAudience ?? 0;
    const revenue = plan.summary?.totalEstimatedRevenue ?? 0;
    const hi = ctx.firstName ? `Bom dia, ${ctx.firstName}! ` : "Bom dia! ";
    const text =
      `🧭 *Plano da semana pronto* — ${ctx.restaurantName}\n\n` +
      `${hi}Analisei sua base e separei ${proposed} campanha(s) pra esta semana` +
      `${audience > 0 ? ` — alcance de ~${audience} cliente(s)` : ""}` +
      `${revenue > 0 ? `, ${BRL(revenue)} em potencial` : ""}.\n\n` +
      `👉 Revise e aprove num toque: ${ctx.dashboardUrl ?? "abra o FOOCCI → CRM → Plano da Semana"}`;

    return this.dispatch(restaurantId, ctx.phone, text);
  }

  /** "Ativei N campanhas sozinho" — sent after an AUTOPILOT plan auto-executes. */
  static async notifyAutopilotExecuted(
    restaurantId: string,
    plan: { items: { status: string }[]; summary: { totalAudience?: number; totalEstimatedRevenue?: number } | null },
    autoExecuted: number,
  ): Promise<NotifyOutcome> {
    if (autoExecuted <= 0) return { sent: false, reason: "nothing-executed" };

    const ctx = await this.ownerContext(restaurantId);
    if (!ctx) return { sent: false, reason: "owner-contact-missing" };

    const pending = plan.items.filter((i) => i.status === "PROPOSED").length;
    const revenue = plan.summary?.totalEstimatedRevenue ?? 0;
    const hi = ctx.firstName ? `Bom dia, ${ctx.firstName}! ` : "Bom dia! ";
    const text =
      `🤖 *Piloto automático* — ${ctx.restaurantName}\n\n` +
      `${hi}Já ativei ${autoExecuted} campanha(s) pra esta semana, dentro dos seus limites` +
      `${revenue > 0 ? ` (${BRL(revenue)} em potencial)` : ""}.\n\n` +
      `${pending > 0 ? `Deixei ${pending} item(ns) maior(es) pra sua aprovação. ` : ""}` +
      `Acompanhe tudo aqui: ${ctx.dashboardUrl ?? "FOOCCI → CRM → Plano da Semana"}`;

    return this.dispatch(restaurantId, ctx.phone, text);
  }

  /** Results digest for the PREVIOUS week's executed plan. */
  static async sendResultsDigest(restaurantId: string, opts?: { now?: Date }): Promise<NotifyOutcome> {
    const now = opts?.now ?? new Date();
    const priorWeekStart = startOfWeek(new Date(now.getTime() - 7 * 86_400_000), { weekStartsOn: 1 });

    const plan = await prisma.crmWeeklyPlan.findFirst({
      where: { restaurantId, weekStart: priorWeekStart },
      include: { items: { select: { campaignId: true } } },
    });
    if (!plan) return { sent: false, reason: "no-prior-plan" };

    const campaignIds = plan.items.map((i) => i.campaignId).filter((id): id is string => !!id);
    if (campaignIds.length === 0) return { sent: false, reason: "nothing-executed" };

    const campaigns = await prisma.campaign.findMany({
      where: { id: { in: campaignIds } },
      select: { totalSent: true, totalConverted: true, totalRevenue: true },
    });
    const totalSent = campaigns.reduce((s, c) => s + c.totalSent, 0);
    if (totalSent === 0) return { sent: false, reason: "no-sends-yet" };
    const totalConverted = campaigns.reduce((s, c) => s + c.totalConverted, 0);
    const totalRevenue = campaigns.reduce((s, c) => s + Number(c.totalRevenue), 0);

    const ctx = await this.ownerContext(restaurantId);
    if (!ctx) return { sent: false, reason: "owner-contact-missing" };

    const hi = ctx.firstName ? `${ctx.firstName}, ` : "";
    const text =
      `📊 *Resumo da semana* — ${ctx.restaurantName}\n\n` +
      `${hi}na semana passada o agente ativou ${campaignIds.length} campanha(s):\n` +
      `• ${totalSent} mensagem(ns) enviada(s)\n` +
      `• ${totalConverted} cliente(s) voltaram a pedir\n` +
      `• ${BRL(totalRevenue)} em pedidos atribuídos\n\n` +
      `Bora ver o plano desta semana? 👇 ${ctx.dashboardUrl ?? ""}`.trimEnd();

    return this.dispatch(restaurantId, ctx.phone, text);
  }

  // ─── internals ───────────────────────────────────────────────────────────────

  private static async ownerContext(restaurantId: string): Promise<OwnerContext | null> {
    const [restaurant, profile] = await Promise.all([
      prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { name: true } }),
      prisma.storeProfile.findUnique({
        where: { restaurantId },
        select: { ownerName: true, ownerWhatsapp: true, ownerPhone: true, whatsappPhone: true, mainPhone: true },
      }),
    ]);
    if (!restaurant) return null;

    const raw = (
      profile?.ownerWhatsapp ??
      profile?.ownerPhone ??
      profile?.whatsappPhone ??
      profile?.mainPhone ??
      ""
    ).trim();
    if (!raw) return null;
    const phone = normalizePhoneForEvolution(raw);
    if (!isValidEvolutionPhone(phone)) return null;

    const base = getPublicBaseUrl().url;
    return {
      restaurantName: restaurant.name,
      firstName: (profile?.ownerName ?? "").trim().split(" ")[0] || null,
      phone,
      dashboardUrl: base ? `${base}/crm?tab=plano-semana` : null,
    };
  }

  private static async dispatch(restaurantId: string, phone: string, text: string): Promise<NotifyOutcome> {
    const cfg = await EvolutionConfigService.getSnapshot(restaurantId);
    if (!cfg.ok) return { sent: false, reason: "evolution-not-configured" };
    try {
      await EvolutionClient.sendTextMessage(cfg.data, phone, text);
      return { sent: true };
    } catch (err) {
      return { sent: false, reason: err instanceof Error ? err.message.slice(0, 120) : "send-failed" };
    }
  }
}
