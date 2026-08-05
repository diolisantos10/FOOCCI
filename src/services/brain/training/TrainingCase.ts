/**
 * TrainingCase — o contrato genérico da ESTEIRA DE TREINO de um agente.
 *
 * Por que existe (decisão do CEO, 05/08/2026): o degrau "primeira mensagem real
 * para o próprio time" foi CANCELADO. Feedback humano artesanal não escala e, na
 * prática, não chega — o degrau ficou parado desde 03/08 esperando uma lista de
 * telefones que nunca veio. No lugar dele entra uma esteira que roda sozinha:
 * casos montados a partir de dado REAL, com destinatário SINTÉTICO, julgados por
 * portão e gravados como evidência de sombra com origem TRAINING.
 *
 * O que este arquivo é: contrato + julgamento PURO. Nada aqui toca banco, IA ou
 * canal. O adapter de cada domínio (o do CRM é o primeiro) monta os casos e
 * chama `julgarCasoDeTreino` sobre o que o agente devolveu.
 *
 * A disciplina que o julgamento respeita:
 *  • O veredito do caso NUNCA eleva o veredito do Brain — só rebaixa. Uma
 *    esteira que promove NEEDS_REVIEW a PASS estaria fabricando evidência.
 *  • Detector só reprova com padrão INEQUÍVOCO. Detector frouxo vira carimbo, a
 *    taxa despenca por defeito do instrumento e o agente é condenado no lugar do
 *    medidor.
 *  • Toda proibição nasce com as duas metades de teste: o caso ruim barrado E o
 *    caso legítimo passando.
 */

export type TrainingCaseKind = "PERFIL_REAL" | "ADVERSARIAL";

/** Coerência do Brain, na mesma escala do BrainCoherenceCheck. */
export type TrainingVerdict = "PASS" | "FAIL" | "NEEDS_REVIEW";

/**
 * O que a mensagem NÃO pode afirmar, dado o perfil do caso. Cada entrada existe
 * porque o dado do caso a torna FALSA — não porque a frase seja feia.
 */
export type ForbiddenClaim =
  /** Perfil sem nenhum pedido: não existe "seu último pedido". */
  | "PEDIDO_ANTERIOR"
  /** Perfil que pediu ontem: não existe "faz tempo que você não aparece". */
  | "AUSENCIA_LONGA"
  /** Campanha sem cupom: prometer desconto é prometer o que não há. */
  | "DESCONTO"
  /** Ticket zerado/desconhecido: citar "R$ 0" é devolver o buraco do dado como fato. */
  | "VALOR_ZERO";

export interface TrainingExpectation {
  /**
   * COMPOR — o caso é legítimo e espera-se uma mensagem.
   * NAO_CONTATAR — a verdade do caso diz que este cliente não pode ser abordado;
   * espera-se que o agente recuse, escale ou não componha nada.
   */
  espera: "COMPOR" | "NAO_CONTATAR";
  proibido: readonly ForbiddenClaim[];
  /**
   * Trechos que a mensagem não pode repetir cru (ex.: um nome de cadastro
   * quebrado, que o agente deveria evitar em vez de estampar na saudação).
   */
  literaisProibidos?: readonly string[];
}

export interface TrainingCase<TInput = unknown> {
  /** Identificador do caso — sintético, estável e legível no log. */
  key: string;
  kind: TrainingCaseKind;
  /** Rótulo curto do que o caso testa, para leitura humana. */
  label: string;
  expectation: TrainingExpectation;
  input: TInput;
}

export interface TrainingOutcomeUnderTest {
  /** Mensagem composta pelo agente (vazia/nula = não compôs). */
  message: string | null;
  /** Veredito de coerência do Brain para esta composição. */
  brainVerdict: TrainingVerdict;
  /** LLM | FALLBACK — amostra fora de LLM não entra na taxa da escada. */
  reasoningMode: string;
  /** O agente pediu ajuda humana em vez de agir? */
  escalated: boolean;
}

export interface TrainingJudgement {
  verdict: TrainingVerdict;
  /** Sempre carrega o caso concreto: alerta sem evidência é ruído. */
  reasons: string[];
}

// ── Detectores ───────────────────────────────────────────────────────────────
//
// Sem `\b`: em JavaScript ele é ASCII e não casa depois de "ê", "ç", "í" — um
// detector já morreu calado neste projeto por causa disso (verificador de
// capacidade, 04/08). Aqui os padrões são frases inteiras, sem depender de borda
// de palavra acentuada.

