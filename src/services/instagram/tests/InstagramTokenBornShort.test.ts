/**
 * "NASCEU CURTO" tinha de virar uma medida honesta — e virou.
 *
 * O SINAL QUE MENTIA
 * ------------------
 * `graph-check` calculava `tokenLooksShortLived = expiresInDays < 7`, ou seja, o tempo
 * que FALTA. Duas consequências, as duas vistas em produção:
 *
 *   1. Um token de 60 dias com 55 dias de idade reportava "nasceu curto: true".
 *   2. **Todo token expirado reporta `true` por aritmética** — dias restantes negativos
 *      são menores que 7. Foi assim que o raio-x de 14/08 leu "vence em −2,4 dias ·
 *      nasceu curto? true". A segunda metade não provava nada: era consequência
 *      matemática da primeira, e mandou a investigação para o lugar errado.
 *
 * O QUE MEDE DE VERDADE
 * ---------------------
 * A vida com que o token NASCEU: `tokenExpiresAt − tokenIssuedAt`. A vitrine já dizia
 * que `≈ 1h` é a assinatura digital do fallback de `ig_exchange_token` — aritmética
 * que dispensa log e que continua verdadeira depois que o token morre.
 *
 * Cada caso abaixo tem as duas metades: o acerto novo e a reprodução do erro antigo.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const findMany = vi.fn();
const update   = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    instagramChannelConfig: {
      findMany:   (...a: unknown[]) => findMany(...a),
      update:     (...a: unknown[]) => update(...a),
      findUnique: vi.fn(),
      upsert:     vi.fn(),
    },
  },
}));
vi.mock("../InstagramConfigService", () => ({
  getInstagramConfig:    vi.fn(async () => null),
  decryptPageToken:      vi.fn(() => null),
  upsertInstagramConfig: vi.fn(async () => ({ ok: true })),
}));

import { refreshExpiringInstagramTokens } from "../instagramTokenRefresh";
import { DURABLE_TOKEN_MIN_SECONDS } from "../instagramLoginOAuth";

const HORA = 60 * 60 * 1000;
const DIA  = 24 * HORA;

/** Uma linha de config como o banco devolve. */
function linha(over: Record<string, unknown> = {}) {
  return {
    restaurantId: "sushi",
    enabled: true,
    pageAccessTokenEncrypted: "enc",
    lastError: null,
    lastWebhookAt: new Date(),
    metadata: {},
    ...over,
  };
}

