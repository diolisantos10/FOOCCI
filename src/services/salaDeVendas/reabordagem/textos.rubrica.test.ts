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
import fs from "fs";
import path from "path";
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

/**
 * ⭐ OS TRÊS MODELOS APROVADOS — o veredito, e o que fazer com ele.
 *
 * Decisão do CEO: o texto do primeiro contato são os três aprovados na Meta.
 * Eu NÃO os reescrevo — eles são dele e da Meta. O que este bloco faz é MEDIR e
 * deixar o veredito escrito, para quem decidir ter o número na mão.
 *
 * ⚠️ E o veredito importa menos do que parece, por uma razão de caminho: a
 * rubrica NÃO é aplicada a template no envio. Template passa por
 * `supervisora/adequacaoDoTemplate.ts`, que julga MOMENTO e FREQUÊNCIA e nunca
 * altera o texto; a rubrica só entra em `entrega.ts`, que é o caminho da fala
 * LIVRE. Ou seja: mesmo com a Supervisora em INTERVENTION, nenhum dos três é
 * retido nem reescrito por ela hoje.
 */
describe("os três modelos aprovados do primeiro contato, pela rubrica", () => {
  const APROVADOS = [
    ["foocci_contato_inicial_01", "Olá! Tudo bem? Este contato é do Restaurante Sabor Mineiro, certo?"],
    ["foocci_contato_inicial_02", "Olá! Tudo bem? Falo com o Restaurante Sabor Mineiro por aqui?"],
    ["foocci_contato_inicial_03", "Olá! Tudo bem?"],
  ] as const;

  for (const [nome, corpo] of APROVADOS) {
    it(`${nome} — veredito registrado`, () => {
      const parecer = avaliarPelaRubrica(corpo);
      console.info(`[rubrica] ${nome}: ${parecer.veredito} — ${parecer.detalhe}`);
      // ⚠️ AMARELO, os três, e por defeitos de FORMA que a brevidade impõe:
      // `_01` e `_02` trazem duas perguntas ("Tudo bem?" + a pergunta real);
      // `_03` é saudação sem identificação. Nenhum é GRAVE, nenhum é CRÍTICO —
      // não há promessa, urgência, panfleto nem mentira sobre quem fala.
      //
      // O teste fixa o valor MEDIDO em vez de exigir VERDE: exigir VERDE seria
      // reprovar uma decisão do CEO; não medir nada seria perder o dia em que o
      // texto piorar de verdade.
      expect(parecer.veredito).toBe("AMARELO");
      expect(parecer.achados.every((a) => a.severidade === "LEVE")).toBe(true);
    });
  }

  it("⛔ a rubrica NÃO é o portão do template — o portão dele é a adequação", () => {
    const fonte = fs.readFileSync(
      path.resolve(__dirname, "../supervisora/adequacaoDoTemplate.ts"),
      "utf8",
    );
    expect(fonte).not.toContain("avaliarPelaRubrica");
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
