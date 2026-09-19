/**
 * As três travas contra a tempestade de webhooks (19/09/2026).
 *
 * O que cada caso prova está no nome. O caso que importa mais é o primeiro:
 * o trabalho NÃO pode acontecer antes de quem chamou seguir em frente.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  enfileirarEnvelope,
  profundidadeDaFila,
  jaProcessado,
  amostrar,
  zerarEstadoDaTempestade,
  JANELA_DE_REENTREGA_MS,
  INTERVALO_DE_AMOSTRA_MS,
} from "./tempestade";

beforeEach(() => zerarEstadoDaTempestade());

describe("fila serial de envelopes", () => {
  it("devolve o controle ANTES de o trabalho rodar — é o que quebra o laço da Meta", async () => {
    let rodou = false;
    const p = enfileirarEnvelope(async () => { rodou = true; });
    expect(rodou).toBe(false); // quem chamou já pode responder 200
    await p;
    expect(rodou).toBe(true);
  });

  it("roda um de cada vez, nunca dois em paralelo", async () => {
    let emVoo = 0;
    let maximo = 0;
    const trabalho = async () => {
      emVoo += 1;
      maximo = Math.max(maximo, emVoo);
      await new Promise((r) => setTimeout(r, 1));
      emVoo -= 1;
    };
    await Promise.all([1, 2, 3, 4, 5].map(() => enfileirarEnvelope(trabalho)));
    expect(maximo).toBe(1);
  });

  it("um envelope que estoura não derruba o próximo, e a falha é registrada", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    let seguinte = false;
    const a = enfileirarEnvelope(async () => { throw new Error("boom"); });
    const b = enfileirarEnvelope(async () => { seguinte = true; });
    await expect(a).resolves.toBeUndefined();
    await b;
    expect(seguinte).toBe(true);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it("a profundidade sobe com o que espera e zera quando esvazia", async () => {
    const p = enfileirarEnvelope(async () => { await new Promise((r) => setTimeout(r, 1)); });
    expect(profundidadeDaFila()).toBe(1);
    await p;
    expect(profundidadeDaFila()).toBe(0);
  });
});

describe("idempotência por id de evento", () => {
  it("o mesmo evento só passa uma vez", () => {
    expect(jaProcessado("status:wamid.X:delivered")).toBe(false);
    expect(jaProcessado("status:wamid.X:delivered")).toBe(true);
    expect(jaProcessado("status:wamid.X:delivered")).toBe(true);
  });

  it("sent, delivered e read do MESMO wamid são três eventos e os três passam", () => {
    expect(jaProcessado("status:wamid.X:sent")).toBe(false);
    expect(jaProcessado("status:wamid.X:delivered")).toBe(false);
    expect(jaProcessado("status:wamid.X:read")).toBe(false);
  });

  it("passada a janela de reentrega, o evento volta a passar", () => {
    const t0 = 1_000_000;
    expect(jaProcessado("msg:wamid.Y", t0)).toBe(false);
    expect(jaProcessado("msg:wamid.Y", t0 + JANELA_DE_REENTREGA_MS - 1)).toBe(true);
    expect(jaProcessado("msg:wamid.Y", t0 + JANELA_DE_REENTREGA_MS + 1)).toBe(false);
  });
});

describe("amostragem de log", () => {
  it("a primeira ocorrência sempre vira linha", () => {
    expect(amostrar("waba-da-sala:123", 0)).toEqual({ logar: true, ocorrencias: 1 });
  });

  it("dentro do minuto conta e cala; depois do minuto loga com a contagem", () => {
    amostrar("waba-da-sala:123", 0);
    for (let i = 1; i <= 59; i++) expect(amostrar("waba-da-sala:123", i * 1000).logar).toBe(false);
    const depois = amostrar("waba-da-sala:123", INTERVALO_DE_AMOSTRA_MS + 1);
    expect(depois.logar).toBe(true);
    expect(depois.ocorrencias).toBe(60); // nada se perde: o volume aparece
  });

  it("assuntos diferentes não se calam entre si", () => {
    expect(amostrar("a", 0).logar).toBe(true);
    expect(amostrar("b", 0).logar).toBe(true);
  });
});
