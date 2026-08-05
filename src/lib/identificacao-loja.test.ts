/**
 * A trava de "onde vale afrouxar a identificação".
 *
 * O caso que mais importa aqui é o de baixo, o da falha fechada: se um dia a
 * consulta do restaurante esquecer de selecionar `isDemo`, o campo chega
 * `undefined` — e `undefined` NÃO pode virar "então pode pular". Seria transformar
 * ausência de informação em permissão, na loja de um cliente de verdade.
 */

import { describe, it, expect } from "vitest";
import { identificacaoPodeSerPulada } from "./identificacao-loja";

describe("identificacaoPodeSerPulada", () => {
  it("vitrine (isDemo=true) pode pular", () => {
    expect(identificacaoPodeSerPulada({ isDemo: true })).toBe(true);
  });

  it("restaurante de verdade (isDemo=false) NÃO pode pular", () => {
    expect(identificacaoPodeSerPulada({ isDemo: false })).toBe(false);
  });

  it("falha FECHADA: sem o campo, sem null, sem restaurante — ninguém pula", () => {
    expect(identificacaoPodeSerPulada({})).toBe(false);
    expect(identificacaoPodeSerPulada({ isDemo: null })).toBe(false);
    expect(identificacaoPodeSerPulada(null)).toBe(false);
    expect(identificacaoPodeSerPulada(undefined)).toBe(false);
  });

  it("não aceita valor 'parecido com verdadeiro' — só o booleano true", () => {
    // Se um dia alguém passar o resultado de uma query crua, string ou 1 não
    // podem destravar a loja de um cliente.
    expect(identificacaoPodeSerPulada({ isDemo: "true" as unknown as boolean })).toBe(false);
    expect(identificacaoPodeSerPulada({ isDemo: 1 as unknown as boolean })).toBe(false);
  });
});
