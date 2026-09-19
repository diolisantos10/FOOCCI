/**
 * O LEAD DO CLIQUE-PARA-WHATSAPP — a recepção do anúncio.
 *
 * ── O QUE ESTES CASOS PROTEGEM ──────────────────────────────────────────────
 *
 * Em 19/09/2026 o CEO trocou o anúncio de formulário por clique-para-WhatsApp.
 * Nesse formato a pessoa não preenche nada: clica e escreve. Até esta entrega o
 * `referral` da Meta — que diz de qual anúncio ela veio — chegava neste webhook
 * e era **jogado fora na normalização**, porque o tipo `RawMessage` não
 * declarava o campo. O lead mais caro da casa nascia como "escreveu direto no
 * WhatsApp" e a campanha sumia.
 *
 * Três perguntas, e as três têm caso aqui:
 *   1. mensagem com `referral` vira lead de CAMPANHA, com o anúncio gravado?
 *   2. a mesma pessoa duas vezes vira duas fichas?
 *   3. telefone que já estava na base FRIA é promovido — e não duplicado?
 *
 * Nenhum banco real é tocado, nenhuma mensagem é enviada.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
  siteLead: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  siteLeadInteraction: { create: vi.fn() },
  $transaction: vi.fn(async (trabalho: (tx: unknown) => unknown) => trabalho({ $executeRaw: vi.fn() })),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/services/whatsapp/WhatsAppMessagingService", () => ({
  WhatsAppMessagingService: { getConnectionStatus: vi.fn() },
}));

// O TA é dublê: o que estes casos provam é a FIAÇÃO da origem, não o turno.
const taMock = vi.hoisted(() => vi.fn());
vi.mock("@/services/salaDeVendas/ta/atender", () => ({ atenderComOTA: taMock }));

// A promoção tem arquivo próprio (`jornadaComercial`). Aqui o que importa é que
// ela seja CHAMADA, com o motivo certo, e ANTES de a fonte ser trocada.
const promoverMock = vi.hoisted(() => vi.fn());
vi.mock("@/services/salaDeVendas/jornadaComercial", async (real) => ({
  ...(await real<Record<string, unknown>>()),
  promoverFrioParaLead: promoverMock,
}));

import { receberMensagemDeVendas } from "../FoocciSalesInbound";
import type { ReferralDeAnuncio } from "../anuncioDeOrigem";

const AGORA = new Date("2026-09-19T15:00:00Z");
process.env.FOOCCI_SDR_JANELA_AGRUPAMENTO_MS = "0";

const ANUNCIO: ReferralDeAnuncio = {
  sourceType: "ad",
  sourceId: "120210000000000001",
  sourceUrl: "https://fb.me/2abcDEF",
  headline: "Cardápio digital que vende sozinho",
  body: "Teste grátis por 7 dias",
  ctwaClid: "ARBxyz123",
};

function dadosDoCreate() {
  return prismaMock.siteLead.create.mock.calls[0]![0].data as Record<string, unknown>;
}
function notas(): string[] {
  return prismaMock.siteLeadInteraction.create.mock.calls.map(
    (c) => String((c[0] as { data: { nota?: string } }).data.nota ?? ""),
  );
}

beforeEach(() => {
  [prismaMock.siteLead, prismaMock.siteLeadInteraction].forEach((t) =>
    Object.values(t).forEach((fn) => (fn as ReturnType<typeof vi.fn>).mockReset()),
  );
  prismaMock.siteLeadInteraction.create.mockResolvedValue({});
  prismaMock.siteLead.update.mockResolvedValue({});
  prismaMock.siteLead.updateMany.mockResolvedValue({ count: 1 });
  taMock.mockReset();
  taMock.mockResolvedValue({ falou: false, chamouGente: false, motivo: "taDesligado", detalhe: "desligado" });
  promoverMock.mockReset();
  promoverMock.mockResolvedValue({ promoveu: true });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("quem clicou no anúncio e escreveu pela primeira vez", () => {
  it("⭐ nasce como LEAD DE CAMPANHA, com o anúncio gravado na ficha", async () => {
    prismaMock.siteLead.findFirst.mockResolvedValue(null); // ninguém na base
    prismaMock.siteLead.create.mockResolvedValue({ id: "L9", codigo: "AAAAA", optOutAt: null });

    const r = await receberMensagemDeVendas({
      fromPhone: "5511988887777",
      text: "oi, quero saber do cardápio",
      profileName: "Ana",
      referral: ANUNCIO,
      agora: AGORA,
    });

    expect(r.status).toBe("CONTATO_NOVO");
    const d = dadosDoCreate();
    // A fonte, que é o que faz a recepção enxergar este lead:
    expect(d.fonte).toBe("CAMPANHA_PAGA");
    // O anúncio, que é o que responde "qual criativo funciona":
    expect(d.utmCampaign).toBe("Cardápio digital que vende sozinho");
    expect(d.utmContent).toBe("120210000000000001");
    expect(d.utmMedium).toBe("click_to_whatsapp");
    expect(d.clickId).toBe("ctwa:ARBxyz123");
    expect(String(d.origem)).toContain("Anúncio clique-para-WhatsApp");
    // ⏱️ O relógio nasce junto — lead de campanha sem prazo nunca aparece atrasado.
    expect(d.slaVenceEm).toBeInstanceOf(Date);
    // E a Meta fica conferível na linha do tempo.
    expect(notas().some((n) => n.includes("ctwa_clid=ARBxyz123"))).toBe(true);
  });

  it("⛔ sem referral, nada muda: continua WHATSAPP_DIRETO", async () => {
    prismaMock.siteLead.findFirst.mockResolvedValue(null);
    prismaMock.siteLead.create.mockResolvedValue({ id: "L10", codigo: "BBBBB", optOutAt: null });

    await receberMensagemDeVendas({ fromPhone: "5511988887777", text: "oi", agora: AGORA });

    const d = dadosDoCreate();
    expect(d.fonte).toBe("WHATSAPP_DIRETO");
    expect(d.utmCampaign).toBeUndefined();
  });

  it("⛔ referral sem identificador NÃO vira campanha paga", async () => {
    prismaMock.siteLead.findFirst.mockResolvedValue(null);
    prismaMock.siteLead.create.mockResolvedValue({ id: "L11", codigo: "CCCCC", optOutAt: null });

    await receberMensagemDeVendas({
      fromPhone: "5511988887777", text: "oi", agora: AGORA,
      referral: { ...ANUNCIO, sourceId: null, ctwaClid: null },
    });

    expect(dadosDoCreate().fonte).toBe("WHATSAPP_DIRETO");
  });

  it("⭐ a PRIMEIRA MENSAGEM não se perde: ela é gravada e o TA é chamado", async () => {
    prismaMock.siteLead.findFirst.mockResolvedValue(null);
    prismaMock.siteLead.create.mockResolvedValue({ id: "L12", codigo: "DDDDD", optOutAt: null });

    await receberMensagemDeVendas({
      fromPhone: "5511988887777", text: "oi, quanto custa?", referral: ANUNCIO,
      waMessageId: "wamid.PRIMEIRA", agora: AGORA,
    });

    expect(taMock).toHaveBeenCalledTimes(1);
  });

  it("⭐ o primeiro contato por ÁUDIO/IMAGEM também chega ao TA", async () => {
    // Mídia da Meta nunca traz `text`: a foto vem com `image.id` e as palavras
    // em `image.caption`. O turno é decidido pelo que a IA CONSEGUE LER.
    prismaMock.siteLead.findFirst.mockResolvedValue(null);
    prismaMock.siteLead.create.mockResolvedValue({ id: "L13", codigo: "EEEEE", optOutAt: null });

    await receberMensagemDeVendas({
      fromPhone: "5511988887777", text: null, referral: ANUNCIO,
      tipo: "AUDIO", tipoCru: "audio", midiaId: "media-1", midiaMimeType: "audio/ogg",
      waMessageId: "wamid.AUDIO", agora: AGORA,
    });

    expect(taMock).toHaveBeenCalledTimes(1);
    expect(dadosDoCreate().fonte).toBe("CAMPANHA_PAGA");
  });
});

describe("a mesma pessoa clicando duas vezes", () => {
  it("⛔ NÃO vira dois leads — a segunda mensagem cai na ficha que já existe", async () => {
    prismaMock.siteLead.findFirst.mockResolvedValue({
      id: "L9", codigo: "AAAAA", optOutAt: null, fonte: "CAMPANHA_PAGA", virouLeadEm: null,
    });
    prismaMock.siteLead.findUnique.mockResolvedValue({
      fonte: "CAMPANHA_PAGA", origem: "Anúncio clique-para-WhatsApp — Cardápio digital que vende sozinho",
      utmSource: "facebook", utmCampaign: "Cardápio digital que vende sozinho",
      utmContent: "120210000000000001", clickId: "ctwa:ARBxyz123", referrer: "meta-click-to-whatsapp",
    });

    const r = await receberMensagemDeVendas({
      fromPhone: "5511988887777", text: "oi de novo", referral: ANUNCIO, agora: AGORA,
    });

    expect(r.status).toBe("RECONHECIDO_POR_TELEFONE");
    expect(r.leadId).toBe("L9");
    expect(prismaMock.siteLead.create).not.toHaveBeenCalled();
    // ⛔ O clickId é de quem trouxe a pessoa PRIMEIRO e não se sobrescreve.
    const escritas = prismaMock.siteLead.update.mock.calls.map((c) => c[0].data as Record<string, unknown>);
    expect(escritas.every((d) => d.clickId === undefined || d.clickId === "ctwa:ARBxyz123")).toBe(true);
    // Quem já entrou por uma porta da frente mantém a fonte do primeiro toque.
    expect(escritas.some((d) => d.fonte !== undefined)).toBe(false);
  });
});

describe("o telefone que JÁ estava na base fria", () => {
  it("⭐ é PROMOVIDO, ganha o anúncio e o relógio de SLA — e não uma segunda ficha", async () => {
    prismaMock.siteLead.findFirst.mockResolvedValue({
      id: "F1", codigo: "FRIO1", optOutAt: null, fonte: "LISTA_PROSPECCAO", virouLeadEm: null,
    });
    prismaMock.siteLead.findUnique.mockResolvedValue({
      fonte: "LISTA_PROSPECCAO", origem: null, utmSource: null, utmCampaign: null,
      utmContent: null, clickId: null, referrer: null,
    });

    const r = await receberMensagemDeVendas({
      fromPhone: "5511955554444", text: "vi o anúncio, me explica", referral: ANUNCIO, agora: AGORA,
    });

    expect(r.leadId).toBe("F1");
    expect(prismaMock.siteLead.create).not.toHaveBeenCalled();

    // 1. A promoção aconteceu, com a PROVA do que a pessoa fez.
    expect(promoverMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        leadId: "F1",
        motivo: expect.stringContaining("Cardápio digital que vende sozinho"),
      }),
    );

    // 2. A fonte passou a ser campanha paga (ela NÃO era porta da frente).
    const escritas = prismaMock.siteLead.update.mock.calls.map((c) => c[0].data as Record<string, unknown>);
    const comFonte = escritas.find((d) => d.fonte !== undefined);
    expect(comFonte?.fonte).toBe("CAMPANHA_PAGA");
    expect(comFonte?.utmCampaign).toBe("Cardápio digital que vende sozinho");

    // 3. ⏱️ O relógio de SLA foi ligado — por quem é dono dele
    //    (`marcarPrazoDePrimeiraResposta`, que só escreve quando é `null`).
    expect(prismaMock.siteLead.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: "F1", slaVenceEm: null }) }),
    );
  });

  it("⛔ a ORDEM é sagrada: promove ANTES de trocar a fonte", async () => {
    // Trocar a fonte primeiro faria a própria promoção ser recusada por
    // "naoEhFrio" — o carimbo de interesse nunca existiria, e a ficha diria
    // que a pessoa sempre foi lead.
    const ordem: string[] = [];
    promoverMock.mockImplementation(async () => { ordem.push("promoveu"); return { promoveu: true }; });
    prismaMock.siteLead.update.mockImplementation(async (a: { data: Record<string, unknown> }) => {
      if (a.data.fonte !== undefined) ordem.push("trocouFonte");
      return {};
    });
    prismaMock.siteLead.findFirst.mockResolvedValue({
      id: "F2", codigo: "FRIO2", optOutAt: null, fonte: "LISTA_PROSPECCAO", virouLeadEm: null,
    });
    prismaMock.siteLead.findUnique.mockResolvedValue({
      fonte: "LISTA_PROSPECCAO", origem: null, utmSource: null, utmCampaign: null,
      utmContent: null, clickId: null, referrer: null,
    });

    await receberMensagemDeVendas({ fromPhone: "5511955554444", text: "me explica", referral: ANUNCIO, agora: AGORA });

    expect(ordem).toEqual(["promoveu", "trocouFonte"]);
  });

  it("⛔ quem pediu SILÊNCIO não vira lead de campanha por ter clicado", async () => {
    prismaMock.siteLead.findFirst.mockResolvedValue({
      id: "F3", codigo: "FRIO3", optOutAt: null, fonte: "LISTA_PROSPECCAO", virouLeadEm: null,
    });

    const r = await receberMensagemDeVendas({
      fromPhone: "5511955554444", text: "PARAR", referral: ANUNCIO, agora: AGORA,
    });

    expect(r.status).toBe("PEDIU_SILENCIO");
    expect(promoverMock).not.toHaveBeenCalled();
    expect(taMock).not.toHaveBeenCalled();
  });
});
