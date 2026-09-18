/**
 * A SUPERVISORA JULGA OS TEXTOS DA CAMPANHA — e o veredito fica impresso.
 *
 * A Supervisora pode estar em OFF quando a campanha rodar. Isso não é desculpa
 * para escrever mensagem que ela reprovaria: a rubrica é pura, roda sem banco e
 * sem modelo, e é aplicada aqui contra cada texto que vai sair.
 *
 * ⚠️ Se um destes reprovar, o texto está errado — não a rubrica.
 */

import { describe, it, expect } from "vitest";
import { avaliarPelaRubrica } from "../supervisora/rubrica";
import { TEXTOS, APRESENTACAO, textoDaOpcaoDoMenu } from "./textos";

describe("os textos da reabordagem, pela rubrica da Supervisora", () => {
  for (const [chave, texto] of Object.entries(TEXTOS)) {
    it(`${chave} → VERDE`, () => {
      const parecer = avaliarPelaRubrica(texto);
      // O veredito impresso, para quem lê a saída do teste e não o código.
      console.info(`[rubrica] ${chave}: ${parecer.veredito} — ${parecer.detalhe}`);
      expect(parecer.achados, parecer.detalhe).toEqual([]);
      expect(parecer.veredito).toBe("VERDE");
    });
  }

  it("a apresentação sozinha → VERDE", () => {
    const parecer = avaliarPelaRubrica(APRESENTACAO);
    console.info(`[rubrica] APRESENTACAO: ${parecer.veredito} — ${parecer.detalhe}`);
    expect(parecer.veredito).toBe("VERDE");
  });

  it("a opção de menu → VERDE (é a opção que o próprio menu ofereceu)", () => {
    for (const opcao of ["3", "atendente", "2"]) {
      const parecer = avaliarPelaRubrica(textoDaOpcaoDoMenu(opcao));
      expect(parecer.veredito, `opção "${opcao}": ${parecer.detalhe}`).toBe("VERDE");
    }
  });
});

describe("a régua pega o panfleto que precisa morrer", () => {
  it("a mensagem antiga é reprovada — a rubrica não é decoração", () => {
    const antiga = [
      "Olá! 👋 Tudo bem?",
      "Sou da Foocci, a plataforma que revoluciona o delivery do seu restaurante! 🚀",
      "✅ Cardápio digital próprio",
      "✅ Zero comissão por pedido",
      "✅ Seus clientes na sua mão",
      "✅ Pedidos direto no WhatsApp",
      "Seus concorrentes já estão na frente e você está perdendo dinheiro todo dia.",
      "Últimas vagas com condição especial, só hoje!",
      "Posso te mostrar como funciona?",
    ].join("\n");

    const parecer = avaliarPelaRubrica(antiga);
    console.info(`[rubrica] MENSAGEM ANTIGA: ${parecer.veredito} — ${parecer.detalhe}`);
    expect(parecer.veredito).toBe("CRITICO");
    expect(parecer.achados.map((a) => a.codigo)).toContain("PANFLETO");
    expect(parecer.achados.map((a) => a.codigo)).toContain("LISTA_DE_BENEFICIOS");
  });
});
