/**
 * A BASE DE PREÇO DA SALA DE VENDAS.
 *
 * ── O DEFEITO QUE ISTO FECHA ────────────────────────────────────────────────
 *
 * O site publica os três planos com valor, e o checkout cobra por eles desde
 * 04/08/2026. Na Sala de Vendas, ao mesmo tempo, TODAS as fichas comerciais
 * carregam a trava "não pode dar preço" — Recepção, Qualificação e o TA.
 *
 * O resultado era um vendedor que não podia repetir um número que qualquer
 * estranho lê na página pública. A primeira pergunta de todo lead de restaurante
 * é "quanto custa?", e a Sala não tinha resposta para ela.
 *
 * A trava está certa e continua de pé — ela proíbe **negociar**. Informar a
 * tabela publicada é outra coisa, e é o que este arquivo torna possível **sem
 * abrir espaço para inventar**.
 *
 * ── POR QUE NENHUM NÚMERO É DIGITADO AQUI ───────────────────────────────────
 *
 * `@/lib/billing/pricing` é a fonte única: a mesma função que decide o que sai
 * do cartão. Antes dela havia quatro tabelas de preço no repositório e nenhuma
 * garantia de que o anunciado era o cobrado.
 *
 * Uma quinta tabela — escrita aqui "só para o vendedor consultar" — seria a pior
 * de todas, porque é a que fala com o cliente antes de qualquer sistema
 * conferir. O vendedor prometeria R$ 429 e o cartão cobraria outro valor, e
 * ninguém descobriria até a primeira fatura.
 *
 * Então este arquivo **deriva**, nunca declara. O teste
 * `precos.test.ts` lê o próprio código-fonte deste arquivo e reprova se
 * aparecer um literal em reais dentro dele.
 *
 * ── O QUE ELE DELIBERADAMENTE NÃO SABE ──────────────────────────────────────
 *
 * Preço fechado não é política comercial fechada. Continuam em aberto, e
 * pertencem ao CEO: até quanto se pode conceder além da tabela, qual o prazo de
 * implantação prometido, quais formas de pagamento são aceitas, e quem tem
 * alçada para fechar exceção.
 *
 * Cada um deles devolve `{ sabe: false, motivo, decideQuem }` — nunca um palpite
 * plausível. É o guardrail 1 aplicado a dinheiro: ausência de informação não é
 * informação.
 */

import {
  PLAN_CYCLE_CENTS,
  PLAN_LABEL,
  CYCLE_LABEL,
  CYCLE_CODES,
  SITE_PLAN_IDS,
  SITE_PLAN_TO_CODE,
  CODE_TO_SITE_PLAN,
  monthlyEquivalentCents,
  firstChargeCents,
  firstMonthDiscountCents,
  formatBRL,
  type PlanCode,
  type CycleCode,
  type SitePlanId,
} from "@/lib/billing/pricing";

/**
 * O que o agente sabe, ou por que não sabe.
 *
 * NÃO é o `Medida` de `agentesComerciais.ts`, e a diferença importa: `Medida`
 * responde "quanto deu" e diz `não medido` quando não houve o que medir. Aqui a
 * pergunta é outra — "posso dizer isto?" — e a resposta negativa precisa carregar
 * **para quem escala**, porque o lead está esperando do outro lado.
 */
export type Politica<T> =
  | { sabe: true; valor: T }
  | { sabe: false; motivo: string; decideQuem: string };

/** Um plano, no vocabulário do cliente, com o número que a tabela cobra. */
export interface PrecoDoPlano {
  id: SitePlanId;
  codigo: PlanCode;
  nome: string;
  ciclos: Array<{
    ciclo: CycleCode;
    nome: string;
    /** O que sai do cartão a cada renovação, no ciclo cheio. */
    doCiclo: string;
    /** Mensalidade EQUIVALENTE — ninguém é cobrado neste valor. */
    equivalenteAoMes: string;
    /** O que sai do cartão na PRIMEIRA cobrança, já com o meio mês abatido. */
    primeiraCobranca: string;
    /** Quanto foi abatido na primeira. */
    abatimentoNaPrimeira: string;
  }>;
}

