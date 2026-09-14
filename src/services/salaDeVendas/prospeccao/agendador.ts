/**
 * O AGENDADOR DA RODADA DAS 9h — dentro do processo, medido, e com reserva.
 *
 * A rodada automática roda no próprio servidor (Railway) e usa reserva atômica
 * no banco para impedir duplicidade com o cron de contingência.
 *
 * O disparo não afrouxa nenhuma trava: fila, canal, teto, portão de lead e
 * pré-voo continuam obrigatórios. O pré-voo valida o mesmo conjunto de templates
 * APPROVED/liberados que o envio real pode escolher.
 */

import type { PrismaClient, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { REGRA, agendaLocal } from "@/services/foocci-sdr/LeadContactSafety";
import { inicioDoDiaEmSaoPaulo } from "./selecao";
import { abordarARodadaDoDia, type ResultadoDaRodada } from "./abordarDaFila";
import { canalDeVendasPronto } from "@/services/foocci-sdr/FoocciSalesChannel";
import { preVooDosModelosLiberados } from "@/services/foocci-sdr/preVooModelosLiberados";

type Cliente = PrismaClient | Prisma.TransactionClient;

/** A cada minuto: barato (uma leitura de relógio) e preciso o bastante. */
const INTERVALO_MS = 60_000;

/**
 * Hora do dia (São Paulo) em que a rodada automática dispara. 9h por padrão.
 * `FOOCCI_PROSPECCAO_HORA` troca sem deploy; fora de 0–23 vale o padrão.
 */
export function horaDaRodada(env: NodeJS.ProcessEnv = process.env): number {
  const n = parseInt((env.FOOCCI_PROSPECCAO_HORA ?? "").trim(), 10);
  return Number.isInteger(n) && n >= 0 && n <= 23 ? n : 9;
}

/**
 * É agora? Dia útil, e a hora local de São Paulo é a da rodada.
 * A reserva — não o minuto — impede disparo duplicado.
 */
export function ehHoraDaRodada(agora: Date, hora: number = horaDaRodada()): boolean {
  const local = agendaLocal(agora, REGRA.fusoHorario);
  if (!(REGRA.diasUteis as readonly number[]).includes(local.dia)) return false;
  return local.hora === hora;
}

export type Reserva =
  | { reservou: true }
  | { reservou: false; motivo: "jaRodouHoje" | "semConfiguracao"; detalhe: string };

/** Reserva atômica da rodada automática de hoje. */
export async function reservarRodadaAutomaticaDoDia(
  db: Cliente,
  agora: Date,
  quem: string,
): Promise<Reserva> {
  const inicioDoDia = inicioDoDiaEmSaoPaulo(agora);

  const r = await db.prospeccaoConfig.updateMany({
    where: {
      id: "singleton",
      OR: [{ ultimaRodadaAutomaticaEm: null }, { ultimaRodadaAutomaticaEm: { lt: inicioDoDia } }],
    },
    data: { ultimaRodadaAutomaticaEm: agora, ultimaRodadaAutomaticaPor: quem },
  });

  if (r.count === 1) return { reservou: true };

  const atual = await db.prospeccaoConfig.findUnique({
    where: { id: "singleton" },
    select: { ultimaRodadaAutomaticaEm: true, ultimaRodadaAutomaticaPor: true },
  });

  if (!atual) {
    return {
      reservou: false,
      motivo: "semConfiguracao",
      detalhe: "prospeccao_config não existe — a prospecção nunca foi ligada",
    };
  }

  return {
    reservou: false,
    motivo: "jaRodouHoje",
    detalhe:
      `a rodada automática de hoje já foi reservada por ${atual.ultimaRodadaAutomaticaPor ?? "?"}` +
      ` às ${atual.ultimaRodadaAutomaticaEm?.toISOString() ?? "?"}`,
  };
}

/** Quantos itens saíram por cada motivo — o mesmo resumo da rota de cron. */
export function resumoDaRodada(r: ResultadoDaRodada): Record<string, unknown> {
  const porMotivo: Record<string, number> = {};
  const exemplo: Record<string, string> = {};
  for (const linha of r.extrato) {
    const chave = linha.ok ? "ok" : linha.motivo ?? "(sem motivo)";
    porMotivo[chave] = (porMotivo[chave] ?? 0) + 1;
    if (!linha.ok && linha.motivo && linha.detalhe && exemplo[linha.motivo] === undefined) {
      exemplo[linha.motivo] = linha.detalhe;
    }
  }
  return {
    abordados: r.abordados,
    pulados: r.pulados,
    parouPor: r.parouPor,
    falha: r.falha,
    porMotivo,
    exemploPorMotivo: exemplo,
  };
}

export interface UltimoTick {
  em: string;
  decisao: "rodou" | "jaRodouHoje" | "semConfiguracao" | "foraDaHora" | "quebrou";
  detalhe?: string;
  rodada?: ReturnType<typeof resumoDaRodada>;
}

export class AgendadorDaProspeccao {
  private static handle: ReturnType<typeof setInterval> | null = null;
  private static rodando = false;
  private static ultimo: UltimoTick | null = null;

  static estaAtivo(): boolean {
    return this.handle !== null;
  }

  static ultimoTick(): UltimoTick | null {
    return this.ultimo;
  }

  static start(): void {
    if (this.handle !== null) return;
    if (process.env.NODE_ENV !== "production") {
      console.log("[AgendadorDaProspeccao] não ligado — NODE_ENV não é 'production'", {
        NODE_ENV: process.env.NODE_ENV,
      });
      return;
    }
    console.log("[AgendadorDaProspeccao] ligado", {
      horaDaRodada: horaDaRodada(),
      fuso: REGRA.fusoHorario,
      intervaloMs: INTERVALO_MS,
    });
    this.handle = setInterval(() => void this.tick(), INTERVALO_MS);
  }

  static stop(): void {
    if (this.handle !== null) {
      clearInterval(this.handle);
      this.handle = null;
    }
  }

  /** Um tick, com relógio/banco/rodada injetáveis para teste. */
  static async tick(
    deps: {
      agora?: Date;
      db?: Cliente;
      rodada?: typeof abordarARodadaDoDia;
      hora?: number;
    } = {},
  ): Promise<UltimoTick> {
    const agora = deps.agora ?? new Date();
    const db = deps.db ?? prisma;
    const rodada = deps.rodada ?? abordarARodadaDoDia;

    if (this.rodando) {
      return { em: agora.toISOString(), decisao: "foraDaHora", detalhe: "tick anterior ainda rodando" };
    }
    if (!ehHoraDaRodada(agora, deps.hora)) {
      return (this.ultimo = { em: agora.toISOString(), decisao: "foraDaHora" });
    }

    this.rodando = true;
    try {
      const reserva = await reservarRodadaAutomaticaDoDia(db, agora, "agendador interno");
      if (!reserva.reservou) {
        console.info(`[AgendadorDaProspeccao] não rodou — ${reserva.detalhe}`);
        return (this.ultimo = { em: agora.toISOString(), decisao: reserva.motivo, detalhe: reserva.detalhe });
      }

      console.info("[AgendadorDaProspeccao] ⭐ reservou a rodada automática de hoje — rodando");
      const r = await rodada(db, {
        autor: "SISTEMA",
        canalPronto: canalDeVendasPronto(),
        preVoo: () => preVooDosModelosLiberados(db),
        agora,
      });
      const resumo = resumoDaRodada(r);
      console.info("[AgendadorDaProspeccao] rodada concluída", resumo);
      return (this.ultimo = { em: agora.toISOString(), decisao: "rodou", rodada: resumo });
    } catch (e) {
      const detalhe = e instanceof Error ? e.message : String(e);
      console.error("[AgendadorDaProspeccao] o tick quebrou DEPOIS da reserva — a rodada de hoje precisa de disparo manual", { detalhe });
      return (this.ultimo = { em: agora.toISOString(), decisao: "quebrou", detalhe });
    } finally {
      this.rodando = false;
    }
  }
}
