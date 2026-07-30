/**
 * PrintJobLease — as regras de vida de uma comanda entre a fila e o papel.
 *
 * Nasceu de uma falha real: o restaurante parou de imprimir e ninguém
 * conseguia dizer por quê. O raio-x achou o buraco no `poll`, que marcava o job
 * como CLAIMED e ia embora. Nada, em lugar nenhum, devolvia CLAIMED para a
 * fila. Bastava o Carteiro ser fechado, o PC dormir, a resposta do poll se
 * perder no caminho ou o ack não ter internet — e a comanda ficava CLAIMED
 * para sempre. Sem papel, sem erro, sem ninguém ver.
 *
 * O Carteiro até dizia, num comentário, que "o FOOCCI re-tenta no próximo poll
 * se não receber o ack". O servidor nunca implementou isso. Este arquivo é a
 * implementação que faltava.
 *
 * Três decisões que sustentam o resto:
 *
 * 1. CLAIMED É EMPRÉSTIMO, NÃO ENTREGA. O job sai com prazo. Vencido o prazo
 *    sem ack, volta para a fila. Nenhum estado prende comanda para sempre.
 *
 * 2. A TENTATIVA CONTA NA SAÍDA, não no ack. Job que foi entregue e sumiu
 *    gastou tentativa igual — senão um Carteiro que engole tudo em silêncio
 *    reservaria a fila inteira para sempre, sem nunca estourar o contador.
 *
 * 3. FALHA TRANSITÓRIA NÃO MATA COMANDA. Papel acabando, impressora offline
 *    por dez segundos, driver travado: volta para a fila com um respiro que
 *    cresce. Só depois de esgotar as tentativas o job vira DEAD — e DEAD é
 *    para ser visto por gente, não para sumir.
 */

import { prisma } from "@/lib/prisma";
import type { PrintJob } from "@prisma/client";

/** Prazo do empréstimo. O Carteiro bate a cada 4s; 90s é folga larga. */
export const LEASE_MS = 90_000;

/** Quantas vezes uma comanda tenta antes de precisar de gente. */
export const MAX_ATTEMPTS = 5;

/**
 * O respiro entre uma tentativa e a próxima.
 *
 * Não é enfeite: sem ele, uma impressora sem papel receberia o mesmo job a
 * cada 4 segundos e queimaria as cinco tentativas em vinte segundos — antes de
 * qualquer humano ter chance de pôr papel. Com o respiro, as cinco tentativas
 * se espalham por uns seis minutos.
 */
export function backoffMs(attempts: number): number {
  const escada = [10_000, 30_000, 60_000, 120_000, 300_000];
  return escada[Math.min(Math.max(attempts, 1) - 1, escada.length - 1)] ?? 300_000;
}

export type ResultadoDaTentativa = "PENDING" | "DEAD";

/** Para onde vai um job que não imprimiu nesta tentativa. */
export function proximoEstado(attempts: number): ResultadoDaTentativa {
  return attempts >= MAX_ATTEMPTS ? "DEAD" : "PENDING";
}

/**
 * Devolve à fila os jobs cujo empréstimo venceu.
 *
 * Roda no próprio poll, e é de propósito: o poll é a única coisa que acontece
 * de segundo em segundo neste caminho. Pendurar o resgate num cron seria criar
 * uma segunda peça para manter — e o resgate só interessa quando existe um
 * Carteiro vivo para receber o job de volta.
 */
export async function resgatarJobsVencidos(restaurantId: string, agora = new Date()): Promise<number> {
  const vencidos = await prisma.printJob.findMany({
    where: {
      restaurantId,
      status:    "CLAIMED",
      claimedAt: { lt: new Date(agora.getTime() - LEASE_MS) },
    },
    select: { id: true, attempts: true },
  });
  if (vencidos.length === 0) return 0;

  const paraFila = vencidos.filter((j) => proximoEstado(j.attempts) === "PENDING");
  const paraDead = vencidos.filter((j) => proximoEstado(j.attempts) === "DEAD");

  await prisma.$transaction([
    ...paraFila.map((j) =>
      prisma.printJob.update({
        where: { id: j.id },
        data: {
          status:        "PENDING",
          nextAttemptAt: new Date(agora.getTime() + backoffMs(j.attempts)),
          error:         "O Carteiro pegou a comanda e não confirmou a impressão. Devolvida para a fila.",
        },
      }),
    ),
    ...(paraDead.length > 0
      ? [
          prisma.printJob.updateMany({
            where: { id: { in: paraDead.map((j) => j.id) } },
            data: {
              status: "DEAD",
              error:  `Não confirmou a impressão em ${MAX_ATTEMPTS} tentativas. Confira se o Carteiro está aberto e se a impressora aparece no Windows.`,
            },
          }),
        ]
      : []),
  ]);

  console.warn("[print] jobs resgatados do limbo", {
    restaurantId, devolvidos: paraFila.length, mortos: paraDead.length,
  });
  return vencidos.length;
}

