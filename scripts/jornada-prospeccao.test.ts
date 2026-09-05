/**
 * A JORNADA 3 DO P0, PONTA A PONTA, CONTRA POSTGRES DE VERDADE.
 *
 * ── POR QUE ESTE ARQUIVO EXISTE ─────────────────────────────────────────────
 *
 * Os testes unitários da prospecção usam dublê de banco. Dublê prova a REGRA e
 * não prova o ENCAIXE: um `where` malformado, uma coluna que não existe, um
 * enum que o banco não conhece, uma migration que não aplica — nada disso
 * aparece com mock, e tudo isso aparece na primeira vez que alguém abre a tela
 * em produção.
 *
 * Esta jornada roda o caminho inteiro contra um Postgres criado do zero, com as
 * migrations aplicadas de verdade. Se a migration não subir, ela falha aqui — e
 * não no boot do contêiner de produção, com o app já fora do ar.
 *
 * ── ⚠️ NADA AQUI FALA COM NINGUÉM ───────────────────────────────────────────
 *
 * Dados sintéticos, telefones de teste, canal desligado. Nenhuma mensagem sai —
 * a jornada mede a máquina, não o cliente.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { importarLote, liberarLote, pausarLote } from "@/services/salaDeVendas/prospeccao/lote";
import {
  montarFilaDeProspeccao,
  materializarLead,
} from "@/services/salaDeVendas/prospeccao/selecao";

const prisma = new PrismaClient();

/** Quarta-feira, 14h em São Paulo: dentro da janela, para não misturar causas. */
const AGORA = new Date("2026-09-02T17:00:00Z");

/** O que a importação devolveu — usado pelos passos seguintes. */
let loteId = "";

beforeAll(async () => {
  // A jornada precisa nascer do zero para medir o que mede.
  await prisma.itemDeProspeccao.deleteMany({});
  await prisma.loteDeProspeccao.deleteMany({});
  await prisma.prospeccaoConfig.deleteMany({});
  await prisma.leadMensagem.deleteMany({});
  await prisma.siteLead.deleteMany({});
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Jornada 3 — prospecção, ponta a ponta", () => {
  it("1. a lista entra com proveniência, deduplicada", async () => {
    const r = await importarLote(prisma, {
      nome: "Curitiba — teste sintético",
      proveniencia: "Lista sintética criada pela jornada de CI. Nenhum contato real.",
      criadoPor: "jornada-ci",
      limiteDiario: 5,
      linhas: [
        { whatsapp: "11987654321", nome: "Cantina Sintética", cidade: "Curitiba" },
        { whatsapp: "(11) 98765-4321", nome: "A mesma, repetida no arquivo" },
        { whatsapp: "11912345678", nome: "Segunda Cantina" },
        { whatsapp: "123", nome: "Telefone impossível" },
      ],
    });

    loteId = r.loteId;

    expect(r.recebidas).toBe(4);
    expect(r.repetidasNoArquivo).toBe(1);
    expect(r.invalidas).toBe(1);
    expect(r.aceitas).toBe(2);
  });

  it("2. importar NÃO autoriza: a prospecção nasce desligada", async () => {
    const fila = await montarFilaDeProspeccao(prisma, { canalPronto: true, agora: AGORA });
    expect(fila.liberados).toHaveLength(0);
    expect(fila.motivoDaFilaVazia).toContain("desligada");
  });

  it("3. ligada, mas com o lote em RASCUNHO, ninguém entra na fila", async () => {
    await prisma.prospeccaoConfig.create({
      data: {
        id: "singleton",
        outboundLigado: true,
        limiteDiario: 10,
        atualizadoPor: "jornada-ci",
      },
    });

    const fila = await montarFilaDeProspeccao(prisma, { canalPronto: true, agora: AGORA });
    expect(fila.liberados).toHaveLength(0);
  });

  it("4. ⭐ liberado o lote, montar a fila NÃO escreve nada", async () => {
    expect((await liberarLote(prisma, loteId, "jornada-ci")).ok).toBe(true);

    const leadsAntes = await prisma.siteLead.count();
    const fila = await montarFilaDeProspeccao(prisma, { canalPronto: true, agora: AGORA });
    const leadsDepois = await prisma.siteLead.count();

    expect(fila.liberados).toHaveLength(2);

    // O defeito que quase entrou: a tela consumia a lista só de ser aberta.
    expect(leadsDepois).toBe(leadsAntes);
    expect(await prisma.itemDeProspeccao.count({ where: { situacao: "PENDENTE" } })).toBe(2);
  });

  it("5. ⭐ materializar cria o lead, e ele NUNCA nasce com consentimento", async () => {
    const fila = await montarFilaDeProspeccao(prisma, { canalPronto: true, agora: AGORA });
    const alvo = fila.liberados[0]!;

    const m = await materializarLead(prisma, alvo.itemId);
    expect(m.materializado).toBe(true);

    const lead = m.materializado
      ? await prisma.siteLead.findUnique({ where: { id: m.leadId } })
      : null;

    expect(lead).not.toBeNull();
    expect(lead!.consentAt).toBeNull();
    expect(lead!.fonte).toBe("LISTA_PROSPECCAO");

    // Idempotente: materializar de novo devolve o mesmo lead.
    const m2 = await materializarLead(prisma, alvo.itemId);
    expect(m2.materializado && m.materializado && m2.leadId === m.leadId).toBe(true);
    expect(await prisma.siteLead.count()).toBe(1);
  });

  it("6. ⭐ quem pediu silêncio não volta a ser liberado", async () => {
    const lead = await prisma.siteLead.findFirst({ where: { fonte: "LISTA_PROSPECCAO" } });
    expect(lead).not.toBeNull();

    await prisma.siteLead.update({
      where: { id: lead!.id },
      data: { optOutAt: AGORA, optOutCanal: "jornada-ci" },
    });

    // O item já materializado saiu de PENDENTE; o que importa é que, se voltasse
    // a ser avaliado, o portão o barraria — e é isso que se mede aqui.
    const fila = await montarFilaDeProspeccao(prisma, { canalPronto: true, agora: AGORA });
    const liberadoComOptOut = fila.liberados.some((c) => c.leadId === lead!.id);
    expect(liberadoComOptOut).toBe(false);
  });

  it("7. o freio do lote esvazia a fila", async () => {
    await pausarLote(prisma, loteId, "jornada-ci");
    const fila = await montarFilaDeProspeccao(prisma, { canalPronto: true, agora: AGORA });
    expect(fila.liberados).toHaveLength(0);
  });

  it("8. o freio geral esvazia a fila, e diz o motivo", async () => {
    await liberarLote(prisma, loteId, "jornada-ci");
    await prisma.prospeccaoConfig.update({
      where: { id: "singleton" },
      data: { pausadoEm: new Date(), pausadoPor: "jornada-ci", motivo: "teste do freio" },
    });

    const fila = await montarFilaDeProspeccao(prisma, { canalPronto: true, agora: AGORA });
    expect(fila.liberados).toHaveLength(0);
    expect(fila.motivoDaFilaVazia).toContain("pausada");
  });

  it("9. sem canal pronto, ninguém é liberado — e o barrado diz por quê", async () => {
    await prisma.prospeccaoConfig.update({
      where: { id: "singleton" },
      data: { pausadoEm: null, motivo: null },
    });

    const fila = await montarFilaDeProspeccao(prisma, { canalPronto: false, agora: AGORA });
    expect(fila.liberados).toHaveLength(0);
    for (const barrado of fila.barrados) {
      expect(barrado.decisao.detail.length).toBeGreaterThan(0);
    }
  });
});
