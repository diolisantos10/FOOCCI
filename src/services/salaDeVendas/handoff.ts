/**
 * HANDOFF IA ↔ HUMANO — os gatilhos e o dossiê.
 *
 * ── A DIVISÃO DE TRABALHO COM `responsavel.ts` ──────────────────────────────
 *
 * `responsavel.ts` responde *de quem é o lead agora* e faz a troca de mão de
 * forma atômica. Este arquivo responde outras duas perguntas, que são as do
 * item 8 do comando: **quando** a IA deve largar, e **o que vai junto**.
 *
 * Os dois estão separados porque a troca de dono é uma escrita condicional
 * simples e crítica, e não pode carregar no colo a lógica de decisão que muda
 * toda semana. Este arquivo chama aquele; nunca reescreve o que ele faz.
 *
 * ── POR QUE O DOSSIÊ É GRAVADO, E NÃO GERADO NA HORA DE LER ─────────────────
 *
 * O dossiê é o estado da conversa NAQUELE instante. Recalculá-lo depois mostra
 * o que se sabe hoje, e não o que a pessoa que pegou o lead tinha em mãos — o
 * que torna impossível avaliar se a decisão dela foi boa com a informação que
 * ela tinha. Auditoria que julga com informação futura não é auditoria.
 *
 * ── E O QUE NUNCA ACONTECE AQUI ─────────────────────────────────────────────
 *
 * Nenhuma mensagem sai deste arquivo. Passar o bastão é mudar de responsável e
 * registrar o contexto; falar com o lead é outra coisa, com outro portão.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import type { MotivoDoHandoff, SiteLeadStage, LeadAtendidoPor } from "@prisma/client";
import { assumirComoHumano, devolverParaIA, pedirHumano } from "./responsavel";

type Cliente = PrismaClient | Prisma.TransactionClient;

// ── Os gatilhos ──────────────────────────────────────────────────────────────

/**
 * O que a conversa mostra, no momento de decidir se a IA continua.
 *
 * Tudo opcional: o TA nem sempre consegue avaliar tudo, e a ausência de um sinal
 * **nunca** dispara handoff — só a presença. Um gatilho que dispara por falta de
 * informação transformaria toda conversa nova numa transferência.
 */
export interface SinaisDaConversa {
  pediuHumano?: boolean;
  pediuProposta?: boolean;
  pediuDesconto?: boolean;
  intencaoDeCompra?: boolean;
  objecaoNaoResolvida?: boolean;
  /** Confiança que o próprio modelo declarou, 0–1. */
  confiancaDaIA?: number | null;
  sentimentoNegativo?: boolean;
  risco?: boolean;
  /** A resposta exigiria afirmar algo que a base oficial não confirma. */
  informacaoNaoConfirmada?: boolean;
  score?: number | null;
  /** A IA repetiu a mesma resposta, travou ou devolveu erro. */
  iaFalhou?: boolean;
}

export interface RegraDeHandoff {
  /** Score a partir do qual o lead vai para gente. */
  scoreParaHumano: number;
  /** Abaixo disto, a IA se declara insegura. */
  confiancaMinima: number;
  /** Gatilhos ligados. Vazio = nenhum dispara (a IA nunca larga sozinha). */
  ligados: readonly MotivoDoHandoff[];
}

export const REGRA_PADRAO: RegraDeHandoff = {
  scoreParaHumano: 70,
  confiancaMinima: 0.6,
  // Os onze do comando. `DEVOLUCAO_PARA_IA` e `DISTRIBUICAO` ficam de fora:
  // não são a IA desistindo, são movimentos operacionais de gente.
  ligados: [
    "PEDIU_HUMANO",
    "INTENCAO_DE_COMPRA",
    "PEDIU_PROPOSTA",
    "PEDIU_DESCONTO",
    "OBJECAO_NAO_RESOLVIDA",
    "IA_INSEGURA",
    "SENTIMENTO_NEGATIVO",
    "RISCO",
    "INFORMACAO_NAO_CONFIRMADA",
    "SCORE_ATINGIU_LIMITE",
    "IA_FALHOU",
  ],
};