/**
 * A tabela publicada, derivada da fonte única.
 *
 * É a mesma que a página `/site/precos` imprime — não uma leitura dela, e sim a
 * mesma origem. Se o CEO mudar um valor em `PLAN_CYCLE_CENTS`, a Sala muda junto,
 * no mesmo deploy, sem ninguém lembrar de atualizar dois lugares.
 */
export function tabelaPublicada(): PrecoDoPlano[] {
  return SITE_PLAN_IDS.map((id) => {
    const codigo = SITE_PLAN_TO_CODE[id];
    return {
      id,
      codigo,
      nome: PLAN_LABEL[codigo],
      ciclos: CYCLE_CODES.map((ciclo) => ({
        ciclo,
        nome: CYCLE_LABEL[ciclo],
        doCiclo: formatBRL(PLAN_CYCLE_CENTS[codigo][ciclo]),
        equivalenteAoMes: formatBRL(monthlyEquivalentCents(codigo, ciclo)),
        primeiraCobranca: formatBRL(firstChargeCents(codigo, ciclo)),
        abatimentoNaPrimeira: formatBRL(firstMonthDiscountCents(codigo, ciclo)),
      })),
    };
  });
}

/** A tabela de um plano só, ou `null` — nunca um plano chutado. */
export function precoDoPlano(id: string): PrecoDoPlano | null {
  const achado = SITE_PLAN_IDS.find((p) => p === id.toLowerCase());
  return achado ? (tabelaPublicada().find((p) => p.id === achado) ?? null) : null;
}

/** O nome comercial a partir do código do banco. O cliente nunca lê "GROWTH". */
export function nomeComercial(codigo: PlanCode): string {
  return PLAN_LABEL[codigo];
}

/** O id do site a partir do código do banco. */
export function idDoSite(codigo: PlanCode): SitePlanId {
  return CODE_TO_SITE_PLAN[codigo];
}

// ── O QUE SE PODE DIZER SOBRE DESCONTO ───────────────────────────────────────

export interface DescontoPublicado {
  /** A regra em uma frase, para o vendedor repetir sem adaptar. */
  regra: string;
  /** Vale para qualquer plano e qualquer ciclo? */
  universal: boolean;
}

/**
 * O desconto que EXISTE e é público: metade do primeiro mês, para todo cliente
 * novo, em qualquer plano e qualquer ciclo.
 *
 * Não é uma concessão do vendedor: já está embutido no que o checkout cobra, e o
 * valor exato de cada caso sai de `tabelaPublicada().primeiraCobranca`. O
 * vendedor informa; não concede.
 *
 * O anual já embute os dois meses grátis e o trimestral já embute os 10% — os
 * dois estão DENTRO do valor do ciclo, e somar qualquer coisa por cima deles é
 * exatamente o erro que a regra do CEO de 04/08 proíbe.
 */
export function descontoPublicado(): Politica<DescontoPublicado> {
  return {
    sabe: true,
    valor: {
      regra:
        "50% no primeiro mês, para todo cliente novo — é o único desconto, e já " +
        "está embutido no valor da primeira cobrança. O anual já vem com dois " +
        "meses grátis e o trimestral com 10%; nada se soma por cima disso.",
      universal: true,
    },
  };
}

// ── O QUE O AGENTE **NÃO** SABE, E POR QUÊ ───────────────────────────────────

/**
 * Os assuntos comerciais que a Sala não tem como responder.
 *
 * Cada linha aqui é uma pergunta que um lead faz na primeira conversa e que
 * hoje **não tem resposta na empresa** — não é que a Sala não leia, é que a
 * decisão não foi tomada. Escrevê-las aqui, nomeadas, é o que impede que uma IA
 * ou um vendedor apressado preencha o silêncio com algo plausível.
 */
