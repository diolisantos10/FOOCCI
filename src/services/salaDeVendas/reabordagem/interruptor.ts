/**
 * ⛔ O INTERRUPTOR DE PÂNICO — para tudo, no meio do lote.
 *
 * ── POR QUE ELE NÃO É UMA VARIÁVEL DE AMBIENTE ──────────────────────────────
 *
 * Variável de ambiente exige redeploy para mudar, e redeploy leva minutos. Um
 * freio que demora minutos não é freio: é um pedido. A parada mora no BANCO, e
 * a máquina a consulta ANTES DE CADA CONTATO — não uma vez por lote. É isso, e
 * só isso, que faz ela funcionar com lote em andamento: o lote não é atômico,
 * é uma sequência, e cada passo pergunta de novo.
 *
 * ── ⚠️ FAIL-CLOSED, E ESTA É A PARTE QUE IMPORTA ────────────────────────────
 *
 * Se a leitura desta linha falhar — banco fora, tabela ausente, o que for — a
 * resposta é **PARADO**. Não saber se mandaram parar é a mesma coisa que ter
 * mandado parar. O erro tolerável aqui é "a campanha parou sozinha"; o
 * intolerável é "continuou mandando porque não conseguiu ler o freio".
 */

import type { PrismaClient, Prisma } from "@prisma/client";

type Cliente = PrismaClient | Prisma.TransactionClient;

/** Uma linha só, e o id é constante: não existe "um interruptor por lote". */
export const ID_DO_INTERRUPTOR = "unico";

export type EstadoDoInterruptor =
  | { parado: false }
  | { parado: true; motivo: string; desde: Date | null; quemParou: string | null };

/**
 * A campanha pode andar?
 *
 * **Nunca lança.** Erro vira parada — que é o lado seguro.
 */
export async function conferirInterruptor(db: Cliente): Promise<EstadoDoInterruptor> {
  try {
    const linha = await db.reabordagemInterruptor.findUnique({
      where: { id: ID_DO_INTERRUPTOR },
      select: { paradoEm: true, motivo: true, quemParou: true },
    });

    if (linha?.paradoEm) {
      return {
        parado: true,
        motivo: linha.motivo ?? "parada pedida pelo comando",
        desde: linha.paradoEm,
        quemParou: linha.quemParou ?? null,
      };
    }
    return { parado: false };
  } catch (e) {
    return {
      parado: true,
      motivo:
        "não consegui LER o interruptor de pânico: " +
        (e instanceof Error ? e.message.slice(0, 200) : "erro desconhecido") +
        ". Não saber se mandaram parar é a mesma coisa que ter mandado parar.",
      desde: null,
      quemParou: null,
    };
  }
}

/** Puxa o freio. Idempotente: puxar duas vezes não muda nada além do motivo. */
export async function pararTudo(
  db: Cliente,
  p: { motivo: string; quemParou: string; agora?: Date },
): Promise<{ parado: true; desde: Date }> {
  const agora = p.agora ?? new Date();
  await db.reabordagemInterruptor.upsert({
    where: { id: ID_DO_INTERRUPTOR },
    create: {
      id: ID_DO_INTERRUPTOR,
      paradoEm: agora,
      motivo: p.motivo.slice(0, 500),
      quemParou: p.quemParou.slice(0, 200),
    },
    update: {
      paradoEm: agora,
      motivo: p.motivo.slice(0, 500),
      quemParou: p.quemParou.slice(0, 200),
    },
  });
  console.warn("[reabordagem/interruptor] PARADA TOTAL", {
    em: agora.toISOString(),
    quemParou: p.quemParou,
    motivo: p.motivo,
  });
  return { parado: true, desde: agora };
}

/**
 * Solta o freio.
 *
 * ⚠️ Ato SEPARADO e explícito de propósito. Se disparar o lote soltasse o freio
 * sozinho, o interruptor duraria até o próximo disparo distraído — e um freio
 * que a próxima ação desfaz não é freio.
 */
export async function retomar(
  db: Cliente,
  p: { quemRetomou: string; agora?: Date },
): Promise<{ parado: false }> {
  await db.reabordagemInterruptor.upsert({
    where: { id: ID_DO_INTERRUPTOR },
    create: { id: ID_DO_INTERRUPTOR, paradoEm: null, motivo: null, quemParou: null },
    update: { paradoEm: null, motivo: null, quemParou: null },
  });
  console.warn("[reabordagem/interruptor] campanha RETOMADA", {
    em: (p.agora ?? new Date()).toISOString(),
    quemRetomou: p.quemRetomou,
  });
  return { parado: false };
}
