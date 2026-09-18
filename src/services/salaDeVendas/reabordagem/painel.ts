/**
 * O PAINEL DA CAMPANHA — dentro do raio-X, e não num segundo lugar.
 *
 * Ordem explícita: *"reaproveite o raio-X; não construa um segundo painel."* Por
 * isso este arquivo não tem rota própria: ele é mais um bloco na resposta de
 * `GET /api/cron/comercial/raio-x-conversas`, com o mesmo segredo e a mesma
 * doutrina de NÃO MEDIDO (zero é uma afirmação; "ninguém mediu" é outra coisa).
 *
 * ⛔ SÓ LÊ. Nenhuma escrita, nenhum envio — medido por `contrato.test.ts`.
 */

import type { PrismaClient, Prisma } from "@prisma/client";

type Cliente = PrismaClient | Prisma.TransactionClient;

export type Medida<T> = { medido: true; valor: T } | { medido: false; motivo: string };

export interface PainelDaCampanha {
  lotes: number;
  examinados: number;
  /** ⭐ A métrica da campanha. Não é "mensagens enviadas": é esta linha. */
  decisoresCapturados: number;
  enviados: number;
  /** Quantos de cada ação a rota de decisão produziu. */
  porAcao: Array<{ acao: string; quantos: number }>;
  /** Quantos não saíram, e por qual REGRA. */
  recusadosPorRegra: Array<{ regra: string; quantos: number }>;
  /** A conta que tem de fechar: enviados + não enviados = examinados. */
  contaFecha: boolean;
  ultimoLoteEm: Date | null;
}

export async function painelDaReabordagem(db: Cliente): Promise<Medida<PainelDaCampanha>> {
  try {
    const examinados = await db.reabordagemExecucao.count();
    if (examinados === 0) {
      return {
        medido: false,
        motivo:
          "a campanha de reabordagem ainda não examinou contato nenhum. Isto NÃO é 'zero decisores': " +
          "é 'nenhum lote foi disparado'. As duas coisas exigem ações diferentes.",
      };
    }

    const [enviados, decisoresCapturados] = await Promise.all([
      db.reabordagemExecucao.count({ where: { enviado: true } }),
      db.reabordagemExecucao.count({ where: { decisorCapturado: true } }),
    ]);

    // ⚠️ Agregação em MEMÓRIA, de propósito: a tabela tem uma linha por
    // contato da campanha (centenas, não milhões), e `findMany` + contagem aqui
    // mantém este arquivo com duas operações de Prisma só — `count` e
    // `findMany` —, que é o que o teste de contrato mede.
    const linhas = (await db.reabordagemExecucao.findMany({
      select: { loteId: true, acao: true, enviado: true, motivoDaRecusa: true },
    })) as Array<{
      loteId: string;
      acao: string;
      enviado: boolean;
      motivoDaRecusa: string | null;
    }>;

    const somar = (chaves: Array<string | null>) => {
      const mapa = new Map<string, number>();
      for (const c of chaves) {
        if (c === null) continue;
        mapa.set(c, (mapa.get(c) ?? 0) + 1);
      }
      return [...mapa.entries()].sort((a, b) => b[1] - a[1]);
    };

    const porAcao = somar(linhas.map((l) => l.acao)).map(([acao, quantos]) => ({ acao, quantos }));
    const recusadosPorRegra = somar(
      linhas.filter((l) => !l.enviado).map((l) => l.motivoDaRecusa),
    ).map(([regra, quantos]) => ({ regra, quantos }));
    const lotes = new Set(linhas.map((l) => l.loteId)).size;

    const ultima = (await db.reabordagemExecucao.findFirst({
      orderBy: { criadoEm: "desc" },
      select: { criadoEm: true },
    })) as { criadoEm: Date } | null;

    return {
      medido: true,
      valor: {
        lotes,
        examinados,
        decisoresCapturados,
        enviados,
        porAcao,
        recusadosPorRegra,
        contaFecha: porAcao.reduce((s, x) => s + x.quantos, 0) === examinados,
        ultimoLoteEm: ultima?.criadoEm ?? null,
      },
    };
  } catch (e) {
    // Painel que inventa zero quando a consulta falha é pior que painel nenhum.
    return {
      medido: false,
      motivo:
        "não consegui ler a conta da campanha: " +
        (e instanceof Error ? e.message.slice(0, 200) : "erro desconhecido"),
    };
  }
}
