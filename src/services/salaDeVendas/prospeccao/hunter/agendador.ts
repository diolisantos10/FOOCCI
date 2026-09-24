/**
 * O AGENDADOR DA VARREDURA — a máquina que LIGA a descoberta.
 *
 * ── ⛔ POR QUE ESTE ARQUIVO É A METADE QUE FALTAVA ──────────────────────────
 *
 * Descoberta construída e nunca chamada é o defeito que esta casa mais repete:
 * o código existe, o teste passa, e a fila continua vazia porque nada dispara.
 * `descoberta.ts` sabe encher a fila; este arquivo é quem manda encher, todo
 * dia útil, sem ninguém clicar em nada.
 *
 * ── AS TRÊS COISAS QUE ELE COPIA DA RODADA DAS 9h, DE PROPÓSITO ─────────────
 *
 * Mesmo padrão de `prospeccao/agendador.ts`, porque padrão repetido é padrão
 * que alguém entende sem reler: tique de um minuto dentro do processo, hora
 * local de São Paulo, dias úteis, e **reserva atômica no banco** para que o
 * agendador interno e o cron de contingência nunca varram duas vezes o mesmo
 * dia.
 *
 * ── ⭐ E A ÚNICA COISA QUE ELE MUDA: A HORA ─────────────────────────────────
 *
 * 7h, e não 9h. A ordem importa e é a alma disto: a varredura precisa terminar
 * ANTES da rodada de abordagem, senão a fila que ela encheu só serve no dia
 * seguinte — e a rodada das 9h continuaria concluindo `filaAcabou` por mais um
 * dia inteiro.
 *
 * ── ⛔ O QUE ELE NÃO FAZ ────────────────────────────────────────────────────
 *
 * Não aborda, não liga a prospecção, não mexe em teto nem em janela. Se a
 * prospecção estiver desligada, a varredura enche a fila e **nada sai** — a
 * fila cheia com o interruptor desligado é um estoque, não um disparo.
 */