/**
 * Quais gatilhos dispararam, em ordem de gravidade.
 *
 * Função PURA e a ordem importa: o motivo gravado é o PRIMEIRO da lista, e quem
 * pega o lead lê esse motivo antes de qualquer outra coisa. "Pediu desconto"
 * explica melhor a conversa do que "score atingiu limite", mesmo quando os dois
 * são verdade — por isso os pedidos explícitos do lead vêm antes dos nossos
 * cálculos internos.
 */
export function gatilhosQueDispararam(
  sinais: SinaisDaConversa,
  regra: RegraDeHandoff = REGRA_PADRAO,
): MotivoDoHandoff[] {
  const ligado = (m: MotivoDoHandoff) => regra.ligados.includes(m);
  const achados: MotivoDoHandoff[] = [];

  // 1. O que o lead PEDIU. Ignorar um pedido explícito é o pior defeito
  //    possível numa conversa de venda.
  if (sinais.pediuHumano && ligado("PEDIU_HUMANO")) achados.push("PEDIU_HUMANO");
  if (sinais.pediuDesconto && ligado("PEDIU_DESCONTO")) achados.push("PEDIU_DESCONTO");
  if (sinais.pediuProposta && ligado("PEDIU_PROPOSTA")) achados.push("PEDIU_PROPOSTA");

  // 2. Risco. Vem cedo porque é o único que também é problema jurídico.
  if (sinais.risco && ligado("RISCO")) achados.push("RISCO");
  if (sinais.sentimentoNegativo && ligado("SENTIMENTO_NEGATIVO")) {
    achados.push("SENTIMENTO_NEGATIVO");
  }

  // 3. Limites da IA.
  if (sinais.informacaoNaoConfirmada && ligado("INFORMACAO_NAO_CONFIRMADA")) {
    achados.push("INFORMACAO_NAO_CONFIRMADA");
  }
  if (sinais.iaFalhou && ligado("IA_FALHOU")) achados.push("IA_FALHOU");
  if (
    typeof sinais.confiancaDaIA === "number" &&
    sinais.confiancaDaIA < regra.confiancaMinima &&
    ligado("IA_INSEGURA")
  ) {
    achados.push("IA_INSEGURA");
  }
  if (sinais.objecaoNaoResolvida && ligado("OBJECAO_NAO_RESOLVIDA")) {
    achados.push("OBJECAO_NAO_RESOLVIDA");
  }

  // 4. Sinais que nós calculamos. Vêm por último de propósito: são os que menos
  //    explicam a conversa para quem vai pegá-la.
  if (sinais.intencaoDeCompra && ligado("INTENCAO_DE_COMPRA")) {
    achados.push("INTENCAO_DE_COMPRA");
  }
  if (
    typeof sinais.score === "number" &&
    sinais.score >= regra.scoreParaHumano &&
    ligado("SCORE_ATINGIU_LIMITE")
  ) {
    achados.push("SCORE_ATINGIU_LIMITE");
  }

  return achados;
}

// ── O dossiê ─────────────────────────────────────────────────────────────────

export interface Dossie {
  resumo?: string | null;
  dorIdentificada?: string | null;
  objecoes?: string | null;
  proximaAcao?: string | null;
  objetivo?: string | null;
  scoreNoMomento?: number | null;
  etapaNoMomento?: SiteLeadStage | null;
}

export interface RecusaDoDossie {
  campo: string;
  motivo: string;
}

/**
 * O que um handoff precisa carregar para não ser um abandono com formulário.
 *
 * A exigência é assimétrica de propósito:
 *
 *  - **IA → humano** precisa de RESUMO. Quem pega vai ler a conversa inteira se
 *    não houver, e no dia movimentado não vai ler — vai perguntar de novo tudo
 *    que a pessoa já respondeu.
 *  - **humano → IA** precisa de OBJETIVO. Devolver sem dizer para quê é largar
 *    o lead com um passo extra.
 *
 * Distribuição operacional não exige nada: não houve conversa para resumir.
 */
