/**
 * As duas listas: quem DEVE passar e quem DEVE ser recusado.
 *
 * A primeira lista é a mais importante das duas. Um validador de telefone erra
 * para os dois lados, e os dois erros não custam o mesmo: aceitar lixo gera um
 * lead que o SDR descarta em dez segundos; recusar um número certo manda embora
 * um dono de restaurante que estava tentando comprar. Por isso a lista de quem
 * passa carrega TODO formato que gente de verdade digita — e cresce sempre que
 * aparecer um novo, antes de a regra ser apertada.
 */

import { describe, it, expect } from "vitest";
import {
  analisarWhatsappBr,
  whatsappBrValido,
  formatarWhatsappBr,
  MENSAGEM_WHATSAPP_INVALIDO,
} from "./whatsapp-br";

/** [entrada, dígitos com DDI que devem sair] */
const DEVEM_PASSAR: Array<[string, string]> = [
  // ── Celular, o caso normal, em todas as roupas ────────────────────────────
  ["11987654321",           "5511987654321"],
  ["(11) 98765-4321",       "5511987654321"],
  ["(11) 98765 4321",       "5511987654321"],
  ["11 98765-4321",         "5511987654321"],
  ["11.98765.4321",         "5511987654321"],
  ["  11987654321  ",       "5511987654321"],

  // ── Com DDI, escrito de todo jeito ────────────────────────────────────────
  ["+5511987654321",        "5511987654321"],
  ["+55 (11) 98765-4321",   "5511987654321"],
  ["55 11 98765-4321",      "5511987654321"],
  ["+55 11 98765 4321",     "5511987654321"],
  ["0055 11 98765-4321",    "5511987654321"],

  // ── Zero da operadora na frente (hábito de interurbano, ainda comum) ──────
  ["011 98765-4321",        "5511987654321"],
  ["0 11 3333-4444",        "551133334444"],

  // ── Sem o nono dígito: celular antigo. Ainda é digitado, e é agendado. ────
  ["1187654321",            "551187654321"],
  ["(11) 8765-4321",        "551187654321"],
  ["+55 11 8765-4321",      "551187654321"],

  // ── Fixo de 8 dígitos: ENTRA (WhatsApp Business roda em fixo) ─────────────
  ["(11) 3333-4444",        "551133334444"],
  ["1133334444",            "551133334444"],
  ["+55 11 3333-4444",      "551133334444"],
  ["(21) 2222-3333",        "552122223333"],

  // ── DDD que parece DDI: o caso que quebra validador ingênuo ──────────────
  // 55 é Santa Maria/RS. "55 99999-8888" tem 11 dígitos e começa com "55" —
  // quem retira o DDI cedo demais transforma isto em número curto e recusa.
  ["55999998888",           "5555999998888"],
  ["(55) 99999-8888",       "5555999998888"],
  ["+55 55 99999-8888",     "5555999998888"],
  ["(55) 3222-1111",        "555532221111"],

  // ── Pontas da lista de DDD ────────────────────────────────────────────────
  ["(19) 99999-8888",       "5519999998888"],
  ["(99) 98888-7777",       "5599988887777"],
  ["(68) 99999-1234",       "5568999991234"],
];

const DEVEM_SER_RECUSADOS: Array<[string, string]> = [
  // ── O defeito relatado: oito caracteres quaisquer passavam ────────────────
  ["não tenho",        "texto — era exatamente o que o min(8) aceitava"],
  ["aaaaaaaa",         "oito letras"],
  ["quero uma demo",   "frase"],
  ["",                 "vazio"],
  ["   ",              "só espaço"],
  ["-- (  ) --",       "só máscara, zero dígito"],

  // ── Incompleto: o pior caso, porque PARECE certo ──────────────────────────
  ["1199999",          "sete dígitos — número cortado no meio"],
  ["999998888",        "nove dígitos: o celular sem o DDD"],
  ["98765-4321",       "só o número, sem DDD"],
  ["11",               "só o DDD"],

  // ── Longo demais ──────────────────────────────────────────────────────────
  ["5511999998888000", "dígitos demais"],
  ["119876543210",     "doze dígitos que não começam com 55"],

  // ── DDD que não existe ────────────────────────────────────────────────────
  ["(00) 98765-4321",  "DDD 00"],
  ["(20) 98765-4321",  "DDD 20 nunca foi atribuído"],
  ["(30) 98765-4321",  "DDD 30 nunca foi atribuído"],
  ["(90) 98765-4321",  "DDD 90 nunca foi atribuído"],

  // ── Forma impossível de número ────────────────────────────────────────────
  ["(11) 88765-4321",  "nove dígitos que não começam com 9 — não existe"],
  ["(11) 0800-1234",   "número de serviço, não é linha de ninguém"],
  ["(11) 1234-5678",   "local começando em 1 — serviço"],
];

describe("analisarWhatsappBr — quem DEVE passar", () => {
  it.each(DEVEM_PASSAR)("aceita %j → %s", (entrada, digitos) => {
    const r = analisarWhatsappBr(entrada);
    expect(r.ok, `"${entrada}" é um telefone brasileiro de verdade e foi recusado`).toBe(true);
    if (r.ok) {
      expect(r.digitos).toBe(digitos);
      expect(r.e164).toBe(`+${digitos}`);
    }
  });
});