const EM_ABERTO = {
  prazoDeImplantacao: {
    motivo:
      "não há prazo de implantação publicado. A página de preços trata " +
      "configuração como item sob consulta, e prometer data aqui seria inventar.",
    decideQuem: "CEO, com o Gerente de Operações do Cliente",
  },

  /**
   * ── ESCOPO ACIMA DO QUE A TABELA ENTREGA (30/08/2026) ─────────────────────
   *
   * O caso que abriu esta linha: um cliente pediu, por escrito e na terceira
   * tentativa sem retorno, "28–30 posts/mês, 3 carrosséis/semana, ciclo de 30
   * dias". O agente respondeu — corretamente — que aquilo está acima da
   * capacidade e disse que ia chamar o gerente. E não havia gerente nenhum
   * sendo chamado: o lead caía numa fila humana e ficava lá.
   *
   * ⚠️ O que está em aberto NÃO é "qual é a nossa capacidade": é se a empresa
   * faz, por quanto e em que prazo, um escopo que não é nenhum dos planos da
   * tabela publicada. Nenhum número de capacidade é escrito aqui, de propósito
   * — escrever um seria a quinta tabela de que o cabeçalho deste arquivo fala,
   * só que de entrega em vez de preço, e o vendedor prometeria um volume que
   * nenhum sistema confere.
   */
  escopoAcimaDaCapacidade: {
    motivo:
      "o que a empresa vende são os planos da tabela publicada. Volume, " +
      "cadência ou entregável fora deles não tem preço, prazo nem capacidade " +
      "decidida — não existe escopo sob medida contratável hoje, e dizer 'a " +
      "gente consegue' seria prometer entrega que ninguém dimensionou.",
    decideQuem: "CEO, com o Gerente de Operações do Cliente",
  },

  /**
   * ── PERMUTA / PARCERIA / PAGAMENTO SEM DINHEIRO (30/08/2026) ──────────────
   *
   * ⚠️ Isto NÃO é `formaDePagamento`, e confundir os dois daria ao cliente uma
   * resposta errada com cara de resposta certa.
   *
   * `formaDePagamento` é mecânica: o checkout cria uma assinatura recorrente no
   * Mercado Pago, que aceita cartão e mais nada. A pergunta "vocês aceitam
   * boleto?" morre ali, porque não há alavanca — e por isso ela é respondida.
   *
   * Permuta é outra coisa: é **não passar pelo checkout**. É acordo comercial —
   * serviço por serviço, mídia por mensalidade — e a pergunta não é se o sistema
   * aceita, é se a EMPRESA aceita. Ninguém decidiu, e o agente não pode decidir:
   * dizer "não" fecha negócio que talvez o dono quisesse, e dizer "vejo com o
   * time" sem ver com ninguém é exatamente o defeito que abriu este trabalho.
   */
  permuta: {
    motivo:
      "não há decisão sobre aceitar permuta, parceria ou qualquer " +
      "contrapartida que não seja dinheiro. Isto não é forma de pagamento que " +
      "falte configurar — o checkout cobra assinatura recorrente no cartão e " +
      "permuta não passa por ele. É acordo comercial fora do checkout, e a " +
      "empresa não decidiu se faz.",
    decideQuem: "CEO",
  },
} as const;

