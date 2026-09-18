/**
 * A FILA DA REABORDAGEM — quem entra no próximo lote, e por quê.
 *
 * ── A REGRA DE ENTRADA, COMO O CEO A DEU ────────────────────────────────────
 *
 *   entra:  TODO contato que já recebeu ao menos uma mensagem nossa.
 *   sai:    quem pediu silêncio (nunca);
 *           quem já está em demo/proposta/negociação/ganho (é continuação);
 *           quem a trava anti-repetição barrar (isso acontece no envio, e a
 *           recusa dela fica escrita em `TravaDeAbordagemRecusa`).
 *
 * ── E QUEM JÁ FOI PROCESSADO NESTA CAMPANHA NÃO VOLTA ───────────────────────
 *
 * `ReabordagemExecucao` tem uma linha por contato examinado. Ela é o que faz a
 * campanha ser **uma passada**, e não um laço: um contato que já saiu (ou que
 * já foi recusado por uma regra) não reaparece no lote seguinte. Sem isso, dois
 * disparos seguidos processariam os mesmos 40 contatos para sempre e a base
 * nunca andaria.
 *
 * ⛔ Este arquivo SÓ LÊ. Não envia, não escreve, não decide o texto.
 */

import type { PrismaClient, Prisma, SiteLeadStage, EstagioDaEmpresa } from "@prisma/client";
import { ETAPAS_DE_CONTINUACAO } from "./rota";
import type { FatosDaConversa } from "./rota";

type Cliente = PrismaClient | Prisma.TransactionClient;

/**
 * ⚠️ POR QUE A ORIGEM NÃO FILTRA AQUI (D-0E1) — e é de propósito.
 *
 * Lead de formulário, campanha, Instagram, Facebook ou indicação **não recebe**
 * abordagem fria. Mas quem o recusa é `rota.ts`, e não esta consulta: filtrar
 * na fila faria essas pessoas sumirem sem deixar rastro, e a pergunta *"quantos
 * ficaram de fora, e por qual origem?"* não teria resposta. Elas entram, saem
 * recusadas com a regra escrita, e viram número em `ReabordagemExecucao`.
 *
 * Corte silencioso é o defeito que a casa já nomeou uma vez, no funil do ciclo
 * do CRM: quem é cortado antes de virar linha não deixa rastro, e sem o rastro
 * a conta nunca fecha.
 */
export const CRITERIO_DE_ENTRADA =
  "já recebeu ao menos uma mensagem nossa; NÃO pediu silêncio; NÃO está em demo/proposta/negociação/ganho; " +
  "e ainda não foi examinado por esta campanha. A trava anti-repetição age depois, no envio, e a recusa dela fica escrita.";

/** Tamanho das buscas por `in` — `in` com dezenas de milhares derruba o banco. */
const LOTE_DE_CONSULTA = 500;

function emLotes<T>(itens: T[]): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < itens.length; i += LOTE_DE_CONSULTA) {
    lotes.push(itens.slice(i, i + LOTE_DE_CONSULTA));
  }
  return lotes;
}

export interface Selecao {
  /** Quantos contatos ainda restam na campanha inteira (não só neste lote). */
  restantes: number;
  /** Os deste lote, já com os fatos lidos. */
  candidatos: FatosDaConversa[];
}

/**
 * Monta o próximo lote.
 *
 * `tamanho` é o freio: nunca 750 de uma vez. Ver `executar.ts` para o porquê do
 * número escolhido.
 */