describe("analisarWhatsappBr — quem DEVE ser recusado", () => {
  it.each(DEVEM_SER_RECUSADOS)("recusa %j (%s)", (entrada) => {
    const r = analisarWhatsappBr(entrada);
    expect(r.ok, `"${entrada}" passou, e não deveria`).toBe(false);
  });

  it("a recusa diz o que fazer, não só que está errado", () => {
    const r = analisarWhatsappBr("não tenho");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.mensagem).toBe(MENSAGEM_WHATSAPP_INVALIDO);
      // O exemplo dentro da mensagem é o que transforma "corrija" em "faça assim".
      expect(r.mensagem).toContain("(11) 98765-4321");
    }
  });

  it("não é string: recusa sem explodir", () => {
    expect(whatsappBrValido(null)).toBe(false);
    expect(whatsappBrValido(undefined)).toBe(false);
    expect(whatsappBrValido(11987654321 as unknown as string)).toBe(false);
  });
});

describe("o que a tela mostra de volta", () => {
  it("devolve o número LIMPO, não o texto cru que a pessoa digitou", () => {
    // A tela de sucesso repetia a digitação. Com o número normalizado, quem
    // errou um dígito tem chance de ver o erro antes de ir esperar a ligação.
    expect(formatarWhatsappBr("5511987654321")).toBe("(11) 98765-4321");
    expect(formatarWhatsappBr("+55 (11) 98765 4321")).toBe("(11) 98765-4321");
    expect(formatarWhatsappBr("1133334444")).toBe("(11) 3333-4444");
    expect(formatarWhatsappBr("011 98765-4321")).toBe("(11) 98765-4321");
  });

  it("sem número plausível, não inventa formatação", () => {
    expect(formatarWhatsappBr("não tenho")).toBeNull();
    expect(formatarWhatsappBr("1199999")).toBeNull();
  });
});

describe("celular × fixo", () => {
  it("classifica sem recusar nenhum dos dois", () => {
    const celularNovo = analisarWhatsappBr("(11) 98765-4321");
    const celularAntigo = analisarWhatsappBr("(11) 98765-432");   // 8 dígitos começando com 9
    const fixo = analisarWhatsappBr("(11) 3333-4444");
    expect(celularNovo.ok && celularNovo.celular).toBe(true);
    expect(celularAntigo.ok && celularAntigo.celular).toBe(true);
    expect(fixo.ok && fixo.celular).toBe(false);
  });
});

describe("o zero da operadora, que é ambíguo em dígitos", () => {
  /*
    "01987654321" é, em dígitos, EXATAMENTE a mesma coisa que "0 (19) 8765-4321"
    e que alguém digitando o DDD como "01". Nenhum código separa os dois. A
    leitura adotada é a que existe (DDD 19), e a tela devolve o número lido para
    a pessoa poder discordar. O teste existe para essa escolha ser deliberada, e
    não um efeito colateral que ninguém notou.
  */
  it("lê o zero da frente como operadora, e devolve o número que leu", () => {
    const r = analisarWhatsappBr("01987654321");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.formatado).toBe("(19) 8765-4321");
      expect(r.digitos).toBe("551987654321");
    }
  });

  it("mas 00 continua fora — não sobra DDD nenhum plausível", () => {
    expect(whatsappBrValido("(00) 98765-4321")).toBe(false);
  });
});

describe("compatibilidade com o que o CRM já guarda", () => {
  it("nos formatos normais, os dígitos batem com `normalizaWhatsapp`", async () => {
    // A chave humana do contato é `whatsappDigits`. Se este validador produzisse
    // outro formato, a busca de duplicata pararia de casar e a mesma pessoa
    // viraria dois contatos — o problema que o serviço resolveu em 04/08.
    const { normalizaWhatsapp } = await import("@/services/foocci-crm/leadOrigin");
    const semZeroDaOperadora = DEVEM_PASSAR.filter(
      ([entrada]) => !entrada.replace(/\D/g, "").startsWith("0"),
    );
    for (const [entrada, digitos] of semZeroDaOperadora) {
      const antigo = normalizaWhatsapp(entrada);
      // `normalizaWhatsapp` devolve null em casos que este validador aceita
      // (ex.: o DDD 55, que ele confunde com o DDI). Só comparamos onde ele
      // afirma algo — divergência conhecida, registrada no relatório.
      if (antigo !== null) {
        expect(antigo, `divergência em "${entrada}"`).toBe(digitos);
      }
    }
  });

  it("EVIDÊNCIA: `normalizaWhatsapp` erra onde este validador acerta", async () => {
    // Guardrail 6: o defeito conhecido fica com o caso concreto ao lado, para
    // quem for consertar o CRM não ter que redescobri-lo.
    const { normalizaWhatsapp } = await import("@/services/foocci-crm/leadOrigin");

    // (55) 99999-8888 — Santa Maria/RS. O antigo tira o "55" achando que é DDI.
    expect(normalizaWhatsapp("55999998888")).toBeNull();
    const rs = analisarWhatsappBr("55999998888");
    expect(rs.ok && rs.digitos).toBe("5555999998888");

    // "011 98765-4321" — o antigo devolve null; este lê o zero da operadora.
    expect(normalizaWhatsapp("011 98765-4321")).toBeNull();
    const zero = analisarWhatsappBr("011 98765-4321");
    expect(zero.ok && zero.digitos).toBe("5511987654321");
  });
});