/**
 * Empresta ao Carteiro os próximos jobs da fila.
 *
 * O `updateMany` condicionado a `status: "PENDING"` é a trava de corrida: se
 * dois polls chegarem juntos, só um consegue mover cada linha. O outro leva
 * lista vazia em vez de mandar a mesma comanda para a impressora duas vezes.
 */
export async function emprestarJobs(
  restaurantId: string,
  limite = 20,
  agora = new Date(),
): Promise<PrintJob[]> {
  const candidatos = await prisma.printJob.findMany({
    where: {
      restaurantId,
      status: "PENDING",
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: agora } }],
    },
    orderBy: { createdAt: "asc" },
    take: limite,
    select: { id: true },
  });
  if (candidatos.length === 0) return [];

  const ids = candidatos.map((c) => c.id);
  const movidos = await prisma.printJob.updateMany({
    where: { id: { in: ids }, status: "PENDING" },
    data:  { status: "CLAIMED", claimedAt: agora, attempts: { increment: 1 } },
  });
  if (movidos.count === 0) return [];

  return prisma.printJob.findMany({
    where:   { id: { in: ids }, status: "CLAIMED", claimedAt: agora },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * O Carteiro respondeu sobre um job.
 *
 * Sucesso encerra. Falha volta para a fila com respiro, até esgotar — aí vira
 * DEAD, que é o único jeito honesto de dizer "isto aqui precisa de alguém".
 */
export async function registrarAck(
  job: Pick<PrintJob, "id" | "attempts">,
  imprimiu: boolean,
  erro: string | null,
  agora = new Date(),
): Promise<"PRINTED" | ResultadoDaTentativa> {
  if (imprimiu) {
    await prisma.printJob.update({
      where: { id: job.id },
      data:  { status: "PRINTED", printedAt: agora, error: null, nextAttemptAt: null },
    });
    return "PRINTED";
  }

  const destino = proximoEstado(job.attempts);
  await prisma.printJob.update({
    where: { id: job.id },
    data: {
      status:    destino,
      printedAt: null,
      error:     (erro ?? "Falha na impressão.").slice(0, 500),
      nextAttemptAt: destino === "PENDING" ? new Date(agora.getTime() + backoffMs(job.attempts)) : null,
    },
  });
  return destino;
}

export interface FilaDeImpressao {
  naFila: number;
  comOCarteiro: number;
  impressas24h: number;
  travadas: { id: string; title: string; printerName: string; error: string | null; createdAt: Date }[];
}

/** O retrato da fila para a tela — inclusive o que precisa de gente. */
export async function lerFila(restaurantId: string, agora = new Date()): Promise<FilaDeImpressao> {
  const desde24h = new Date(agora.getTime() - 24 * 60 * 60 * 1000);
  const [naFila, comOCarteiro, impressas24h, travadas] = await Promise.all([
    prisma.printJob.count({ where: { restaurantId, status: "PENDING" } }),
    prisma.printJob.count({ where: { restaurantId, status: "CLAIMED" } }),
    prisma.printJob.count({ where: { restaurantId, status: "PRINTED", printedAt: { gte: desde24h } } }),
    prisma.printJob.findMany({
      where:   { restaurantId, status: "DEAD" },
      orderBy: { createdAt: "desc" },
      take:    20,
      select:  { id: true, title: true, printerName: true, error: true, createdAt: true },
    }),
  ]);
  return { naFila, comOCarteiro, impressas24h, travadas };
}

/** Recoloca na fila os jobs mortos — o "tentar de novo" da tela. */
export async function reenfileirarMortos(restaurantId: string, ids?: string[]): Promise<number> {
  const res = await prisma.printJob.updateMany({
    where: { restaurantId, status: "DEAD", ...(ids && ids.length > 0 ? { id: { in: ids } } : {}) },
    data:  { status: "PENDING", attempts: 0, nextAttemptAt: null, error: null },
  });
  return res.count;
}
