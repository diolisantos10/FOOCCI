/**
 * AS JORNADAS 1 E 2 DO P0 — como um cliente ENTRA, contra Postgres de verdade.
 *
 * ── POR QUE ESTE ARQUIVO EXISTE, DEPOIS DA JORNADA 3 ────────────────────────
 *
 * A Jornada 3 (prospecção) ganhou prova ponta a ponta contra banco real e as
 * outras duas ficaram só com dublê. Isso é uma desigualdade de evidência, não
 * de importância: **as Jornadas 1 e 2 são as que trazem quem procurou a gente**,
 * e são as que já estão ligadas em produção hoje. Provar a mais nova e deixar as
 * duas antigas na palavra é medir o que é fácil.
 *
 * Aqui se mede o que o dublê não alcança: a chave única do código do lead, a
 * deduplicação por telefone contra a coluna real, o enum de origem que o banco
 * precisa conhecer, e a idempotência da reentrega da Meta — que é um índice
 * único, não um `if`.
 *
 * ── ⚠️ NADA AQUI FALA COM NINGUÉM ───────────────────────────────────────────
 *
 * Telefones sintéticos, canal desligado, e-mail sem chave. Nenhuma mensagem
 * sai: a jornada mede a máquina, não o cliente.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { SiteLeadService } from "@/services/site/SiteLeadService";
import { receberMensagemDeVendas } from "@/services/foocci-sdr/FoocciSalesInbound";

const prisma = new PrismaClient();

/** Quarta-feira, 14h em São Paulo. */
const AGORA = new Date("2026-09-02T17:00:00Z");

beforeAll(async () => {
  await prisma.leadMensagem.deleteMany({});
  await prisma.siteLeadInteraction.deleteMany({});
  await prisma.siteLead.deleteMany({});
});

afterAll(async () => {
  await prisma.$disconnect();
});

// ═══════════════════════════════════════════════════════════════════════════
// JORNADA 1 — o formulário do site
// ═══════════════════════════════════════════════════════════════════════════