export function validarDossie(
  params: { de: LeadAtendidoPor; para: LeadAtendidoPor; motivo: MotivoDoHandoff; dossie: Dossie },
): RecusaDoDossie[] {
  const recusas: RecusaDoDossie[] = [];

  if (params.motivo === "DISTRIBUICAO") return recusas;

  const vaiParaGente = params.para === "HUMANO" || params.para === "AGUARDANDO_HUMANO";
  const veioDaIA = params.de === "IA";

  if (vaiParaGente && veioDaIA && !params.dossie.resumo?.trim()) {
    recusas.push({
      campo: "resumo",
      motivo: "quem pega precisa saber o que já foi conversado sem reler tudo",
    });
  }

  if (params.para === "IA" && !params.dossie.objetivo?.trim()) {
    recusas.push({
      campo: "objetivo",
      motivo: "devolver sem dizer para quê é abandonar o lead com um passo extra",
    });
  }

  return recusas;
}

export type ResultadoDeRegistrar =
  | { ok: true; handoffId: string }
  | { ok: false; recusas: RecusaDoDossie[] };

/**
 * Grava a passagem de bastão.
 *
 * NÃO muda o responsável — quem faz isso é `responsavel.ts`, atomicamente. Aqui
 * só se registra o que aconteceu e o que foi junto. A separação existe para que
 * uma falha ao gravar o dossiê nunca desfaça uma troca de dono que já valeu.
 */
export async function registrarHandoff(
  db: Cliente,
  params: {
    leadId: string;
    de: LeadAtendidoPor;
    para: LeadAtendidoPor;
    motivo: MotivoDoHandoff;
    dossie: Dossie;
    deUserId?: string | null;
    paraUserId?: string | null;
    agora?: Date;
  },
): Promise<ResultadoDeRegistrar> {
  const recusas = validarDossie(params);
  if (recusas.length) return { ok: false, recusas };

  const criado = await db.leadHandoff.create({
    data: {
      leadId: params.leadId,
      de: params.de,
      para: params.para,
      motivo: params.motivo,
      deUserId: params.deUserId ?? null,
      paraUserId: params.paraUserId ?? null,
      resumo: params.dossie.resumo ?? null,
      dorIdentificada: params.dossie.dorIdentificada ?? null,
      objecoes: params.dossie.objecoes ?? null,
      proximaAcao: params.dossie.proximaAcao ?? null,
      objetivo: params.dossie.objetivo ?? null,
      scoreNoMomento: params.dossie.scoreNoMomento ?? null,
      etapaNoMomento: params.dossie.etapaNoMomento ?? null,
      // Quando já vai direto para uma pessoa nomeada, não há espera nenhuma.
      aceitoEm: params.paraUserId ? (params.agora ?? new Date()) : null,
    },
    select: { id: true },
  });

  return { ok: true, handoffId: criado.id };
}

export type ResultadoDeAceitar =
  | { ok: true; handoffId: string; leadId: string }
  | { ok: false; causa: "naoExiste" }
  | { ok: false; causa: "jaAceito"; porUserId: string | null }
  | { ok: false; causa: "leadJaTemDono" };

/**
 * Uma pessoa pega um lead que estava esperando gente.
 *
 * DUAS escritas condicionais, nesta ordem, e a ordem é o desenho:
 *
 *   1. O lead troca de dono (`responsavel.ts`, atômico). Se perder a corrida,
 *      nada mais acontece.
 *   2. Só então o handoff é marcado como aceito — também condicionalmente.
 *
 * Marcar o handoff primeiro criaria o estado mais confuso possível: o registro
 * diz que Fulano pegou, e o lead está com outra pessoa.
 */
export async function aceitarHandoff(
  db: Cliente,
  params: { handoffId: string; userId: string; agora?: Date },
): Promise<ResultadoDeAceitar> {
  const agora = params.agora ?? new Date();

  const handoff = await db.leadHandoff.findUnique({
    where: { id: params.handoffId },
    select: { id: true, leadId: true, aceitoEm: true, paraUserId: true },
  });

  if (!handoff) return { ok: false, causa: "naoExiste" };
  if (handoff.aceitoEm) return { ok: false, causa: "jaAceito", porUserId: handoff.paraUserId };

  const dono = await assumirComoHumano(db, {
    leadId: handoff.leadId,
    userId: params.userId,
    agora,
  });

  if (!dono.ok) return { ok: false, causa: "leadJaTemDono" };

  const marcados = await db.leadHandoff.updateMany({
    where: { id: params.handoffId, aceitoEm: null },
    data: { aceitoEm: agora, paraUserId: params.userId },
  });

  if (marcados.count === 1) {
    return { ok: true, handoffId: params.handoffId, leadId: handoff.leadId };
  }

  // Corrida rara: o lead é nosso, mas outro registro de aceite venceu. O lead
  // ficou com quem chamou — e é isso que a tela precisa dizer.
  return { ok: false, causa: "jaAceito", porUserId: null };
}

