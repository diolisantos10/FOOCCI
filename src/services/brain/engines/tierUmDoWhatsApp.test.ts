/**
 * A RÉGUA DO TIER 1 NO AGENTE DE WHATSAPP.
 *
 * Ordem do CEO, 24/09/2026: o agente que ANOTA PEDIDO do cliente do restaurante
 * é **Tier 1**. Por D-101, Tier 1 ⇒ classe **A**. Este arquivo existe para
 * REPROVAR a versão errada deste próprio código: se alguém — pessoa ou agente —
 * devolver o `whatsapp` para `gpt-4o-mini`, para `claude-haiku-4-5` ou para
 * qualquer motor fora da prateleira Tier 1, a suíte quebra AQUI, com o nome do
 * modelo na mensagem.
 *
 * ⛔ Este teste NÃO chama IA nenhuma e não gasta um centavo: só lê a decisão do
 * roteador.
 *
 * ⚠️ A lista abaixo é a prateleira Tier 1 (classe A) da foto de 23/09/2026
 * (control_room/docs/sala-id/08-PRATELEIRA-2026-09-23.md), restrita aos
 * laboratórios que este runtime sabe chamar (OPENAI / CLAUDE / GEMINI). A foto
 * envelhece: quando ela for refeita, esta lista se atualiza junto — e é de
 * propósito que seja preciso EDITAR a lista para aprovar um motor novo.
 */

import { describe, it, expect } from "vitest";
import { selectEngine, AGENT_MODEL_PREFERENCES, AGENT_ENGINE_PREFERENCES } from "./AIEngineRouter";

/** Prateleira Tier 1 — classe A, foto de 23/09/2026. */
const PRATELEIRA_TIER_1 = new Set([
  // Anthropic
  "claude-opus-5-5",
  "claude-fable-5-1",
  "claude-opus-5",
  // OpenAI
  "gpt-6-astra",
  "gpt-6-sol",
  "gpt-5.6-sol",
  // Google
  "gemini-3.1-pro-preview",
]);

/** Motores que já ocuparam o cargo e NÃO são classe A. Servem de prova viva. */
const FORA_DO_TIER_1 = ["gpt-4o-mini", "gpt-4o", "claude-haiku-4-5", "gemini-2.5-flash", "gpt-5.1"];

const ENV_COM_TODAS_AS_CHAVES = {
  OPENAI_API_KEY: "sk-test",
  ANTHROPIC_API_KEY: "sk-ant-test",
  GEMINI_API_KEY: "g-test",
} as unknown as NodeJS.ProcessEnv;

describe("Tier 1 — o agente de WhatsApp que anota pedido", () => {
  it("o roteador entrega um motor da PRATELEIRA TIER 1, nunca um modelo pequeno", () => {
    const escolha = selectEngine("whatsapp", { env: ENV_COM_TODAS_AS_CHAVES });

    expect(
      PRATELEIRA_TIER_1.has(escolha.model),
      `O agente de WhatsApp é Tier 1 (ordem do CEO, 24/09/2026) e recebeu "${escolha.model}", ` +
        `que não está na prateleira classe A. Tier 1 ⇒ classe A (D-101). ` +
        `Se o motor é novo e legítimo, atualize a prateleira em ` +
        `docs/sala-id/08-PRATELEIRA-2026-09-23.md e esta lista — não baixe a régua.`,
    ).toBe(true);
  });

  it("os motores pequenos que já estiveram no cargo continuam reprovados", () => {
    for (const modelo of FORA_DO_TIER_1) {
      expect(PRATELEIRA_TIER_1.has(modelo), `"${modelo}" não pode passar por Tier 1`).toBe(false);
    }
  });

  it("o NOME DO MODELO mora no roteador, não no agente (regra de ouro do CEO)", () => {
    const escolha = AGENT_MODEL_PREFERENCES.whatsapp;
    expect(escolha).toBeDefined();
    expect(PRATELEIRA_TIER_1.has(escolha!.model)).toBe(true);
    // E o par (provider, modelo) tem que ser coerente: modelo Claude com piloto CLAUDE.
    expect(escolha!.provider).toBe("CLAUDE");
    expect(AGENT_ENGINE_PREFERENCES.whatsapp).toBe("CLAUDE");
    expect(escolha!.model.startsWith("claude-")).toBe(true);
  });

  it("⚠️ SEM a chave do laboratório escolhido, a troca NÃO acontece — e isso fica visível", () => {
    // Não é um defeito a esconder: é o aviso de que ligar o Tier 1 depende de uma
    // credencial que nenhuma sala possui. Sem ANTHROPIC_API_KEY o roteador cai no
    // default de produção e o cargo Tier 1 volta a ser atendido por um motor que
    // NÃO é classe A. Quem for ligar precisa saber disto antes, não depois.
    const semChaveClaude = selectEngine("whatsapp", {
      env: { OPENAI_API_KEY: "sk-test" } as unknown as NodeJS.ProcessEnv,
    });
    expect(semChaveClaude.provider).toBe("OPENAI");
    expect(PRATELEIRA_TIER_1.has(semChaveClaude.model)).toBe(false);
    expect(semChaveClaude.reason).toContain("não configurado");
  });
});
