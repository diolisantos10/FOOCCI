import { describe, expect, it } from "vitest";
import { analisarAutomacaoWhatsapp } from "./WhatsappBotGate";

describe("cold prospect bot routing", () => {
  it("prioriza atendente/humano quando o restaurante oferece essa rota", () => {
    expect(analisarAutomacaoWhatsapp("1 - Pedidos\n2 - Comercial\n9 - Falar com atendente")).toMatchObject({ tipo: "MENU", opcao: "9" });
  });
  it("usa comercial quando não há rota humana explícita", () => {
    expect(analisarAutomacaoWhatsapp("Atendimento automático. Escolha uma opção:\n1 - Pedidos\n2 - Comercial")).toMatchObject({ tipo: "MENU", opcao: "2" });
  });
  it("não deixa uma automação sem rota cair no TA como se fosse pessoa", () => {
    expect(analisarAutomacaoWhatsapp("Olá, sou o assistente virtual do restaurante.").tipo).toBe("BOT_SEM_ROTA");
  });
  it("libera resposta humana para descoberta comercial", () => {
    expect(analisarAutomacaoWhatsapp("Boa tarde, aqui é a Ana do administrativo. Como posso ajudar?").tipo).toBe("HUMANO");
  });
});
