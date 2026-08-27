/**
 * QUEM ATENDE — escolher o agente que pega o cliente que acabou de chegar.
 *
 * ── O BURACO QUE ISTO FECHA ─────────────────────────────────────────────────
 *
 * O CEO perguntou *"cadê o agente pra atender o lead?"* e a resposta honesta era:
 * ele existe e não atende ninguém. `iaAssumeSeEstaLivre` gravava
 * `atendidoPor: "IA"` com **`atendenteUserId: null`** — atendimento sem dono.
 *
 * O efeito não era só cosmético:
 *
 *  · a conversa dizia "IA" em vez de "Agente Maria", e o cliente falava com um
 *    rótulo em vez de com alguém;
 *  · nenhum agente tinha carteira, então "os números do agente" não existiam;
 *  · e o revezamento 24h que o CEO desenhou não tinha o que revezar — não se
 *    passa adiante uma conversa que não é de ninguém.
 *
 * ── A REGRA: QUEM ESTÁ MAIS LIVRE PEGA ──────────────────────────────────────
 *
 * Não é sorteio nem rodízio fixo. Conta quantos clientes ABERTOS cada agente já
 * tem e entrega ao que tem menos.
 *
 * Sorteio distribui igual **no total** e desigual **no momento** — e o momento é
 * o que importa numa fila: dois sorteios azarados seguidos põem quatro clientes
 * no mesmo agente enquanto outro está com zero. Rodízio fixo tem o mesmo defeito
 * quando um agente fica preso numa conversa longa: chega a vez dele de novo e
 * ele ainda está ocupado.
 *
 * ⚠️ Nada disto é sobre "esforço do robô" — um programa não cansa. É sobre o
 * **cliente**: conversas espalhadas entre agentes distintos mantêm cada linha do
 * tempo separada e legível, e é isso que permite a um humano assumir uma delas
 * depois sem herdar o novelo das outras.
 *
 * ── O EMPATE, E POR QUE ELE É RESOLVIDO PELA LISTA ──────────────────────────
 *
 * Todos com zero é o caso comum (Sala nova, madrugada vazia). Aí vence a ordem
 * da lista, que não é alfabética: é a ordem em que o time foi desenhado —
 * primeiro atendimento primeiro, reserva por último. Empate resolvido por acaso
 * daria um agente diferente a cada reinício e nenhum jeito de reproduzir um
 * problema relatado.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import { TIME_DE_AGENTES, PAPEL_DO_TIME } from "./timeDeAgentes";

type Cliente = PrismaClient | Prisma.TransactionClient;

/**
 * As situações em que o cliente ainda é responsabilidade de alguém.
 *
 * `NINGUEM` fica de fora de propósito: lead devolvido para a fila não conta como
 * carga de quem o devolveu — senão quem devolve trabalho é punido por devolver,
 * e a conta premia justamente quem segura conversa parada.
 */
const ABERTO = ["IA", "HUMANO", "AGUARDANDO_HUMANO"] as const;

export interface AgenteEscolhido {
  userId: string;
  nome: string;
}

/**
 * O agente do time com menos clientes abertos.
 *
 * `null` quando **nenhum** agente do time existe no banco ainda — e aí quem
 * chama segue sem dono, que é o comportamento antigo. Devolver `null` em vez de
 * lançar é deliberado: o cliente já escreveu, e é melhor um atendimento sem nome
 * do que nenhum atendimento.
 */
export async function escolherAgente(db: Cliente): Promise<AgenteEscolhido | null> {
  const emails = TIME_DE_AGENTES.map((a) => a.email);

  const noBanco = await db.internalUser.findMany({
    where: { email: { in: emails }, role: PAPEL_DO_TIME, isActive: true },
    select: { id: true, nome: true, email: true },
  });

  if (noBanco.length === 0) return null;

  const carga = await db.siteLead.groupBy({
    by: ["atendenteUserId"],
    where: {
      atendenteUserId: { in: noBanco.map((u) => u.id) },
      atendidoPor: { in: [...ABERTO] },
    },
    _count: { _all: true },
  });

  const quantos = new Map<string, number>();
  for (const linha of carga) {
    if (linha.atendenteUserId) quantos.set(linha.atendenteUserId, linha._count._all);
  }

  // A ordem da LISTA decide o empate, então percorre por ela e não pelo que o
  // banco devolveu — a ordem do banco não é garantida e mudaria o desempate a
  // cada consulta.
  let escolhido: AgenteEscolhido | null = null;
  let menor = Number.POSITIVE_INFINITY;

  for (const daLista of TIME_DE_AGENTES) {
    const u = noBanco.find((x) => x.email === daLista.email);
    if (!u) continue;

    const n = quantos.get(u.id) ?? 0;
    if (n < menor) {
      menor = n;
      escolhido = { userId: u.id, nome: u.nome };
    }
  }

  return escolhido;
}
