/**
 * Audio arming gate — the single source of truth for "is the browser's autoplay
 * lock lifted yet?". The "ativar som" bar and the alert engine both read it, so
 * its edge semantics (fire once on false→true, never re-fire, clean unsubscribe)
 * are what keep the prompt from flickering or getting stuck on screen.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  isAudioArmed,
  markAudioArmed,
  subscribeAudioArmed,
  isAudioBlocked,
  refletirTentativaDeAlerta,
  __resetAudioGate,
} from "@/lib/audio-gate";

beforeEach(() => __resetAudioGate());

describe("audio-gate", () => {
  it("starts disarmed", () => {
    expect(isAudioArmed()).toBe(false);
  });

  it("markAudioArmed flips to armed and notifies subscribers once", () => {
    let calls = 0;
    subscribeAudioArmed(() => { calls++; });
    markAudioArmed();
    expect(isAudioArmed()).toBe(true);
    expect(calls).toBe(1);
  });

  it("is idempotent — a second arm neither re-fires nor un-arms", () => {
    let calls = 0;
    subscribeAudioArmed(() => { calls++; });
    markAudioArmed();
    markAudioArmed();
    markAudioArmed();
    expect(isAudioArmed()).toBe(true);
    expect(calls).toBe(1); // only the false→true edge notifies
  });

  it("notifies every live subscriber on the arming edge", () => {
    const seen: string[] = [];
    subscribeAudioArmed(() => seen.push("a"));
    subscribeAudioArmed(() => seen.push("b"));
    markAudioArmed();
    expect(seen.sort()).toEqual(["a", "b"]);
  });

  it("stops notifying after unsubscribe", () => {
    let calls = 0;
    const off = subscribeAudioArmed(() => { calls++; });
    off();
    markAudioArmed();
    expect(calls).toBe(0);
  });

  it("a throwing subscriber does not block the others", () => {
    const seen: string[] = [];
    subscribeAudioArmed(() => { throw new Error("boom"); });
    subscribeAudioArmed(() => seen.push("survived"));
    expect(() => markAudioArmed()).not.toThrow();
    expect(seen).toEqual(["survived"]);
  });

  it("a subscriber added AFTER arming is not retroactively fired", () => {
    markAudioArmed();
    let calls = 0;
    subscribeAudioArmed(() => { calls++; });
    expect(calls).toBe(0);
    expect(isAudioArmed()).toBe(true);
  });
});

/**
 * O aviso "Ativar som" da barra superior — o que substituiu o chip "Som ativo".
 *
 * O chip antigo era um STATUS e mentia: afirmava "🔔 Som ativo" a partir de uma
 * marca de `localStorage` de algum dia do passado, enquanto o navegador exige um
 * gesto a cada carregamento. O dono lia "Som ativo" de manhã e o pedido entrava
 * mudo. O que ficou no lugar só pode aparecer com EVIDÊNCIA — um alerta real
 * recusado — e nunca pode afirmar que está tudo bem.
 */
describe("aviso de som bloqueado", () => {
  const recusa = { lastResult: "error" as const, lastError: "NotAllowedError: play() failed", activeCount: 1 };

  it("nasce invisível — silêncio não é promessa de que o som funciona", () => {
    expect(isAudioBlocked()).toBe(false);
  });

  it("aparece quando um alerta REAL é recusado pelo navegador", () => {
    refletirTentativaDeAlerta(recusa, true);
    expect(isAudioBlocked()).toBe(true);
  });

  it("não aparece por erro que não é bloqueio de autoplay", () => {
    // Arquivo faltando, rede caída: não é coisa que um toque do lojista resolva.
    refletirTentativaDeAlerta({ lastResult: "error", lastError: "NotSupportedError: no source", activeCount: 1 }, true);
    expect(isAudioBlocked()).toBe(false);
  });

  it("não aparece sem item esperando — alarme sem evidência é ruído", () => {
    refletirTentativaDeAlerta({ ...recusa, activeCount: 0 }, true);
    expect(isAudioBlocked()).toBe(false);
  });

  it("some quando o alerta consegue tocar", () => {
    refletirTentativaDeAlerta(recusa, true);
    refletirTentativaDeAlerta({ lastResult: "success", lastError: null, activeCount: 1 }, true);
    expect(isAudioBlocked()).toBe(false);
  });

  it("some quando não há mais pedido esperando", () => {
    refletirTentativaDeAlerta(recusa, true);
    refletirTentativaDeAlerta({ lastResult: null, lastError: null, activeCount: 0 }, true);
    expect(isAudioBlocked()).toBe(false);
  });

  it("o alarme de atendimento esvaziar NÃO apaga o aviso do pedido mudo", () => {
    refletirTentativaDeAlerta(recusa, true);            // pedido entrou mudo
    refletirTentativaDeAlerta({ lastResult: null, lastError: null, activeCount: 0 }); // atendimento vazio
    expect(isAudioBlocked()).toBe(true);
  });

  it("o toque do lojista (armar) apaga o aviso e avisa a tela", () => {
    let calls = 0;
    refletirTentativaDeAlerta(recusa, true);
    subscribeAudioArmed(() => { calls++; });
    markAudioArmed();
    expect(isAudioBlocked()).toBe(false);
    expect(isAudioArmed()).toBe(true);
    expect(calls).toBe(1);
  });

  it("depois de armado, uma recusa antiga não ressuscita o aviso", () => {
    markAudioArmed();
    refletirTentativaDeAlerta(recusa, true);
    expect(isAudioBlocked()).toBe(false);
  });
});
