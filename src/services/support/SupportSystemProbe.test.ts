/**
 * A sonda do suporte — as DUAS metades.
 *
 * A primeira metade (cliente saudável responde saudável) é a fácil e é a que
 * costuma existir sozinha. A segunda (cliente CAÍDO **não** responde saudável, e
 * cliente que não deu para verificar responde "não consigo verificar agora") é a
 * que importa, porque foi exatamente ela que faltou: até 15/08/2026 a sonda não
 * recebia o restaurante e devolvia "tudo saudável" com o WhatsApp do lojista no
 * chão.
 *
 * Regra que estes testes travam: **nenhum caminho deste arquivo devolve
 * `HEALTHY` sem ter lido, com sucesso, o estado daquele restaurante.**
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  restaurant: { findUnique: vi.fn() },
  instagramChannelConfig: { findUnique: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { probeSystem, buildProbeContext } from "./SupportSystemProbe";

const NOW = new Date("2026-08-15T12:00:00Z");
const R = "rest-1";

/** Um restaurante inteiramente saudável, como o banco o devolveria. */
function healthyRestaurant(over: Record<string, unknown> = {}) {
  return {
    id: R,
    isOrderingPaused: false,
    orderingPausedReason: null,
    metaWhatsAppConfig: {
      connectionStatus: "CONNECTED",
      lastError: null,
      // Bem longe do vencimento — token curto vira âmbar, e âmbar não é o assunto aqui.
      tokenExpiresAt: new Date("2027-01-01T00:00:00Z"),
      displayPhoneNumber: "+55 11 90000-0000",
      lastHealthCheckAt: new Date("2026-08-15T11:00:00Z"),
    },
    printAgent: { token: "tok", lastSeenAt: new Date("2026-08-15T11:59:50Z") },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
  db.restaurant.findUnique.mockResolvedValue(healthyRestaurant());
  db.instagramChannelConfig.findUnique.mockResolvedValue(null); // não usa o canal
  process.env.OPENAI_API_KEY = "sk-test";
  process.env.DATABASE_URL = "postgres://x";
  process.env.ENCRYPTION_KEY = "k";
  process.env.NEXTAUTH_SECRET = "s";
});

describe("METADE 1 — cliente saudável responde saudável", () => {
  it("tudo no lugar → HEALTHY, e o resumo nomeia o que foi visto", async () => {
    const snap = await probeSystem({ restaurantId: R, now: NOW });

    expect(snap.verdict).toBe("HEALTHY");
    expect(snap.restaurantId).toBe(R);
    expect(snap.summary).toMatch(/sem incidente aparente/i);
    // O que ele diz que viu tem de estar listado — alerta carrega a evidência.
    expect(snap.summary).toMatch(/WhatsApp oficial/i);
  });

  it("a sonda pergunta pelo restaurante certo (e não por 'o sistema')", async () => {
    await probeSystem({ restaurantId: R, now: NOW });
    expect(db.restaurant.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: R } }),
    );
  });

  it("canal que o lojista nunca ligou é AUSENTE, não caído — e não derruba o veredito", async () => {
    const snap = await probeSystem({ restaurantId: R, now: NOW });
    expect(snap.tenant.find((t) => t.key === "instagram")?.state).toBe("absent");
    expect(snap.verdict).toBe("HEALTHY");
  });
});

