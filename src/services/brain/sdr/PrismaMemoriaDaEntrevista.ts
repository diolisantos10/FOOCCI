/**
 * PrismaMemoriaDaEntrevista — a entrevista que sobrevive ao deploy.
 *
 * A entrevista de um cliente leva dias e passa por várias conversas. Memória de
 * processo não serve: o app roda em mais de uma instância, então o turno de
 * amanhã cairia noutra máquina e a sondagem recomeçaria em branco — sem ninguém
 * perceber, que é o pior jeito de errar isto.
 *
 * Ao contrário da memória do anti-mesmice, aqui o erro NÃO é engolido. Se a
 * gravação falhar, quem chamou precisa saber: o registro do que foi perguntado é
 * o que autoriza a proposta a sair. Um "salvei" mentiroso reabre exatamente o
 * buraco que esta peça existe para fechar.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { EstadoDaSondagem } from "../oficina/Sondagem";
import type { MemoriaDaEntrevista } from "./MemoriaDaEntrevista";

function lerFicha(v: unknown): EstadoDaSondagem["ficha"] {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as EstadoDaSondagem["ficha"]) : {};
}

function lerLista(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function lerServicos(v: unknown): EstadoDaSondagem["servicos"] {
  return Array.isArray(v) ? (v as EstadoDaSondagem["servicos"]) : [];
}

export class PrismaMemoriaDaEntrevista implements MemoriaDaEntrevista {
  async ler(chave: string): Promise<EstadoDaSondagem | null> {
    const linha = await prisma.sdrEntrevista.findUnique({
      where: { chave },
      select: { ficha: true, perguntadas: true, servicos: true },
    });
    if (!linha) return null;
    return {
      ficha:       lerFicha(linha.ficha as unknown),
      perguntadas: lerLista(linha.perguntadas as unknown),
      servicos:    lerServicos(linha.servicos as unknown),
    };
  }

  async gravar(chave: string, estado: EstadoDaSondagem): Promise<void> {
    // O round-trip por JSON tira undefined e qualquer coisa não serializável —
    // o que o Prisma recusa em silêncio se passar direto.
    const dados = {
      ficha:       JSON.parse(JSON.stringify(estado.ficha       ?? {})) as Prisma.InputJsonValue,
      perguntadas: JSON.parse(JSON.stringify(estado.perguntadas ?? [])) as Prisma.InputJsonValue,
      servicos:    JSON.parse(JSON.stringify(estado.servicos    ?? [])) as Prisma.InputJsonValue,
    };
    await prisma.sdrEntrevista.upsert({
      where:  { chave },
      create: { chave, ...dados },
      update: dados,
    });
  }

  async apagar(chave: string): Promise<void> {
    await prisma.sdrEntrevista.deleteMany({ where: { chave } });
  }
}

export const prismaMemoriaDaEntrevista = new PrismaMemoriaDaEntrevista();