// ── AS TRÊS QUE JUNTAM AS DUAS METADES ───────────────────────────────────────
//
// ── O DEFEITO QUE ESTA SEÇÃO FECHA ──────────────────────────────────────────
//
// Até aqui existiam duas metades que nunca se encontravam. `responsavel.ts`
// trocava o dono do lead, atomicamente, e era o que a rota chamava.
// `handoff.ts` tinha os onze gatilhos, o dossiê congelado e a tabela
// `lead_handoffs` — e **nenhuma rota o chamava**.
//
// O efeito prático: toda passagem de bastão da Sala trocava o dono e não
// gravava registro nenhum. `lead_handoffs` ficava vazia para sempre, e os
// indicadores que leem dela — "taxa e motivo de handoff", que é o que as
// fichas 1.4 e 1.5 declaram como a própria medida — respondiam sobre uma
// tabela sem linhas. Não davam erro: davam silêncio, que é pior.
//
// ── A ORDEM, E POR QUE ELA É ASSIM ──────────────────────────────────────────
//
//   1. **Validar o dossiê ANTES de mexer no dono.** `validarDossie` é pura, e
//      recusar depois de já ter trocado o responsável deixaria o lead em
//      `AGUARDANDO_HUMANO` sem registro — exatamente o estado que esta seção
//      existe para impedir.
//   2. **Trocar o dono** (escrita condicional, `responsavel.ts`).
//   3. **Só então gravar o handoff.** Uma falha ao gravar o registro nunca
//      desfaz uma troca de mão que já valeu — e um lead com dono e sem registro
//      é recuperável; um registro sem dono não é.

export type ResultadoDePassar =
  | { ok: true; leadId: string; handoffId: string; motivo: MotivoDoHandoff }
  | { ok: false; causa: "semGatilho" }
  | { ok: false; causa: "dossieIncompleto"; recusas: RecusaDoDossie[] }
  | { ok: false; causa: "semMotivo" }
  | { ok: false; causa: "naoExiste" }
  | { ok: false; causa: "naoEraDaIA"; atendidoPor: LeadAtendidoPor }
  /** O dono trocou, mas o registro não foi gravado. Estado recuperável. */
  | { ok: false; causa: "trocouSemRegistrar"; leadId: string };

/**
 * A IA para e chama gente — com gatilho nomeado e dossiê junto.
 *
 * Substitui a chamada crua a `pedirHumano` na rota. A diferença que importa não
 * é de código: é que a partir daqui **existe registro** de por que a IA largou,
 * e o motivo é um dos onze do catálogo em vez de texto livre que ninguém agrupa.
 *
 * `motivoExplicito` existe para o caso em que quem chama já sabe o motivo (o
 * lead escreveu "quero falar com uma pessoa") e não precisa de inferência. Sem
 * gatilho e sem motivo explícito a função **recusa** — passar o lead adiante sem
 * saber por quê é o que transforma a estatística de motivo em decoração.
 */