describe("METADE 2 — cliente caído NÃO responde saudável", () => {
  it("WhatsApp com erro registrado → DEGRADED, e o resumo não diz 'saudável'", async () => {
    db.restaurant.findUnique.mockResolvedValue(
      healthyRestaurant({
        metaWhatsAppConfig: {
          connectionStatus: "ERROR",
          lastError: "(#131047) Message failed to send",
          tokenExpiresAt: null,
          displayPhoneNumber: "+55 11 90000-0000",
          lastHealthCheckAt: NOW,
        },
      }),
    );

    const snap = await probeSystem({ restaurantId: R, now: NOW });

    expect(snap.verdict).toBe("DEGRADED");
    expect(snap.summary).not.toMatch(/saudável|sem incidente/i);
    expect(snap.summary).toMatch(/131047/); // o alerta carrega a evidência
  });

  it("número DESCONECTADO → DEGRADED", async () => {
    db.restaurant.findUnique.mockResolvedValue(
      healthyRestaurant({
        metaWhatsAppConfig: {
          connectionStatus: "DISCONNECTED",
          lastError: null,
          tokenExpiresAt: null,
          displayPhoneNumber: null,
          lastHealthCheckAt: null,
        },
      }),
    );

    const snap = await probeSystem({ restaurantId: R, now: NOW });
    expect(snap.verdict).toBe("DEGRADED");
    expect(snap.tenant.find((t) => t.key === "whatsapp")?.state).toBe("down");
  });

  it("credencial VENCIDA derruba o canal mesmo com o cadastro dizendo CONNECTED", async () => {
    db.restaurant.findUnique.mockResolvedValue(
      healthyRestaurant({
        metaWhatsAppConfig: {
          connectionStatus: "CONNECTED",
          lastError: null,
          tokenExpiresAt: new Date("2026-08-01T00:00:00Z"), // duas semanas atrás
          displayPhoneNumber: null,
          lastHealthCheckAt: null,
        },
      }),
    );

    const snap = await probeSystem({ restaurantId: R, now: NOW });
    expect(snap.verdict).toBe("DEGRADED");
    expect(snap.summary).toMatch(/venceu/i);
  });

  it("Instagram com erro derruba o veredito mesmo com o WhatsApp perfeito", async () => {
    db.instagramChannelConfig.findUnique.mockResolvedValue({
      enabled: true, paused: false, mode: "FULL",
      lastError: "token expirado", lastWebhookAt: new Date("2026-08-15T11:00:00Z"),
    });

    const snap = await probeSystem({ restaurantId: R, now: NOW });
    expect(snap.verdict).toBe("DEGRADED");
  });

  it("Carteiro offline há horas → DEGRADED (a comanda não está saindo)", async () => {
    db.restaurant.findUnique.mockResolvedValue(
      healthyRestaurant({ printAgent: { token: "tok", lastSeenAt: new Date("2026-08-15T06:00:00Z") } }),
    );

    const snap = await probeSystem({ restaurantId: R, now: NOW });
    expect(snap.verdict).toBe("DEGRADED");
    expect(snap.summary).toMatch(/comandas não estão saindo/i);
  });
});

describe("METADE 2b — o que não deu para verificar responde 'não consigo verificar agora'", () => {
  it("restaurante inexistente NÃO é restaurante saudável", async () => {
    db.restaurant.findUnique.mockResolvedValue(null);

    const snap = await probeSystem({ restaurantId: "fantasma", now: NOW });

    expect(snap.verdict).toBe("UNKNOWN");
    expect(snap.summary).toMatch(/não consigo verificar agora/i);
    expect(snap.summary).not.toMatch(/saudável|sem incidente/i);
  });

  it("restaurantId vazio não consulta o banco e não vira saúde", async () => {
    const snap = await probeSystem({ restaurantId: "   ", now: NOW });

    expect(snap.verdict).toBe("UNKNOWN");
    expect(db.restaurant.findUnique).not.toHaveBeenCalled();
  });

  it("banco fora do ar não vira 'não sei' educado — vira falha confirmada", async () => {
    db.$queryRaw.mockRejectedValue(new Error("P1001 can't reach database"));

    const snap = await probeSystem({ restaurantId: R, now: NOW });

    expect(snap.verdict).toBe("DEGRADED");
    expect(snap.summary).toMatch(/P1001/);
  });

  it("exceção ao ler o restaurante → UNKNOWN, nunca HEALTHY", async () => {
    db.restaurant.findUnique.mockRejectedValue(new Error("connection reset"));

    const snap = await probeSystem({ restaurantId: R, now: NOW });

    expect(snap.verdict).toBe("UNKNOWN");
    expect(snap.summary).toMatch(/não consigo verificar agora/i);
  });

  it("CEGUEIRA PARCIAL também é cegueira: um canal ilegível impede o 'tudo bem'", async () => {
    // O WhatsApp está perfeito; só o Instagram não deu para ler. A versão antiga
    // teria dito "tudo saudável" — aqui, dúvida em qualquer sinal barra a saúde.
    db.instagramChannelConfig.findUnique.mockRejectedValue(new Error("timeout"));

    const snap = await probeSystem({ restaurantId: R, now: NOW });

    expect(snap.verdict).toBe("UNKNOWN");
    expect(snap.summary).toMatch(/não consigo verificar agora/i);
  });

  it("estado de conexão desconhecido não é otimismo: UNKNOWN", async () => {
    db.restaurant.findUnique.mockResolvedValue(
      healthyRestaurant({
        metaWhatsAppConfig: {
          connectionStatus: "SOME_NEW_STATUS",
          lastError: null, tokenExpiresAt: null, displayPhoneNumber: null, lastHealthCheckAt: null,
        },
      }),
    );

    const snap = await probeSystem({ restaurantId: R, now: NOW });
    expect(snap.verdict).toBe("UNKNOWN");
  });
});

