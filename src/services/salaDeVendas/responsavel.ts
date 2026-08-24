/**
 * QUEM ATENDE O LEAD AGORA.
 *
 * O documento 06 da v3 e a ficha 1.3 do catálogo dizem a mesma coisa:
 *
 *   "Assumir é ATÔMICO. Ao confirmar, o humano vira responsável e a IA silencia
 *    ANTES do próximo envio — com trava de banco e transação, não com boa
 *    intenção."
 *
 * ── A JANELA QUE ESTE ARQUIVO FECHA ──
 *
 * O jeito natural de escrever seria: ler o lead, conferir se está livre, e
 * escrever quem assumiu.
 *
 *     const lead = await prisma.siteLead.findUnique(...);
 *     if (lead.atendidoPor !== "HUMANO") { await prisma.siteLead.update(...) }
 *
 * Entre a leitura e a escrita cabe uma requisição inteira. Dois SDRs clicando
 * "assumir" no mesmo segundo passam os dois pela conferência e escrevem os dois.
 * O segundo sobrescreve o primeiro em silêncio: dois humanos donos da mesma
 * conversa, e o lead recebendo duas respostas diferentes.
 *
 * A janela é pequena — e é por isso que machuca. Ela só aparece quando a
 * operação está cheia, que é quando ninguém pode parar para investigar.
 *
 * Aqui a condição vai DENTRO da escrita (`updateMany` com o estado no `where`).
 * Dois pedidos disputam a mesma linha; um sai com `count: 1` e o outro com
 * `count: 0`. Quem perde recebe uma resposta clara, nunca um sucesso falso.
 *
 * É a mesma trava do handoff entre departamentos, já provada contra Postgres
 * real com dez pedidos simultâneos.
 */

import type { Prisma, PrismaClient, LeadAtendidoPor } from "@prisma/client";

type Cliente = PrismaClient | Prisma.TransactionClient;

// ── A máquina de estados, pura ────────────────────────────────────────────────

/**
 * A IA pode enviar mensagem para este lead?
 *
 * É a pergunta que precisa ser feita ANTES DE CADA ENVIO, não só ao começar a
 * conversa. O passo que evita a mensagem fantasma: a IA começou a redigir quando
 * o lead era dela e terminou quando já não era.
 */
export function iaPodeEnviar(estado: LeadAtendidoPor): boolean {
  // Só quando a IA é a responsável declarada. `NINGUEM` não basta: um lead sem
  // dono não autoriza ninguém a falar em nome da empresa.
  return estado === "IA";
}

/** De quem é o lead, em linguagem de tela. */
export function deQuemE(estado: LeadAtendidoPor): "ninguém" | "IA" | "humano" | "aguardando gente" {
  switch (estado) {
    case "IA":
      return "IA";
    case "HUMANO":
      return "humano";
    case "AGUARDANDO_HUMANO":
      return "aguardando gente";
    default:
      return "ninguém";
  }
}

/**
 * Estados a partir dos quais uma PESSOA pode assumir.
 *
 * Repare que `HUMANO` não está na lista: quem já tem dono humano não é assumido
 * por outro sem antes ser liberado. Roubar conversa de colega em silêncio produz
 * exatamente o defeito que a atomicidade existe para evitar.
 */
const ASSUMIVEIS: readonly LeadAtendidoPor[] = ["NINGUEM", "IA", "AGUARDANDO_HUMANO"];

export function podeSerAssumidoPorHumano(estado: LeadAtendidoPor): boolean {
  return ASSUMIVEIS.includes(estado);
}

// ── Assumir ───────────────────────────────────────────────────────────────────

export type ResultadoDeAssumir =
  | { ok: true; leadId: string }
  | { ok: false; causa: "naoExiste" }
  | {
      ok: false;
      causa: "jaTemDono";
      atendidoPor: LeadAtendidoPor;
      atendenteUserId: string | null;
    };

/**
 * Uma pessoa assume o lead. Atômico.
 *
 * Devolve `ok: false` com a causa em vez de lançar: perder a corrida não é erro
 * de programa, é resultado normal que a tela precisa saber explicar ("Fulano
 * assumiu primeiro").
 */
export async function assumirComoHumano(
  db: Cliente,
  params: { leadId: string; userId: string; agora?: Date },
): Promise<ResultadoDeAssumir> {
  const agora = params.agora ?? new Date();

  const alterados = await db.siteLead.updateMany({
    // A condição de estado vai DENTRO da escrita. Trocar isto por
    // `findUnique` + `if` + `update` reabre a janela de corrida, e nada mais
    // reclama — nem o compilador, nem os outros testes.
    where: { id: params.leadId, atendidoPor: { in: [...ASSUMIVEIS] } },
    data: {
      atendidoPor: "HUMANO",
      atendenteUserId: params.userId,
      atendenteDesde: agora,
      motivoDoPedido: null,
    },
  });

  if (alterados.count === 1) {
    await db.siteLeadInteraction.create({
      data: {
        leadId: params.leadId,
        tipo: "ASSUMIU_HUMANO",
        actor: params.userId,
        interna: true,
        nota: "Assumiu o atendimento. A IA para de enviar a partir daqui.",
      },
    });
    return { ok: true, leadId: params.leadId };
  }

  // Perdeu a corrida — ou o lead não existe. Só agora vale a pena ler, e a
  // leitura serve para EXPLICAR, não para decidir.
  const atual = await db.siteLead.findUnique({
    where: { id: params.leadId },
    select: { atendidoPor: true, atendenteUserId: true },
  });

  if (!atual) return { ok: false, causa: "naoExiste" };
  return {
    ok: false,
    causa: "jaTemDono",
    atendidoPor: atual.atendidoPor,
    atendenteUserId: atual.atendenteUserId,
  };
}

