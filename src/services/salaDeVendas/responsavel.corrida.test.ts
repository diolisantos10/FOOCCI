import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { assumirComoHumano, devolverParaIA, pedirHumano } from "./responsavel";

/**
 * DOIS SDRs CLICANDO "ASSUMIR" NO MESMO SEGUNDO.
 *
 * `responsavel.test.ts` prova que a condição está dentro do `where`. Isso é o
 * formato da consulta — não é prova de que o banco realmente serializa. Um banco
 * mockado responde o que mandarem responder.
 *
 * Este arquivo dispara os pedidos ao mesmo tempo, em conexões diferentes, e
 * conta quantos venceram. Se alguém trocar a escrita condicional por
 * leitura-e-escrita, os testes mockados podem até ser reescritos junto — este
 * só passa se a propriedade for real.
 *
 *   SALA_VENDAS_TEST_DB=postgresql://... npx vitest run responsavel.corrida
 */

const URL_TESTE = process.env.SALA_VENDAS_TEST_DB;
const rodar = URL_TESTE ? describe : describe.skip;

if (!URL_TESTE) {
  // eslint-disable-next-line no-console
  console.warn(
    "[responsavel.corrida] pulado: SALA_VENDAS_TEST_DB não definida. " +
      "A atomicidade do 'assumir' NÃO foi verificada contra banco real nesta execução.",
  );
}

