import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { aceitarHandoff, recusarHandoff } from "./handoff";

/**
 * A CORRIDA DE VERDADE, CONTRA POSTGRES DE VERDADE.
 *
 * `handoff.test.ts` prova que a condição está dentro do `where`. Isso é o
 * formato da consulta — não é prova de que o banco realmente serializa dois
 * aceites simultâneos. Um banco mockado responde o que mandarem responder.
 *
 * Este arquivo dispara os dois aceites ao mesmo tempo, em conexões diferentes, e
 * conta quantos venceram. Se um dia alguém trocar a escrita condicional por
 * leitura-e-escrita, os testes mockados podem até ser reescritos junto — este
 * aqui só passa se a propriedade for real.
 *
 *   createdb foocci_teste
 *   psql -d foocci_teste -f prisma/migrations/<...>/migration.sql   (as três)
 *   HANDOFF_TEST_DB=postgresql://... npx vitest run handoff.corrida
 */

const URL_TESTE = process.env.HANDOFF_TEST_DB;
const rodar = URL_TESTE ? describe : describe.skip;

if (!URL_TESTE) {
  // eslint-disable-next-line no-console
  console.warn(
    "[handoff.corrida] pulado: HANDOFF_TEST_DB não definida. " +
      "A atomicidade do aceite NÃO foi verificada contra banco real nesta execução.",
  );
}

rodar("dois aceites simultâneos, um handoff", () => {
  let prisma: PrismaClient;
  const marca = `corrida-${Date.now()}`;
  let origemId = "";
  let destinoId = "";
  /** Pessoas de verdade: `aceitoPorId` tem chave estrangeira, e ela é certa —
   *  um aceite tem que apontar para alguém que existe. */
  const pessoas: string[] = [];

  beforeAll(async () => {
    const { PrismaClient: Cliente } = await import("@prisma/client");
    prisma = new Cliente({ datasources: { db: { url: URL_TESTE } } });

    const origem = await prisma.department.upsert({
      where: { slug: `${marca}-origem` },
      update: {},
      create: { numero: 901, slug: `${marca}-origem`, nome: "Origem", missao: "teste" },
    });
    const destino = await prisma.department.upsert({
      where: { slug: `${marca}-destino` },
      update: {},
      create: { numero: 902, slug: `${marca}-destino`, nome: "Destino", missao: "teste" },
    });
    origemId = origem.id;
    destinoId = destino.id;

    for (let i = 0; i < 12; i++) {
      const u = await prisma.internalUser.create({
        data: { email: `${marca}-${i}@foocci.test`, nome: `Pessoa ${i}`, role: "AGENTE_HUMANO" },
      });
      pessoas.push(u.id);
    }
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.handoff.deleteMany({ where: { origemDepartmentId: origemId } });
    await prisma.internalUser.deleteMany({ where: { email: { startsWith: marca } } });
    await prisma.department.deleteMany({ where: { slug: { startsWith: marca } } });
    await prisma.$disconnect();
  });

  async function novoHandoff() {
    return prisma.handoff.create({
      data: {
        origemDepartmentId: origemId,
        destinoDepartmentId: destinoId,
        resumo: "corrida",
        entregaveis: ["x"],
      },
    });
  }

  it("exatamente um aceite vence — e o outro sabe que perdeu", async () => {
    const h = await novoHandoff();

    const [a, b] = await Promise.all([
      aceitarHandoff(prisma, { handoffId: h.id, aceitoPorId: pessoas[0]! }),
      aceitarHandoff(prisma, { handoffId: h.id, aceitoPorId: pessoas[1]! }),
    ]);

    const vencedores = [a, b].filter((r) => r.ok);
    expect(vencedores).toHaveLength(1);

    const perdedor = [a, b].find((r) => !r.ok)!;
    expect(perdedor.ok).toBe(false);
    if (!perdedor.ok) expect(perdedor.causa).toBe("jaResolvido");
  });

  it("o banco guarda UM dono, não o último que escreveu", async () => {
    const h = await novoHandoff();

    await Promise.all([
      aceitarHandoff(prisma, { handoffId: h.id, aceitoPorId: pessoas[0]! }),
      aceitarHandoff(prisma, { handoffId: h.id, aceitoPorId: pessoas[1]! }),
    ]);

    const depois = await prisma.handoff.findUniqueOrThrow({ where: { id: h.id } });
    expect(depois.status).toBe("ACEITO");
    expect([pessoas[0], pessoas[1]]).toContain(depois.aceitoPorId);
  });

  it("a linha do tempo registra UM aceite, não dois", async () => {
    const h = await novoHandoff();

    await Promise.all([
      aceitarHandoff(prisma, { handoffId: h.id, aceitoPorId: pessoas[0]! }),
      aceitarHandoff(prisma, { handoffId: h.id, aceitoPorId: pessoas[1]! }),
    ]);

    const eventos = await prisma.domainEvent.findMany({
      where: { entidade: "Handoff", entidadeId: h.id, tipo: "handoff.aceito" },
    });
    expect(eventos).toHaveLength(1);
  });

  it("dez aceites ao mesmo tempo continuam produzindo um dono só", async () => {
    // Dois podem passar por sorte. Dez expõem a janela se ela existir.
    const h = await novoHandoff();

    const resultados = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        aceitarHandoff(prisma, { handoffId: h.id, aceitoPorId: pessoas[i]! }),
      ),
    );

    expect(resultados.filter((r) => r.ok)).toHaveLength(1);
  });

  it("aceitar e recusar ao mesmo tempo: um dos dois, nunca os dois", async () => {
    const h = await novoHandoff();

    const [aceite, recusa] = await Promise.all([
      aceitarHandoff(prisma, { handoffId: h.id, aceitoPorId: pessoas[0]! }),
      recusarHandoff(prisma, { handoffId: h.id, motivo: "faltou contrato" }),
    ]);

    expect([aceite.ok, recusa.ok].filter(Boolean)).toHaveLength(1);

    const depois = await prisma.handoff.findUniqueOrThrow({ where: { id: h.id } });
    expect(["ACEITO", "RECUSADO"]).toContain(depois.status);
  });

  it("a linha do tempo recusa UPDATE — a trava é do banco, não do código", async () => {
    const h = await novoHandoff();
    await aceitarHandoff(prisma, { handoffId: h.id, aceitoPorId: pessoas[0]! });

    const evento = await prisma.domainEvent.findFirstOrThrow({
      where: { entidade: "Handoff", entidadeId: h.id },
    });

    await expect(
      prisma.domainEvent.update({ where: { id: evento.id }, data: { tipo: "outra.coisa" } }),
    ).rejects.toThrow();

    await expect(
      prisma.domainEvent.delete({ where: { id: evento.id } }),
    ).rejects.toThrow();
  });
});
