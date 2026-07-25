/**
 * CrmPhraseConfidence — traduz os números crus de cada frase (enviadas/pedidos)
 * no "quanto dá pra confiar" que o lojista vê como SELO, sem tirar conclusão cedo.
 *
 * É a MESMA régua que o agente usa por baixo — nada novo, nada mais permissivo:
 *   • em teste   → tem envios, mas < MIN_SENDS_TO_JUDGE_PHRASE (amostra pequena).
 *   • confiável  → já tem amostra suficiente, sem ser a campeã.
 *   • campeã     → mesma definição do CrmChampionDetector (≥2 frases medidas,
 *                  sent ≥ mínimo E taxa ≥ média × CHAMPION_LIFT_MULTIPLIER).
 *   • (nenhum)   → sem envios ainda.
 *
 * Puro/determinístico: não lê DB, não escreve, não decide envio — só ROTULA leitura.
 * Roda no backend (rota phrase-stats) pra o front só desenhar o selo pronto.
 */

import { MIN_SENDS_TO_JUDGE_PHRASE, MIN_CAMPAIGN_SENDS_TO_OPTIMIZE } from "@/services/crm/CrmPhraseSelector";
import { CHAMPION_LIFT_MULTIPLIER } from "@/services/crm/CrmChampionDetector";

export type PhraseTier = "champion" | "reliable" | "under-test" | "none";

export interface PhraseCount {
  /** variantKey (fingerprint da frase). */
  key: string;
  sent: number;
  converted: number;
}

export interface PhraseConfidence {
  /** true quando tem envios mas ainda não o bastante p/ julgar. */
  underTest: boolean;
  /** true quando é a campeã da campanha (mesma régua do detector). */
  champion: boolean;
  tier: PhraseTier;
}

export interface CampaignConfidence {
  totalSent: number;
  /** Envios necessários p/ o baseline (espelha MIN_CAMPAIGN_SENDS_TO_OPTIMIZE). */
  baselineTarget: number;
  /** true quando a campanha já passou do baseline (dá p/ tirar conclusão). */
  baselineReached: boolean;
}

export interface ConfidenceResult {
  byKey: Record<string, PhraseConfidence>;
  campaign: CampaignConfidence;
}

/** Suavização de Laplace — idêntica ao detector/selector (evita extremos com pouca amostra). */
function smoothedRate(sent: number, converted: number): number {
  return (converted + 1) / (sent + 2);
}

/**
 * Rotula cada frase a partir das contagens que a rota já tem em mãos.
 * @param counts uma entrada por frase medida (sent/converted da campanha).
 */
export function computePhraseConfidence(counts: PhraseCount[]): ConfidenceResult {
  const totalSent = counts.reduce((sum, c) => sum + c.sent, 0);

  // Campeã: espelha CrmChampionDetector — precisa de ≥2 frases COM envio, a taxa
  // suavizada acima da média × lift, e amostra suficiente. Vence a de maior taxa.
  const measured = counts.filter((c) => c.sent > 0);
  let championKey: string | null = null;
  if (measured.length >= 2) {
    const rates = measured.map((c) => ({ key: c.key, sent: c.sent, rate: smoothedRate(c.sent, c.converted) }));
    const avg = rates.reduce((sum, r) => sum + r.rate, 0) / rates.length;
    championKey = rates
      .filter((r) => r.sent >= MIN_SENDS_TO_JUDGE_PHRASE && r.rate >= avg * CHAMPION_LIFT_MULTIPLIER)
      .sort((a, b) => b.rate - a.rate)[0]?.key ?? null;
  }

  const byKey: Record<string, PhraseConfidence> = {};
  for (const c of counts) {
    const champion = c.key === championKey;
    const underTest = c.sent > 0 && c.sent < MIN_SENDS_TO_JUDGE_PHRASE;
    const tier: PhraseTier = champion
      ? "champion"
      : c.sent === 0
      ? "none"
      : underTest
      ? "under-test"
      : "reliable";
    byKey[c.key] = { underTest, champion, tier };
  }

  return {
    byKey,
    campaign: {
      totalSent,
      baselineTarget: MIN_CAMPAIGN_SENDS_TO_OPTIMIZE,
      baselineReached: totalSent >= MIN_CAMPAIGN_SENDS_TO_OPTIMIZE,
    },
  };
}
