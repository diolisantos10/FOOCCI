/**
 * foocciCrmFunnel — o núcleo PURO do CRM da Foocci.
 *
 * ⚠️ CRM DA FOOCCI ≠ CRM DO RESTAURANTE.
 * `src/services/crm/` é o CRM do PRODUTO: o restaurante falando com os clientes
 * dele, multi-tenant, com ledger de contato e campanhas de WhatsApp.
 * `src/services/foocci-crm/` (aqui) é a base de prospects DA FOOCCI: donos de
 * restaurante que pediram demonstração. Sem tenant, outra lei, outra tabela.
 * Se você está escrevendo `restaurantId` neste diretório, está no lugar errado.
 *
 * Este arquivo não lê banco, não escreve, não faz I/O. Só define o funil e
 * calcula taxa — o que o torna testável de forma determinística e o que permite
 * que a MESMA régua sirva à tela, à rota e (depois) ao agente SDR.
 *
 * A REGRA QUE MAIS IMPORTA AQUI: taxa com amostra pequena é mentira com cara de
 * número. `MIN_LEADS_PARA_TAXA` faz o cálculo devolver `null` — e a tela é
 * obrigada a escrever "ainda não dá para dizer" em vez de estampar 0% ou 100%.
 * Espelha a régua que o CRM do produto já usa em `CrmPhraseConfidence`.
 */

/** As etapas, exatamente como no enum do Prisma. */
export type FoocciLeadStage =
  | "NOVO" | "CONTATADO" | "QUALIFICADO" | "PROPOSTA" | "FECHADO" | "PERDIDO";

/**
 * A sequência do funil. PERDIDO NÃO está aqui de propósito: quem se perdeu
 * SAIU do funil, não avançou nele. Contá-lo como etapa faria a conversão mentir
 * para cima (todo mundo "avança" para perdido).
 */
export const SEQUENCIA_FUNIL = [
  "NOVO", "CONTATADO", "QUALIFICADO", "PROPOSTA", "FECHADO",
] as const;

export type FoocciFunnelStage = (typeof SEQUENCIA_FUNIL)[number];

export const ROTULO_ETAPA: Record<FoocciLeadStage, string> = {
  NOVO:        "Novo",
  CONTATADO:   "Contatado",
  QUALIFICADO: "Qualificado",
  PROPOSTA:    "Proposta",
  FECHADO:     "Fechado",
  PERDIDO:     "Perdido",
};

/** O que cada etapa significa comercialmente — vai na tela, para não virar folclore. */
export const DESCRICAO_ETAPA: Record<FoocciLeadStage, string> = {
  NOVO:        "Chegou na base. Ninguém falou com ele ainda.",
  CONTATADO:   "Recebeu a primeira mensagem nossa.",
  QUALIFICADO: "Respondeu e tem perfil: é restaurante, tem a dor, tem interesse.",
  PROPOSTA:    "Recebeu preço/proposta ou agendou a demonstração.",
  FECHADO:     "Virou cliente da Foocci.",
  PERDIDO:     "Saiu do funil. O motivo fica na nota da interação.",
};

export const TODAS_AS_ETAPAS: FoocciLeadStage[] = [...SEQUENCIA_FUNIL, "PERDIDO"];

export function isEtapaValida(v: unknown): v is FoocciLeadStage {
  return typeof v === "string" && (TODAS_AS_ETAPAS as string[]).includes(v);
}

/** Posição no funil. PERDIDO devolve -1: está fora da régua, não no fim dela. */
export function indiceEtapa(stage: FoocciLeadStage): number {
  return (SEQUENCIA_FUNIL as readonly string[]).indexOf(stage);
}

// ── Interações ────────────────────────────────────────────────────────────────

export type FoocciInteractionType =
  | "CAPTURA" | "REENVIO_FORMULARIO" | "MUDANCA_ETAPA" | "MENSAGEM_ENVIADA"
  | "RESPOSTA_RECEBIDA" | "LIGACAO" | "REUNIAO" | "NOTA";