export async function passarParaGente(
  db: Cliente,
  params: {
    leadId: string;
    /** Texto livre que vai para o lead, para quem pegar a fila ler primeiro. */
    motivoEscrito: string;
    dossie: Dossie;
    sinais?: SinaisDaConversa;
    motivoExplicito?: MotivoDoHandoff;
    regra?: RegraDeHandoff;
    deUserId?: string | null;
    agora?: Date;
  },
): Promise<ResultadoDePassar> {
  const agora = params.agora ?? new Date();

  if (!params.motivoEscrito?.trim()) return { ok: false, causa: "semMotivo" };

  const disparados = params.sinais
    ? gatilhosQueDispararam(params.sinais, params.regra)
    : [];
  const motivo = params.motivoExplicito ?? disparados[0];
  if (!motivo) return { ok: false, causa: "semGatilho" };

  // Lido ANTES, e só para o registro dizer de onde veio. A garantia de corrida
  // continua sendo a condição dentro do `updateMany` de `pedirHumano`: se o
  // estado mudar entre esta leitura e a escrita, a escrita é que recusa. O pior
  // caso desta leitura é gravar `IA` onde era `NINGUEM` — os dois estão na lista
  // permitida, e nenhum decide nada.
  const antes = await db.siteLead.findUnique({
    where: { id: params.leadId },
    select: { atendidoPor: true, score: true, stage: true },
  });
  if (!antes) return { ok: false, causa: "naoExiste" };

  const dossie: Dossie = {
    ...params.dossie,
    // O dossiê é uma fotografia. Score e etapa entram AQUI, do estado atual, e
    // não são relidos na hora de exibir — senão a auditoria julgaria a decisão
    // de quem pegou o lead com informação que ele não tinha.
    scoreNoMomento: params.dossie.scoreNoMomento ?? antes.score,
    etapaNoMomento: params.dossie.etapaNoMomento ?? antes.stage,
  };

  const recusas = validarDossie({
    de: antes.atendidoPor,
    para: "AGUARDANDO_HUMANO",
    motivo,
    dossie,
  });
  if (recusas.length) return { ok: false, causa: "dossieIncompleto", recusas };

  const trocou = await pedirHumano(db, {
    leadId: params.leadId,
    motivo: params.motivoEscrito,
    agora,
  });

  if (!trocou.ok) {
    if (trocou.causa === "naoExiste") return { ok: false, causa: "naoExiste" };
    if (trocou.causa === "semMotivo") return { ok: false, causa: "semMotivo" };
    return { ok: false, causa: "naoEraDaIA", atendidoPor: trocou.atendidoPor };
  }

  const registrado = await registrarHandoff(db, {
    leadId: params.leadId,
    de: antes.atendidoPor,
    para: "AGUARDANDO_HUMANO",
    motivo,
    dossie,
    deUserId: params.deUserId ?? null,
    agora,
  });

  // O dossiê já passou por `validarDossie` acima, então esta recusa é
  // inalcançável hoje. O ramo existe porque o dono JÁ trocou: transformar isto
  // num `throw` apagaria a informação de que a troca valeu.
  if (!registrado.ok) return { ok: false, causa: "trocouSemRegistrar", leadId: params.leadId };

  return { ok: true, leadId: params.leadId, handoffId: registrado.handoffId, motivo };
}

export type ResultadoDeDevolverComDossie =
  | { ok: true; leadId: string; handoffId: string }
  | { ok: false; causa: "dossieIncompleto"; recusas: RecusaDoDossie[] }
  | { ok: false; causa: "semObjetivo" }
  | { ok: false; causa: "naoExiste" }
  | { ok: false; causa: "naoEraSeu"; atendenteUserId: string | null }
  | { ok: false; causa: "trocouSemRegistrar"; leadId: string };

/**
 * O caminho inverso: a pessoa devolve o lead para a IA.
 *
 * Também vira linha em `lead_handoffs`, com motivo `DEVOLUCAO_PARA_IA`. Sem
 * isso, a tabela contaria só as saídas da IA e a razão entre "quantas vezes a
 * IA largou" e "quantas voltaram" — que é o número que diz se o handoff está
 * sendo usado como ferramenta ou como fuga — não teria denominador.
 */