export type ResultadoDeDevolver =
  | { ok: true; leadId: string }
  | { ok: false; causa: "naoExiste" }
  | { ok: false; causa: "semObjetivo" }
  | { ok: false; causa: "naoEraSeu"; atendenteUserId: string | null };

/**
 * A pessoa devolve o lead para a IA, com objetivo escrito.
 *
 * O objetivo é obrigatório e não é burocracia: sem ele a IA retoma sem saber o
 * que se espera dela, e a chance de contradizer o que o humano prometeu é alta.
 *
 * A condição inclui `atendenteUserId`: só devolve quem estava atendendo. Sem
 * isso, um SDR poderia devolver o lead de outro sem que o dono soubesse.
 */
export async function devolverParaIA(
  db: Cliente,
  params: { leadId: string; userId: string; objetivo: string; agora?: Date },
): Promise<ResultadoDeDevolver> {
  const objetivo = params.objetivo?.trim();
  if (!objetivo) return { ok: false, causa: "semObjetivo" };

  const agora = params.agora ?? new Date();

  const alterados = await db.siteLead.updateMany({
    where: { id: params.leadId, atendidoPor: "HUMANO", atendenteUserId: params.userId },
    data: {
      atendidoPor: "IA",
      atendenteUserId: null,
      atendenteDesde: agora,
      motivoDoPedido: null,
    },
  });

  if (alterados.count === 1) {
    await db.siteLeadInteraction.create({
      data: {
        leadId: params.leadId,
        tipo: "DEVOLVEU_PARA_IA",
        actor: params.userId,
        interna: true,
        nota: `Devolvido para a IA. Objetivo: ${objetivo}`,
      },
    });
    return { ok: true, leadId: params.leadId };
  }

  const atual = await db.siteLead.findUnique({
    where: { id: params.leadId },
    select: { atendenteUserId: true },
  });

  if (!atual) return { ok: false, causa: "naoExiste" };
  return { ok: false, causa: "naoEraSeu", atendenteUserId: atual.atendenteUserId };
}

export type ResultadoDePedirHumano =
  | { ok: true; leadId: string }
  | { ok: false; causa: "naoExiste" }
  | { ok: false; causa: "semMotivo" }
  | { ok: false; causa: "naoEraDaIA"; atendidoPor: LeadAtendidoPor };

/**
 * A IA para e pede gente.
 *
 * O motivo é obrigatório: quem pegar a fila precisa saber por que a IA parou.
 * "Pediu humano" sem motivo obriga o SDR a ler a conversa inteira antes de
 * entender o que fazer — e num volume grande, isso é o mesmo que não avisar.
 *
 * O lead vai para `AGUARDANDO_HUMANO`, que é a fila mais importante da Sala: uma
 * venda em queda livre, invisível em qualquer lista organizada por etapa.
 */
export async function pedirHumano(
  db: Cliente,
  params: { leadId: string; motivo: string; agora?: Date },
): Promise<ResultadoDePedirHumano> {
  const motivo = params.motivo?.trim();
  if (!motivo) return { ok: false, causa: "semMotivo" };

  const agora = params.agora ?? new Date();

  const alterados = await db.siteLead.updateMany({
    where: { id: params.leadId, atendidoPor: { in: ["IA", "NINGUEM"] } },
    data: { atendidoPor: "AGUARDANDO_HUMANO", atendenteDesde: agora, motivoDoPedido: motivo },
  });

  if (alterados.count === 1) {
    await db.siteLeadInteraction.create({
      data: {
        leadId: params.leadId,
        tipo: "PEDIU_HUMANO",
        actor: "agente-sdr-ia",
        interna: true,
        nota: motivo,
      },
    });
    return { ok: true, leadId: params.leadId };
  }

  const atual = await db.siteLead.findUnique({
    where: { id: params.leadId },
    select: { atendidoPor: true },
  });

  if (!atual) return { ok: false, causa: "naoExiste" };
  return { ok: false, causa: "naoEraDaIA", atendidoPor: atual.atendidoPor };
}

// ── Tempo na fila ─────────────────────────────────────────────────────────────

export type EsperaNaFila =
  | { estado: "naoSeAplica" }
  | { estado: "naoMedido"; motivo: string }
  | { estado: "esperando"; horas: number };

/**
 * Há quanto tempo o lead espera por gente.
 *
 * Três estados, e o do meio é o que evita a mentira. Um lead em
 * `AGUARDANDO_HUMANO` sem `atendenteDesde` não esperou zero hora — não se sabe
 * há quanto tempo espera. Escrever `0` faria a fila parecer em dia.
 *
 * É a mesma regra do tipo `Medida` da Sala dos Agentes: não escrever zero
 * quando a resposta é "não sei".
 */
export function esperaPorGente(
  lead: { atendidoPor: LeadAtendidoPor; atendenteDesde: Date | null },
  agora: Date,
): EsperaNaFila {
  if (lead.atendidoPor !== "AGUARDANDO_HUMANO") return { estado: "naoSeAplica" };

  if (!lead.atendenteDesde) {
    return { estado: "naoMedido", motivo: "sem carimbo de quando entrou na fila" };
  }

  return {
    estado: "esperando",
    horas: (agora.getTime() - lead.atendenteDesde.getTime()) / 3_600_000,
  };
}
