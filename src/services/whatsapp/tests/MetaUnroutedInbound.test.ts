/**
 * Mensagem de cliente não pode sumir num log.
 *
 * ── O incidente que gerou isto ──────────────────────────────────────────────────
 * A Meta entrega o webhook carimbado com um `phone_number_id`. Quando nenhum
 * restaurante reconhece esse id, a mensagem era descartada num `console.warn` —
 * e a retenção de log do Railway é por deploy, então a explicação morria antes de
 * alguém procurar. Em 12/08/2026 um restaurante trocou de chip, o id gravado
 * continuou apontando para o número velho e TODA mensagem que entrava sumia ali,
 * com a tela verde o tempo todo. O CEO descobriu no dia seguinte, pelas vendas.
 *
 * As duas metades aqui: o rastro precisa ser GRAVADO, e precisa ser gravado sem
 * inventar dono, sem guardar dado sensível e sem virar tabela infinita.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  metaUnroutedInbound: {
    findUnique: vi.fn(),
    update:     vi.fn(),
    create:     vi.fn(),
    count:      vi.fn(),
    findMany:   vi.fn(),
  },
  metaWhatsAppConfig: {
    findMany: vi.fn(),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import {
  MetaUnroutedInboundService, MAX_TRACKED_NUMBERS, maskFromPhone,
} from "../MetaUnroutedInboundService";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  db.metaUnroutedInbound.findUnique.mockResolvedValue(null);
  db.metaUnroutedInbound.count.mockResolvedValue(0);
  db.metaUnroutedInbound.create.mockResolvedValue({});
  db.metaUnroutedInbound.update.mockResolvedValue({});
});

describe("record — o rastro é gravado", () => {
  it("GRAVA a evidência de um número novo: qual, quando, quantas", async () => {
    const quando = new Date("2026-08-13T10:00:00Z");

    const gravou = await MetaUnroutedInboundService.record({
      phoneNumberId:      "999888777",
      displayPhoneNumber: "+55 11 91896-4947",
      fromPhone:          "5511987654321",
      seenAt:             quando,
    });

    expect(gravou).toBe(true);
    const data = db.metaUnroutedInbound.create.mock.calls[0][0].data;
    expect(data.phoneNumberId).toBe("999888777");
    expect(data.displayPhoneNumber).toBe("+55 11 91896-4947");
    expect(data.messageCount).toBe(1);
    expect(data.lastSeenAt).toBe(quando);
  });

  it("AGREGA por número em vez de criar linha nova — o teto está na forma da tabela", async () => {
    db.metaUnroutedInbound.findUnique.mockResolvedValue({ id: "linha1" });

    await MetaUnroutedInboundService.record({ phoneNumberId: "999888777", fromPhone: "5511987654321" });

    expect(db.metaUnroutedInbound.create).not.toHaveBeenCalled();
    const data = db.metaUnroutedInbound.update.mock.calls[0][0].data;
    expect(data.messageCount).toEqual({ increment: 1 });
  });

  it("NÃO guarda o telefone do cliente em claro — só mascarado", async () => {
    await MetaUnroutedInboundService.record({ phoneNumberId: "999888777", fromPhone: "5511987654321" });

    const data = db.metaUnroutedInbound.create.mock.calls[0][0].data;
    expect(data.lastMaskedFrom).toBe("+55***4321");
    // O número completo não pode estar em campo nenhum da linha.
    expect(JSON.stringify(data)).not.toContain("5511987654321");
  });

  it("NÃO inventa dono: nada que se pareça com restaurantId é gravado", async () => {
    // Atribuir a um restaurante qualquer poria a mensagem de um cliente na tela de
    // OUTRO negócio. Sem dono conhecido, guardar sem dono é o certo.
    await MetaUnroutedInboundService.record({ phoneNumberId: "999888777", fromPhone: "5511987654321" });

    const data = db.metaUnroutedInbound.create.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("restaurantId");
    expect(data).not.toHaveProperty("conversationId");
  });

  it("respeita o TETO de números distintos — enxurrada não vira tabela infinita", async () => {
    db.metaUnroutedInbound.count.mockResolvedValue(MAX_TRACKED_NUMBERS);

    const gravou = await MetaUnroutedInboundService.record({ phoneNumberId: "numero-novo" });

    expect(gravou).toBe(false);
    expect(db.metaUnroutedInbound.create).not.toHaveBeenCalled();
  });

  it("mas número JÁ rastreado continua contando mesmo com o teto atingido", async () => {
    // Se o teto calasse também a contagem, a evidência do caso real pararia de
    // crescer justamente durante a enxurrada.
    db.metaUnroutedInbound.count.mockResolvedValue(MAX_TRACKED_NUMBERS);
    db.metaUnroutedInbound.findUnique.mockResolvedValue({ id: "linha1" });

    const gravou = await MetaUnroutedInboundService.record({ phoneNumberId: "ja-rastreado" });

    expect(gravou).toBe(true);
    expect(db.metaUnroutedInbound.update).toHaveBeenCalled();
  });

  it("payload sem os campos opcionais NÃO apaga o que já se sabia", async () => {
    db.metaUnroutedInbound.findUnique.mockResolvedValue({ id: "linha1" });

    await MetaUnroutedInboundService.record({ phoneNumberId: "999888777" }); // sem from, sem display

    const data = db.metaUnroutedInbound.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("lastMaskedFrom");
    expect(data).not.toHaveProperty("displayPhoneNumber");
  });

  it("falha de banco NÃO propaga — o webhook precisa devolver 200 à Meta", async () => {
    // A Meta desativa a inscrição de quem não responde 200. Perder o canal inteiro
    // para gravar um diagnóstico seria a proteção mais destrutiva que o problema.
    db.metaUnroutedInbound.findUnique.mockRejectedValue(new Error("banco fora do ar"));

    await expect(
      MetaUnroutedInboundService.record({ phoneNumberId: "999888777" }),
    ).resolves.toBe(false);
  });
});

describe("listOpen — o que ainda é problema", () => {
  const linha = {
    phoneNumberId: "999888777", displayPhoneNumber: "+55 11 91896-4947",
    messageCount: 7, firstSeenAt: new Date("2026-08-12T10:00:00Z"),
    lastSeenAt: new Date("2026-08-13T10:00:00Z"), lastMaskedFrom: "+55***4321",
  };

  it("lista a porta sem dono com a contagem — a evidência que faltava", async () => {
    db.metaUnroutedInbound.findMany.mockResolvedValue([linha]);
    db.metaWhatsAppConfig.findMany.mockResolvedValue([]);

    const abertos = await MetaUnroutedInboundService.listOpen();

    expect(abertos).toHaveLength(1);
    expect(abertos[0].messageCount).toBe(7);
    expect(abertos[0].displayPhoneNumber).toBe("+55 11 91896-4947");
  });

  it("PARA de listar assim que o número é conectado — o alerta se apaga sozinho", async () => {
    db.metaUnroutedInbound.findMany.mockResolvedValue([linha]);
    db.metaWhatsAppConfig.findMany.mockResolvedValue([{ phoneNumberId: "999888777" }]);

    // A linha histórica continua na tabela para perícia; só não conta como aberta.
    await expect(MetaUnroutedInboundService.listOpen()).resolves.toEqual([]);
  });
});

describe("maskFromPhone", () => {
  it("mantém país e 4 últimos dígitos, esconde o miolo", () => {
    expect(maskFromPhone("5511987654321")).toBe("+55***4321");
  });

  it("entrada curta demais vira ***, nunca vaza o que tem", () => {
    expect(maskFromPhone("12")).toBe("***");
  });
});