rodar("quem assume o lead quando dois pedem junto", () => {
  let prisma: PrismaClient;
  const marca = `sv-${Date.now()}`;
  const pessoas: string[] = [];

  beforeAll(async () => {
    const { PrismaClient: Cliente } = await import("@prisma/client");
    prisma = new Cliente({ datasources: { db: { url: URL_TESTE } } });

    for (let i = 0; i < 12; i++) {
      const u = await prisma.internalUser.create({
        data: { email: `${marca}-${i}@foocci.test`, nome: `SDR ${i}`, role: "AGENTE_HUMANO" },
      });
      pessoas.push(u.id);
    }
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.siteLeadInteraction.deleteMany({ where: { lead: { nome: { startsWith: marca } } } });
    await prisma.siteLead.deleteMany({ where: { nome: { startsWith: marca } } });
    await prisma.internalUser.deleteMany({ where: { email: { startsWith: marca } } });
    await prisma.$disconnect();
  });

  async function novoLead(atendidoPor: "NINGUEM" | "IA" | "AGUARDANDO_HUMANO" = "IA") {
    return prisma.siteLead.create({
      data: { nome: `${marca}-lead`, whatsapp: "5511999999999", atendidoPor },
    });
  }

  it("exatamente um SDR vence — e o outro sabe que perdeu", async () => {
    const lead = await novoLead();

    const [a, b] = await Promise.all([
      assumirComoHumano(prisma, { leadId: lead.id, userId: pessoas[0]! }),
      assumirComoHumano(prisma, { leadId: lead.id, userId: pessoas[1]! }),
    ]);

    expect([a, b].filter((r) => r.ok)).toHaveLength(1);

    const perdedor = [a, b].find((r) => !r.ok)!;
    if (!perdedor.ok) expect(perdedor.causa).toBe("jaTemDono");
  });

  it("o banco guarda UM atendente, não o último que escreveu", async () => {
    const lead = await novoLead();

    await Promise.all([
      assumirComoHumano(prisma, { leadId: lead.id, userId: pessoas[0]! }),
      assumirComoHumano(prisma, { leadId: lead.id, userId: pessoas[1]! }),
    ]);

    const depois = await prisma.siteLead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(depois.atendidoPor).toBe("HUMANO");
    expect([pessoas[0], pessoas[1]]).toContain(depois.atendenteUserId);
  });

  it("o histórico registra UM 'assumiu', não dois", async () => {
    const lead = await novoLead();

    await Promise.all([
      assumirComoHumano(prisma, { leadId: lead.id, userId: pessoas[0]! }),
      assumirComoHumano(prisma, { leadId: lead.id, userId: pessoas[1]! }),
    ]);

    const eventos = await prisma.siteLeadInteraction.findMany({
      where: { leadId: lead.id, tipo: "ASSUMIU_HUMANO" },
    });
    expect(eventos).toHaveLength(1);
  });

  it("dez SDRs ao mesmo tempo continuam produzindo um atendente só", async () => {
    // Dois podem passar por sorte. Dez expõem a janela se ela existir.
    const lead = await novoLead();

    const r = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        assumirComoHumano(prisma, { leadId: lead.id, userId: pessoas[i]! }),
      ),
    );

    expect(r.filter((x) => x.ok)).toHaveLength(1);
  });

  it("assumir e a IA pedir gente ao mesmo tempo terminam num estado coerente", async () => {
    // ── POR QUE AQUI OS DOIS PODEM VENCER, E ISSO ESTÁ CERTO ──
    //
    // A primeira versão deste teste exigia "um dos dois, nunca os dois" — e
    // reprovou. Investigando, o defeito era do teste.
    //
    // O Postgres serializa a escrita na mesma linha: o segundo `updateMany`
    // espera o primeiro e reavalia o `where` contra a linha NOVA. Se o pedido da
    // IA chega primeiro, o lead vira AGUARDANDO_HUMANO — e AGUARDANDO_HUMANO é
    // exatamente um dos estados de onde um humano PODE assumir.
    //
    // Ou seja: a IA pediu gente e a gente pegou. É a sequência que a Sala existe
    // para produzir, não uma corrida perdida.
    //
    // O que NÃO pode acontecer é o que este teste realmente verifica: o lead
    // acabar sem dono, com dono errado, ou com o motivo do pedido pendurado
    // depois de alguém já ter assumido.
    const lead = await novoLead();

    const [assumiu, pediu] = await Promise.all([
      assumirComoHumano(prisma, { leadId: lead.id, userId: pessoas[0]! }),
      pedirHumano(prisma, { leadId: lead.id, motivo: "quer negociar" }),
    ]);

    // Pelo menos um tem que ter efeito — perder os dois seria o lead sumindo.
    expect([assumiu.ok, pediu.ok].some(Boolean)).toBe(true);

    const depois = await prisma.siteLead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(["HUMANO", "AGUARDANDO_HUMANO"]).toContain(depois.atendidoPor);

    if (depois.atendidoPor === "HUMANO") {
      // Um dono, e é quem assumiu. Nunca dois.
      expect(depois.atendenteUserId).toBe(pessoas[0]);
      // E o motivo do pedido não fica de resto: a fila não mostra um lead que
      // já tem dono.
      expect(depois.motivoDoPedido).toBeNull();
    } else {
      // Ficou na fila: então ninguém assumiu, e o motivo está lá para quem pegar.
      expect(depois.atendenteUserId).toBeNull();
      expect(depois.motivoDoPedido).toBe("quer negociar");
    }
  });

  it("nunca existem dois donos humanos, mesmo com pedido da IA no meio", async () => {
    // A invariante que realmente importa, atacada de todos os lados ao mesmo
    // tempo: cinco SDRs assumindo enquanto a IA pede gente duas vezes.
    const lead = await novoLead();

    await Promise.all([
      ...Array.from({ length: 5 }, (_, i) =>
        assumirComoHumano(prisma, { leadId: lead.id, userId: pessoas[i]! }),
      ),
      pedirHumano(prisma, { leadId: lead.id, motivo: "a" }),
      pedirHumano(prisma, { leadId: lead.id, motivo: "b" }),
    ]);

    const depois = await prisma.siteLead.findUniqueOrThrow({ where: { id: lead.id } });

    if (depois.atendidoPor === "HUMANO") {
      // Um id só, e ele é de um dos cinco. Não há estado "dois donos" possível.
      expect(pessoas.slice(0, 5)).toContain(depois.atendenteUserId);
    }

    // E o histórico nunca mostra dois "assumiu" para a mesma conversa.
    const assumidas = await prisma.siteLeadInteraction.count({
      where: { leadId: lead.id, tipo: "ASSUMIU_HUMANO" },
    });
    expect(assumidas).toBeLessThanOrEqual(1);
  });

  it("um SDR não devolve o lead que é de outro", async () => {
    const lead = await novoLead();
    await assumirComoHumano(prisma, { leadId: lead.id, userId: pessoas[0]! });

    const r = await devolverParaIA(prisma, {
      leadId: lead.id,
      userId: pessoas[1]!,
      objetivo: "tentando devolver o que não é meu",
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.causa).toBe("naoEraSeu");

    const depois = await prisma.siteLead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(depois.atendenteUserId).toBe(pessoas[0]);
  });

  it("o lead que a IA devolveu pode ser assumido — é a fila que mais importa", async () => {
    const lead = await novoLead("AGUARDANDO_HUMANO");

    const r = await assumirComoHumano(prisma, { leadId: lead.id, userId: pessoas[0]! });
    expect(r.ok).toBe(true);

    const depois = await prisma.siteLead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(depois.atendidoPor).toBe("HUMANO");
    // O motivo do pedido foi limpo: a fila não fica com resto.
    expect(depois.motivoDoPedido).toBeNull();
  });

  it("o ciclo completo IA → humano → IA preserva o histórico inteiro", async () => {
    // "Nenhuma transferência pode perder histórico ou contexto" — critério 9.
    const lead = await novoLead();

    await pedirHumano(prisma, { leadId: lead.id, motivo: "pediu falar com gente" });
    await assumirComoHumano(prisma, { leadId: lead.id, userId: pessoas[0]! });
    await devolverParaIA(prisma, {
      leadId: lead.id,
      userId: pessoas[0]!,
      objetivo: "confirmar o endereço e agendar",
    });

    const historico = await prisma.siteLeadInteraction.findMany({
      where: { leadId: lead.id },
      orderBy: { createdAt: "asc" },
    });

    expect(historico.map((h) => h.tipo)).toEqual([
      "PEDIU_HUMANO",
      "ASSUMIU_HUMANO",
      "DEVOLVEU_PARA_IA",
    ]);
    // Os três são internos: o lead não vê a negociação interna sobre ele.
    expect(historico.every((h) => h.interna)).toBe(true);
    // E o objetivo escrito sobreviveu à devolução.
    expect(historico[2]!.nota).toContain("confirmar o endereço");
  });
});