import type { PrismaClient, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { REGRA, agendaLocal } from "@/services/foocci-sdr/LeadContactSafety";
import { inicioDoDiaEmSaoPaulo } from "../selecao";
import { descobrirEEncherAFila, type ResultadoDaDescoberta } from "./descoberta";

type Cliente = PrismaClient | Prisma.TransactionClient;

const INTERVALO_MS = 60_000;

/**
 * Hora local (São Paulo) da varredura. 7h por padrão, e o padrão é a regra:
 * ela tem que caber antes das 9h da rodada de abordagem.
 * `FOOCCI_HUNTER_HORA` troca sem deploy; fora de 0–23 vale o padrão.
 */
export function horaDaVarredura(env: NodeJS.ProcessEnv = process.env): number {
  const n = parseInt((env.FOOCCI_HUNTER_HORA ?? "").trim(), 10);
  return Number.isInteger(n) && n >= 0 && n <= 23 ? n : 7;
}

export function ehHoraDaVarredura(agora: Date, hora: number = horaDaVarredura()): boolean {
  const local = agendaLocal(agora, REGRA.fusoHorario);
  if (!(REGRA.diasUteis as readonly number[]).includes(local.dia)) return false;
  return local.hora === hora;
}

export type ReservaDaVarredura =
  | { reservou: true }
  | { reservou: false; motivo: "jaVarreuHoje" | "semConfiguracao"; detalhe: string };

/**
 * Reserva atômica da varredura de hoje.
 *
 * ⚠️ O `updateMany` condicional é a trava inteira: quem consegue `count === 1`
 * ganhou o dia. Ler-decidir-gravar deixaria os dois disparadores lerem "ainda
 * não varreu" no mesmo segundo e varrerem juntos — o que gastaria duas vezes o
 * uso justo da fonte pública e criaria duas importações para a mesma varredura.
 */
export async function reservarVarreduraDoDia(
  db: Cliente,
  agora: Date,
  quem: string,
): Promise<ReservaDaVarredura> {
  const inicioDoDia = inicioDoDiaEmSaoPaulo(agora);

  const r = await db.prospeccaoConfig.updateMany({
    where: {
      id: "singleton",
      OR: [
        { ultimaDescobertaAutomaticaEm: null },
        { ultimaDescobertaAutomaticaEm: { lt: inicioDoDia } },
      ],
    },
    data: { ultimaDescobertaAutomaticaEm: agora, ultimaDescobertaAutomaticaPor: quem },
  });

  if (r.count === 1) return { reservou: true };

  const atual = await db.prospeccaoConfig.findUnique({
    where: { id: "singleton" },
    select: { ultimaDescobertaAutomaticaEm: true, ultimaDescobertaAutomaticaPor: true },
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
    motivo: "jaVarreuHoje",
    detalhe:
      `a varredura de hoje já foi reservada por ${atual.ultimaDescobertaAutomaticaPor ?? "?"}` +
      ` às ${atual.ultimaDescobertaAutomaticaEm?.toISOString() ?? "?"}`,
  };
}

/** O resumo que vai para o log e para a resposta do cron. */
export function resumoDaVarredura(r: ResultadoDaDescoberta): Record<string, unknown> {
  return {
    cidades: r.cidades,
    cidadesQueFalharam: r.cidadesQueFalharam,
    encontrados: r.encontrados,
    entraramNaFila: r.entraramNaFila,
    descartes: r.descartes,
    importacaoId: r.importacaoId,
  };
}

export interface UltimoTickDaVarredura {
  em: string;
  decisao: "varreu" | "jaVarreuHoje" | "semConfiguracao" | "foraDaHora" | "quebrou";
  detalhe?: string;
  varredura?: ReturnType<typeof resumoDaVarredura>;
}

export class AgendadorDaDescoberta {
  private static handle: ReturnType<typeof setInterval> | null = null;
  private static rodando = false;
  private static ultimo: UltimoTickDaVarredura | null = null;

  static estaAtivo(): boolean {
    return this.handle !== null;
  }

  static ultimoTick(): UltimoTickDaVarredura | null {
    return this.ultimo;
  }

  static start(): void {
    if (this.handle !== null) return;
    if (process.env.NODE_ENV !== "production") {
      console.log("[AgendadorDaDescoberta] não ligado — NODE_ENV não é 'production'", {
        NODE_ENV: process.env.NODE_ENV,
      });
      return;
    }
    console.log("[AgendadorDaDescoberta] ligado", {
      horaDaVarredura: horaDaVarredura(),
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

  /** Um tique, com relógio/banco/varredura injetáveis para teste. */
  static async tick(
    deps: {
      agora?: Date;
      db?: Cliente;
      varrer?: typeof descobrirEEncherAFila;
      hora?: number;
    } = {},
  ): Promise<UltimoTickDaVarredura> {
    const agora = deps.agora ?? new Date();
    const db = deps.db ?? prisma;
    const varrer = deps.varrer ?? descobrirEEncherAFila;

    if (this.rodando) {
      return {
        em: agora.toISOString(),
        decisao: "foraDaHora",
        detalhe: "tique anterior ainda rodando",
      };
    }
    if (!ehHoraDaVarredura(agora, deps.hora)) {
      return (this.ultimo = { em: agora.toISOString(), decisao: "foraDaHora" });
    }

    this.rodando = true;
    try {
      const reserva = await reservarVarreduraDoDia(db, agora, "agendador interno");
      if (!reserva.reservou) {
        console.info(`[AgendadorDaDescoberta] não varreu — ${reserva.detalhe}`);
        return (this.ultimo = {
          em: agora.toISOString(),
          decisao: reserva.motivo,
          detalhe: reserva.detalhe,
        });
      }

      console.info("[AgendadorDaDescoberta] ⭐ reservou a varredura de hoje — varrendo");
      const r = await varrer(db, { agora });
      const resumo = resumoDaVarredura(r);
      console.info("[AgendadorDaDescoberta] varredura concluída", resumo);
      return (this.ultimo = { em: agora.toISOString(), decisao: "varreu", varredura: resumo });
    } catch (e) {
      const detalhe = e instanceof Error ? e.message : String(e);
      console.error(
        "[AgendadorDaDescoberta] o tique quebrou DEPOIS da reserva — a varredura de hoje precisa de disparo manual",
        { detalhe },
      );
      return (this.ultimo = { em: agora.toISOString(), decisao: "quebrou", detalhe });
    } finally {
      this.rodando = false;
    }
  }
}