/**
 * ── TRÊS PERGUNTAS QUE DEIXARAM DE EXISTIR (decisão do CEO, 25/08/2026) ──────
 *
 * Esta lista tinha quatro itens. O CEO respondeu **quem fecha** e a resposta
 * apagou três de uma vez:
 *
 *   *"quem fecha é o SDR que dá o link do site pra ele fechar por lá. Quem
 *    fecha é o checkout, o cliente no próprio checkout."*
 *
 * Ninguém do time fecha. O vendedor manda o link; o cliente contrata sozinho.
 * E daí saem três respostas que **não são política, são mecânica** — vêm do que
 * o sistema faz, não de uma opinião que alguém ainda precisasse ter:
 *
 * **Desconto além da tabela deixou de ser uma pergunta.** O checkout cobra
 * `PLAN_CYCLE_CENTS`. Não existe campo, tela ou rota por onde um vendedor
 * conceda outra coisa — o único abatimento é o meio mês do primeiro ciclo, e ele
 * já está embutido. Não é que a alçada seja zero: é que não há caminho.
 *
 * **Forma de pagamento idem.** `MercadoPagoPlatformBilling` cria um
 * `preapproval`, que é assinatura recorrente — cartão de crédito, e só. Não há
 * boleto nem PIX a oferecer, porque recorrência no Mercado Pago não os aceita.
 *
 * **Alçada para condição fora do padrão idem.** Não existe condição fora do
 * padrão a assinar quando o cliente contrata sozinho na tabela publicada.
 *
 * ⚠️ **Se um dia alguém abrir um caminho de exceção** — cupom, contrato manual,
 * cobrança fora do checkout — estas três voltam a ser perguntas em aberto no
 * mesmo dia. Elas sumiram porque a máquina não tem a alavanca, não porque a
 * pergunta foi respondida com um número.
 */
export const RESPONDIDO_PELO_CHECKOUT = {
  quemFecha:
    "o próprio cliente, no checkout. O vendedor manda o link do site; ninguém " +
    "do time assina nada por ele.",
  descontoAlemDaTabela:
    "não existe caminho para conceder. O checkout cobra a tabela publicada, e o " +
    "único abatimento — metade do primeiro mês — já vem embutido na primeira cobrança.",
  formaDePagamento:
    "cartão de crédito, na recorrência do Mercado Pago. Não há boleto nem PIX: " +
    "assinatura recorrente não os aceita.",
} as const;

export type AssuntoEmAberto = keyof typeof EM_ABERTO;

/** A lista inteira, para a tela de configurações e para o backlog. */
export function oQueAindaNaoSeSabe(): Array<{
  assunto: AssuntoEmAberto;
  motivo: string;
  decideQuem: string;
}> {
  return (Object.keys(EM_ABERTO) as AssuntoEmAberto[]).map((assunto) => ({
    assunto,
    motivo: EM_ABERTO[assunto].motivo,
    decideQuem: EM_ABERTO[assunto].decideQuem,
  }));
}

/** Um assunto em aberto, na forma que o agente consome. */
export function naoSei<T>(assunto: AssuntoEmAberto): Politica<T> {
  const { motivo, decideQuem } = EM_ABERTO[assunto];
  return { sabe: false, motivo, decideQuem };
}

// ── O PORTÃO: O QUE ESTE AGENTE PODE FALAR ───────────────────────────────────

export type AssuntoDePreco =
  | "tabela"
  | "descontoPublicado"
  | "comoFecha"
  | "descontoAlemDaTabela"
  | "formaDePagamento"
  | "prazoDeImplantacao"
  // Os dois que o caso real de 30/08/2026 destampou. Ver `EM_ABERTO`.
  | "escopoAcimaDaCapacidade"
  | "permuta";

export interface RespostaSobrePreco {
  /** Pode falar? */
  podeResponder: boolean;
  /** O que dizer, quando pode. */
  tabela?: PrecoDoPlano[];
  desconto?: DescontoPublicado;
  /** A resposta pronta, quando ela vem do que o checkout faz. */
  resposta?: string;
  /** Por que não, e para quem vai, quando não pode. */
  motivo?: string;
  decideQuem?: string;
}

/**
 * A única porta por onde preço sai da Sala.
 *
 * Informar a tabela é permitido a QUALQUER perfil, humano ou IA: é dado público,
 * está estampado no site, e negá-lo ao lead não protege nada — só faz a empresa
 * parecer que esconde preço.
 *
 * Negociar, prometer prazo, combinar forma de pagamento ou conceder além da
 * tabela é outra coisa, e nenhum perfil faz isso aqui — nem o humano. A diferença
 * é a razão de este portão existir em vez de uma linha de instrução na ficha:
 * ficha é aviso, portão é trava.
 */
