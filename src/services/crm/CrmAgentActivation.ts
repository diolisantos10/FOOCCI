/**
 * CrmAgentActivation — o "interruptor de ativação por campanha" do Agente de CRM.
 *
 * Enquanto DESLIGADO (padrão de TODA campanha), o agente fica em modo aprendiz:
 * observa qual frase converte, mantém as frases que criou ESTACIONADAS (aprovadas
 * na Meta, prontas, mas fora do rodízio) e NÃO manda nada ao cliente.
 *
 * Ligar o interruptor de uma campanha (decisão humana/governada, com dados maduros)
 * faz as frases do agente entrarem no rodízio daquela campanha — e só dela.
 *
 * O estado mora em campaign.scheduleConfig.agentActive (default false). O envio lê
 * isto e passa includeAgent para resolveActivePhrases. Desligado = nada muda no que
 * sai hoje.
 */

import { prisma } from "@/lib/prisma";

/** Uma campanha está com o agente ativado? (default: NÃO — modo aprendiz.) */
export function isAgentActive(scheduleConfig: unknown): boolean {
  if (!scheduleConfig || typeof scheduleConfig !== "object") return false;
  return (scheduleConfig as { agentActive?: unknown }).agentActive === true;
}

/** Master switch do restaurante: o Agente de CRM está LIGADO? (default: sim.) */
export async function isAgentGloballyEnabled(restaurantId: string): Promise<boolean> {
  const r = await prisma.restaurant
    .findUnique({ where: { id: restaurantId }, select: { crmAgentEnabled: true } })
    .catch(() => null);
  return r?.crmAgentEnabled !== false; // ausente/erro → tratado como ligado (comportamento padrão)
}

/** Liga/desliga o Agente de CRM no restaurante inteiro (rodar o CRM na mão). */
export async function setAgentGloballyEnabled(
  restaurantId: string,
  enabled: boolean,
): Promise<{ ok: boolean; enabled: boolean }> {
  await prisma.restaurant.update({ where: { id: restaurantId }, data: { crmAgentEnabled: enabled } }).catch(() => null);
  return { ok: true, enabled };
}

/** Liga/desliga o agente numa campanha, preservando o resto do scheduleConfig. */
export async function setAgentActive(
  restaurantId: string,
  campaignId: string,
  active: boolean,
): Promise<{ ok: boolean; campaignId: string; active: boolean; error?: string }> {
  const campaign = await prisma.campaign
    .findFirst({ where: { id: campaignId, restaurantId }, select: { id: true, scheduleConfig: true } })
    .catch(() => null);
  if (!campaign) return { ok: false, campaignId, active: false, error: "campanha não encontrada" };

  const base = (campaign.scheduleConfig && typeof campaign.scheduleConfig === "object")
    ? (campaign.scheduleConfig as Record<string, unknown>)
    : {};
  const nextConfig = { ...base, agentActive: active };
  await prisma.campaign.update({ where: { id: campaignId }, data: { scheduleConfig: nextConfig as never } });
  return { ok: true, campaignId, active };
}

/**
 * BOTÃO DE PÂNICO: desliga o agente em TODAS as campanhas do restaurante de uma vez.
 * Volta tudo pro modo aprendiz (o que já rodava por sorteio segue igual). Nunca envia.
 */
export async function panicDisableAll(restaurantId: string): Promise<{ ok: boolean; disabled: number }> {
  const campaigns = await prisma.campaign
    .findMany({ where: { restaurantId }, select: { id: true, scheduleConfig: true } })
    .catch(() => [] as Array<{ id: string; scheduleConfig: unknown }>);

  let disabled = 0;
  for (const c of campaigns) {
    if (!isAgentActive(c.scheduleConfig)) continue;
    const base = (c.scheduleConfig && typeof c.scheduleConfig === "object")
      ? (c.scheduleConfig as Record<string, unknown>)
      : {};
    await prisma.campaign
      .update({ where: { id: c.id }, data: { scheduleConfig: { ...base, agentActive: false } as never } })
      .then(() => { disabled += 1; })
      .catch(() => {});
  }
  return { ok: true, disabled };
}
