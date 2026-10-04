import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/openai", () => ({ openai: {} }));

import { paraMensagensDoCofre, RESPOSTA_DE_RESERVA_DO_GARCOM } from "../AIOrderService";

describe("Garçom da loja pelo cofre (regra do CEO de 04/10/2026)", () => {
  it("converte o histórico para só texto: system/user/assistant, sem 'tool'", () => {
    const out = paraMensagensDoCofre([
      { role: "system", content: "Você é o garçom." },
      { role: "user", content: [{ type: "text", text: "tem " }, { type: "text", text: "temaki?" }] },
      { role: "tool", tool_call_id: "t1", content: "{}" },
      { role: "assistant", content: "" },
      { role: "assistant", content: "Temos!" },
    ] as never);
    expect(out).toEqual([
      { role: "system", content: "Você é o garçom." },
      { role: "user", content: "tem temaki?" },
      { role: "assistant", content: "Temos!" },
    ]);
  });

  it("o turno da loja não chama mais a OpenAI direto — fala com o cofre e tem resposta de reserva", () => {
    const fonte = readFileSync(join(__dirname, "..", "AIOrderService.ts"), "utf8");
    const ini = fonte.indexOf("async function runWebTurnInternal(");
    const fim = fonte.indexOf("// ── Post-AI validation", ini);
    const turnoWeb = fonte.slice(ini, fim);
    expect(turnoWeb).toContain("executarTextoNoCofre(");
    expect(turnoWeb).toContain("RESPOSTA_DE_RESERVA_DO_GARCOM");
    expect(turnoWeb).not.toMatch(/openai\.chat\.completions\.create/);
    expect(RESPOSTA_DE_RESERVA_DO_GARCOM).toMatch(/cardápio/);
  });
});
