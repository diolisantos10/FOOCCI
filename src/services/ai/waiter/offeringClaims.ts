/**
 * offeringClaims — a trava que impede o Garçom de transformar busca vazia em
 * negação sobre o que o restaurante oferece.
 *
 * ─── O caso que originou este arquivo ────────────────────────────────────────
 * 05/08/2026, 14:57, cardápio do Sushi Cazza. A cliente Júlia perguntou
 * "Vocês tem rodízios". O Garçom respondeu:
 *
 *     "Não encontrei rodízios no nosso cardápio. Posso ajudar com outra coisa?"
 *
 * Ela insistiu um minuto depois ("Vcs tem rodízio"), recebeu a mesma frase e foi
 * embora. O Sushi Cazza **tem rodízio**: `RODIZIO PRESENCIAL`, R$ 99/pessoa,
 * cadastrado e ativo — só que com `showInDelivery = false`. O catálogo que chega
 * ao Garçom é filtrado por `showInDelivery: true`
 * (`src/app/api/pedido/[slug]/route.ts`), então o item simplesmente não existia
 * na busca. "Não achei no meu recorte do cardápio" virou "não temos" na cara da
 * cliente — o guardrail 1 violado ao pé da letra.
 *
 * ─── A distinção que este módulo carrega ─────────────────────────────────────
 * Não achar um PRATO no cardápio de delivery é um fato sobre o cardápio, e o
 * Garçom pode dizer que não encontrou aquele item.
 *
 * Não achar uma MODALIDADE / SERVIÇO (rodízio, reserva, estacionamento, entrega
 * num bairro, forma de pagamento, cardápio infantil…) não é fato nenhum: essas
 * coisas **nunca são itens de delivery**, então a busca no cardápio não tem
 * nem como confirmá-las nem como negá-las. Sobre elas o agente responde
 * "preciso confirmar" e escala. Nunca nega sozinho.
 *
 * ─── Por que a lista é curta e explícita (guardrail 5) ───────────────────────
 * A trava só dispara sobre termos NOMEADOS aqui, e só quando a busca no cardápio
 * já tinha voltado vazia. Um agente que responde "preciso confirmar" para tudo
 * seria pior que o defeito que ele evita. Fora desta lista, o comportamento é
 * exatamente o de antes.
 *
 * Puro: sem DB, sem I/O. Chamado no caminho determinístico
 * (`WaiterBrainV2`) e no caminho da IA (`AIOrderService`).
 */

/** Uma oferta do restaurante que o cardápio de delivery não consegue provar. */
export interface OfferingTerm {
  /** Identificador estável para log/telemetria. */
  id: string;
  /** Como falar disso com o cliente. */
  label: string;
  /** Como o cliente pergunta. */
  questionRe: RegExp;
  /**
   * Como essa oferta apareceria no catálogo SE existisse no canal.
   * Serve para o caso inverso: quando o cardápio prova a oferta, o agente pode
   * falar dela normalmente e a trava não interfere.
   */
  catalogRe: RegExp;
}

/**
 * Vocabulário de ofertas. Cada linha entrou porque é pergunta real de cliente
 * de restaurante que **nunca** vira item de cardápio de delivery.
 *
 * NÃO estão aqui restrição alimentar (vegetariano / vegano / sem glúten /
 * alergia): esse caminho já tem tratamento próprio e mais rígido em
 * `ConversationGuardrails.classifyDietarySafety` + nos handlers dietéticos do
 * `WaiterBrainV2`, que respondem "prefiro não cravar sem confirmar". Duplicar
 * aqui só criaria dois donos para a mesma regra.
 */
