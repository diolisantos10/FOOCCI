/**
 * "Unsupported request" NÃO é endpoint errado — é permissão faltando.
 *
 * O CASO REAL, 14/08/2026. A conexão do Sushi Cazza nasceu com ZERO dia e o banco
 * guardava:
 *   troca:      "Unsupported request - method type: get (code 100)"
 *   inscrição:  "Unsupported request - method type: post"
 *
 * A leitura natural — e a que esta casa seguiu por quatro tentativas — é "host ou
 * verbo errado". **Está errada**, e dá para provar sem tocar em produção:
 *
 *   $ curl "https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=zzz&access_token=zzz"
 *   {"error":{"message":"Invalid OAuth access token...","code":190}}
 *
 *   $ curl -X POST "https://graph.instagram.com/v21.0/<id>/subscribed_apps?subscribed_fields=messages&access_token=zzz"
 *   {"error":{"message":"Invalid OAuth access token...","code":190}}
 *
 * Os endpoints EXISTEM: com token inválido eles respondem **190**, não 100. A Meta
 * avalia o token primeiro e a OPERAÇÃO depois. Nossa chamada passou do 190 e morreu
 * no 100 — logo o token era válido e o que foi recusado foi a operação, por falta de
 * permissão. A doc do `/access_token` lista `instagram_business_basic` em "Permissions".
 *
 * A evidência que provaria isso na hora vinha no PASSO 1 (`permissions`) e era jogada
 * fora. Estes testes travam a captura dela e as três leituras que ela destrava.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  realInstagramLoginGraph,
  missingInstagramPermissions,
  INSTAGRAM_REQUIRED_PERMISSIONS,
} from "../instagramLoginOAuth";

const CREDS = { appId: "ig-app", appSecret: "ig-secret" };

/** Resposta do passo 1 no formato do Business Login (envelope `data[]`). */
function passo1(permissions?: string, extra: Record<string, unknown> = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data: [{ access_token: "IGAAshort", user_id: 17841400008460056, permissions, ...extra }] }),
  };
}
const UNSUPPORTED_GET  = { ok: false, status: 400, json: async () => ({ error: { message: "Unsupported request - method type: get", code: 100 } }) };
const UNSUPPORTED_POST = { ok: false, status: 400, json: async () => ({ error: { message: "Unsupported request - method type: post", code: 100 } }) };

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("permissões concedidas — a evidência que era descartada", () => {
  it("captura `permissions` do passo 1 (formato string separada por vírgula)", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("api.instagram.com")) {
        return passo1("instagram_business_basic,instagram_business_manage_messages");
      }
      if (String(url).includes("grant_type=ig_exchange_token")) {
        return { ok: true, status: 200, json: async () => ({ access_token: "IGAAlong", expires_in: 5184000 }) };
      }
      return { ok: true, status: 200, json: async () => ({ user_id: "178414", username: "sushicazza" }) };
    }));

    const p = await realInstagramLoginGraph.exchange({ code: "c", redirectUri: "https://foocci.com.br/cb", creds: CREDS });

    expect(p.grantedPermissions).toEqual(["instagram_business_basic", "instagram_business_manage_messages"]);
    expect(p.expiresInSeconds).toBe(5184000);
    expect(p.profileError).toBeNull();
  });

  it("A METADE QUE REPRODUZ O CASO DE 14/08: sem permissão, a troca devolve 'Unsupported request' e o token nasce curto", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      // A Meta concedeu NADA além do básico de login — falta instagram_business_basic.
      if (String(url).includes("api.instagram.com")) return passo1("");
      if (String(url).includes("grant_type=ig_exchange_token")) return UNSUPPORTED_GET;
      return { ok: true, status: 200, json: async () => ({ user_id: "178414", username: "sushicazza" }) };
    }));

    const promessa = realInstagramLoginGraph.exchange({ code: "c", redirectUri: "https://foocci.com.br/cb", creds: CREDS });
    await vi.runAllTimersAsync();
    const p = await promessa;

    // O token nasce com 1h — a assinatura do fallback.
    expect(p.expiresInSeconds).toBe(3600);
    // E o motivo LITERAL da Meta sobrevive, para não morrer com o deploy.
    expect(p.longLivedError).toContain("Unsupported request");
    expect(p.longLivedError).toContain("code 100");
    // A permissão vazia é o que explica o 'Unsupported request'.
    expect(p.grantedPermissions).toEqual([]);
  });

  it("aceita `permissions` como array, sem se perder no formato", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("api.instagram.com")) {
        return { ok: true, status: 200, json: async () => ({ access_token: "IGAAshort", user_id: 1, permissions: ["instagram_business_basic"] }) };
      }
      if (String(url).includes("grant_type=ig_exchange_token")) {
        return { ok: true, status: 200, json: async () => ({ access_token: "L", expires_in: 5184000 }) };
      }
      return { ok: true, status: 200, json: async () => ({ user_id: "1", username: "x" }) };
    }));

    const p = await realInstagramLoginGraph.exchange({ code: "c", redirectUri: "r", creds: CREDS });
    expect(p.grantedPermissions).toEqual(["instagram_business_basic"]);
  });
});

