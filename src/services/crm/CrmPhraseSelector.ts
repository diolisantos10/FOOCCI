/**
 * CrmPhraseSelector — o "coração" do Agente de CRM: escolher, entre as frases
 * JÁ APROVADAS de uma campanha, qual mandar — favorecendo as que mais convertem.
 *
 * Hoje o sistema sorteia uniformemente (pickPhrase). Isto substitui o sorteio por
 * uma escolha PACIENTE e SEGURA:
 *
 *  • JANELA DE TEMPO (regra do lojista): enquanto não houver dados de sobra, o
 *    agente NÃO favorece ninguém — mantém exploração uniforme, coletando baseline
 *    justo. Nada de tirar conclusão com poucos envios.
 *  • Só depois de dados suficientes ele "otimiza": pesa a favor das vencedoras.
 *  • PISO DE EXPLORAÇÃO: toda frase aprovada mantém uma fatia mínima — nenhuma
 *    desafiante nova (recém-aprovada pela Meta) morre sem chance de provar valor.
 *
 * Puro e determinístico (RNG injetável). Não lê DB, não envia, não toca runtime.
 * Só decide PROPORÇÕES entre frases aprovadas — nunca cria/edita texto, então é
 * 100% compatível com a regra da Meta (só rodízio de templates aprovados).
 */

export interface PhraseStat {
  /** variantKey (fingerprint da frase) — a identidade que já é medida por execução. */
  key: string;
  sent: number;
  converted: number;
}

export interface PhraseWeight {
  key: string;
  /** Proporção 0–1 (soma de todos = 1) com que esta frase deve ser escolhida. */
  weight: number;
  /** Taxa de conversão suavizada, p/ transparência/painel. */
  rate: number;
  /** true quando a frase ainda não tem envios suficientes p/ ser julgada. */
  underTest: boolean;
}

export interface PhraseSelection {
  mode: "EXPLORING" | "OPTIMIZING";
  reason: string;
  weights: PhraseWeight[];
}

/** Envios que uma frase precisa acumular antes de a taxa dela ser confiável. */
export const MIN_SENDS_TO_JUDGE_PHRASE = 30;
/** Envios totais na campanha antes de o agente sair da exploração e começar a otimizar. */
export const MIN_CAMPAIGN_SENDS_TO_OPTIMIZE = 100;
/** Fatia mínima garantida a CADA frase ativa (mantém desafiantes vivas). */
export const EXPLORATION_FLOOR = 0.1;

/** Taxa de conversão com suavização de Laplace (evita 0/0 e extremos com pouca amostra). */
function smoothedRate(s: PhraseStat): number {
  return (s.converted + 1) / (s.sent + 2);
}

function uniform(keys: string[], stats: Map<string, PhraseStat>): PhraseWeight[] {
  const w = keys.length ? 1 / keys.length : 0;
  return keys.map((key) => {
    const s = stats.get(key) ?? { key, sent: 0, converted: 0 };
    return { key, weight: w, rate: smoothedRate(s), underTest: s.sent < MIN_SENDS_TO_JUDGE_PHRASE };
  });
}

/**
 * Decide as proporções entre as frases APROVADAS ativas da campanha.
 * @param phraseKeys as frases ativas (aprovadas) — a ordem não importa.
 * @param statList estatísticas por frase (sent/converted) da janela considerada.
 */
export function selectPhraseWeights(phraseKeys: string[], statList: PhraseStat[]): PhraseSelection {
  const keys = [...new Set(phraseKeys)].filter(Boolean);
  const stats = new Map(statList.map((s) => [s.key, s]));

  if (keys.length <= 1) {
    return { mode: "EXPLORING", reason: "uma frase só — nada a otimizar", weights: uniform(keys, stats) };
  }

  const totalSent = keys.reduce((sum, k) => sum + (stats.get(k)?.sent ?? 0), 0);

  // PACIÊNCIA: sem dados de sobra na campanha, mantém exploração uniforme.
  if (totalSent < MIN_CAMPAIGN_SENDS_TO_OPTIMIZE) {
    return {
      mode: "EXPLORING",
      reason: `coletando baseline (${totalSent}/${MIN_CAMPAIGN_SENDS_TO_OPTIMIZE} envios) — ainda não favorece nenhuma`,
      weights: uniform(keys, stats),
    };
  }

  // OTIMIZAÇÃO: pesa pela taxa suavizada. Frases ainda "em teste" (pouca amostra)
  // recebem a taxa MÉDIA (não são punidas por falta de dados — só precisam de mais envios).
  const judged = keys.map((k) => stats.get(k) ?? { key: k, sent: 0, converted: 0 });
  const avgRate = judged.reduce((sum, s) => sum + smoothedRate(s), 0) / judged.length;

  const rawRates = keys.map((k) => {
    const s = stats.get(k) ?? { key: k, sent: 0, converted: 0 };
    const underTest = s.sent < MIN_SENDS_TO_JUDGE_PHRASE;
    return { key: k, rate: underTest ? avgRate : smoothedRate(s), underTest, realRate: smoothedRate(s) };
  });

  const rateSum = rawRates.reduce((sum, r) => sum + r.rate, 0) || 1;
  const floorShare = EXPLORATION_FLOOR / keys.length;

  // peso = piso de exploração + fatia proporcional à taxa (renormalizado p/ somar 1).
  const weights: PhraseWeight[] = rawRates.map((r) => ({
    key: r.key,
    weight: floorShare + (1 - EXPLORATION_FLOOR) * (r.rate / rateSum),
    rate: Number(r.realRate.toFixed(4)),
    underTest: r.underTest,
  }));

  return {
    mode: "OPTIMIZING",
    reason: `favorecendo as vencedoras (${totalSent} envios; piso de exploração ${Math.round(EXPLORATION_FLOOR * 100)}%)`,
    weights,
  };
}

/** Escolhe uma frase segundo os pesos. RNG injetável (default Math.random via arg). */
export function pickWeighted(weights: PhraseWeight[], rand: number): string | null {
  if (!weights.length) return null;
  const total = weights.reduce((sum, w) => sum + w.weight, 0);
  let r = Math.min(Math.max(rand, 0), 0.999999) * total;
  for (const w of weights) {
    r -= w.weight;
    if (r <= 0) return w.key;
  }
  return weights[weights.length - 1]?.key ?? null;
}
