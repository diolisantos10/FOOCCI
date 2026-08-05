/**
 * Cofre de credenciais — as regras que protegem uma chave-mestra.
 *
 * Um token de conta do Railway lê e altera TODOS os segredos do projeto. Por isso cada
 * uma destas regras está travada por teste, não por comentário (o comentário deste repo
 * já descreveu o contrário do que o servidor fazia, na fila de impressão):
 *
 *   (c) o valor vai para o banco CRIPTOGRAFADO — nunca em texto puro;
 *   (b) nada que a tela recebe contém o valor — só os 4 últimos caracteres;
 *   (d) toda leitura para uso grava trilha, inclusive quando falha;
 *   (5) token que o serviço RECUSOU não é guardado — nem "para corrigir depois".
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const findMany = vi.fn();
const findUnique = vi.fn();
const upsert = vi.fn();
const del = vi.fn();
const accessCreate = vi.fn();
const accessFindMany = vi.fn();
const accessGroupBy = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    infraCredential: {
      findMany: (...a: unknown[]) => findMany(...a),
      findUnique: (...a: unknown[]) => findUnique(...a),
      upsert: (...a: unknown[]) => upsert(...a),
      delete: (...a: unknown[]) => del(...a),
    },
    infraCredentialAccess: {
      create: (...a: unknown[]) => accessCreate(...a),
      findMany: (...a: unknown[]) => accessFindMany(...a),
      groupBy: (...a: unknown[]) => accessGroupBy(...a),
    },
  },
}));

// A cripto NÃO é dublê aqui, de propósito. A afirmação "o valor vai criptografado para o
// banco" só é prova se o texto puro realmente não aparecer no que se grava — com um
// stand-in tipo `enc:<plain>` o teste passaria sem provar nada. Só o Prisma é mockado.
import { encrypt } from "@/lib/crypto";

const auditLog = vi.fn();
vi.mock("@/lib/audit", () => ({ auditLog: (...a: unknown[]) => auditLog(...a) }));

const validateRailway = vi.fn();
vi.mock("./infraProviders", async (importOriginal) => {
  const real = await importOriginal<typeof import("./infraProviders")>();
  return {
    ...real,
    INFRA_SERVICES: [
      {
        slug: "railway",
        label: "Railway",
        whatItIs: "onde o Foocci fica hospedado",
        whereToGet: "railway.app → Account Settings → Tokens",
        blastRadius: "lê e troca todas as senhas do sistema",
        validate: (t: string) => validateRailway(t),
      },
    ],
    findService: (slug: string) =>
      slug === "railway"
        ? {
            slug: "railway",
            label: "Railway",
            whatItIs: "onde o Foocci fica hospedado",
            whereToGet: "railway.app → Account Settings → Tokens",
            blastRadius: "lê e troca todas as senhas do sistema",
            validate: (t: string) => validateRailway(t),
          }
        : undefined,
  };
});

import {
  InfraCredentialService,
  InvalidCredentialError,
  CredentialInputError,
} from "./InfraCredentialService";

const TOKEN = "railway-token-super-secreto-9999";
// 64 hex = 32 bytes, o formato que `@/lib/crypto` exige. Chave de teste, sem valor real.
const TEST_KEY = "0".repeat(63) + "1";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ENCRYPTION_KEY = TEST_KEY;
  findMany.mockResolvedValue([]);
  findUnique.mockResolvedValue(null);
  upsert.mockResolvedValue({});
  accessCreate.mockResolvedValue({});
  accessFindMany.mockResolvedValue([]);
  accessGroupBy.mockResolvedValue([]);
  validateRailway.mockResolvedValue({ status: "valid", detail: "Token de conta — dioli@x.com." });
});

describe("(c) o valor é gravado criptografado, nunca em texto puro", () => {
  it("o texto puro NÃO aparece em nada que vai para o banco", async () => {
    await InfraCredentialService.save({ service: "railway", token: TOKEN });

    const call = upsert.mock.calls[0]![0] as {
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    };

    // A prova: o payload inteiro serializado não contém o token em lugar nenhum.
    expect(JSON.stringify(call)).not.toContain(TOKEN);

    // E o que está lá é ciphertext no formato do `@/lib/crypto`: iv:tag:dados.
    expect(String(call.create.tokenEncrypted)).toMatch(/^[0-9a-f]{32}:[0-9a-f]{32}:[0-9a-f]+$/);
    expect(call.create.last4).toBe("9999");
    expect(call.create.tokenLength).toBe(TOKEN.length);
  });

  it("nenhum campo gravado é, por si só, o token", async () => {
    await InfraCredentialService.save({ service: "railway", token: TOKEN });
    const call = upsert.mock.calls[0]![0] as {
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    };
    for (const value of [...Object.values(call.create), ...Object.values(call.update)]) {
      expect(value).not.toBe(TOKEN);
    }
  });

  it("duas gravações do MESMO token produzem ciphertexts diferentes (IV aleatório)", async () => {
    await InfraCredentialService.save({ service: "railway", token: TOKEN });
    await InfraCredentialService.save({ service: "railway", token: TOKEN });
    const a = (upsert.mock.calls[0]![0] as { create: Record<string, unknown> }).create.tokenEncrypted;
    const b = (upsert.mock.calls[1]![0] as { create: Record<string, unknown> }).create.tokenEncrypted;
    expect(a).not.toBe(b);
  });
});

describe("(b) o que a tela recebe nunca contém o valor", () => {
  it("list() devolve last4 e não descriptografa nada", async () => {
    findMany.mockResolvedValue([
      {
        service: "railway",
        label: "Railway",
        last4: "9999",
        tokenLength: 33,
        savedBy: "admin",
        validationStatus: "valid",
        validationDetail: "Token de conta — dioli@x.com.",
        validatedAt: new Date("2026-08-04T10:00:00Z"),
        updatedAt: new Date("2026-08-04T10:00:00Z"),
      },
    ]);

    const list = await InfraCredentialService.list();

    expect(JSON.stringify(list)).not.toContain(TOKEN);
    expect(list[0]!.last4).toBe("9999");
    expect(list[0]!.stored).toBe(true);
    // A vista não tem campo de token nenhum — nem com outro nome.
    expect(Object.keys(list[0]!)).not.toContain("token");
    expect(Object.keys(list[0]!)).not.toContain("tokenEncrypted");
  });

  it("o retorno do save também é vista mascarada, não o que foi enviado", async () => {
    findUnique.mockResolvedValue({
      service: "railway",
      label: "Railway",
      last4: "9999",
      tokenLength: TOKEN.length,
      savedBy: "admin",
      validationStatus: "valid",
      validationDetail: "Token de conta — dioli@x.com.",
      validatedAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await InfraCredentialService.save({ service: "railway", token: TOKEN });

    expect(JSON.stringify(result.view)).not.toContain(TOKEN);
    expect(result.view.last4).toBe("9999");
  });

  it("o catálogo aparece mesmo sem nada guardado — o CEO vê o que PODE guardar", async () => {
    findMany.mockResolvedValue([]);
    const list = await InfraCredentialService.list();
    expect(list).toHaveLength(1);
    expect(list[0]!.service).toBe("railway");
    expect(list[0]!.stored).toBe(false);
    expect(list[0]!.last4).toBeNull();
  });
});

describe("(5) token recusado não entra no cofre", () => {
  it("o serviço recusou → lança e NÃO grava nada", async () => {
    validateRailway.mockResolvedValue({
      status: "invalid",
      detail: "O Railway respondeu que não reconhece este token.",
    });

    await expect(
      InfraCredentialService.save({ service: "railway", token: TOKEN }),
    ).rejects.toBeInstanceOf(InvalidCredentialError);

    expect(upsert).not.toHaveBeenCalled();
  });

  it("não deu para testar → guarda, mas marcado como NÃO validado", async () => {
    validateRailway.mockResolvedValue({
      status: "unknown",
      detail: "Não consegui falar com o Railway agora. Guardei sem testar.",
    });

    const result = await InfraCredentialService.save({ service: "railway", token: TOKEN });

    const call = upsert.mock.calls[0]![0] as { create: Record<string, unknown> };
    expect(call.create.validationStatus).toBe("unknown");
    expect(call.create.validatedAt).toBeNull();
    expect(result.validationStatus).toBe("unknown");
  });

  it("serviço sem validador guarda como 'unknown' — ausência de teste não é aprovação", async () => {
    const result = await InfraCredentialService.save({ service: "cloudflare", token: TOKEN });
    expect(result.validationStatus).toBe("unknown");
    expect(validateRailway).not.toHaveBeenCalled();
  });

  it("recusa apelido fora do padrão e token curto demais", async () => {
    await expect(
      InfraCredentialService.save({ service: "Rail Way!", token: TOKEN }),
    ).rejects.toBeInstanceOf(CredentialInputError);
    await expect(
      InfraCredentialService.save({ service: "railway", token: "abc" }),
    ).rejects.toBeInstanceOf(CredentialInputError);
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe("(d) leitura para uso gera registro de auditoria", () => {
  it("leitura bem-sucedida devolve o token E grava a trilha com quem/para quê", async () => {
    findUnique.mockResolvedValue({ id: "cred1", tokenEncrypted: encrypt(TOKEN) });

    const res = await InfraCredentialService.useToken("railway", {
      actor: "robo-noturno",
      purpose: "ler variáveis do deploy",
    });

    expect(res).toEqual({ ok: true, token: TOKEN });

    const row = accessCreate.mock.calls[0]![0].data as Record<string, unknown>;
    expect(row).toMatchObject({
      credentialId: "cred1",
      service: "railway",
      actor: "robo-noturno",
      purpose: "ler variáveis do deploy",
      outcome: "ok",
    });
    // A trilha jamais carrega o valor lido.
    expect(JSON.stringify(row)).not.toContain(TOKEN);

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "infra_credential.read", targetId: "railway" }),
    );
  });

  it("tentativa sem credencial guardada TAMBÉM vira trilha", async () => {
    findUnique.mockResolvedValue(null);

    const res = await InfraCredentialService.useToken("railway", {
      actor: "admin",
      purpose: "teste",
    });

    expect(res.ok).toBe(false);
    expect(accessCreate.mock.calls[0]![0].data.outcome).toBe("missing");
  });

  it("registro corrompido não derruba o chamador — degrada com trilha", async () => {
    findUnique.mockResolvedValue({ id: "cred1", tokenEncrypted: "lixo-nao-cifrado" });

    const res = await InfraCredentialService.useToken("railway", {
      actor: "admin",
      purpose: "deploy",
    });

    expect(res).toMatchObject({ ok: false, reason: "decrypt_failed" });
    expect(accessCreate.mock.calls[0]![0].data.outcome).toBe("decrypt_failed");
  });

  it("leitura sem motivo declarado é recusada — chave-mestra não admite leitura cega", async () => {
    await expect(
      InfraCredentialService.useToken("railway", { actor: "admin", purpose: "  " }),
    ).rejects.toBeInstanceOf(CredentialInputError);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("falha ao gravar a trilha não derruba a operação, mas grita no log", async () => {
    findUnique.mockResolvedValue({ id: "cred1", tokenEncrypted: encrypt(TOKEN) });
    accessCreate.mockRejectedValue(new Error("tabela fora do ar"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await InfraCredentialService.useToken("railway", {
      actor: "admin",
      purpose: "deploy",
    });

    expect(res.ok).toBe(true);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("remover", () => {
  it("apaga e registra; a trilha de quem já usou não é tocada aqui", async () => {
    del.mockResolvedValue({});
    const removed = await InfraCredentialService.remove("railway");
    expect(removed).toBe(true);
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "infra_credential.delete", targetId: "railway" }),
    );
  });

  it("devolve false quando não havia nada para apagar", async () => {
    del.mockRejectedValue(new Error("not found"));
    expect(await InfraCredentialService.remove("railway")).toBe(false);
  });
});
