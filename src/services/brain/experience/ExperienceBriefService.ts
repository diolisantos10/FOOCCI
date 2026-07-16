/**
 * ExperienceBriefService — o CONSUMO do Cofre de Experiências.
 *
 * Destila as experiências acumuladas de um restaurante num "brief" curto que os
 * agentes leem para chegar PREPARADOS ("os clientes daqui pedem muito poke,
 * festival, delivery à noite"). Regra de ouro: é CONTEXTO para antecipar e ser
 * relevante — NUNCA fonte de verdade nem de disponibilidade. A verdade continua
 * sendo a Base de Conhecimento; os críticos continuam guardando.
 *
 * Cacheado em memória (TTL) para NÃO pesar no caminho de atendimento: uma
 * agregação por restaurante a cada poucas horas, não por mensagem.
 */

import { prisma } from "@/lib/prisma";

const TTL_MS = 6 * 60 * 60 * 1000; // 6h
const LOOKBACK_DAYS = 30;
const MIN_ROWS = 15; // pouco dado → sem brief (evita ruído)

const cache = new Map<string, { brief: string; at: number }>();

/** Brief de experiência do restaurante (cacheado). "" quando não há dado suficiente. */
export async function getExperienceBrief(restaurantId: string, agentId?: string): Promise<string> {
  const key = `${restaurantId}:${agentId ?? "*"}`;
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < TTL_MS) return hit.brief;
  const brief = await buildBrief(restaurantId, agentId).catch(() => "");
  cache.set(key, { brief, at: now });
  return brief;
}

async function buildBrief(restaurantId: string, agentId?: string): Promise<string> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const rows = await prisma.restaurantExperience.findMany({
    where: { restaurantId, ...(agentId ? { agentId } : {}), sourceAt: { gte: since } },
    orderBy: { sourceAt: "desc" },
    take: 800,
    select: { tags: true },
  });
  if (rows.length < MIN_ROWS) return "";

  const counts: Record<string, number> = {};
  for (const r of rows) for (const t of r.tags) counts[t] = (counts[t] ?? 0) + 1;
  const top = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([t]) => t)
    .filter(Boolean);
  if (!top.length) return "";

  return (
    "CONTEXTO DE EXPERIÊNCIA (padrões reais deste restaurante — o que os clientes mais pedem/perguntam): " +
    `${top.join(", ")}. ` +
    "Use SOMENTE para antecipar e ser ágil/relevante. NÃO é fonte de verdade nem lista de disponibilidade — " +
    "nunca afirme que algo existe/tem preço com base nisto; a verdade é a BASE DE CONHECIMENTO acima."
  );
}

/** Limpa o cache (usado em testes / após re-ingestão manual). */
export function clearExperienceBriefCache(): void {
  cache.clear();
}