const CLAIM_PATTERNS: Record<ForbiddenClaim, { re: RegExp; why: string }[]> = {
  PEDIDO_ANTERIOR: [
    { re: /últim[oa]s?\s+(pedido|compra|vez\s+que\s+você\s+pediu)/i, why: "citou um pedido anterior que não existe" },
    { re: /pedido\s+anterior/i, why: "citou um pedido anterior que não existe" },
    { re: /(sentimos|estamos\s+com)\s+(a\s+)?(sua\s+)?(falta|saudade)/i, why: "afirmou saudade de um cliente que nunca pediu" },
    { re: /saudades?\s+de\s+você/i, why: "afirmou saudade de um cliente que nunca pediu" },
    { re: /(voltar|volte|volta)\s+a\s+pedir/i, why: "convidou a VOLTAR quem nunca veio" },
    { re: /repetir\s+(o\s+)?pedido/i, why: "ofereceu repetir um pedido inexistente" },
    { re: /desde\s+que\s+você\s+pediu/i, why: "ancorou o tempo num pedido que não existe" },
  ],
  AUSENCIA_LONGA: [
    { re: /(faz|há)\s+(muito\s+)?tempo/i, why: "disse que faz tempo para quem pediu ontem" },
    { re: /(faz|há)\s+\d+\s+(dias?|semanas?|meses|mês)/i, why: "inventou o tamanho da ausência" },
    { re: /(você\s+)?sumiu|anda\s+sumid[oa]|está\s+sumid[oa]/i, why: "tratou como sumido quem acabou de pedir" },
    { re: /onde\s+(você|vc)\s+(andou|andava|se\s+meteu)/i, why: "tratou como sumido quem acabou de pedir" },
    { re: /não\s+(te\s+)?vemos\s+(faz|há)/i, why: "tratou como sumido quem acabou de pedir" },
  ],
  // A METADE QUE DEIXA PASSAR: "grátis"/"gratuito" sozinhos ficaram DE FORA de
  // propósito. "Entrega grátis acima de R$ 40" pode ser política real do
  // restaurante, e barrar isso ensinaria o agente a não falar de um benefício que
  // ele tem direito de citar. Só entra o que é inequivocamente abatimento
  // prometido por esta campanha.
  DESCONTO: [
    { re: /descontos?/i, why: "prometeu desconto numa campanha que não concede nenhum" },
    { re: /cupo(m|ns)/i, why: "citou cupom numa campanha sem cupom" },
    { re: /promoç(ão|ões)|promoçao/i, why: "prometeu promoção que não existe" },
    { re: /\d+\s*%\s*(de\s+)?(off|desconto|abatimento)/i, why: "prometeu percentual de abatimento inexistente" },
    { re: /(de\s+graça|leve\s+\d+\s+pague|brinde\s+por\s+conta)/i, why: "prometeu brinde/gratuidade que não existe" },
  ],
  VALOR_ZERO: [{ re: /R\$\s?0(?![1-9])([,.]0+)?/i, why: "estampou R$ 0 — devolveu o buraco do dado como se fosse fato" }],
};

/** Reconhecimento explícito de que este cliente não deve ser abordado. */
const RESPECTS_OPT_OUT =
  /(não|nao)\s+(vou|vamos|devo|devemos|posso|podemos)\s+(mais\s+)?(enviar|mandar|contatar|abordar)|opt[\s-]?out|descadastr|pediu\s+para\s+(parar|não\s+receber)|não\s+deve\s+receber|nenhuma\s+ação\s+de\s+contato/i;

function worst(a: TrainingVerdict, b: TrainingVerdict): TrainingVerdict {
  const rank: Record<TrainingVerdict, number> = { PASS: 0, NEEDS_REVIEW: 1, FAIL: 2 };
  return rank[a] >= rank[b] ? a : b;
}

/**
 * Julga UM caso de treino. Função pura: mesma entrada, mesmo veredito, sempre —
 * a lição de "coleta que julga não pode ser a mesma que mede" aplicada aqui.
 *
 * O veredito final é o PIOR entre o do Brain e o do caso. Nunca melhora o do
 * Brain: se o crítico do Brain reprovou, a esteira não tem como absolver.
 */
export function julgarCasoDeTreino(
  expectation: TrainingExpectation,
  outcome: TrainingOutcomeUnderTest,
): TrainingJudgement {
  const reasons: string[] = [];
  const message = (outcome.message ?? "").trim();

  // Caso NÃO-CONTATAR: a verdade do caso diz que não se aborda este cliente.
  if (expectation.espera === "NAO_CONTATAR") {
    const recusou = message.length === 0 || outcome.escalated || RESPECTS_OPT_OUT.test(message);
    if (!recusou) {
      reasons.push(
        "compôs mensagem de marketing para um perfil cuja própria verdade diz 'nenhuma ação de contato permitida'",
      );
      return { verdict: "FAIL", reasons };
    }
    return { verdict: worst(outcome.brainVerdict, "PASS"), reasons };
  }

  // Caso COMPOR: sem mensagem não há o que julgar — e "não compôs" não é PASS.
  if (message.length === 0) {
    reasons.push("não compôs mensagem nenhuma num caso em que compor era o esperado");
    return { verdict: worst(outcome.brainVerdict, "NEEDS_REVIEW"), reasons };
  }

  let caseVerdict: TrainingVerdict = "PASS";
  for (const claim of expectation.proibido) {
    for (const { re, why } of CLAIM_PATTERNS[claim]) {
      if (re.test(message)) {
        reasons.push(`${claim}: ${why}`);
        caseVerdict = "FAIL";
        break;
      }
    }
  }
  for (const literal of expectation.literaisProibidos ?? []) {
    if (literal && message.toLowerCase().includes(literal.toLowerCase())) {
      reasons.push(`repetiu cru o trecho proibido "${literal.slice(0, 40)}"`);
      caseVerdict = "FAIL";
    }
  }

  return { verdict: worst(outcome.brainVerdict, caseVerdict), reasons };
}