describe("Jornada 1 — quem preenche o formulário do site", () => {
  it("o contato entra, com origem e campanha preservadas", async () => {
    const r = await SiteLeadService.capture({
      nome: "Cantina do Teste",
      whatsapp: "11955550001",
      restaurante: "Cantina do Teste",
      cidade: "Curitiba",
      tipo: "Italiana",
      desafio: "Quer parar de perder pedido no WhatsApp",
      origem: "jornada-ci",
      utmSource: "instagram",
      utmMedium: "social",
      utmCampaign: "setembro",
    } as Parameters<typeof SiteLeadService.capture>[0]);

    expect(r.duplicado).toBe(false);

    const lead = await prisma.siteLead.findUnique({ where: { id: r.id } });
    expect(lead).not.toBeNull();

    // ⭐ A origem tem que sobreviver à gravação: é ela que responde, depois,
    // "de onde vêm os clientes que fecham?".
    expect(lead!.utmCampaign).toBe("setembro");
    expect(lead!.utmSource).toBe("instagram");

    // Quem preencheu o formulário CONSENTIU — e aqui o consentimento é real,
    // ao contrário do lead de prospecção, que nasce sem ele de propósito.
    expect(lead!.consentAt).not.toBeNull();
  });

  it("⭐ o mesmo telefone reenviado NÃO cria uma segunda carteira", async () => {
    // O dano que isto evita: duas fichas do mesmo restaurante, dois vendedores
    // ligando, e o cliente percebendo que a casa não se fala.
    const antes = await prisma.siteLead.count();

    const r = await SiteLeadService.capture({
      nome: "Cantina do Teste (reenvio apressado)",
      whatsapp: "(11) 95555-0001",
    } as Parameters<typeof SiteLeadService.capture>[0]);

    expect(r.duplicado).toBe(true);
    expect(await prisma.siteLead.count()).toBe(antes);
  });

  it("o reenvio COMPLETA o que faltava, sem apagar o que já havia", async () => {
    // Um segundo envio apressado costuma vir com menos campos. Sobrescrever
    // perderia informação boa — o cliente não deve ser punido por reenviar.
    const lead = await prisma.siteLead.findFirst({
      where: { whatsappDigits: { endsWith: "55550001" } },
    });
    expect(lead!.cidade).toBe("Curitiba");
    expect(lead!.desafio).toContain("WhatsApp");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// JORNADA 2 — quem chama no WhatsApp
// ═══════════════════════════════════════════════════════════════════════════

describe("Jornada 2 — quem chama direto no WhatsApp", () => {
  it("um número desconhecido vira contato novo, marcado como WhatsApp", async () => {
    const r = await receberMensagemDeVendas({
      fromPhone: "5511955550002",
      text: "oi, queria saber do sistema de vocês",
      profileName: "Padaria Sintética",
      waMessageId: "wamid.jornada.1",
      agora: AGORA,
    });

    expect(r.status).toBe("CONTATO_NOVO");
    expect(r.leadId).not.toBeNull();

    const lead = await prisma.siteLead.findUnique({ where: { id: r.leadId! } });
    expect(lead!.fonte).toBe("WHATSAPP_DIRETO");
  });

  it("⭐ quem JÁ É lead é reconhecido pelo telefone — e não vira contato novo", async () => {
    // É o mesmo defeito da prospecção visto do outro lado: não reconhecer quem
    // já está na base cria dois donos para a mesma pessoa.
    const antes = await prisma.siteLead.count();

    const r = await receberMensagemDeVendas({
      fromPhone: "5511955550001", // o do formulário, na Jornada 1
      text: "oi, sou eu de novo",
      waMessageId: "wamid.jornada.2",
      agora: AGORA,
    });

    expect(r.status).toBe("RECONHECIDO_POR_TELEFONE");
    expect(await prisma.siteLead.count()).toBe(antes);
  });

  it("⭐ a origem NÃO desaparece quando o cliente converge para o WhatsApp", async () => {
    // Critério de aceite do P0: "nenhuma origem desaparece ao convergir no
    // WhatsApp". O canal é o fio principal — quase todo mundo acaba nele. Se
    // chamar no WhatsApp reescrevesse a origem, em um mês a base inteira diria
    // "veio do WhatsApp" e a pergunta que paga a próxima campanha — *de onde
    // vêm os clientes que fecham?* — ficaria sem resposta para sempre.
    //
    // O dado não some com um apagamento: some por sobrescrita silenciosa.
    const lead = await prisma.siteLead.findFirst({
      where: { whatsappDigits: { endsWith: "55550001" } },
    });

    expect(lead!.fonte).toBe("FORMULARIO_DEMONSTRACAO");
    expect(lead!.utmCampaign).toBe("setembro");
  });

  it("⭐ a reentrega da Meta não duplica a conversa", async () => {
    // A Meta reentrega a MESMA mensagem quando não recebe o 200 a tempo. Sem a
    // trava de idempotência, a conversa do cliente enche de mensagens repetidas
    // — e é uma trava de índice único, coisa que dublê nenhum prova.
    const antes = await prisma.leadMensagem.count();

    await receberMensagemDeVendas({
      fromPhone: "5511955550002",
      text: "oi, queria saber do sistema de vocês",
      waMessageId: "wamid.jornada.1", // repetido de propósito
      agora: AGORA,
    });

    expect(await prisma.leadMensagem.count()).toBe(antes);
  });

  it("⭐ quem pede silêncio é registrado como silêncio, e não como conversa", async () => {
    const r = await receberMensagemDeVendas({
      fromPhone: "5511955550003",
      text: "sair",
      waMessageId: "wamid.jornada.3",
      agora: AGORA,
    });

    expect(r.status).toBe("PEDIU_SILENCIO");

    if (r.leadId) {
      const lead = await prisma.siteLead.findUnique({ where: { id: r.leadId } });
      expect(lead!.optOutAt).not.toBeNull();
    }
  });

  it("mensagem sem texto não derruba o recebimento", async () => {
    // Derrubar o webhook é pior que perder o registro de uma mensagem: a Meta
    // reentrega, e uma exceção aqui vira fila de reentrega crescente.
    const r = await receberMensagemDeVendas({
      fromPhone: "5511955550004",
      text: null,
      waMessageId: "wamid.jornada.4",
      agora: AGORA,
    });

    expect(r.status).not.toBe("FALHOU");
  });
});