export const OFFERING_TERMS: readonly OfferingTerm[] = [
  {
    id:         "rodizio",
    label:      "rodízio",
    questionRe: /\brod[íi]zios?\b|\brodizios?\b|all[\s-]?you[\s-]?can[\s-]?eat|\bbuff?ets?\b|\b[àa]\s+vontade\b|self[\s-]?service|\bpor\s+quilo\b|\bpor\s+kg\b/i,
    catalogRe:  /rod[íi]zio|rodizio|buffet|bufet|all.?you.?can.?eat|[àa]\s+vontade|self.?service/i,
  },
  {
    id:         "reserva",
    label:      "reserva de mesa",
    questionRe: /\breserv(a|as|ar|am)\b|\bmesa\s+(para|pra)\s+\d+|reservar\s+mesa/i,
    catalogRe:  /reserva/i,
  },
  {
    id:         "consumo_local",
    label:      "consumo no salão",
    questionRe: /consum(o|ir)\s+no\s+local|comer\s+(a[íi]|no\s+local|no\s+restaurante|aqui)|\bno\s+sal[ãa]o\b|\bpresencial\b|\bmesa\s+no\s+local\b/i,
    catalogRe:  /presencial|sal[ãa]o|no\s+local/i,
  },
  {
    id:         "retirada",
    label:      "retirada no local",
    questionRe: /\bretirad[ao]\b|retirar\s+no\s+local|pegar\s+no\s+local|\bdrive[\s-]?thru\b|\bbalc[ãa]o\b/i,
    catalogRe:  /retirad|drive.?thru/i,
  },
  {
    id:         "entrega_regiao",
    label:      "entrega nessa região",
    // "no seu bairro", "nessa região", "entregamos em…": a régua precisa pegar
    // tanto a pergunta do cliente quanto a frase de negação do agente.
    questionRe: /entrega(m|mos|r)?\s+(em|no|na|pra|para|at[ée])\b|fazem?\s+entrega|entrega(m|mos)\s+(aqui|a[íi])|\bbairro\b|\bregi[ãa]o\b|taxa\s+de\s+entrega|raio\s+de\s+entrega/i,
    catalogRe:  /taxa\s+de\s+entrega/i,
  },
  {
    id:         "pagamento",
    label:      "essa forma de pagamento",
    questionRe: /vale\s*(refei[çc][ãa]o|alimenta[çc][ãa]o)|\balelo\b|\bsodexo\b|\bticket\b|\bvr\b|aceita[m]?\s+(cart[ãa]o|pix|dinheiro|d[ée]bito|cr[ée]dito|vale)|forma[s]?\s+de\s+pagamento|parcel(a|ar|amos)/i,
    catalogRe:  /$^/, // pagamento nunca é item de cardápio — o catálogo jamais prova
  },
  {
    id:         "horario",
    label:      "o horário de funcionamento",
    questionRe: /\bhor[áa]rio[s]?\b|que\s+horas?\s+(abre|fecha|abrem|fecham)|\babre[m]?\s+(hoje|amanh[ãa]|domingo|segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado)|\bfuncionam?\s+(hoje|amanh[ãa]|domingo|s[áa]bado)/i,
    catalogRe:  /$^/,
  },
  {
    id:         "cardapio_infantil",
    label:      "cardápio infantil",
    questionRe: /card[áa]pio\s+infantil|menu\s+infantil|prato\s+infantil|espa[çc]o\s+kids|[áa]rea\s+(kids|infantil)|brinquedoteca|\bpra\s+crian[çc]a[s]?\b|\bpara\s+crian[çc]a[s]?\b/i,
    catalogRe:  /infantil|kids|crian[çc]a/i,
  },
  {
    id:         "estacionamento",
    label:      "estacionamento",
    questionRe: /estacionamento|manobrista|\bvalet\b|\bvaga[s]?\s+(de\s+)?carro/i,
    catalogRe:  /estacionamento|valet|manobrista/i,
  },
  {
    id:         "eventos",
    label:      "eventos e encomendas",
    questionRe: /\b(festa|evento|anivers[áa]rio|confraterniza\w*|formatura|coquetel)s?\b|\bencomend(a|as|ar)\b|buffet\s+(para|pra)/i,
    catalogRe:  /festa|evento|anivers[áa]rio|encomenda|coquetel/i,
  },
  {
    id:         "musica_ao_vivo",
    label:      "música ao vivo",
    questionRe: /m[úu]sica\s+ao\s+vivo|som\s+ao\s+vivo|\bshow\s+(hoje|ao\s+vivo)/i,
    catalogRe:  /m[úu]sica\s+ao\s+vivo|som\s+ao\s+vivo/i,
  },
  {
    id:         "pet",
    label:      "levar pet",
    questionRe: /pet[\s-]?friendly|aceita[m]?\s+(pet|cachorro|animal|animais)|pode\s+levar\s+(pet|cachorro)/i,
    catalogRe:  /pet[\s-]?friendly/i,
  },
  {
    id:         "acessibilidade",
    label:      "acessibilidade",
    questionRe: /acessibilidade|cadeirante|\brampa\b|acess[íi]vel/i,
    catalogRe:  /acessibilidade|cadeirante/i,
  },
  {
    id:         "wifi",
    label:      "wi-fi",
    questionRe: /\bwi[\s-]?fi\b|\bwifi\b/i,
    catalogRe:  /wi[\s-]?fi/i,
  },
  {
    id:         "couvert",
    label:      "couvert / taxa de rolha",
    questionRe: /\bcouvert\b|taxa\s+de\s+rolha/i,
    catalogRe:  /couvert|rolha/i,
  },
];