export const ROTULO_INTERACAO: Record<FoocciInteractionType, string> = {
  CAPTURA:            "Entrou na base",
  REENVIO_FORMULARIO: "Preencheu o formulário de novo",
  MUDANCA_ETAPA:      "Mudou de etapa",
  MENSAGEM_ENVIADA:   "Mensagem enviada",
  RESPOSTA_RECEBIDA:  "Respondeu",
  LIGACAO:            "Ligação",
  REUNIAO:            "Reunião / demonstração",
  NOTA:               "Anotação",
};

/**
 * Quais interações significam "a Foocci FALOU com esta pessoa".
 *
 * Só estas mexem em `lastContactedAt`, e é `lastContactedAt` que responde
 * "quem ainda não foi abordado" — a fila de trabalho do SDR. Uma anotação
 * interna não pode fazer um contato sumir dessa fila.
 */
const INTERACOES_DE_SAIDA: ReadonlySet<FoocciInteractionType> = new Set([
  "MENSAGEM_ENVIADA", "LIGACAO", "REUNIAO",
]);

export function contaComoAbordagem(tipo: FoocciInteractionType): boolean {
  return INTERACOES_DE_SAIDA.has(tipo);
}

// ── Taxa de conversão, com trava de amostra ───────────────────────────────────

/**
 * Abaixo disto, NÃO se calcula taxa entre duas etapas.
 *
 * O número é conservador de propósito. Com 3 contatos, 1 fechamento vira "33% de
 * conversão" e vai parar numa decisão de mídia — que é exatamente o tipo de
 * número inventado que o guardrail proíbe. Quem quiser o dado cru continua
 * vendo as CONTAGENS, que são fato; o que fica escondido é a RAZÃO, que é
 * inferência.
 */
export const MIN_LEADS_PARA_TAXA = 10;

export type MotivoSemTaxa = "sem_ninguem" | "amostra_insuficiente";

export interface DegrauFunil {
  de: FoocciFunnelStage;
  para: FoocciFunnelStage;
  /** Quantos contatos alcançaram a etapa de origem. Fato, sempre exibível. */
  base: number;
  /** Quantos alcançaram a etapa de destino. Fato, sempre exibível. */
  alcancaram: number;
  /** null = não dá para afirmar. NUNCA 0 nem 1 como consolo. */
  taxa: number | null;
  motivoSemTaxa: MotivoSemTaxa | null;
  /** Frase pronta e honesta para a tela. */
  explicacao: string;
}

export interface EtapaContagem {
  stage: FoocciFunnelStage;
  /** Contatos que ALCANÇARAM esta etapa em algum momento (cumulativo). */
  alcancaram: number;
  /** Contatos parados NESTA etapa agora. */
  agora: number;
}

export interface ResultadoFunil {
  etapas: EtapaContagem[];
  degraus: DegrauFunil[];
  /** Perdidos ficam fora da sequência, contados à parte. */
  perdidos: number;
  total: number;
  /** Conversão ponta a ponta (NOVO → FECHADO), mesma trava de amostra. */
  pontaAPonta: DegrauFunil | null;
  minimoParaTaxa: number;
}

/**
 * Quantos contatos alcançaram cada etapa e quantos estão parados nela.
 *
 * @param leads etapa MAIS AVANÇADA que cada contato já alcançou, e a atual.
 *   O "mais avançada" vem do histórico de interações, não do estado atual: um
 *   contato que chegou em PROPOSTA e depois foi marcado PERDIDO alcançou
 *   PROPOSTA, e apagar isso esconderia justamente onde o funil vaza.
 */
