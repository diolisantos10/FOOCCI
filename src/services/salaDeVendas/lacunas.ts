/**
 * O CADERNO DE LACUNAS — as perguntas que o agente não soube responder.
 *
 * ── POR QUE ISTO EXISTE, E POR QUE AGORA ────────────────────────────────────
 *
 * O TA já sabe não inventar: quando a base de verdade não cobre a pergunta, ele
 * diz que vai confirmar e abre um handoff `INFORMACAO_NAO_CONFIRMADA`. Essa
 * parte está pronta e testada (`responder.ts`).
 *
 * Só que ela resolve o turno e **não ensina nada à casa**. O handoff nasce, um
 * humano responde aquele lead, e a pergunta morre ali. No dia seguinte o
 * próximo lead pergunta a mesma coisa, e o agente continua sem saber.
 *
 * Numa operação que começa a abordar leads em volume, esse é o desperdício mais
 * caro que existe: a informação de *o que falta na base* passa na frente de
 * todo mundo, todo dia, e ninguém a recolhe. Este arquivo recolhe.
 *
 * ── POR QUE É CONSULTA E NÃO TABELA NOVA ────────────────────────────────────
 *
 * Tudo de que a lista precisa já está gravado: o handoff diz *quando* o agente
 * não soube, e `LeadMensagem` diz *o que* tinha sido perguntado. Criar uma
 * terceira tabela para repetir isso seria uma cópia — e cópia diverge.
 *
 * O custo dessa escolha, dito na cara: a pergunta é **reconstruída** (a última
 * mensagem de entrada antes do handoff), não capturada no ato. Se um dia o TA
 * passar a abrir handoff sem que o lead tenha escrito nada, esse caso aparece
 * em `semPerguntaRegistrada` em vez de sumir da conta.
 *
 * ── O QUE ESTE ARQUIVO SE PROÍBE ────────────────────────────────────────────
 *
 * **Não agrupa por semelhança.** Duas perguntas só entram na mesma linha se
 * usarem exatamente as mesmas palavras significativas. É deliberado: agrupar
 * por parecença juntaria *"quanto custa o plano"* com *"quanto custa o
 * treinamento"* — as duas dividem "custa" — e **esconderia uma lacuna real**
 * dentro de outra. Numa lista de vinte linhas lida por gente, ver o mesmo
 * assunto em duas linhas custa dois segundos; perder uma lacuna custa vendas.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import { palavras } from "./ta/vocabulario";

type Cliente = PrismaClient | Prisma.TransactionClient;

/** Uma pergunta que ficou sem resposta, e o tamanho do buraco. */
export interface Lacuna {
  /** As palavras significativas, ordenadas — é o que define "a mesma pergunta". */
  chave: string;
  /** A redação mais recente, já sem números pessoais. */
  pergunta: string;
  /** Quantas vezes foi perguntada. */
  vezes: number;
  /** Por quantos leads diferentes — 5 leads pesa mais que 5 vezes um lead. */
  leads: number;
  /** A última vez que alguém perguntou. */
  ultimaEm: Date;
}

export type CadernoDeLacunas =
  | {
      medido: true;
      /** Perguntas sem resposta no período, contando repetição. */
      total: number;
      /** Handoffs de "não sei" sem nenhuma mensagem de entrada antes deles. */
      semPerguntaRegistrada: number;
      lista: Lacuna[];
    }
  | { medido: false; motivo: "semAtendimento" };

/**
 * Quantas linhas o caderno mostra.
 *
 * Vinte cabe numa tela e numa leitura. O `total` continua contando tudo, então
 * o corte encurta a lista sem mentir sobre o tamanho do problema.
 */
export const LINHAS_DO_CADERNO = 20;

/**
 * Sequências longas de dígito saem do texto.
 *
 * ── POR QUE ISTO NÃO É EXCESSO DE ZELO ──────────────────────────────────────
 *
 * Esta lista existe para ser lida FORA da tela de conversa — por quem vai
 * completar a base de verdade, num relatório, possivelmente colada num chat.
 * É dado de lead saindo do lugar onde ele foi coletado, e telefone, CPF e CNPJ
 * não têm nenhuma utilidade para quem precisa saber *qual assunto falta*.
 *
 * O corte em oito dígitos é escolhido: telefone, CPF, CNPJ e cartão passam
 * disso; *"tenho 2 lojas"*, *"abro às 18h"* e *"somos 15 funcionários"* não —
 * e essas são exatamente as perguntas que a gente precisa conseguir ler.
 */
export function semNumerosPessoais(texto: string): string {
  return texto.replace(/\d[\d.\-/\s]{6,}\d/g, (trecho) =>
    (trecho.match(/\d/g) ?? []).length >= 8 ? "[número]" : trecho,
  );
}

/**
 * As perguntas viram linhas do caderno.
 *
 * Pura de propósito: agrupar e ordenar é a regra de negócio, e ela se testa com
 * uma lista de strings — sem banco, sem relógio, sem ambiente.
 *
 * A ordem é `leads` → `vezes` → mais recente. Leads distintos vem primeiro
 * porque é o único dos três que não pode ser inflado por uma conversa só: um
 * lead insistindo cinco vezes na mesma dúvida é um lead confuso; cinco leads
 * perguntando a mesma coisa é um buraco na base.
 */
