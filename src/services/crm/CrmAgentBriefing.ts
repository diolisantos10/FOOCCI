/**
 * CrmAgentBriefing — "o recado do agente": ele fala SÓ quando tem algo que se
 * destaca. Compõe, a partir de sinais reais (frases campeãs + ganho projetado +
 * repertório magro), uma lista de recados — vitórias e oportunidades. Se nada
 * cruza a régua do "vale a pena falar", devolve vazio e a tela fica quieta.
 *
 * Pura e determinística: não consulta DB (recebe os dados já buscados), não
 * envia, não decide por calendário — decide por relevância.
 */

interface ChampionLike { campaignName: string; liftVsAvg: number; sent: number }
interface ShadowLike { campaignId: string; name: string; mode: "EXPLORING" | "OPTIMIZING"; projectedLiftPct: number | null; phrases: number; totalSent: number }
interface ActivationLike { campaignId: string; agentActive: boolean }

export interface BriefingNote {
  kind: "WIN" | "OPPORTUNITY";
  emoji: string;
  title: string;
  detail: string;
}

// Réguas do "vale a pena falar".
const WIN_MIN_LIFT = 1.5; // frase campeã convertendo ≥1,5× a média
const OPP_MIN_LIFT_PCT = 10; // ganho projetado ≥10%
const THIN_POOL_MIN_SENDS = 50; // repertório magro só vira recado com volume
const MAX_NOTES = 5;

export function composeBriefing(input: {
  champions: ChampionLike[];
  shadowCampaigns: ShadowLike[];
  activation: ActivationLike[];
}): BriefingNote[] {
  const notes: BriefingNote[] = [];
  const activeById = new Map(input.activation.map((a) => [a.campaignId, a.agentActive]));

  // VITÓRIAS — frases campeãs que se destacam de verdade.
  for (const c of input.champions.filter((c) => c.liftVsAvg >= WIN_MIN_LIFT).slice(0, 2)) {
    notes.push({
      kind: "WIN",
      emoji: "🏆",
      title: `${c.campaignName}: achamos uma frase campeã`,
      detail: `Ela está convertendo ${c.liftVsAvg}× a média da campanha. O agente já aprendeu com ela pra criar novas parecidas.`,
    });
  }

  // OPORTUNIDADES — ganho projetado alto numa campanha ainda não ativada.
  for (const s of input.shadowCampaigns
    .filter((s) => s.mode === "OPTIMIZING" && (s.projectedLiftPct ?? 0) >= OPP_MIN_LIFT_PCT && !activeById.get(s.campaignId))
    .sort((a, b) => (b.projectedLiftPct ?? 0) - (a.projectedLiftPct ?? 0))
    .slice(0, 2)) {
    notes.push({
      kind: "OPPORTUNITY",
      emoji: "📈",
      title: `${s.name}: dá pra melhorar +${s.projectedLiftPct}%`,
      detail: "Já tem dados suficientes. Ativando o agente nesta campanha, ele passa a usar mais as frases que convertem.",
    });
  }

  // OPORTUNIDADE — campanha rodando com pouca variação, mas com volume.
  for (const s of input.shadowCampaigns
    .filter((s) => s.phrases <= 1 && s.totalSent >= THIN_POOL_MIN_SENDS)
    .sort((a, b) => b.totalSent - a.totalSent)
    .slice(0, 2)) {
    notes.push({
      kind: "OPPORTUNITY",
      emoji: "✍️",
      title: `${s.name}: roda com uma frase só`,
      detail: `Já foram ${s.totalSent} envios com pouca variação. Posso criar frases novas (aprovadas pela Meta) pra testar e melhorar.`,
    });
  }

  return notes.slice(0, MAX_NOTES);
}