export function computeFunnel(
  leads: Array<{ atual: FoocciLeadStage; maisAvancada: FoocciLeadStage }>,
): ResultadoFunil {
  const etapas: EtapaContagem[] = SEQUENCIA_FUNIL.map((stage) => ({
    stage, alcancaram: 0, agora: 0,
  }));

  let perdidos = 0;

  for (const lead of leads) {
    if (lead.atual === "PERDIDO") perdidos++;

    // Um contato conta em TODAS as etapas até a mais avançada que alcançou.
    // NOVO é o piso: entrar na base já é ter alcançado NOVO.
    const topo = Math.max(indiceEtapa(lead.maisAvancada), 0);
    for (let i = 0; i <= topo; i++) etapas[i]!.alcancaram++;

    const atual = indiceEtapa(lead.atual);
    if (atual >= 0) etapas[atual]!.agora++;
  }

  const degraus: DegrauFunil[] = [];
  for (let i = 0; i < SEQUENCIA_FUNIL.length - 1; i++) {
    degraus.push(montaDegrau(
      SEQUENCIA_FUNIL[i]!, SEQUENCIA_FUNIL[i + 1]!,
      etapas[i]!.alcancaram, etapas[i + 1]!.alcancaram,
    ));
  }

  const total = leads.length;
  const pontaAPonta = total > 0
    ? montaDegrau("NOVO", "FECHADO", etapas[0]!.alcancaram, etapas[SEQUENCIA_FUNIL.length - 1]!.alcancaram)
    : null;

  return { etapas, degraus, perdidos, total, pontaAPonta, minimoParaTaxa: MIN_LEADS_PARA_TAXA };
}

/**
 * A trava. Fora daqui ninguém divide um número pelo outro neste domínio.
 */
export function montaDegrau(
  de: FoocciFunnelStage,
  para: FoocciFunnelStage,
  base: number,
  alcancaram: number,
): DegrauFunil {
  if (base === 0) {
    return {
      de, para, base, alcancaram, taxa: null, motivoSemTaxa: "sem_ninguem",
      explicacao: `Ninguém chegou em "${ROTULO_ETAPA[de]}" ainda.`,
    };
  }

  if (base < MIN_LEADS_PARA_TAXA) {
    return {
      de, para, base, alcancaram, taxa: null, motivoSemTaxa: "amostra_insuficiente",
      explicacao:
        `Ainda não dá para dizer: ${base} ${base === 1 ? "contato" : "contatos"} em ` +
        `"${ROTULO_ETAPA[de]}", e a taxa só é confiável a partir de ${MIN_LEADS_PARA_TAXA}. ` +
        `Por enquanto: ${alcancaram} de ${base} avançaram.`,
    };
  }

  return {
    de, para, base, alcancaram,
    taxa: alcancaram / base,
    motivoSemTaxa: null,
    explicacao: `${alcancaram} de ${base} avançaram de "${ROTULO_ETAPA[de]}" para "${ROTULO_ETAPA[para]}".`,
  };
}

/** "42%" ou o texto honesto. Um único lugar formata taxa neste domínio. */
export function formataTaxa(taxa: number | null): string {
  if (taxa === null) return "ainda não dá para dizer";
  return `${(taxa * 100).toFixed(taxa * 100 < 10 ? 1 : 0)}%`;
}

// ── Transições ────────────────────────────────────────────────────────────────

/**
 * Toda etapa alcança toda etapa. É deliberado.
 *
 * Uma máquina de estados rígida no comercial só produz o hábito de mentir no
 * registro: o CEO fecha um contato que nunca passou por "proposta" e teria que
 * inventar etapas intermediárias para conseguir salvar. Quem guarda a verdade é
 * o HISTÓRICO, que registra o pulo com autor e data.
 *
 * O que NÃO se permite é registrar mudança para a mesma etapa: isso seria ruído
 * na linha do tempo, e é erro do chamador, não intenção.
 */
export function podeMover(de: FoocciLeadStage, para: FoocciLeadStage): boolean {
  return isEtapaValida(para) && de !== para;
}