export function agruparLacunas(
  perguntas: Array<{ texto: string; leadId: string; em: Date }>,
  limite: number = LINHAS_DO_CADERNO,
): Lacuna[] {
  const grupos = new Map<
    string,
    { pergunta: string; vezes: number; leads: Set<string>; ultimaEm: Date }
  >();

  for (const p of perguntas) {
    const chave = palavras(p.texto).sort().join(" ");
    // Sem nenhuma palavra significativa não há assunto para registrar: "oi?",
    // "?" e "e aí" cairiam todos na mesma linha vazia e não ensinariam nada.
    if (chave === "") continue;

    const grupo = grupos.get(chave);
    if (!grupo) {
      grupos.set(chave, {
        pergunta: semNumerosPessoais(p.texto).trim(),
        vezes: 1,
        leads: new Set([p.leadId]),
        ultimaEm: p.em,
      });
      continue;
    }

    grupo.vezes += 1;
    grupo.leads.add(p.leadId);
    // A redação exibida é sempre a mais recente: é a que reflete como as
    // pessoas estão perguntando hoje, e é dela que sai o texto da resposta.
    if (p.em > grupo.ultimaEm) {
      grupo.ultimaEm = p.em;
      grupo.pergunta = semNumerosPessoais(p.texto).trim();
    }
  }

  return [...grupos.entries()]
    .map(([chave, g]) => ({
      chave,
      pergunta: g.pergunta,
      vezes: g.vezes,
      leads: g.leads.size,
      ultimaEm: g.ultimaEm,
    }))
    .sort(
      (a, b) =>
        b.leads - a.leads ||
        b.vezes - a.vezes ||
        b.ultimaEm.getTime() - a.ultimaEm.getTime(),
    )
    .slice(0, limite);
}

/**
 * Casa cada handoff de "não sei" com a pergunta que o provocou.
 *
 * Pura, e separada da leitura do banco, porque é aqui que mora a única decisão
 * sutil: *qual* mensagem é a pergunta. A resposta é a **última entrada até o
 * instante do handoff** — não a primeira da conversa, não a mais próxima em
 * valor absoluto. Uma entrada posterior ao handoff é outra coisa que o lead
 * escreveu depois, e atribuí-la ao handoff inverteria causa e efeito.
 */
export function perguntasQueGeraramOsHandoffs(
  handoffs: Array<{ leadId: string; em: Date }>,
  entradas: Array<{ leadId: string; texto: string | null; em: Date }>,
): { perguntas: Array<{ texto: string; leadId: string; em: Date }>; semPergunta: number } {
  const porLead = new Map<string, Array<{ texto: string; em: Date }>>();
  for (const m of entradas) {
    const texto = m.texto?.trim();
    if (!texto) continue; // áudio e imagem não têm pergunta em texto
    const lista = porLead.get(m.leadId) ?? [];
    lista.push({ texto, em: m.em });
    porLead.set(m.leadId, lista);
  }
  for (const lista of porLead.values()) {
    lista.sort((a, b) => a.em.getTime() - b.em.getTime());
  }

  const perguntas: Array<{ texto: string; leadId: string; em: Date }> = [];
  let semPergunta = 0;

  for (const h of handoffs) {
    const anteriores = (porLead.get(h.leadId) ?? []).filter(
      (m) => m.em.getTime() <= h.em.getTime(),
    );
    const ultima = anteriores.at(-1);
    if (!ultima) {
      semPergunta += 1;
      continue;
    }
    perguntas.push({ texto: ultima.texto, leadId: h.leadId, em: h.em });
  }

  return { perguntas, semPergunta };
}

/**
 * O caderno do período, lido do banco.
 *
 * Duas consultas, e nem uma a mais: os handoffs de "não sei", e as entradas dos
 * leads envolvidos. O cruzamento acontece em memória porque "a última mensagem
 * antes de cada handoff" é uma correlação linha a linha — em SQL viraria uma
 * subconsulta por handoff, e o painel do gerente não pode ficar lento no dia
 * movimentado, que é justamente o dia em que ele serve para alguma coisa.
 */
export async function cadernoDeLacunas(
  db: Cliente,
  params: { de: Date; ate: Date },
): Promise<CadernoDeLacunas> {
  const janela = { createdAt: { gte: params.de, lt: params.ate } };

  const [handoffs, atendimentosDaIa] = await Promise.all([
    db.leadHandoff.findMany({
      where: { ...janela, motivo: "INFORMACAO_NAO_CONFIRMADA" },
      select: { leadId: true, createdAt: true },
    }),
    db.leadMensagem.count({ where: { ...janela, direcao: "SAIDA", autor: "IA" } }),
  ]);

  // ⚠️ A distinção que o número sozinho apagaria: zero lacuna com o agente
  // trabalhando é notícia boa; zero lacuna com o agente parado não é notícia
  // nenhuma. Os dois desenhariam o mesmo "0" na tela.
  if (handoffs.length === 0 && atendimentosDaIa === 0) {
    return { medido: false, motivo: "semAtendimento" };
  }

  if (handoffs.length === 0) {
    return { medido: true, total: 0, semPerguntaRegistrada: 0, lista: [] };
  }

  const entradas = await db.leadMensagem.findMany({
    where: {
      leadId: { in: [...new Set(handoffs.map((h) => h.leadId))] },
      direcao: "ENTRADA",
      // Uma mensagem posterior ao fim da janela nunca pode ter causado um
      // handoff que aconteceu dentro dela.
      createdAt: { lt: params.ate },
    },
    select: { leadId: true, texto: true, createdAt: true },
  });

  const { perguntas, semPergunta } = perguntasQueGeraramOsHandoffs(
    handoffs.map((h) => ({ leadId: h.leadId, em: h.createdAt })),
    entradas.map((m) => ({ leadId: m.leadId, texto: m.texto, em: m.createdAt })),
  );

  return {
    medido: true,
    total: perguntas.length,
    semPerguntaRegistrada: semPergunta,
    lista: agruparLacunas(perguntas),
  };
}