describe("token do Instagram que NASCEU curto", () => {
  beforeEach(() => {
    findMany.mockReset();
    update.mockReset().mockResolvedValue({});
  });

  it("token de 1h é acusado, com o motivo LITERAL que a Meta deu", async () => {
    const emitido = new Date(Date.now() - 30 * DIA);
    findMany.mockResolvedValue([linha({
      enabled: false, // já morreu e saiu da varredura de renovação — e mesmo assim aparece
      pageAccessTokenEncrypted: null,
      metadata: {
        tokenIssuedAt:  emitido.toISOString(),
        tokenExpiresAt: new Date(emitido.getTime() + HORA).toISOString(),
        longLivedExchangeError: "Invalid platform app (code 200)",
      },
    })]);

    const r = await refreshExpiringInstagramTokens();

    expect(r.bornShort).toHaveLength(1);
    expect(r.bornShort[0].issuedForSeconds).toBe(3600);
    expect(r.needsAttention).toBe(true);
    const texto = r.attention.join(" ");
    expect(texto).toContain("NASCEU com 1h de validade");
    expect(texto).toContain("Invalid platform app");
    expect(texto).toContain("ig_exchange_token");
  });

  it("A METADE QUE REPRODUZ O ERRO ANTIGO: token de 60 dias JÁ EXPIRADO não é 'nasceu curto'", async () => {
    // Emitido há 70 dias, com 60 dias de vida → morto há 10 dias.
    // A régua velha (dias restantes = −10 < 7) diria "nasceu curto: true". É falso.
    const emitido = new Date(Date.now() - 70 * DIA);
    findMany.mockResolvedValue([linha({
      metadata: {
        tokenIssuedAt:  emitido.toISOString(),
        tokenExpiresAt: new Date(emitido.getTime() + 60 * DIA).toISOString(),
      },
    })]);

    const r = await refreshExpiringInstagramTokens();

    expect(r.bornShort).toEqual([]);
    expect(r.attention.join(" ")).not.toContain("NASCEU");
  });

  it("A OUTRA METADE: token de 60 dias VELHO (55 dias) também não é 'nasceu curto'", async () => {
    const emitido = new Date(Date.now() - 55 * DIA);
    findMany.mockResolvedValue([linha({
      metadata: {
        tokenIssuedAt:  emitido.toISOString(),
        tokenExpiresAt: new Date(emitido.getTime() + 60 * DIA).toISOString(),
      },
    })]);

    const r = await refreshExpiringInstagramTokens();
    expect(r.bornShort).toEqual([]);
  });

  it("sem as duas pontas, fica QUIETO — ausência de informação não é informação", async () => {
    findMany.mockResolvedValue([
      linha({ restaurantId: "sem-emissao", metadata: { tokenExpiresAt: new Date().toISOString() } }),
      linha({ restaurantId: "sem-expiry",  metadata: { tokenIssuedAt:  new Date().toISOString() } }),
      linha({ restaurantId: "sem-nada",    metadata: {} }),
    ]);

    const r = await refreshExpiringInstagramTokens();

    expect(r.bornShort).toEqual([]);
    expect(r.attention.join(" ")).not.toContain("NASCEU");
  });

  it("cai em `connectedAt` nas linhas antigas, e errar para MAIS é o lado seguro", async () => {
    // Linha gravada antes de `tokenIssuedAt` existir: só tem connectedAt.
    const conectado = new Date(Date.now() - 2 * DIA);
    findMany.mockResolvedValue([linha({
      metadata: {
        connectedAt:    conectado.toISOString(),
        tokenExpiresAt: new Date(conectado.getTime() + HORA).toISOString(),
        longLivedExchangeError: "erro antigo",
      },
    })]);

    const r = await refreshExpiringInstagramTokens();
    expect(r.bornShort).toHaveLength(1);
    expect(r.bornShort[0].issuedForSeconds).toBe(3600);
  });

  it("o limite é o mesmo da tela: abaixo de 7 dias acusa, 7 dias ou mais não", async () => {
    const base = Date.now() - 10 * DIA;
    const caso = async (vidaSegundos: number) => {
      findMany.mockResolvedValue([linha({
        metadata: {
          tokenIssuedAt:  new Date(base).toISOString(),
          tokenExpiresAt: new Date(base + vidaSegundos * 1000).toISOString(),
        },
      })]);
      return (await refreshExpiringInstagramTokens()).bornShort.length;
    };

    expect(await caso(DURABLE_TOKEN_MIN_SECONDS - 60)).toBe(1);
    expect(await caso(DURABLE_TOKEN_MIN_SECONDS)).toBe(0);
  });

  it("a causa vem ANTES das consequências na lista de atenção", async () => {
    const emitido = new Date(Date.now() - 5 * DIA);
    findMany.mockResolvedValue([linha({
      enabled: true,
      pageAccessTokenEncrypted: null, // também gera "inelegível" (consequência)
      metadata: {
        tokenIssuedAt:  emitido.toISOString(),
        tokenExpiresAt: new Date(emitido.getTime() + HORA).toISOString(),
      },
    })]);

    const r = await refreshExpiringInstagramTokens();

    expect(r.attention.length).toBeGreaterThan(1);
    expect(r.attention[0]).toContain("NASCEU"); // a causa é a primeira linha
  });
});
