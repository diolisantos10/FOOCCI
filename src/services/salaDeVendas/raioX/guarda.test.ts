/**
 * A guarda do raio-x: fechada sem a variável, e sem encosto em segredo alheio.
 */

import { describe, it, expect } from "vitest";
import {
  CABECALHO_DO_SEGREDO,
  TAMANHO_MINIMO_DO_SEGREDO,
  VARIAVEL_DO_SEGREDO,
  conferirSegredo,
  segredoConfere,
  segredoDaPorta,
} from "./guarda";

const BOM = "segredo-do-raio-x-comercial-2026";

describe("a variável é PRÓPRIA", () => {
  it("o nome é RAIOX_COMERCIAL_SECRET e o cabeçalho é o dela", () => {
    expect(VARIAVEL_DO_SEGREDO).toBe("RAIOX_COMERCIAL_SECRET");
    expect(CABECALHO_DO_SEGREDO).toBe("x-raiox-comercial-secret");
  });

  it("⛔ CRON_SECRET e ADMIN_SECRET NÃO abrem esta porta", () => {
    const env = { CRON_SECRET: BOM, ADMIN_SECRET: BOM } as NodeJS.ProcessEnv;
    expect(segredoDaPorta(env)).toBeNull();
    const r = conferirSegredo({ proprio: BOM, authorization: `Bearer ${BOM}` }, env);
    expect(r).toEqual({ ok: false, status: 503, motivo: expect.stringContaining("não está configurada") });
  });
});

describe("fail-closed", () => {
  it("sem a variável: 503, e a porta está DESLIGADA, não desautorizada", () => {
    const r = conferirSegredo({ proprio: BOM, authorization: null }, {} as NodeJS.ProcessEnv);
    expect(r.ok).toBe(false);
    expect(r).toMatchObject({ status: 503 });
  });

  it("variável curta demais é porta desligada, não segredo fraco", () => {
    const curto = "a".repeat(TAMANHO_MINIMO_DO_SEGREDO - 1);
    const env = { [VARIAVEL_DO_SEGREDO]: curto } as NodeJS.ProcessEnv;
    expect(segredoDaPorta(env)).toBeNull();
    expect(conferirSegredo({ proprio: curto, authorization: null }, env)).toMatchObject({ status: 503 });
  });

  it("variável presente e segredo errado: 401", () => {
    const env = { [VARIAVEL_DO_SEGREDO]: BOM } as NodeJS.ProcessEnv;
    expect(conferirSegredo({ proprio: "errado", authorization: null }, env)).toMatchObject({ status: 401 });
    expect(conferirSegredo({ proprio: null, authorization: null }, env)).toMatchObject({ status: 401 });
  });

  it("segredo certo abre pelo cabeçalho próprio ou pelo Bearer", () => {
    const env = { [VARIAVEL_DO_SEGREDO]: BOM } as NodeJS.ProcessEnv;
    expect(conferirSegredo({ proprio: BOM, authorization: null }, env)).toEqual({ ok: true });
    expect(conferirSegredo({ proprio: null, authorization: `Bearer ${BOM}` }, env)).toEqual({ ok: true });
  });
});

describe("a comparação", () => {
  it("compara hashes de tamanho fixo — tamanho diferente não estoura", () => {
    expect(segredoConfere("x", BOM)).toBe(false);
    expect(segredoConfere("x".repeat(9999), BOM)).toBe(false);
    expect(segredoConfere(BOM, BOM)).toBe(true);
    expect(segredoConfere(null, BOM)).toBe(false);
  });

  it("o fonte usa timingSafeEqual — comparar segredo com === vaza tempo", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const fonte = fs.readFileSync(path.join(__dirname, "guarda.ts"), "utf8");
    expect(fonte).toContain("timingSafeEqual");
    expect(fonte).not.toMatch(/recebido === esperado/);
  });
});