export async function selecionarProximoLote(
  db: Cliente,
  p: { tamanho: number },
): Promise<Selecao> {
  // ── 1. Quem esta campanha já examinou ──
  const jaExaminados = (await db.reabordagemExecucao.findMany({
    select: { leadId: true },
  })) as Array<{ leadId: string }>;
  const examinados = new Set(jaExaminados.map((x) => x.leadId));

  const filtro: Prisma.SiteLeadWhereInput = {
    optOutAt: null,
    stage: { notIn: [...ETAPAS_DE_CONTINUACAO] as SiteLeadStage[] },
    // ⭐ ABORDADO = recebeu ao menos uma mensagem NOSSA. Quem só escreveu
    // (inbound puro, ex.: formulário do site) não foi abordado por nós, e
    // contá-lo aqui inflaria a campanha com quem procurou a Foocci sozinho.
    mensagens: { some: { direcao: "SAIDA" } },
    ...(examinados.size ? { id: { notIn: [...examinados] } } : {}),
  };

  const restantes = await db.siteLead.count({ where: filtro });

  const leads = (await db.siteLead.findMany({
    where: filtro,
    // Mais antigos primeiro: quem está esperando há mais tempo é quem menos
    // arrisca ser incomodado duas vezes na mesma semana.
    orderBy: { id: "asc" },
    take: Math.max(0, Math.trunc(p.tamanho)),
    select: {
      id: true,
      whatsapp: true,
      stage: true,
      fonte: true,
      optOutAt: true,
      empresaId: true,
      contatoId: true,
    },
  })) as Array<{
    id: string;
    whatsapp: string | null;
    stage: SiteLeadStage;
    fonte: string | null;
    optOutAt: Date | null;
    empresaId: string | null;
    contatoId: string | null;
  }>;

  if (leads.length === 0) return { restantes, candidatos: [] };

  // ── 2. A última fala DA PESSOA em cada conversa ──
  //
  // É ela que responde as duas perguntas da rota: se a janela de 24h está
  // aberta, e quem está do outro lado.
  const ultimaEntrada = new Map<string, { em: Date; texto: string | null }>();
  for (const lote of emLotes(leads.map((l) => l.id))) {
    const entradas = (await db.leadMensagem.findMany({
      where: { leadId: { in: lote }, direcao: "ENTRADA" },
      orderBy: { ocorreuEm: "desc" },
      select: { leadId: true, ocorreuEm: true, texto: true, legenda: true },
    })) as Array<{ leadId: string; ocorreuEm: Date; texto: string | null; legenda: string | null }>;

    for (const m of entradas) {
      // `orderBy desc` + primeira ocorrência = a mais recente. Guardar só a
      // primeira evita reordenar em memória.
      if (ultimaEntrada.has(m.leadId)) continue;
      ultimaEntrada.set(m.leadId, { em: m.ocorreuEm, texto: m.texto ?? m.legenda ?? null });
    }
  }

  // ── 3. O que a jornada já sabe da empresa e do contato ──
  const empresaIds = [...new Set(leads.map((l) => l.empresaId).filter((x): x is string => !!x))];
  const contatoIds = [...new Set(leads.map((l) => l.contatoId).filter((x): x is string => !!x))];

  const estagioPorEmpresa = new Map<string, EstagioDaEmpresa>();
  for (const lote of emLotes(empresaIds)) {
    const achadas = (await db.empresa.findMany({
      where: { id: { in: lote } },
      select: { id: true, estagio: true },
    })) as Array<{ id: string; estagio: EstagioDaEmpresa }>;
    for (const e of achadas) estagioPorEmpresa.set(e.id, e.estagio);
  }

  const decisorPorContato = new Map<string, boolean>();
  for (const lote of emLotes(contatoIds)) {
    const achados = (await db.contato.findMany({
      where: { id: { in: lote } },
      select: { id: true, ehDecisor: true },
    })) as Array<{ id: string; ehDecisor: boolean }>;
    for (const c of achados) decisorPorContato.set(c.id, c.ehDecisor);
  }

  const candidatos: FatosDaConversa[] = leads.map((l) => {
    const entrada = ultimaEntrada.get(l.id) ?? null;
    return {
      leadId: l.id,
      telefone: l.whatsapp,
      // ⚠️ Vai CRUA para a rota, inclusive quando é nula: é a rota que decide o
      // que fazer com "não sei por onde entrou", e ela decide REVISÃO.
      fonte: l.fonte,
      stage: l.stage,
      optOutAt: l.optOutAt,
      // ⚠️ `null` quando o religamento ainda não ligou a empresa. `null` não é
      // "não tem estágio": é "a base ainda não sabe", e a rota trata assim.
      estagioDaEmpresa: l.empresaId ? (estagioPorEmpresa.get(l.empresaId) ?? null) : null,
      contatoEhDecisor: l.contatoId ? (decisorPorContato.get(l.contatoId) ?? null) : null,
      ultimaEntradaEm: entrada?.em ?? null,
      textoDaUltimaEntrada: entrada?.texto ?? null,
    };
  });

  return { restantes, candidatos };
}
