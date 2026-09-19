/**
 * ⛔ 19/09/2026 — O LEAD DO ANÚNCIO CHEGOU E A IA NÃO FOI CHAMADA.
 *
 * O CEO clicou no próprio anúncio clique-para-WhatsApp às 16:02 (19:02 UTC) e
 * escreveu. O log de produção mostra a recepção inteira (`CONTATO_NOVO — lead de
 * campanha paga`) e **nada depois**: nenhuma linha de turno, de agente, de erro.
 * A IA não tentou e falhou — ela não foi chamada.
 *
 * Este arquivo fecha a pergunta com um caso: **mensagem com `referral` de
 * anúncio chega → o turno do TA é despachado?**
 */
import { vi, describe, it, expect, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => {
  const vazio = () => ({
    findUnique: vi.fn(async () => null),
    findFirst: vi.fn(async () => null),
    findMany: vi.fn(async () => []),
    create: vi.fn(async () => ({ id: "X" })),
    update: vi.fn(async () => ({})),
    updateMany: vi.fn(async () => ({ count: 0 })),
    deleteMany: vi.fn(async () => ({ count: 0 })),
    count: vi.fn(async () => 0),
    upsert: vi.fn(async () => ({})),
  });
  const base: Record<string, unknown> = {
    $executeRaw: vi.fn(async () => 0),
    $executeRawUnsafe: vi.fn(async () => 0),
  };
  const alvo = new Proxy(base, {
    get(t, p: string) {
      if (!(p in t)) t[p] = vazio();
      return t[p];
    },
  });
  (base as Record<string, unknown>).$transaction = vi.fn(async (t: (tx: unknown) => unknown) => t(alvo));
  return alvo as Record<string, ReturnType<typeof vazio>> & Record<string, never>;
});
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/services/whatsapp/WhatsAppMessagingService", () => ({
  WhatsAppMessagingService: { getConnectionStatus: vi.fn() },
}));

const taMock = vi.hoisted(() => vi.fn());
vi.mock("@/services/salaDeVendas/ta/atender", () => ({ atenderComOTA: taMock }));

import { receberMensagemDeVendas } from "../FoocciSalesInbound";
import type { ReferralDeAnuncio } from "../anuncioDeOrigem";

const AGORA = new Date("2026-09-19T19:02:40Z");
process.env.FOOCCI_SDR_JANELA_AGRUPAMENTO_MS = "0";

const ANUNCIO: ReferralDeAnuncio = {
  sourceType: "ad",
  sourceId: "120210000000000001",
  sourceUrl: "https://fb.me/2abcDEF",
  headline: "Transforme conversa em venda",
  body: "Teste grátis",
  ctwaClid: "ARBxyz123",
};

beforeEach(() => {
  vi.clearAllMocks();
  taMock.mockResolvedValue({ falou: false, chamouGente: false, motivo: "taDesligado", detalhe: "desligado" });
  const lead = prismaMock.siteLead as unknown as { create: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn> };
  lead.findFirst.mockResolvedValue(null);
  lead.create.mockResolvedValue({ id: "L1", codigo: "AAAAA", optOutAt: null });
  const msg = prismaMock.leadMensagem as unknown as { create: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
  msg.create.mockResolvedValue({ id: "M1" });
  msg.findMany.mockResolvedValue([
    { id: "M1", tipo: "TEXTO", tipoCru: null, texto: "Olá! Posso ter mais informações sobre isso?", legenda: null, midiaNome: null, ocorreuEm: AGORA },
  ]);
});

describe("o lead que clicou no anúncio", () => {
  it("⭐ tem o turno da IA DESPACHADO — 19/09/2026 ele não teve", async () => {
    const r = await receberMensagemDeVendas({
      fromPhone: "5511988887777",
      text: "Olá! Posso ter mais informações sobre isso?",
      profileName: "Diego",
      waMessageId: "wamid.AD1",
      referral: ANUNCIO,
      agora: AGORA,
    });

    expect(r.status).toBe("CONTATO_NOVO");
    expect(taMock).toHaveBeenCalled();
  });

  /**
   * ⛔ O SILÊNCIO É O DEFEITO, E NÃO SÓ O SINTOMA.
   *
   * O turno de 19/09 rodou e voltou calado. Do lado de fora — que é o log de
   * produção — isso é indistinguível de "a IA nem foi chamada", e foi essa
   * ambiguidade que fez o dia inteiro ser gasto procurando no lugar errado.
   * Todo desfecho do turno tem de deixar linha.
   */
  it("⭐ o desfecho do turno SEMPRE deixa rastro no log", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      await receberMensagemDeVendas({
        fromPhone: "5511988887777",
        text: "Olá! Posso ter mais informações sobre isso?",
        waMessageId: "wamid.AD1",
        referral: ANUNCIO,
        agora: AGORA,
      });
      const linhas = info.mock.calls.map((c) => String(c[0]));
      expect(linhas.some((l) => l.includes("turno do lead L1"))).toBe(true);
    } finally {
      info.mockRestore();
    }
  });

  it("⭐ mensagem sem nada legível não some calada: sobra um aviso", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await receberMensagemDeVendas({
        fromPhone: "5511988887777",
        text: null,
        waMessageId: "wamid.AD2",
        tipo: "TEXTO",
        referral: ANUNCIO,
        agora: AGORA,
      });
      expect(taMock).not.toHaveBeenCalled();
      expect(aviso.mock.calls.map((c) => String(c[0])).some((l) => l.includes("turno DESCARTADO"))).toBe(true);
    } finally {
      aviso.mockRestore();
    }
  });
});
