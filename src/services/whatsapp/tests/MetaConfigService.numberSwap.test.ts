/**
 * A trava que impede a troca ACIDENTAL do número de WhatsApp de um restaurante.
 *
 * ── Por que esta trava existe, para ninguém remover achando que é zelo ───────────
 * `MetaConfigService.upsert` tem chave `restaurantId`, não o número. Sem guarda,
 * conectar um SEGUNDO número no mesmo restaurante SOBRESCREVE o primeiro —
 * `phoneNumberId`, `wabaId` e token trocados de uma vez, sem erro e sem log. O número
 * que sai deixa de ser reconhecido pelo webhook de entrada (`getByPhoneNumberId`
 * devolve null) e toda mensagem que os clientes mandarem para ele passa a ser
 * DESCARTADA em silêncio, num `console.warn` que morre no deploy seguinte.
 *
 * Não era hipótese: a tela tem o botão "Conectar número que está no celular"
 * (MetaProviderCard.tsx:439) ao lado de um restaurante já conectado. Um clique
 * bastava para derrubar o número que atende o restaurante agora.
 *
 * ── As DUAS metades, porque só a primeira não prova nada ────────────────────────
 * Uma guarda que só recusa é fácil de escrever e quebra o que é legítimo. Os casos
 * de "passa" valem tanto quanto os de "recusa": se a renovação de token parar de
 * funcionar, o token expira em 60 dias e ninguém consegue renovar — uma queda pior
 * do que a que se está evitando (guardrail 5).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const findUnique = vi.fn();
const upsert     = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    metaWhatsAppConfig: {
      findUnique: (...args: unknown[]) => findUnique(...args),
      upsert:     (...args: unknown[]) => upsert(...args),
    },
  },
}));

// Stand-ins determinísticos: o `enc:` marca "criptografado" sem depender do AES real.
vi.mock("@/lib/crypto", () => ({
  encrypt:    (plain: string) => `enc:${plain}`,
  decrypt:    (stored: string) => stored.replace(/^enc:/, ""),
  maskSecret: () => "***",
}));

import { MetaConfigService, MetaNumberSwapBlockedError } from "../MetaConfigService";

const RESTAURANTE = "rest_1";

/** O número que está no ar hoje. */
const NUMERO_ATIVO = {
  phoneNumberId:      "111111111111111",
  connectionStatus:   "CONNECTED",
  displayPhoneNumber: "+55 11 91896-4947",
};

function conectar(phoneNumberId: string, extra: Partial<Parameters<typeof MetaConfigService.upsert>[0]> = {}) {
  return MetaConfigService.upsert({
    restaurantId:  RESTAURANTE,
    wabaId:        "waba_1",
    phoneNumberId,
    accessToken:   "token-novo",
    ...extra,
  });
}

beforeEach(() => {
  findUnique.mockReset();
  upsert.mockReset();
  upsert.mockResolvedValue(undefined);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("MetaConfigService.upsert — trava de troca de número", () => {
  // ── Metade 1: RECUSA ─────────────────────────────────────────────────────────

  it("RECUSA conectar um número DIFERENTE quando já existe um CONNECTED", async () => {
    findUnique.mockResolvedValue(NUMERO_ATIVO);

    await expect(conectar("999999999999999")).rejects.toBeInstanceOf(MetaNumberSwapBlockedError);

    // O que mais importa: NADA foi gravado. Fail-closed de verdade é não escrever.
    expect(upsert).not.toHaveBeenCalled();
  });

  it("a recusa diz o CONSERTO, não o sintoma", async () => {
    findUnique.mockResolvedValue(NUMERO_ATIVO);

    const erro = await conectar("999999999999999").catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(MetaNumberSwapBlockedError);
    const msg = (erro as MetaNumberSwapBlockedError).message;
    // Quem lê precisa saber QUAL número está lá e O QUE FAZER para trocar.
    expect(msg).toContain("+55 11 91896-4947");
    expect(msg).toContain("Desconectar");
    expect(msg.toLowerCase()).toContain("desconecte o atual");
  });

  it("FAIL-CLOSED: status desconhecido também recusa", async () => {
    // Uma allowlist de estados "trocáveis" existe justamente para isto. Se a guarda
    // bloqueasse apenas CONNECTED, bastaria um health-check marcar ERROR para a troca
    // silenciosa voltar a ser possível.
    for (const connectionStatus of ["PENDING", "ERROR", "ALGO_QUE_ALGUEM_INVENTOU"]) {
      findUnique.mockResolvedValue({ ...NUMERO_ATIVO, connectionStatus });
      await expect(conectar("999999999999999")).rejects.toBeInstanceOf(MetaNumberSwapBlockedError);
      expect(upsert).not.toHaveBeenCalled();
    }
  });

  // ── Metade 2: PASSA — o que quebraria se a trava fosse grosseira ─────────────

  it("PASSA ao renovar o token do MESMO número (é o caminho legítimo mais comum)", async () => {
    findUnique.mockResolvedValue(NUMERO_ATIVO);

    await expect(
      conectar(NUMERO_ATIVO.phoneNumberId, { accessToken: "token-renovado" }),
    ).resolves.toBeUndefined();

    expect(upsert).toHaveBeenCalledTimes(1);
    const arg = upsert.mock.calls[0][0] as { update: { accessToken: string } };
    expect(arg.update.accessToken).toBe("enc:token-renovado");
  });

  it("PASSA ao trocar a WABA do MESMO número — muda o dado, não o número", async () => {
    findUnique.mockResolvedValue(NUMERO_ATIVO);

    await expect(
      conectar(NUMERO_ATIVO.phoneNumberId, { wabaId: "waba_nova" }),
    ).resolves.toBeUndefined();

    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("PASSA no PRIMEIRO número de um restaurante que ainda não tem config", async () => {
    findUnique.mockResolvedValue(null);

    await expect(conectar("999999999999999")).resolves.toBeUndefined();

    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("PASSA depois de desconectar — a saída explícita existe", async () => {
    findUnique.mockResolvedValue({ ...NUMERO_ATIVO, connectionStatus: "DISCONNECTED" });

    await expect(conectar("999999999999999")).resolves.toBeUndefined();

    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("espaço em volta do id não engana a comparação (seria uma troca falsa)", async () => {
    findUnique.mockResolvedValue(NUMERO_ATIVO);

    await expect(conectar(` ${NUMERO_ATIVO.phoneNumberId} `)).resolves.toBeUndefined();

    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("a guarda não lê segredo — um token corrompido não pode derrubá-la", async () => {
    // `getResolved` descriptografaria accessToken/webhookVerifyToken; a guarda usa
    // `select` com três campos não sensíveis. Se alguém trocar isso por getResolved,
    // uma linha com ciphertext quebrado passa a estourar ANTES da checagem — e a
    // proteção vira mais destrutiva que o problema (guardrail 5).
    findUnique.mockResolvedValue(NUMERO_ATIVO);
    await conectar(NUMERO_ATIVO.phoneNumberId);

    const arg = findUnique.mock.calls[0][0] as { select: Record<string, boolean> };
    expect(arg.select).toEqual({ phoneNumberId: true, connectionStatus: true, displayPhoneNumber: true });
    expect(arg.select).not.toHaveProperty("accessToken");
    expect(arg.select).not.toHaveProperty("webhookVerifyToken");
  });
});
