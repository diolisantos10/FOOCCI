/**
 * CrmPhraseProposer — o agente CRIANDO repertório novo (passos 3 e 4).
 *
 * O agente não fica preso às frases existentes: ele redige UMA frase nova para a
 * campanha (no tom da marca, ancorada, sem inventar oferta), que depois segue para
 * APROVAÇÃO DA META. Só entra no rodízio quando a Meta libera — 100% dentro da regra.
 *
 * Também APRENDE com a campeã: se recebe uma frase que converteu muito (criada pelo
 * lojista ou por outro restaurante, via Cofre), imita o PADRÃO dela — sem copiar
 * texto — pra renovar o repertório com o que comprovadamente funciona.
 *
 * DISCIPLINA (shadow-safe):
 *  • NUNCA submete sozinho e NUNCA envia — só PROPÕE a frase candidata.
 *  • Passa pelo piso de segurança do agente (sem spam, sem desconto inventado).
 *  • É uma frase de CAMPANHA (template), não personalizada por cliente.
 */

import { reasonAsAgent } from "@/services/brain/reasoning/BrainReasoner";
import { detectSpamLanguage, impliesDiscount, isRepetitive } from "@/services/crm/MessageVariationService";

export interface ProposePhraseInput {
  restaurantId: string;
  /** Objetivo da campanha (ex.: "recuperar cliente frio", "convidar VIP"). */
  objective: string;
  /** A campanha concede cupom real? Se sim, a frase pode citar {cupom}. */
  hasCoupon?: boolean;
  /** Frases já ativas na campanha — para não repetir. */
  existingPhrases?: string[];
  /** Frase campeã cujo PADRÃO imitar (aprendizado). Nunca copiada ao pé da letra. */
  winningExample?: string;
  /** Segmento-alvo (ex.: "FRIO", "VIP") — dá contexto sem PII. */
  targetSegment?: string;
  /** Ângulo/gancho desta frase (ex.: "curiosidade", "prova social") — p/ diversidade. */
  angle?: string;
}

/** Ângulos distintos p/ um rodízio variado — cada frase ataca por um caminho. */
export const PHRASE_ANGLES = [
  "emocional/saudade — carinho, sentimos falta",
  "curiosidade — desperta interesse, uma pergunta ou gancho intrigante",
  "novidade/benefício — o que há de bom esperando por ele",
  "prova social — muita gente pedindo/aprovando",
  "convite direto e acolhedor — chamada simples e calorosa",
  "urgência leve — um empurrãozinho gentil pra agir hoje, sem pressão agressiva",
] as const;

export interface ProposePhraseResult {
  ok: boolean;
  /** A frase candidata (pronta p/ revisão e submissão à Meta). null se não deu. */
  phrase: string | null;
  /** true só quando limpa no piso (sem spam, sem oferta inventada, não repetida). */
  clean: boolean;
  blockedReasons: string[];
  reasoningMode?: string;
  coherence?: string;
  note?: string;
  /** Invariantes: nunca submete, nunca envia. */
  submitted: false;
  sent: false;
}

/** Valida a candidata no MESMO piso do agente (o que o diagnóstico protege). */
function screen(phrase: string, hasCoupon: boolean, existing: string[]): string[] {
  const reasons: string[] = [];
  const spam = detectSpamLanguage(phrase);
  if (spam.length) reasons.push(`linguagem inadequada: ${spam.join("; ")}`);
  if (!hasCoupon && impliesDiscount(phrase)) reasons.push("insinua desconto/oferta sem cupom da campanha");
  if (isRepetitive(phrase, existing)) reasons.push("muito parecida com uma frase já ativa");
  return reasons;
}

export async function proposePhrase(input: ProposePhraseInput): Promise<ProposePhraseResult> {
  const existing = input.existingPhrases ?? [];
  const hasCoupon = input.hasCoupon ?? false;

  const couponLine = hasCoupon
    ? "A campanha concede um cupom real — você pode usar o marcador {cupom}. Nunca invente outro desconto."
    : "Esta campanha NÃO concede cupom — não prometa desconto algum.";
  const learnLine = input.winningExample
    ? `Inspire-se no PADRÃO desta frase que converteu muito (ritmo, gancho, tom) — mas escreva uma NOVA, não copie: "${input.winningExample.slice(0, 200)}".`
    : "";
  const avoidLine = existing.length
    ? `Não repita estas frases já ativas: ${existing.slice(0, 6).map((p) => `"${p.slice(0, 80)}"`).join(" | ")}.`
    : "";

  const sanitizedInput = [
    "Escreva UMA frase-modelo de campanha de CRM (WhatsApp), curta, no tom da marca, para ser aprovada como template.",
    `Objetivo: ${input.objective}.`,
    input.angle ? `ÂNGULO desta frase (siga-o, seja distinto de outras abordagens): ${input.angle}.` : "",
    input.targetSegment ? `Público: clientes do segmento ${input.targetSegment}.` : "",
    "Use marcadores quando fizer sentido: {nome}, {link_cardapio}. Não invente preço/produto/promoção.",
    couponLine,
    avoidLine,
    learnLine,
    "Responda com a frase final no campo idealResponse — nada além dela.",
  ].filter(Boolean).join(" ");

  let outcome;
  try {
    outcome = await reasonAsAgent({
      businessId: input.restaurantId,
      businessType: "RESTAURANT",
      agentId: "crm",
      agentRole: "CRM",
      sourceType: "SYSTEM_EVENT",
      sanitizedInput,
      contextHints: [
        `objetivo: ${input.objective}`,
        `cupom: ${hasCoupon ? "sim" : "não"}`,
        input.winningExample ? "aprender-com-campeã" : "nova-frase",
      ],
    });
  } catch (err) {
    return {
      ok: false, phrase: null, clean: false, blockedReasons: [],
      note: err instanceof Error ? err.message.slice(0, 160) : "erro no motor de IA",
      submitted: false, sent: false,
    };
  }

  const phrase = (outcome.result.idealResponse ?? "").trim();
  if (!phrase) {
    return { ok: false, phrase: null, clean: false, blockedReasons: [], note: "agente não produziu frase", submitted: false, sent: false };
  }

  const blockedReasons = screen(phrase, hasCoupon, existing);
  const critic = outcome.reasoningMode === "LLM" && outcome.result.coherenceCheck.verdict === "PASS";

  return {
    ok: true,
    phrase,
    clean: blockedReasons.length === 0 && critic,
    blockedReasons,
    reasoningMode: outcome.reasoningMode,
    coherence: outcome.result.coherenceCheck.verdict,
    submitted: false,
    sent: false,
  };
}
