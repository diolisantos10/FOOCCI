/**
 * PrismaAssinaturaMemory — a memória do anti-mesmice que sobrevive ao deploy.
 *
 * A versão em processo não serve em produção: o app roda em mais de uma
 * instância, então duas peças geradas ao mesmo tempo não se enxergariam e o
 * anti-mesmice viraria enfeite. Aqui a janela é do banco, compartilhada por
 * todo mundo e estável entre reinícios.
 *
 * Best-effort de propósito: banco fora do ar NUNCA derruba a esteira. Sem
 * memória o Variador só perde o histórico — continua escolhendo, e a peça sai.
 * Perder variedade é ruim; não entregar é pior.
 */

import { prisma } from "@/lib/prisma";
import type { AssinaturaMemory } from "./AssinaturaMemory";

/** Teto por chave. Acima disso as mais antigas são podadas. */
const TETO_POR_CHAVE = 60;

/** Poda 1 a cada N gravações — não precisa ser exato, só não crescer sem fim. */
const PODA_A_CADA = 20;

let gravacoes = 0;

export class PrismaAssinaturaMemory implements AssinaturaMemory {
  async recentes(chave: string, limite: number): Promise<string[]> {
    try {
      const linhas = await prisma.oficinaAssinatura.findMany({
        where: { chave },
        orderBy: { createdAt: "desc" },
        take: Math.max(1, limite),
        select: { assinatura: true },
      });
      return linhas.map((l) => l.assinatura);
    } catch (err) {
      console.warn("[Oficina] leitura da memória falhou:", err instanceof Error ? err.message : err);
      return [];
    }
  }

  async registrar(chave: string, assinatura: string): Promise<void> {
    try {
      // upsert: re-gastar a mesma combinação renova a data, em vez de duplicar —
      // assim ela volta pro fim da fila em vez de sumir da janela.
      await prisma.oficinaAssinatura.upsert({
        where: { oficina_assinatura_unica: { chave, assinatura } },
        create: { chave, assinatura },
        update: { createdAt: new Date() },
      });

      if (++gravacoes % PODA_A_CADA === 0) await this.podar(chave);
    } catch (err) {
      console.warn("[Oficina] gravação da memória falhou:", err instanceof Error ? err.message : err);
    }
  }

  /** Mantém só as mais recentes daquela chave. Falha aqui é irrelevante. */
  private async podar(chave: string): Promise<void> {
    try {
      const sobreviventes = await prisma.oficinaAssinatura.findMany({
        where: { chave },
        orderBy: { createdAt: "desc" },
        take: TETO_POR_CHAVE,
        select: { id: true },
      });
      if (sobreviventes.length < TETO_POR_CHAVE) return;
      await prisma.oficinaAssinatura.deleteMany({
        where: { chave, id: { notIn: sobreviventes.map((s) => s.id) } },
      });
    } catch {
      // poda é higiene, não correção — silêncio é aceitável aqui
    }
  }
}

export const prismaAssinaturaMemory = new PrismaAssinaturaMemory();
