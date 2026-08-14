/**
 * A precedência BANCO → AMBIENTE, agora também no Instagram.
 *
 * A regra da casa é uma só: leia `MetaAppCredentialsService.getResolved()`, nunca
 * `process.env.META_*` direto — porque a tela `/admin/meta` pode ter um valor que o
 * Railway não tem. Três consumidores do Instagram furavam essa regra (achado 1 do
 * raio-x de 05/08, em `docs/agents/meta/oficina.md`).
 *
 * O EFEITO DO FURO, que é o motivo destes testes existirem: rotacionar o segredo do
 * aplicativo pela tela, sem atualizar o Railway, deixava o WhatsApp com a credencial
 * NOVA e o Instagram com a VELHA. Dois valores em vigor ao mesmo tempo, para o mesmo
 * aplicativo, sem erro nenhum — falha silenciosa, que é a pior espécie.
 *
 * Cada caso tem as duas metades: o acerto novo e a garantia de que o caminho antigo
 * (só ambiente) continua funcionando, para que subir isto não possa quebrar um deploy
 * que já estava bom.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const getResolved = vi.fn();
vi.mock("@/services/meta/MetaAppCredentialsService", () => ({
  MetaAppCredentialsService: { getResolved: () => getResolved() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/crypto", () => ({ encrypt: (s: string) => s, decrypt: (s: string) => s, maskSecret: () => "***" }));

import { resolveInstagramLoginCreds } from "./instagramLoginOAuth";
import { resolveMetaAppCreds } from "./metaOAuth";

const CHAVES = [
  "META_APP_ID", "META_APP_SECRET", "FACEBOOK_APP_ID", "FACEBOOK_APP_SECRET",
  "INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET",
];
const original: Record<string, string | undefined> = {};

describe("precedência de credencial do aplicativo Meta", () => {
  beforeEach(() => {
    for (const k of CHAVES) { original[k] = process.env[k]; delete process.env[k]; }
    getResolved.mockReset();
  });
  afterEach(() => {
    for (const k of CHAVES) {
      if (original[k] === undefined) delete process.env[k];
      else process.env[k] = original[k];
    }
  });

  it("Instagram: o valor salvo na TELA vence o do Railway", async () => {
    process.env.INSTAGRAM_APP_ID = "id-velho-do-railway";
    process.env.INSTAGRAM_APP_SECRET = "segredo-velho-do-railway";
    getResolved.mockResolvedValue({ igAppId: "id-novo-da-tela", igAppSecret: "segredo-novo-da-tela" });

    const creds = await resolveInstagramLoginCreds();

    expect(creds).toEqual({ appId: "id-novo-da-tela", appSecret: "segredo-novo-da-tela" });
  });

  it("Instagram: sem nada salvo na tela, o Railway continua valendo (nada quebra)", async () => {
    process.env.INSTAGRAM_APP_ID = "id-do-railway";
    process.env.INSTAGRAM_APP_SECRET = "segredo-do-railway";
    getResolved.mockResolvedValue({});

    expect(await resolveInstagramLoginCreds()).toEqual({ appId: "id-do-railway", appSecret: "segredo-do-railway" });
  });

  it("Instagram: banco fora do ar NÃO impede uma conexão que o ambiente sustentava (guardrail 5)", async () => {
    process.env.INSTAGRAM_APP_ID = "id-do-railway";
    process.env.INSTAGRAM_APP_SECRET = "segredo-do-railway";
    getResolved.mockRejectedValue(new Error("banco indisponível"));

    expect(await resolveInstagramLoginCreds()).toEqual({ appId: "id-do-railway", appSecret: "segredo-do-railway" });
  });

  it("Instagram: sem credencial em lugar nenhum devolve null — nunca um par pela metade", async () => {
    getResolved.mockResolvedValue({});
    expect(await resolveInstagramLoginCreds()).toBeNull();

    process.env.INSTAGRAM_APP_ID = "só-o-id";
    expect(await resolveInstagramLoginCreds()).toBeNull();
  });

  it("WhatsApp/Facebook: o valor salvo na TELA vence o do Railway", async () => {
    process.env.META_APP_ID = "id-velho";
    process.env.META_APP_SECRET = "segredo-velho";
    getResolved.mockResolvedValue({ appId: "id-novo", appSecret: "segredo-novo" });

    expect(await resolveMetaAppCreds()).toEqual({ appId: "id-novo", appSecret: "segredo-novo" });
  });

  it("WhatsApp/Facebook: sem nada na tela, o ambiente continua valendo", async () => {
    process.env.META_APP_ID = "id-do-railway";
    process.env.META_APP_SECRET = "segredo-do-railway";
    getResolved.mockResolvedValue({});

    expect(await resolveMetaAppCreds()).toEqual({ appId: "id-do-railway", appSecret: "segredo-do-railway" });
  });

  it("nenhuma das funções devolve credencial pela metade (id sem segredo, ou o contrário)", async () => {
    getResolved.mockResolvedValue({ appId: "só-id", igAppId: "só-id" });
    expect(await resolveMetaAppCreds()).toBeNull();
    expect(await resolveInstagramLoginCreds()).toBeNull();
  });
});