export function responderSobrePreco(assunto: AssuntoDePreco): RespostaSobrePreco {
  switch (assunto) {
    case "tabela":
      return { podeResponder: true, tabela: tabelaPublicada() };

    case "descontoPublicado": {
      const d = descontoPublicado();
      // O `sabe: false` é inalcançável hoje, e o ramo existe para o dia em que a
      // política de desconto passar a ser configurável. Sem ele, esse dia
      // chegaria como um `undefined` numa mensagem ao cliente.
      return d.sabe
        ? { podeResponder: true, desconto: d.valor }
        : { podeResponder: false, motivo: d.motivo, decideQuem: d.decideQuem };
    }

    // As três que o checkout responde. NÃO são "pode negociar": são "a máquina
    // faz assim, e não há outra alavanca". O vendedor informa, como informa o
    // preço — e o portão continua sendo o único lugar por onde isso sai.
    case "comoFecha":
      return { podeResponder: true, resposta: RESPONDIDO_PELO_CHECKOUT.quemFecha };
    case "descontoAlemDaTabela":
      return {
        podeResponder: true,
        resposta: RESPONDIDO_PELO_CHECKOUT.descontoAlemDaTabela,
      };
    case "formaDePagamento":
      return {
        podeResponder: true,
        resposta: RESPONDIDO_PELO_CHECKOUT.formaDePagamento,
      };

    default: {
      const { motivo, decideQuem } = EM_ABERTO[assunto];
      return { podeResponder: false, motivo, decideQuem };
    }
  }
}

/**
 * O gatilho de handoff que nasce daqui.
 *
 * Quando o lead pergunta algo que a empresa não decidiu, a resposta certa não é
 * "não sei" e ponto: é passar para gente. Esta função devolve o motivo já
 * escrito, pronto para entrar no dossiê do handoff — porque handoff sem motivo
 * escrito é o que faz o humano começar a conversa do zero.
 */
export function motivoDeHandoffPorPreco(assunto: AssuntoDePreco): string | null {
  const r = responderSobrePreco(assunto);
  return r.podeResponder ? null : `${r.motivo} Decide: ${r.decideQuem}.`;
}

// ── ⭐ O CHAMADOR QUE FALTAVA: DO TEXTO DO LEAD ATÉ O ASSUNTO ────────────────

/**
 * ⭐⭐ A PEÇA QUE FALTAVA, E O DEFEITO-ASSINATURA DESTA CASA.
 *
 * `motivoDeHandoffPorPreco` foi escrita, testada, revisada — e **nunca teve um
 * chamador de produção**. Medido em 30/08/2026: nenhum caminho que saísse de uma
 * mensagem de cliente chegava até ela. Foi o quarto caso do mesmo defeito no
 * mesmo dia: peça pronta, correta, e desligada.
 *
 * O motivo de ela ficar órfã é banal e vale ser dito: ela recebe um
 * `AssuntoDePreco`, e **ninguém sabia transformar o texto do cliente num
 * assunto**. O elo que falta entre o mundo e a peça é sempre este — a peça pede
 * um tipo que só existe depois de alguém decidir. Esta função é esse alguém.
 *
 * ─── POR QUE DETERMINÍSTICA, E NÃO UMA PERGUNTA AO MODELO ──────────────────
 *
 * Mesma doutrina de `responder.ts`: a decisão de escalar é tomada em código,
 * antes do modelo. Um modelo simpático lê "topam permuta?" e tenta resolver — e
 * "tentar resolver" aqui significa combinar forma de pagamento que a empresa não
 * decidiu. A trava não pode morar na peça que erra sob pressão.
 *
 * ─── E POR QUE ELA DEVOLVE UMA LISTA ───────────────────────────────────────
 *
 * O caso real que abriu isto trouxe **duas** perguntas na mesma mensagem —
 * volume acima do plano E permuta. Devolver só a primeira faria o gerente
 * responder metade, e o cliente voltar com a outra metade três dias depois. É
 * exatamente a espera que este trabalho existe para acabar.
 */