export async function devolverParaIAComDossie(
  db: Cliente,
  params: { leadId: string; userId: string; objetivo: string; dossie?: Dossie; agora?: Date },
): Promise<ResultadoDeDevolverComDossie> {
  const agora = params.agora ?? new Date();

  const dossie: Dossie = { ...params.dossie, objetivo: params.objetivo };

  const recusas = validarDossie({
    de: "HUMANO",
    para: "IA",
    motivo: "DEVOLUCAO_PARA_IA",
    dossie,
  });
  if (recusas.length) return { ok: false, causa: "dossieIncompleto", recusas };

  const antes = await db.siteLead.findUnique({
    where: { id: params.leadId },
    select: { score: true, stage: true },
  });
  if (!antes) return { ok: false, causa: "naoExiste" };

  const trocou = await devolverParaIA(db, {
    leadId: params.leadId,
    userId: params.userId,
    objetivo: params.objetivo,
    agora,
  });

  if (!trocou.ok) {
    if (trocou.causa === "naoExiste") return { ok: false, causa: "naoExiste" };
    if (trocou.causa === "semObjetivo") return { ok: false, causa: "semObjetivo" };
    return { ok: false, causa: "naoEraSeu", atendenteUserId: trocou.atendenteUserId };
  }

  const registrado = await registrarHandoff(db, {
    leadId: params.leadId,
    de: "HUMANO",
    para: "IA",
    motivo: "DEVOLUCAO_PARA_IA",
    dossie: {
      ...dossie,
      scoreNoMomento: dossie.scoreNoMomento ?? antes.score,
      etapaNoMomento: dossie.etapaNoMomento ?? antes.stage,
    },
    deUserId: params.userId,
    agora,
  });

  if (!registrado.ok) return { ok: false, causa: "trocouSemRegistrar", leadId: params.leadId };

  return { ok: true, leadId: params.leadId, handoffId: registrado.handoffId };
}

/**
 * Fecha o handoff aberto de um lead que acabou de ser assumido.
 *
 * O SDR assume pela FILA, não por um id de handoff — ele vê "3 esperando gente"
 * e clica. `aceitarHandoff` exige o id e serve ao caminho em que ele já é
 * conhecido; esta serve ao caminho real da tela.
 *
 * **Não achar handoff aberto não é erro.** Um lead em `NINGUEM`, que nunca
 * passou pela IA, nunca gerou registro — e assumi-lo é normal. Tratar isso como
 * falha faria a tela mostrar erro no caminho mais comum de todos.
 */
export async function fecharHandoffAbertoDoLead(
  db: Cliente,
  params: { leadId: string; userId: string; agora?: Date },
): Promise<{ fechou: boolean; handoffId: string | null; esperaMin: number | null }> {
  const agora = params.agora ?? new Date();

  const aberto = await db.leadHandoff.findFirst({
    where: {
      leadId: params.leadId,
      aceitoEm: null,
      para: { in: ["HUMANO", "AGUARDANDO_HUMANO"] },
    },
    // O mais ANTIGO: é ele que está contando tempo na fila. Fechar o mais novo
    // deixaria o veterano aberto para sempre, inflando a espera do painel com um
    // registro que já foi atendido.
    orderBy: { createdAt: "asc" },
    select: { id: true, createdAt: true },
  });

  if (!aberto) return { fechou: false, handoffId: null, esperaMin: null };

  const marcados = await db.leadHandoff.updateMany({
    where: { id: aberto.id, aceitoEm: null },
    data: { aceitoEm: agora, paraUserId: params.userId },
  });

  if (marcados.count !== 1) return { fechou: false, handoffId: aberto.id, esperaMin: null };

  return {
    fechou: true,
    handoffId: aberto.id,
    esperaMin: Math.floor((agora.getTime() - aberto.createdAt.getTime()) / 60_000),
  };
}

// ── Espera por gente ─────────────────────────────────────────────────────────

export type EsperaMedida =
  | { medido: true; handoffsAbertos: number; maiorEsperaMin: number }
  /** Nenhum handoff aberto: não há espera para medir. Diferente de "zero". */
  | { medido: false; motivo: "nenhumAberto" };

/**
 * Quanto tempo alguém está esperando ser atendido por gente.
 *
 * Devolve `medido: false` quando não há fila — e não zero. Zero minutos de
 * espera é uma afirmação forte ("estamos atendendo na hora"); "não há ninguém
 * esperando" é outra. O painel do gerente precisa distinguir as duas, senão o
 * dia parado e o dia perfeito viram o mesmo número verde.
 */
export async function esperaPorGente(
  db: Cliente,
  agora: Date,
): Promise<EsperaMedida> {
  const abertos = await db.leadHandoff.findMany({
    where: { aceitoEm: null, para: { in: ["HUMANO", "AGUARDANDO_HUMANO"] } },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });

  if (abertos.length === 0) return { medido: false, motivo: "nenhumAberto" };

  const maisAntigo = abertos[0]!.createdAt;
  return {
    medido: true,
    handoffsAbertos: abertos.length,
    maiorEsperaMin: Math.floor((agora.getTime() - maisAntigo.getTime()) / 60_000),
  };
}
