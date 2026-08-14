/**
 * O CONECTAR DO WHATSAPP NÃO PODE DIZER "CONECTADO" QUANDO O CANAL ESTÁ MUDO.
 *
 * O DEFEITO, encontrado no raio-x de autoatendimento de 14/08:
 *
 *     try { await subscribeAppToWaba(accessToken, body.wabaId); } catch { }
 *
 * `subscribeAppToWaba` **não lança** — ela devolve `{ ok:false, error }`. Então o
 * `catch` não pegava nada e o `{ok:false}` ia direto para o lixo. Sem essa assinatura
 * a Meta **não entrega mensagem nenhuma** para nós: o número conecta, ENVIA, e nunca
 * RECEBE. Para um restaurante novo que se integra sozinho, o resultado é a tela verde
 * dizendo "conectado" enquanto todo cliente que escreve cai no vazio.
 *
 * É o mesmo defeito que manteve o Instagram mudo por 22 dias, no canal que mais
 * importa para cliente novo — e ali ele custou um cliente pagante sem atendimento.
 *
 * A correção NÃO bloqueia a conexão (guardrail 5: a proteção não pode ser mais
 * destrutiva que o problema — as credenciais já estão salvas e a falha é recuperável).
 * O que muda é que a falha passa a ser DITA, em três lugares: `inboundReady:false` na
 * resposta, `inboundError` com a mensagem da Meta, e `lastError` gravado no config.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const subscribeAppToWaba = vi.fn();
const setHealth = vi.fn();
const upsert = vi.fn();

vi.mock("@/lib/tenant", () => ({
  getTenantContext: () => ({ restaurantId: "r-novo", userId: "u1", role: "OWNER" }),
}));
vi.mock("@/services/whatsapp/metaFlag", () => ({
  isMetaWhatsAppEnabled: () => true,
  metaGraphUrl: (p: string) => `https://graph.facebook.com/v21.0/${p}`,
  META_GRAPH_VERSION: "v21.0",
}));
vi.mock("@/services/whatsapp/MetaOnboardingService", () => ({
  exchangeCodeForToken: vi.fn(async () => ({ ok: true, accessToken: "T" })),
  fetchPhoneDetails:    vi.fn(async () => ({ displayPhoneNumber: "+55 11 90000-0000", verifiedName: "Novo" })),
  inspectTokenExpiry:   vi.fn(async () => ({ expiresAt: null })),
  subscribeAppToWaba:   (...a: unknown[]) => subscribeAppToWaba(...a),
}));
vi.mock("@/services/whatsapp/MetaConfigService", () => ({
  MetaConfigService: {
    getByPhoneNumberId: vi.fn(async () => null),
    upsert:    (...a: unknown[]) => upsert(...a),
    setHealth: (...a: unknown[]) => setHealth(...a),
    getPublic: vi.fn(async () => ({ connected: true })),
  },
}));
vi.mock("@/services/whatsapp/providers/MetaWhatsAppCloudProvider", () => ({
  MetaWhatsAppCloudProvider: class { async healthCheck() { return { connected: true, detail: null }; } },
}));

import { POST } from "./route";

function pedido() {
  return {
    json: async () => ({ code: "c", wabaId: "waba-novo", phoneNumberId: "phone-novo" }),
  } as unknown as Parameters<typeof POST>[0];
}

describe("POST /api/integracoes/whatsapp/meta/connect — o restaurante novo", () => {
  beforeEach(() => {
    subscribeAppToWaba.mockReset();
    setHealth.mockReset().mockResolvedValue(undefined);
    upsert.mockReset().mockResolvedValue(undefined);
  });

  it("assinatura OK: conectado E pronto para receber", async () => {
    subscribeAppToWaba.mockResolvedValue({ ok: true });

    const body = await (await POST(pedido())).json();

    expect(body.data.connected).toBe(true);
    expect(body.data.inboundReady).toBe(true);
    expect(body.data.inboundError).toBeNull();
    expect(setHealth).not.toHaveBeenCalled(); // nada de erro inventado num caminho feliz
  });

  it("A METADE QUE REPRODUZ O ERRO ANTIGO: assinatura falha e o canal fica MUDO — e agora isso é dito", async () => {
    // `subscribeAppToWaba` NÃO lança: devolve ok:false. O `catch` antigo não pegava
    // nada e o resultado era descartado, então a resposta era "conectado" e ponto.
    subscribeAppToWaba.mockResolvedValue({ ok: false, error: "(#200) Permissions error" });

    const body = await (await POST(pedido())).json();

    expect(body.data.connected).toBe(true);      // não bloqueia (guardrail 5)
    expect(body.data.inboundReady).toBe(false);  // ← mas não mente
    expect(body.data.inboundError).toContain("Permissions error");

    // E a evidência sobrevive ao deploy, gravada no config.
    expect(setHealth).toHaveBeenCalledTimes(1);
    const patch = setHealth.mock.calls[0][1] as { lastError: string };
    expect(patch.lastError).toContain("RECEBER");
    expect(patch.lastError).toContain("Permissions error");
    // Nunca desconecta nem apaga credencial: só descreve.
    expect(Object.keys(patch)).toEqual(["lastError"]);
  });

  it("exceção na assinatura também vira 'mudo declarado', não 'conectado'", async () => {
    subscribeAppToWaba.mockRejectedValue(new Error("ECONNRESET"));

    const body = await (await POST(pedido())).json();

    expect(body.data.connected).toBe(true);
    expect(body.data.inboundReady).toBe(false);
    expect(body.data.inboundError).toContain("ECONNRESET");
    expect(setHealth).toHaveBeenCalledTimes(1);
  });

  it("a credencial é salva ANTES de qualquer julgamento sobre a assinatura", async () => {
    subscribeAppToWaba.mockResolvedValue({ ok: false, error: "x" });
    await POST(pedido());
    // Se a assinatura falhar, o lojista não pode perder a conexão que acabou de fazer.
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});