export const GATILHOS_DE_ASSUNTO: ReadonlyArray<{
  assunto: AssuntoDePreco;
  padrao: RegExp;
  /** O que este gatilho está lendo, para o teste e para quem depurar. */
  le: string;
}> = [
  {
    assunto: "permuta",
    // "parceria" e "troca" sozinhas são palavras de conversa boa ("parceria de
    // longo prazo") e disparariam à toa. Só contam quando estão perto de
    // dinheiro/pagamento — ou quando a palavra já é inequívoca (permuta, escambo).
    padrao:
      /\b(permuta|permutar|escambo|barter)\b|\bsem\s+(dinheiro|grana|pagar)\b|\b(parceria|troca|contrapartida)\b[^.?!]{0,60}\b(pagamento|pagar|dinheiro|mensalidade|valor)\b|\b(pagamento|pagar|dinheiro|mensalidade)\b[^.?!]{0,60}\b(parceria|troca|permuta|contrapartida)\b/i,
    le: "permuta, escambo, ou parceria/troca dita perto de pagamento/dinheiro",
  },
  {
    assunto: "escopoAcimaDaCapacidade",
    // Volume pedido em número + unidade de entrega, ou a frase de capacidade dita
    // com todas as letras. O número não é comparado com teto nenhum aqui de
    // propósito: não existe teto publicado, e inventar um seria a quinta tabela.
    padrao:
      /\b\d{1,4}\s*(a|-|–|até)?\s*\d{0,4}\s*(posts?|publica[çc][õo]es|pe[çc]as|artes|carross[ée]is|carrossel|reels|v[íi]deos|stories)\b|\b(acima|fora|al[ée]m)\s+d[ao]s?\s+(nossa\s+|sua\s+)?(capacidade|plano|pacote|escopo)\b|\b(escopo|volume|cad[êe]ncia)\s+(maior|acima|customizad[oa]|sob medida|personalizad[oa])\b/i,
    le: "volume pedido em peças/posts/carrosséis, ou escopo dito acima do plano",
  },
  {
    assunto: "prazoDeImplantacao",
    padrao:
      /\b(prazo de implanta[çc][ãa]o|implanta[çc][ãa]o leva|quanto tempo (leva|demora)|em quantos dias|quando fica pronto|prazo (de|para) entrega)\b/i,
    le: "pergunta de prazo de implantação",
  },
];

/** Todos os assuntos de preço que a mensagem levanta, na ordem dos gatilhos. */
export function assuntosDePrecoNaMensagem(mensagem: string): AssuntoDePreco[] {
  if (!mensagem?.trim()) return [];
  return GATILHOS_DE_ASSUNTO.filter((g) => g.padrao.test(mensagem)).map((g) => g.assunto);
}

/**
 * O que ESCALA nesta mensagem, já com o motivo escrito.
 *
 * Vazio quer dizer "nada aqui está fora da alçada do agente" — e é diferente de
 * "não li a mensagem". Um assunto que a Sala SABE responder (a tabela, o
 * desconto publicado, quem fecha) não entra aqui, mesmo tendo sido reconhecido:
 * escalar o que o agente pode responder sozinho é o jeito mais rápido de entupir
 * a fila e fazer o time desligar o agente.
 */
export function foraDaAlcadaNaMensagem(
  mensagem: string,
): Array<{ assunto: AssuntoDePreco; motivo: string }> {
  const fora: Array<{ assunto: AssuntoDePreco; motivo: string }> = [];
  for (const assunto of assuntosDePrecoNaMensagem(mensagem)) {
    const motivo = motivoDeHandoffPorPreco(assunto);
    if (motivo) fora.push({ assunto, motivo });
  }
  return fora;
}