describe("o contexto que vai para o prompt carrega a regra dura", () => {
  it("UNKNOWN proíbe, por escrito, a frase 'está tudo saudável'", async () => {
    db.restaurant.findUnique.mockResolvedValue(null);
    const ctx = buildProbeContext(await probeSystem({ restaurantId: R, now: NOW }));

    expect(ctx).toMatch(/VEREDITO: UNKNOWN/);
    expect(ctx).toMatch(/PROIBIDO dizer "está tudo saudável"/i);
  });

  it("DEGRADED manda não minimizar", async () => {
    db.restaurant.findUnique.mockResolvedValue(
      healthyRestaurant({
        metaWhatsAppConfig: {
          connectionStatus: "ERROR", lastError: "caiu",
          tokenExpiresAt: null, displayPhoneNumber: null, lastHealthCheckAt: null,
        },
      }),
    );
    const ctx = buildProbeContext(await probeSystem({ restaurantId: R, now: NOW }));

    expect(ctx).toMatch(/VEREDITO: DEGRADED/);
    expect(ctx).toMatch(/não diga que está tudo bem/i);
  });

  it("o bloco nomeia o restaurante sondado — o snapshot sabe de quem fala", async () => {
    const ctx = buildProbeContext(await probeSystem({ restaurantId: R, now: NOW }));
    expect(ctx).toContain(R);
  });
});

describe("âmbar não é vermelho (guardrail 5 — a proteção não pode ser pior que o problema)", () => {
  it("loja com pedidos pausada pelo dono não vira incidente", async () => {
    db.restaurant.findUnique.mockResolvedValue(
      healthyRestaurant({ isOrderingPaused: true, orderingPausedReason: "fim de expediente" }),
    );

    const snap = await probeSystem({ restaurantId: R, now: NOW });

    expect(snap.verdict).toBe("HEALTHY");
    // Mas ele DIZ que está pausada — é a resposta de "por que não chega pedido?".
    expect(snap.summary).toMatch(/PAUSADOS/);
  });

  it("Instagram em silêncio longo é atenção, nunca queda", async () => {
    db.instagramChannelConfig.findUnique.mockResolvedValue({
      enabled: true, paused: false, mode: "FULL",
      lastError: null, lastWebhookAt: new Date("2026-08-01T00:00:00Z"),
    });

    const snap = await probeSystem({ restaurantId: R, now: NOW });

    expect(snap.verdict).toBe("HEALTHY");
    expect(snap.tenant.find((t) => t.key === "instagram")?.state).toBe("attention");
    expect(snap.summary).toMatch(/movimento baixo/i);
  });

  it("credencial vencendo em 10 dias é atenção — e aparece no resumo", async () => {
    db.restaurant.findUnique.mockResolvedValue(
      healthyRestaurant({
        metaWhatsAppConfig: {
          connectionStatus: "CONNECTED", lastError: null,
          tokenExpiresAt: new Date("2026-08-25T12:00:00Z"),
          displayPhoneNumber: null, lastHealthCheckAt: null,
        },
      }),
    );

    const snap = await probeSystem({ restaurantId: R, now: NOW });

    expect(snap.verdict).toBe("HEALTHY");
    expect(snap.summary).toMatch(/credencial vence em 10 dias/i);
  });
});
