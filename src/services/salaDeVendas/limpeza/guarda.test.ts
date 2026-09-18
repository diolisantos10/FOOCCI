import { describe, expect, it } from "vitest";
import { CABECALHO_DO_SEGREDO, VARIAVEL_DO_SEGREDO, conferirSegredo } from "./guarda";

const SEGREDO = "um-segredo-bem-comprido-123";

describe("guarda da limpeza de conversas", () => {
  it("sem variável configurada, a porta está fechada (503)", () => {
    const r = conferirSegredo({ proprio: SEGREDO, authorization: null }, {} as NodeJS.ProcessEnv);
    expect(r).toMatchObject({ ok: false, status: 503 });
  });

  it("segredo curto não liga a porta", () => {
    const env = { [VARIAVEL_DO_SEGREDO]: "curto" } as unknown as NodeJS.ProcessEnv;
    expect(conferirSegredo({ proprio: "curto", authorization: null }, env)).toMatchObject({
      status: 503,
    });
  });

  it("segredo errado é 401", () => {
    const env = { [VARIAVEL_DO_SEGREDO]: SEGREDO } as unknown as NodeJS.ProcessEnv;
    expect(conferirSegredo({ proprio: "outro-segredo-comprido", authorization: null }, env)).toMatchObject({
      ok: false,
      status: 401,
    });
  });

  it("aceita o cabeçalho próprio e o Bearer", () => {
    const env = { [VARIAVEL_DO_SEGREDO]: SEGREDO } as unknown as NodeJS.ProcessEnv;
    expect(conferirSegredo({ proprio: SEGREDO, authorization: null }, env)).toEqual({ ok: true });
    expect(conferirSegredo({ proprio: null, authorization: `Bearer ${SEGREDO}` }, env)).toEqual({
      ok: true,
    });
    expect(CABECALHO_DO_SEGREDO).toBe("x-limpeza-conversas-secret");
  });

  it("não encosta em nenhum segredo de outra porta", () => {
    const env = {
      CRON_SECRET: SEGREDO,
      ADMIN_SECRET: SEGREDO,
      REABORDAGEM_SECRET: SEGREDO,
      RELIGAMENTO_FRIO_SECRET: SEGREDO,
    } as unknown as NodeJS.ProcessEnv;
    expect(conferirSegredo({ proprio: SEGREDO, authorization: null }, env)).toMatchObject({
      status: 503,
    });
  });
});
