/**
 * Portão da rota /api/cron/expire-wa-ordering-sessions.
 *
 * A rota é pública no middleware (`/^\/api\/cron(\/.*)?$/`). O que a fecha é
 * exclusivamente este Bearer. O defeito que este teste existe para impedir de
 * voltar: `if (secret) { ...confere... }` — que, sem CRON_SECRET, não conferia
 * nada e deixava a rota aberta para a internet em silêncio.
 *
 * As duas metades são obrigatórias: reprovar sem a credencial não prova nada
 * sozinho, porque negar tudo também passaria. Por isso o caso (4) prova que COM
 * a credencial a rota efetivamente executa.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as routeModule from "./route";

const expireOldSessions = vi.fn();

vi.mock("@/services/whatsapp/ordering/WhatsAppOrderingSessionService", () => ({
  WhatsAppOrderingSessionService: {
    expireOldSessions: (...a: unknown[]) => expireOldSessions(...a),
  },
}));

import { POST } from "./route";

function req(headers: Record<string, string> = {}) {
  return {
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
  } as unknown as Parameters<typeof POST>[0];
}

const OLD = process.env.CRON_SECRET;
beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "s3cr3t";
  expireOldSessions.mockResolvedValue(7);
});
afterEach(() => {
  process.env.CRON_SECRET = OLD;
});

describe("POST /api/cron/expire-wa-ordering-sessions — metade 1: REPROVA sem a credencial", () => {
  it("(1) sem cabeçalho Authorization → 401 e não executa", async () => {
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(expireOldSessions).not.toHaveBeenCalled();
  });

  it("(2) com segredo errado → 401 e não executa", async () => {
    const res = await POST(req({ authorization: "Bearer errado" }));
    expect(res.status).toBe(401);
    expect(expireOldSessions).not.toHaveBeenCalled();
  });

  it("(3) FALHA FECHADA: sem CRON_SECRET configurado → 503, nunca liberado", async () => {
    delete process.env.CRON_SECRET;
    const res = await POST(req({ authorization: "Bearer qualquer-coisa" }));
    expect(res.status).toBe(503);
    expect(expireOldSessions).not.toHaveBeenCalled();
  });

  it("(3b) FALHA FECHADA: sem CRON_SECRET e SEM cabeçalho nenhum → 503", async () => {
    // Este é exatamente o pedido que o `if (secret)` antigo deixava passar.
    delete process.env.CRON_SECRET;
    const res = await POST(req());
    expect(res.status).toBe(503);
    expect(expireOldSessions).not.toHaveBeenCalled();
  });

  it("(3c) CRON_SECRET vazio conta como ausente → 503", async () => {
    process.env.CRON_SECRET = "";
    const res = await POST(req({ authorization: "Bearer " }));
    expect(res.status).toBe(503);
    expect(expireOldSessions).not.toHaveBeenCalled();
  });
});

describe("POST /api/cron/expire-wa-ordering-sessions — metade 2: PASSA com a credencial", () => {
  it("(4) com o Bearer correto → 200 e executa de verdade", async () => {
    const res = await POST(req({ authorization: "Bearer s3cr3t" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(expireOldSessions).toHaveBeenCalledTimes(1);
    expect(body).toMatchObject({ ok: true, expired: 7 });
  });
});

describe("POST /api/cron/expire-wa-ordering-sessions — superfície", () => {
  it("(5) não expõe handler GET", () => {
    expect((routeModule as Record<string, unknown>).GET).toBeUndefined();
  });
});
