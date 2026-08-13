/**
 * Portão de `POST /api/admin/reset-owner` — a rota que APAGA contas de usuário.
 *
 * As duas metades: reprova sem credencial / sem alvo / sem confirmação, e passa
 * com as três. E prova a coisa que mais importa num produto multi-restaurante:
 * ela apaga o restaurante QUE FOI PEDIDO, nunca "um ativo qualquer".
 *
 * SABOTAGEM CONFERIDA (13/08):
 *   - trocar `checkAdminSecretHeader` por `true` → caso (1)/(2) reprova;
 *   - voltar ao `findFirst({ isActive: true })` sem slug → caso (5) reprova;
 *   - aceitar corpo sem `confirm` → caso (4) reprova.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const findUnique = vi.fn();
const deleteMany = vi.fn();
const count = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    restaurant: { findUnique: (...a: unknown[]) => findUnique(...a) },
    user: {
      deleteMany: (...a: unknown[]) => deleteMany(...a),
      count: (...a: unknown[]) => count(...a),
    },
  },
}));

import { POST } from "./route";

const SEGREDO = "segredo-de-operador-bem-comprido-123456";
const ALVO = { restaurantSlug: "pizzaria-nonna", confirm: "APAGAR-USUARIOS" };

function req(body: unknown, secret?: string) {
  const headers = new Headers();
  if (secret !== undefined) headers.set("x-admin-secret", secret);
  return {
    headers,
    json: async () => body,
  } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ADMIN_SECRET", SEGREDO);
  findUnique.mockResolvedValue({ id: "r1", name: "Pizzaria Nonna", slug: "pizzaria-nonna" });
  deleteMany.mockResolvedValue({ count: 3 });
  count.mockResolvedValue(3);
});

describe("reset-owner — a credencial", () => {
  it("(1) sem ADMIN_SECRET no servidor a rota está DESLIGADA (403), não liberada", async () => {
    vi.stubEnv("ADMIN_SECRET", "");
    const res = await POST(req(ALVO, SEGREDO));
    expect(res.status).toBe(403);
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it("(2) segredo errado, ausente ou vazio → 401 e nada é apagado", async () => {
    for (const tentativa of [undefined, "", "chute", `${SEGREDO}x`]) {
      const res = await POST(req(ALVO, tentativa));
      expect(res.status, `tentativa ${JSON.stringify(tentativa)}`).toBe(401);
    }
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it("(3) nenhuma resposta devolve o segredo, nem pedaço dele", async () => {
    const respostas = await Promise.all([
      POST(req(ALVO, "chute")),
      POST(req({}, SEGREDO)),
      POST(req(ALVO, SEGREDO)),
    ]);
    for (const res of respostas) {
      const texto = JSON.stringify(await res.json());
      expect(texto).not.toContain(SEGREDO);
      expect(texto).not.toContain(SEGREDO.slice(0, 8));
    }
  });
});

describe("reset-owner — a mira", () => {
  it("(4) com credencial mas SEM alvo ou SEM confirmação → 400 e nada é apagado", async () => {
    const semAlvo = await POST(req({ confirm: "APAGAR-USUARIOS" }, SEGREDO));
    expect(semAlvo.status).toBe(400);

    const semConfirmacao = await POST(req({ restaurantSlug: "pizzaria-nonna" }, SEGREDO));
    expect(semConfirmacao.status).toBe(400);

    const confirmacaoErrada = await POST(
      req({ restaurantSlug: "pizzaria-nonna", confirm: "sim" }, SEGREDO),
    );
    expect(confirmacaoErrada.status).toBe(400);

    expect(deleteMany).not.toHaveBeenCalled();
  });

  it("(5) apaga SÓ o restaurante pedido — o alvo vem do slug, não do banco", async () => {
    const res = await POST(req(ALVO, SEGREDO));
    expect(res.status).toBe(200);
    expect(findUnique).toHaveBeenCalledWith({
      where: { slug: "pizzaria-nonna" },
      select: { id: true, name: true, slug: true },
    });
    expect(deleteMany).toHaveBeenCalledWith({ where: { restaurantId: "r1" } });
    expect((await res.json()).deletedUsers).toBe(3);
  });

  it("(6) slug inexistente → 404 e nada é apagado", async () => {
    findUnique.mockResolvedValue(null);
    const res = await POST(req({ ...ALVO, restaurantSlug: "nao-existe" }, SEGREDO));
    expect(res.status).toBe(404);
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it("(7) dryRun conta e NÃO apaga — o ponto de reversão antes do gesto", async () => {
    const res = await POST(req({ ...ALVO, dryRun: true }, SEGREDO));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.dryRun).toBe(true);
    expect(body.wouldDeleteUsers).toBe(3);
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it("(8) as mensagens de erro estão em português", async () => {
    const body = await (await POST(req({}, SEGREDO))).json();
    expect(body.error).toMatch(/[çãáéê]/);
    expect(body.error).not.toMatch(/Unauthorized|Bad Request/i);
  });
});