describe("missingInstagramPermissions", () => {
  it("aponta exatamente o que falta", () => {
    expect(missingInstagramPermissions(["instagram_business_basic"]))
      .toEqual(["instagram_business_manage_messages"]);
  });

  it("lista completa não acusa nada", () => {
    expect(missingInstagramPermissions([...INSTAGRAM_REQUIRED_PERMISSIONS])).toEqual([]);
  });

  it("AUSENTE (null) não vira acusação — é 'não sei' (guardrail 1)", () => {
    // Conexões anteriores a 14/08 não gravaram permissões, e a Meta pode
    // simplesmente não devolver o campo. Ausência de informação não é informação.
    expect(missingInstagramPermissions(null)).toEqual([]);
    expect(missingInstagramPermissions(undefined)).toEqual([]);
  });

  it("VAZIO ([]) É informação: a Meta disse que não concedeu nada, então tudo falta", () => {
    // 24/08/2026 — a correção que destravou o diagnóstico do Sushi Cazza. Antes,
    // `[]` e "não sei" eram a mesma coisa, e o único fato que explicava os três
    // `Unsupported request` de uma vez era engolido pelo guardrail 1.
    expect(missingInstagramPermissions([])).toEqual([...INSTAGRAM_REQUIRED_PERMISSIONS]);
  });
});

describe("o /me deixou de engolir erro", () => {
  it("A METADE QUE REPRODUZ O ERRO ANTIGO: HTTP 400 no /me não lança — antes virava silêncio", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("api.instagram.com")) return passo1("instagram_business_basic");
      if (String(url).includes("grant_type=ig_exchange_token")) {
        return { ok: true, status: 200, json: async () => ({ access_token: "L", expires_in: 5184000 }) };
      }
      return { ok: false, status: 400, json: async () => ({ error: { message: "Unsupported request - method type: get", code: 100 } }) };
    }));

    const p = await realInstagramLoginGraph.exchange({ code: "c", redirectUri: "r", creds: CREDS });

    // Antes: profileError não existia, username virava null e ninguém sabia por quê.
    expect(p.profileError).toContain("Unsupported request");
    expect(p.profileError).toContain("code 100");
    expect(p.username).toBeNull();
    // E o id NÃO é sobrescrito com lixo: cai no id do passo 1, de forma declarada.
    expect(p.igUserId).toBe("17841400008460056");
  });
});

describe("inscrição no webhook", () => {
  it("tenta `me` primeiro, como a doc da Meta prescreve", async () => {
    const chamadas: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      chamadas.push(String(url));
      return { ok: true, status: 200, json: async () => ({ success: true }) };
    }));

    const r = await realInstagramLoginGraph.subscribe!({ igUserId: "178414", token: "T" });

    expect(r.ok).toBe(true);
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]).toContain("/me/subscribed_apps");
    expect(chamadas[0]).toContain("subscribed_fields=messages");
  });

  it("se `me` falhar, tenta o id numérico antes de desistir", async () => {
    const chamadas: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      chamadas.push(String(url));
      return String(url).includes("/me/") ? UNSUPPORTED_POST : { ok: true, status: 200, json: async () => ({ success: true }) };
    }));

    const r = await realInstagramLoginGraph.subscribe!({ igUserId: "178414", token: "T" });

    expect(r.ok).toBe(true);
    expect(chamadas).toHaveLength(2);
    expect(chamadas[1]).toContain("/178414/subscribed_apps");
  });

  it("falhando nos dois, o erro diz QUAL alvo falhou — o alerta carrega a evidência", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => UNSUPPORTED_POST));

    const r = await realInstagramLoginGraph.subscribe!({ igUserId: "178414", token: "T" });

    expect(r.ok).toBe(false);
    expect(r.error).toContain("Unsupported request");
    expect(r.error).toContain("alvo: 178414");
  });

  it("`success:false` com HTTP 200 não passa por sucesso", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ success: false }) })));
    const r = await realInstagramLoginGraph.subscribe!({ igUserId: "178414", token: "T" });
    expect(r.ok).toBe(false);
  });
});
