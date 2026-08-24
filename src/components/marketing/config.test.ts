/**
 * A chave que acende o caminho do WhatsApp, e a mensagem que a pessoa vai assinar.
 *
 * ── ESTE ARQUIVO MUDOU DE LADO EM 25/08/2026 ────────────────────────────────
 *
 * Até aqui, o teste principal afirmava que o número estava DESLIGADO, e existia
 * para que ninguém acendesse o caminho do WhatsApp sem decisão do CEO. A decisão
 * veio: o número é 11 94372-3316.
 *
 * Então o teste inverte, e continua sendo a mesma trava apontando para o mesmo
 * lugar — o número que o site publica é uma decisão do CEO, e ele não pode mudar
 * por acidente, nem para vazio nem para outro. Por isso o valor exato está escrito
 * aqui: se alguém trocar um dígito em `config.ts`, este arquivo reprova.
 *
 * O caminho de "sem número" continua testado, agora com o `null` passado à mão —
 * é o comportamento de qualquer ambiente onde a chave não esteja presente, e ele
 * não pode apodrecer só porque hoje há número.
 */

import { describe, it, expect } from "vitest";
import {
  WHATSAPP_SALES_NUMBER,
  whatsappUrl,
  buildLeadWhatsAppMessage,
  formatSalesNumber,
} from "./config";

const NUMERO = "5511999998888";

describe("WHATSAPP_SALES_NUMBER — o estado de hoje", () => {
  it("é o número de vendas da Foocci, dígito por dígito", () => {
    // Se este teste falhar, o número que o site publica mudou. Isso é uma decisão
    // do CEO (com quem o restaurante vai falar), não um detalhe de configuração.
    expect(WHATSAPP_SALES_NUMBER).toBe("5511943723316");
  });

  it("o site mostra +55 (11) 94372-3316 — o plano B de quem não conseguir abrir o app", () => {
    expect(formatSalesNumber()).toBe("+55 (11) 94372-3316");
  });

  it("o botão do formulário leva a esse número, com a mensagem escrita", () => {
    const url = whatsappUrl("Oi! Sou Ana e quero conhecer o Foocci. #A7K2M")!;
    expect(url.startsWith("https://wa.me/5511943723316?text=")).toBe(true);
    expect(decodeURIComponent(url.split("?text=")[1]!)).toContain("#A7K2M");
  });

  it("sem número, whatsappUrl devolve null e nada no site muda", () => {
    // O caminho de ambiente sem chave. Ele não some do teste só porque hoje há
    // número: é o que acontece em qualquer build onde a chave falte.
    expect(whatsappUrl("qualquer mensagem", null)).toBeNull();
    expect(formatSalesNumber(null)).toBeNull();
  });
});

describe("whatsappUrl — com número configurado", () => {
  it("monta o wa.me com o texto já preenchido", () => {
    const url = whatsappUrl("Oi tudo bem?", NUMERO);
    expect(url).toBe("https://wa.me/5511999998888?text=Oi%20tudo%20bem%3F");
  });

  it("escapa o que quebraria a URL — acento, `#`, `&`, espaço e quebra de linha", () => {
    const url = whatsappUrl("Olá & cia. #A7K2M\nSão Paulo", NUMERO)!;

    // O `#` cru cortaria a mensagem no fragmento e o `&` inventaria outro
    // parâmetro: depois de `?text=` não pode sobrar nenhum dos dois.
    const texto = url.split("?text=")[1]!;
    expect(texto).not.toContain("#");
    expect(texto).not.toContain("&");
    expect(texto).not.toContain(" ");
    expect(texto).not.toContain("\n");

    // E o que chega do outro lado é exatamente o que foi escrito.
    expect(decodeURIComponent(texto)).toBe("Olá & cia. #A7K2M\nSão Paulo");
  });
});

describe("buildLeadWhatsAppMessage — a mensagem é feita do que a pessoa digitou", () => {
  it("usa nome, restaurante e código", () => {
    expect(
      buildLeadWhatsAppMessage({ nome: "João", restaurante: "Restaurante X", codigo: "A7K2M" }),
    ).toBe("Oi! Sou João, do restaurante Restaurante X, e quero conhecer o Foocci. #A7K2M");
  });

  it("continua uma frase correta sem o restaurante (campo opcional)", () => {
    const msg = buildLeadWhatsAppMessage({ nome: "Ana", restaurante: "", codigo: "B4N9P" });
    expect(msg).toBe("Oi! Sou Ana e quero conhecer o Foocci. #B4N9P");
    // Sem o trecho, somem também as vírgulas dele — nada de buraco pontuado.
    expect(msg).not.toContain(", ,");
    expect(msg).not.toContain("  ");
  });

  it("não erra o gênero de ninguém — nem da pessoa, nem do estabelecimento", () => {
    // "Sou o Ana" / "Sou a João" seria adivinhação; "do Pizzaria" e "do Padaria"
    // seriam erro de concordância. A frase sai certa nos quatro casos porque não
    // depende de gênero nenhum.
    const casos = [
      { nome: "Ana", restaurante: "Pizzaria Nonna" },
      { nome: "João", restaurante: "Bar do Zé" },
      { nome: "Andrea", restaurante: "Padaria Central" },
      { nome: "Darci", restaurante: "Espeto do Norte" },
    ];
    for (const c of casos) {
      const msg = buildLeadWhatsAppMessage({ ...c, codigo: "A7K2M" });
      expect(msg).toBe(`Oi! Sou ${c.nome}, do restaurante ${c.restaurante}, e quero conhecer o Foocci. #A7K2M`);
      expect(msg).not.toMatch(/Sou [oa] /);
    }
  });

  it("sem código, a mensagem sai limpa — nunca com `#` órfão", () => {
    const msg = buildLeadWhatsAppMessage({ nome: "Ana", restaurante: "Cantina", codigo: null });
    expect(msg).toBe("Oi! Sou Ana, do restaurante Cantina, e quero conhecer o Foocci.");
    expect(msg).not.toContain("#");
  });

  it("apara espaço sobrando do que foi digitado", () => {
    expect(
      buildLeadWhatsAppMessage({ nome: "  Ana  ", restaurante: "  Cantina  ", codigo: " B4N9P " }),
    ).toBe("Oi! Sou Ana, do restaurante Cantina, e quero conhecer o Foocci. #B4N9P");
  });

  it("a mensagem completa sobrevive à URL sem perder o código", () => {
    const msg = buildLeadWhatsAppMessage({ nome: "João", restaurante: "Pizzaria Nonna", codigo: "A7K2M" });
    const url = whatsappUrl(msg, NUMERO)!;
    expect(decodeURIComponent(url.split("?text=")[1]!)).toContain("#A7K2M");
  });
});

describe("formatSalesNumber — o plano B precisa ser legível", () => {
  it("formata celular brasileiro de 9 dígitos", () => {
    expect(formatSalesNumber("5511999998888")).toBe("+55 (11) 99999-8888");
  });

  it("formata fixo brasileiro de 8 dígitos", () => {
    expect(formatSalesNumber("551133334444")).toBe("+55 (11) 3333-4444");
  });

  it("não inventa máscara para número de outro país", () => {
    expect(formatSalesNumber("14155552671")).toBe("+14155552671");
  });
});
