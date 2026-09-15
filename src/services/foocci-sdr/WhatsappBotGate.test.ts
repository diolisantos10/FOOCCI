import { describe, expect, it } from "vitest";
import { analisarAutomacaoWhatsapp } from "./WhatsappBotGate";

describe("WhatsappBotGate", () => {
  it("libera uma resposta humana normal sem criar barreira artificial", () => {
    expect(analisarAutomacaoWhatsapp("Oi! Aqui é o João. Como posso te ajudar?").tipo).toBe("HUMANO");
  });

  it("detecta menu e prefere atendente acima de vendas", () => {
    const r = analisarAutomacaoWhatsapp(
      "Olá! Escolha uma opção:\n1 - Pedidos\n2 - Vendas\n9 - Falar com atendente",
    );
    expect(r).toMatchObject({ tipo: "MENU", opcao: "9" });
  });

  it("navega para vendas quando é a melhor rota existente", () => {
    const r = analisarAutomacaoWhatsapp(
      "Atendimento automático. Escolha uma opção:\n1️⃣ Cardápio\n2️⃣ Vendas\n3️⃣ Financeiro",
    );
    expect(r).toMatchObject({ tipo: "MENU", opcao: "2" });
  });

  it("entende menu escrito em uma única frase", () => {
    const r = analisarAutomacaoWhatsapp("Digite 5 para falar com um atendente.");
    expect(r).toMatchObject({ tipo: "MENU", opcao: "5" });
  });

  it("espera quando o bot declarou transferência para humano", () => {
    const r = analisarAutomacaoWhatsapp("Aguarde um momento, vou te transferir para um atendente.");
    expect(r.tipo).toBe("AGUARDAR_HUMANO");
  });

  it("não inventa opção quando o menu não oferece rota segura", () => {
    const r = analisarAutomacaoWhatsapp(
      "Atendimento automático. Escolha uma opção:\n1 - Fazer pedido\n2 - Ver cardápio",
    );
    expect(r.tipo).toBe("BOT_SEM_ROTA");
  });

  it("segura bot sem menu em vez de mandar o texto para o SDR", () => {
    const r = analisarAutomacaoWhatsapp("Olá, sou o assistente virtual do restaurante.");
    expect(r.tipo).toBe("BOT_SEM_ROTA");
  });
});
