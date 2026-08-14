/**
 * metaTokenHealth — as regras que impedem o WhatsApp de morrer calado.
 *
 * Cada caso aqui trava um jeito específico de o sistema mentir que está bem:
 *
 *   1. Token morto tem de virar atenção. Foi assim que o Instagram ficou 13 dias mudo.
 *   2. **Não conseguir perguntar** não pode virar "está tudo bem". Guardrail 1 e 2:
 *      ausência de informação não é informação, e esquecer o portão nunca é aprovar.
 *   3. A varredura NÃO pode desconectar ninguém. Guardrail 5 — a proteção não pode ser
 *      mais destrutiva que o problema (incidente da Nicole).
 *   4. Token emitido por OUTRO aplicativo tem de aparecer. "Existe um só app" era
 *      combinado, não trava — achado 2 do raio-x de 05/08.
 *   5. Vencimento próximo avisa ANTES, porque não existe renovação automática aqui.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const findMany   = vi.fn();
const updateMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    metaWhatsAppConfig: {
      findMany:   (...args: unknown[]) => findMany(...args),
      updateMany: (...args: unknown[]) => updateMany(...args),
    },
  },
}));

const getResolvedConfig = vi.fn();
vi.mock("./MetaConfigService", () => ({
  MetaConfigService: { getResolved: (...args: unknown[]) => getResolvedConfig(...args) },
}));

const getResolvedApp = vi.fn();
vi.mock("@/services/meta/MetaAppCredentialsService", () => ({
  MetaAppCredentialsService: { getResolved: () => getResolvedApp() },
}));

import { sweepMetaTokenHealth, inspectMetaToken, REQUIRED_SCOPE } from "./metaTokenHealth";

const NOSSO_APP = "893641126399955";

function respostaDebugToken(data: Record<string, unknown>) {
  return { ok: true, json: async () => ({ data }) };
}

function configDe(restaurantId: string) {
  return {
    restaurantId,
    wabaId: "waba_1",
    phoneNumberId: "phone_1",
    displayPhoneNumber: "+55 11 90000-0000",
    businessId: null,
    accessToken: "EAAtoken",
    webhookVerifyToken: "verify",
    connectionStatus: "CONNECTED",
    coexistence: false,
  };
}

const emDias = (d: number) => Math.floor((Date.now() + d * 24 * 60 * 60 * 1000) / 1000);

describe("metaTokenHealth", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    findMany.mockReset();
    updateMany.mockReset().mockResolvedValue({ count: 1 });
    getResolvedConfig.mockReset().mockImplementation(async (id: string) => configDe(id));
    getResolvedApp.mockReset().mockResolvedValue({ appId: NOSSO_APP, appSecret: "segredo" });
  });

  afterEach(() => { vi.unstubAllGlobals(); });

  it("credencial viva, do nosso app e com folga: silêncio é permitido", async () => {
    findMany.mockResolvedValue([{ restaurantId: "r1" }]);
    vi.stubGlobal("fetch", vi.fn(async () => respostaDebugToken({
      app_id: NOSSO_APP, is_valid: true, expires_at: emDias(58), scopes: [REQUIRED_SCOPE],
    })));

    const r = await sweepMetaTokenHealth();

    expect(r.needsAttention).toBe(false);
    expect(r.attention).toEqual([]);
    expect(r.answered).toBe(1);
    expect(r.results[0].isValid).toBe(true);
    expect(r.results[0].appIdMatches).toBe(true);
    expect(r.results[0].expiresInDays).toBeGreaterThan(50);
  });

  it("credencial MORTA vira atenção com o caso concreto (guardrail 6)", async () => {
    findMany.mockResolvedValue([{ restaurantId: "sushi" }]);
    vi.stubGlobal("fetch", vi.fn(async () => respostaDebugToken({
      app_id: NOSSO_APP, is_valid: false, expires_at: emDias(-3), scopes: [REQUIRED_SCOPE],
      error: { message: "Session has expired" },
    })));

    const r = await sweepMetaTokenHealth();

    expect(r.needsAttention).toBe(true);
    expect(r.attention.join(" ")).toContain("sushi");
    expect(r.attention.join(" ")).toContain("MORTA");
    expect(r.results[0].isValid).toBe(false);
  });

  it("A METADE QUE REPRODUZ O ERRO ANTIGO: não conseguir perguntar NÃO é 'está tudo bem'", async () => {
    findMany.mockResolvedValue([{ restaurantId: "r1" }]);
    // Sem credencial de aplicativo não há como consultar a Meta. O jeito errado de
    // tratar isso — e o que quebrou o Instagram — é seguir em frente calado.
    getResolvedApp.mockResolvedValue({ appId: undefined, appSecret: undefined });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("não deveria ser chamado"); }));

    const r = await sweepMetaTokenHealth();

    expect(r.results[0].answered).toBe(false);
    expect(r.results[0].isValid).toBeNull();      // nunca `true` por omissão
    expect(r.needsAttention).toBe(true);
    expect(r.attention.join(" ")).toContain("NÃO consegui perguntar");
  });

  it("Meta fora do ar também é atenção, não aprovação", async () => {
    findMany.mockResolvedValue([{ restaurantId: "r1" }]);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNRESET"); }));

    const r = await sweepMetaTokenHealth();

    expect(r.answered).toBe(0);
    expect(r.results[0].isValid).toBeNull();
    expect(r.needsAttention).toBe(true);
  });

  it("NUNCA desconecta ninguém — só carimba saúde e vencimento (guardrail 5)", async () => {
    findMany.mockResolvedValue([{ restaurantId: "r1" }]);
    vi.stubGlobal("fetch", vi.fn(async () => respostaDebugToken({
      app_id: NOSSO_APP, is_valid: false, expires_at: emDias(-1), scopes: [REQUIRED_SCOPE],
    })));

    await sweepMetaTokenHealth();

    expect(updateMany).toHaveBeenCalledTimes(1);
    const escrito = updateMany.mock.calls[0][0].data as Record<string, unknown>;
    expect(Object.keys(escrito).sort()).toEqual(["lastHealthCheckAt", "tokenExpiresAt"]);
    expect(escrito).not.toHaveProperty("connectionStatus");
    expect(escrito).not.toHaveProperty("lastError");
  });

  it("token emitido por OUTRO aplicativo aparece — 'um só app' vira trava, não combinado", async () => {
    findMany.mockResolvedValue([{ restaurantId: "r1" }]);
    vi.stubGlobal("fetch", vi.fn(async () => respostaDebugToken({
      app_id: "999999999999", is_valid: true, expires_at: emDias(50), scopes: [REQUIRED_SCOPE],
    })));

    const r = await sweepMetaTokenHealth();

    expect(r.results[0].appIdMatches).toBe(false);
    expect(r.attention.join(" ")).toContain("OUTRO aplicativo");
  });

  it("avisa ANTES de vencer, porque o WhatsApp não tem renovação automática", async () => {
    findMany.mockResolvedValue([{ restaurantId: "r1" }]);
    vi.stubGlobal("fetch", vi.fn(async () => respostaDebugToken({
      app_id: NOSSO_APP, is_valid: true, expires_at: emDias(9), scopes: [REQUIRED_SCOPE],
    })));

    const r = await sweepMetaTokenHealth();

    expect(r.needsAttention).toBe(true);
    expect(r.attention.join(" ")).toMatch(/vence em 8|vence em 9/);
  });

  it("token de usuário de sistema (expires_at 0) não gera alarme de vencimento", async () => {
    findMany.mockResolvedValue([{ restaurantId: "r1" }]);
    vi.stubGlobal("fetch", vi.fn(async () => respostaDebugToken({
      app_id: NOSSO_APP, is_valid: true, expires_at: 0, scopes: [REQUIRED_SCOPE],
    })));

    const r = await sweepMetaTokenHealth();

    expect(r.results[0].neverExpires).toBe(true);
    expect(r.needsAttention).toBe(false);
  });

  it("permissão faltando é dita; lista de permissões VAZIA não vira acusação (guardrail 1)", async () => {
    findMany.mockResolvedValue([{ restaurantId: "r1" }]);
    vi.stubGlobal("fetch", vi.fn(async () => respostaDebugToken({
      app_id: NOSSO_APP, is_valid: true, expires_at: emDias(50), scopes: ["public_profile"],
    })));
    const comEscopoErrado = await sweepMetaTokenHealth();
    expect(comEscopoErrado.attention.join(" ")).toContain(REQUIRED_SCOPE);

    vi.stubGlobal("fetch", vi.fn(async () => respostaDebugToken({
      app_id: NOSSO_APP, is_valid: true, expires_at: emDias(50), // sem `scopes`
    })));
    const semLista = await sweepMetaTokenHealth();
    expect(semLista.results[0].hasRequiredScope).toBeNull();
    expect(semLista.attention.join(" ")).not.toContain(REQUIRED_SCOPE);
  });

  it("config que não abre (ENCRYPTION_KEY trocada) é atenção, não linha ignorada", async () => {
    findMany.mockResolvedValue([{ restaurantId: "r1" }]);
    getResolvedConfig.mockResolvedValue(null);

    const r = await sweepMetaTokenHealth();

    expect(r.needsAttention).toBe(true);
    expect(r.attention.join(" ")).toContain("não abriu");
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("zero configuração de WhatsApp é problema — o canal do restaurante sumiu", async () => {
    findMany.mockResolvedValue([]);
    const r = await sweepMetaTokenHealth();
    expect(r.totalConfigs).toBe(0);
    expect(r.needsAttention).toBe(true);
  });

  it("inspectMetaToken nunca devolve o token, nem em erro", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      json: async () => ({ error: { message: "erro com EAAabcdefghijklmnopqrstuvwxyz123456 dentro" } }),
    })));
    const r = await inspectMetaToken("EAAabcdefghijklmnopqrstuvwxyz123456");
    expect(r.error).not.toContain("EAAabcdefghijklmnopqrstuvwxyz123456");
    expect(r.answered).toBe(false);
  });
});