/** Item mínimo de catálogo que a trava precisa ler. Compatível com `V2CatalogItem`. */
export interface OfferingCatalogItem {
  name:         string;
  categoryName: string;
  description?: string | null;
}

/**
 * A pergunta do cliente é sobre uma oferta do restaurante (e não sobre um prato)?
 * Devolve o termo reconhecido ou `null`.
 */
export function detectOfferingQuestion(message: string): OfferingTerm | null {
  const msg = (message ?? "").trim();
  if (!msg) return null;
  for (const term of OFFERING_TERMS) {
    if (term.questionRe.test(msg)) return term;
  }
  return null;
}

/**
 * O catálogo deste canal PROVA que a oferta existe?
 *
 * Quando prova (ex.: restaurante com um item "Rodízio" liberado no delivery), o
 * agente fala dela a partir da verdade e a trava não interfere em nada.
 */
export function catalogProvesOffering(
  term:    OfferingTerm,
  catalog: readonly OfferingCatalogItem[],
): boolean {
  return catalog.some((i) =>
    term.catalogRe.test(`${i.name} ${i.categoryName} ${i.description ?? ""}`),
  );
}

/**
 * Frases de negação. O ponto não é a palavra "não": é o verbo de posse/oferta
 * logo depois dela — que é o que transforma "não achei" em "não temos".
 */
const DENIAL_RE =
  /\bn[ãa]o\s+(?:temos|tem|t[êe]m|h[áa]|encontrei|encontramos|achei|achamos|possu[ií]mos|oferecemos|fazemos|trabalhamos|servimos|dispomos|disponibilizamos|fornecemos|entregamos|aceitamos|atendemos|rolam?)\b|\binfelizmente\s+n[ãa]o\b|\bn[ãa]o\s+(?:est[áa]|estamos)\s+dispon[ií]ve/i;

/** Divide em frases sem perder o texto — a substituição é cirúrgica, frase a frase. */
function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?\n])\s+/);
}

/**
 * A frase que o Garçom passa a dizer no lugar da negação que ele não pode provar.
 * Curta de propósito — a resposta do Garçom tem teto de 2 linhas.
 */
export function cannotConfirmSentence(term: OfferingTerm): string {
  return `Sobre ${term.label}, preciso confirmar com o restaurante 🙏`;
}

export interface SanitizeResult {
  /** A resposta já corrigida (idêntica à original quando nada disparou). */
  reply:   string;
  /** Disparou? */
  blocked: boolean;
  /** Qual oferta o agente tentou negar sem prova. */
  term:    OfferingTerm | null;
  /** A frase original barrada — o alerta carrega a própria evidência (guardrail 6). */
  evidence: string | null;
}

/**
 * A TRAVA DE SAÍDA. Roda sobre a mensagem final, venha ela de handler
 * determinístico ou do modelo.
 *
 * Dispara quando as três coisas valem ao mesmo tempo:
 *   1. a frase nega ("não temos", "não fazemos", "não encontrei"…);
 *   2. a MESMA frase nomeia uma oferta da lista acima;
 *   3. o catálogo deste canal não prova essa oferta.
 *
 * Só a frase ofensora é trocada — o resto da resposta é preservado, porque
 * proteção que dispara não pode ser mais destrutiva que o problema que ela
 * evita (guardrail 5).
 */
export function sanitizeUnprovenDenial(params: {
  reply:    string;
  catalog:  readonly OfferingCatalogItem[];
}): SanitizeResult {
  const { reply, catalog } = params;
  if (!reply || !DENIAL_RE.test(reply)) {
    return { reply, blocked: false, term: null, evidence: null };
  }

  let blocked   = false;
  let hitTerm:  OfferingTerm | null = null;
  let evidence: string | null       = null;

  const fixed = splitSentences(reply)
    .map((sentence) => {
      if (!DENIAL_RE.test(sentence)) return sentence;
      const term = OFFERING_TERMS.find((t) => t.questionRe.test(sentence));
      if (!term) return sentence;
      if (catalogProvesOffering(term, catalog)) return sentence;
      blocked  = true;
      hitTerm  = hitTerm ?? term;
      evidence = evidence ?? sentence.trim();
      return cannotConfirmSentence(term);
    })
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim();

  return { reply: blocked ? fixed : reply, blocked, term: hitTerm, evidence };
}
