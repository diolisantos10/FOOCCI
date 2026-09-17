/**
 * A PROVA — mensagem ruim de verdade é barrada; mensagem boa passa sem
 * fricção inútil.
 *
 * ── ⚠️ O TESTE ALCANÇA O CÓDIGO QUE RESPONDE AO CLIENTE? ─────────────────────
 *
 * Sim, e o caminho é este, sem atalho:
 *
 *   entrega.ts (`entregarMensagem`, o único ponto por onde passa TODA fala
 *   livre da empresa para um lead — IA, humano digitando e conector)
 *     → revisao.ts (`revisarAntesDeEntregar`)
 *       → camadaRapida.ts (`avaliarCamadaRapida`)   ← ESTE ARQUIVO TESTA AQUI
 *         → rubrica.ts (`avaliarPelaRubrica`)
 *
 * A segunda metade dos casos chama `avaliarCamadaRapida` DE VERDADE — a mesma
 * função que `revisao.ts` chama em produção — e prova que a mensagem ruim volta
 * VERMELHA **sem que nenhum motor de IA seja chamado**. Não há mock de modelo
 * que "sempre passa": se a régua não pegasse o defeito, o código cairia na
 * seleção de motor e o teste quebraria com falha técnica, não passaria em
 * silêncio.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  avaliarPelaRubrica,
  vereditoDosAchados,
  vereditoMaisSevero,
  rubricaParaPrompt,
  MAX_LINHAS,
  MAX_EMOJIS,
  MAX_ITENS_DE_LISTA,
} from "./rubrica";
import { avaliarCamadaRapida } from "./camadaRapida";
import { zerarTetoParaTeste, podeChamarModelo, estadoDoTeto, TETO_DE_CHAMADAS_POR_DIA } from "./tetoDiario";
import { conhecimentoComercialParaPrompt, frentesDaDoutrina, VERSAO_DO_PLAYBOOK_COMERCIAL } from "./conhecimentoComercial";
import type { ContextoDaRevisao } from "./contexto";

/** O padrão que está saindo hoje, nomeado pelo CEO: panfleto de 9 linhas com
 *  emoji, check verde e o clichê de fechamento. */
const PANFLETO = [
  "Olá! 😊 Tudo bem?",
  "Aqui é da Foocci 🚀",
  "Você sabia que a gente pode transformar o seu delivery?",
  "✅ Cardápio digital próprio",
  "✅ CRM completo de clientes",
  "✅ Atendimento com inteligência artificial",
  "✅ Sem comissão por pedido",
  "Já são centenas de restaurantes usando! 🎉",
  "Posso te mostrar como funciona?",
].join("\n");

/** Uma abordagem boa: identifica-se, ancora num fato observável, oferece a
 *  hipótese como hipótese e faz UMA pergunta que muda o próximo movimento. */
const MENSAGEM_BOA =
  "Bom dia, Marcelo. Aqui é a Ana, da Foocci. Vi que vocês atendem delivery só pelo iFood na Vila Nova. Costuma pesar mais a taxa ou o fato de o cliente ficar com o marketplace e não com vocês?";

const contexto: ContextoDaRevisao = {
  ultimaMensagemDoCliente: null,
  resumoIncremental: "",
  etapaDoFunil: "PRIMEIRO_CONTATO",
  perfilDoLead: "restaurante de delivery",
  regrasComerciais: [],
  tomDaMarca: "direto, cordial, sem jargão",
  ultimosAlertasDesteAtendimento: [],
  irritacaoDoLead: 0,
  pediuParar: false,
  conhecimentoDaAcademia: [],
};

function codigos(texto: string): string[] {
  return avaliarPelaRubrica(texto).achados.map((a) => a.codigo);
}

beforeEach(() => {
  zerarTetoParaTeste();
});

describe("a rubrica barra a mensagem ruim, com o motivo NOMEADO", () => {
  it("o panfleto de hoje é VERMELHO, e cada defeito tem nome", () => {
    const parecer = avaliarPelaRubrica(PANFLETO);

    expect(parecer.veredito).toBe("VERMELHO");
    expect(parecer.achados.map((a) => a.codigo)).toEqual(
      expect.arrayContaining([
        "PANFLETO",
        "LISTA_DE_BENEFICIOS",
        "EXCESSO_DE_EMOJI",
        "PEDIDO_DE_PERMISSAO_VAZIO",
      ]),
    );
    // Nenhum achado pode ser mudo: ou cita o trecho, ou explica a contagem.
    for (const a of parecer.achados) {
      expect(a.explicacao.length).toBeGreaterThan(20);
    }
    // O detalhe é uma linha que um humano que nunca leu o prompt consegue ler.
    expect(parecer.detalhe).toContain("PANFLETO");
    expect(parecer.detalhe).toContain(`o teto é ${MAX_LINHAS}`);
  });

  it("urgência inventada e escassez falsa: VERMELHO, com o trecho citado", () => {
    const p = avaliarPelaRubrica("Essa condição acaba hoje e só restam 3 vagas.");
    expect(p.veredito).toBe("VERMELHO");
    expect(p.achados.map((a) => a.codigo)).toEqual(
      expect.arrayContaining(["URGENCIA_INVENTADA", "ESCASSEZ_FALSA"]),
    );
    expect(p.achados.find((a) => a.codigo === "ESCASSEZ_FALSA")?.evidencia).toContain("vagas");
  });

  it("promessa de resultado: VERMELHO", () => {
    expect(avaliarPelaRubrica("Garanto que você vai dobrar seu faturamento.").veredito).toBe("VERMELHO");
  });

  it("vender por medo é CRÍTICO — retém e vai para uma pessoa", () => {
    const p = avaliarPelaRubrica(
      "Se você não agir agora, seu restaurante vai ficar para trás e você vai perder clientes.",
    );
    expect(p.veredito).toBe("CRITICO");
    expect(p.achados.map((a) => a.codigo)).toContain("MEDO_OU_CULPA");
  });

  it("fingir-se de cliente para furar o porteiro é CRÍTICO", () => {
    const p = avaliarPelaRubrica("Oi, queria fazer um pedido, pode me mandar o cardápio?");
    expect(p.veredito).toBe("CRITICO");
    expect(p.achados.map((a) => a.codigo)).toContain("FINGIR_SE_DE_CLIENTE");
  });

  it("negar ser um agente é CRÍTICO", () => {
    expect(avaliarPelaRubrica("Não sou um robô, sou uma pessoa de verdade.").veredito).toBe("CRITICO");
  });

  it("insistir depois de um pedido de parar é CRÍTICO", () => {
    expect(
      avaliarPelaRubrica("Sei que você disse que não, mas deixa eu te mostrar uma coisa.").veredito,
    ).toBe("CRITICO");
  });

  it("fechamento prematuro na abertura é VERMELHO", () => {
    expect(
      avaliarPelaRubrica("Oi! Já posso agendar uma demonstração para você?").veredito,
    ).toBe("VERMELHO");
  });

  it("defeito só de forma, isolado, é AMARELO — reescrita resolve", () => {
    const p = avaliarPelaRubrica("Oi! 😀😀😀 Como vai o movimento aí?");
    expect(p.veredito).toBe("AMARELO");
    expect(p.achados.map((a) => a.codigo)).toContain("EXCESSO_DE_EMOJI");
  });

  it("três defeitos leves somados deixam de ser pequeno ajuste: VERMELHO", () => {
    const p = avaliarPelaRubrica(
      "Oi! 😀😀😀 Somos a melhor plataforma do mercado. Tem interesse? Quer conversar?",
    );
    expect(p.achados.filter((a) => a.severidade === "LEVE").length).toBeGreaterThanOrEqual(3);
    expect(p.veredito).toBe("VERMELHO");
  });
});

describe("a rubrica NÃO cria fricção inútil", () => {
  it("a abordagem boa passa VERDE, sem nenhum achado", () => {
    const p = avaliarPelaRubrica(MENSAGEM_BOA);
    expect(p.veredito).toBe("VERDE");
    expect(p.achados).toEqual([]);
    expect(p.detalhe).toBe("nenhum defeito de forma ou de frase proibida");
  });

  it("a abordagem correta ao porteiro passa VERDE", () => {
    const p = avaliarPelaRubrica(
      "Oi, bom dia. Aqui é o João, da Foocci — não é um pedido. Queria falar com quem cuida da parte comercial aí. Consigo por este mesmo número?",
    );
    expect(p.veredito).toBe("VERDE");
  });

  it("objeção bem tratada passa VERDE", () => {
    const p = avaliarPelaRubrica(
      "Faz sentido — o iFood traz movimento mesmo. Deixa eu entender: hoje ele é a maior parte dos seus pedidos ou é um complemento?",
    );
    expect(p.veredito).toBe("VERDE");
  });

  it("dois emojis, duas linhas de lista e uma pergunta continuam VERDE — os tetos não são zero", () => {
    const p = avaliarPelaRubrica(
      ["Claro, Marcelo 👍", "- o cardápio fica no seu domínio", "- os dados do cliente ficam com você", "Qual desses dois pesa mais aí? 🙂"].join("\n"),
    );
    expect(p.achados).toEqual([]);
    expect(p.veredito).toBe("VERDE");
    expect(MAX_EMOJIS).toBe(2);
    expect(MAX_ITENS_DE_LISTA).toBe(2);
  });

  it("texto vazio não inventa defeito", () => {
    expect(avaliarPelaRubrica("   ").veredito).toBe("VERDE");
  });

  it("a rubrica é reprodutível: mesma entrada, mesma saída", () => {
    expect(codigos(PANFLETO)).toEqual(codigos(PANFLETO));
    expect(codigos(MENSAGEM_BOA)).toEqual([]);
  });
});

describe("a tabela de vereditos, sozinha", () => {
  const leve = { codigo: "X", severidade: "LEVE", motivo: "OUTRO", explicacao: "", evidencia: "" } as const;
  const grave = { ...leve, severidade: "GRAVE" } as const;
  const critica = { ...leve, severidade: "CRITICA" } as const;

  it("nenhum achado é VERDE", () => expect(vereditoDosAchados([])).toBe("VERDE"));
  it("um leve é AMARELO", () => expect(vereditoDosAchados([leve])).toBe("AMARELO"));
  it("dois leves ainda é AMARELO", () => expect(vereditoDosAchados([leve, leve])).toBe("AMARELO"));
  it("três leves é VERMELHO", () => expect(vereditoDosAchados([leve, leve, leve])).toBe("VERMELHO"));
  it("um grave é VERMELHO", () => expect(vereditoDosAchados([grave])).toBe("VERMELHO"));
  it("uma crítica vence tudo", () => expect(vereditoDosAchados([leve, grave, critica])).toBe("CRITICO"));

  it("na divergência, a mais severa vence — a régua nunca afrouxa", () => {
    expect(vereditoMaisSevero("VERDE", "VERMELHO")).toBe("VERMELHO");
    expect(vereditoMaisSevero("CRITICO", "AMARELO")).toBe("CRITICO");
    expect(vereditoMaisSevero("VERDE", "VERDE")).toBe("VERDE");
  });
});

describe("⭐ o caminho real: `avaliarCamadaRapida`, a mesma função que `revisao.ts` chama", () => {
  it("o panfleto volta VERMELHO sem chamar motor de IA nenhum", async () => {
    const r = await avaliarCamadaRapida(contexto, PANFLETO);

    expect(r.veredito).toBe("VERMELHO");
    // A prova de que nenhum modelo foi chamado: o resultado não carrega motor.
    expect(r.engineProvider).toBeNull();
    expect(r.engineModel).toBeNull();
    // E não é falha técnica disfarçada de reprovação — é um veredito de mérito.
    expect(r.falhaTecnica).toBe(false);
    expect(r.detalhe).toContain("régua determinística da rubrica");
    expect(r.motivos.length).toBeGreaterThan(0);
    // Zero chamadas gastas do teto do dia.
    expect(estadoDoTeto().chamadas).toBe(0);
  });

  it("a mensagem de medo volta CRÍTICO pelo mesmo caminho, também de graça", async () => {
    const r = await avaliarCamadaRapida(
      contexto,
      "Se você não agir agora, seu restaurante vai ficar para trás e você vai perder clientes.",
    );
    expect(r.veredito).toBe("CRITICO");
    expect(r.falhaTecnica).toBe(false);
    expect(estadoDoTeto().chamadas).toBe(0);
  });

  it("⚠️ a mensagem BOA não é barrada pela régua — ela segue para o modelo", async () => {
    const r = await avaliarCamadaRapida(contexto, MENSAGEM_BOA);

    // Sem motor configurado no ambiente de teste, seguir para o modelo termina
    // em falha técnica — e é exatamente isso que prova que a régua NÃO a
    // barrou: se tivesse barrado, o resultado seria uma reprovação de mérito
    // (`falhaTecnica: false`), como nos dois casos acima. Uma régua que
    // aprovasse tudo em silêncio faria este teste passar pelo motivo errado, e
    // por isso ele confere o motivo, não só o resultado.
    expect(r.falhaTecnica).toBe(true);
    expect(r.detalhe).not.toContain("régua determinística");
    // E a tentativa consumiu uma chamada do teto do dia — o gasto é contado
    // onde ele de fato acontece.
    expect(estadoDoTeto().chamadas).toBe(1);
  });
});

describe("o teto diário de custo", () => {
  it("conta uma chamada por vez e para no teto", () => {
    for (let i = 0; i < TETO_DE_CHAMADAS_POR_DIA; i++) expect(podeChamarModelo()).toBe(true);
    expect(podeChamarModelo()).toBe(false);
    expect(estadoDoTeto().restantes).toBe(0);
  });

  it("estourado o teto, a mensagem RUIM continua barrada — degrada, não abre", async () => {
    for (let i = 0; i < TETO_DE_CHAMADAS_POR_DIA; i++) podeChamarModelo();

    const r = await avaliarCamadaRapida(contexto, PANFLETO);
    expect(r.veredito).toBe("VERMELHO");
    expect(r.falhaTecnica).toBe(false);
  });

  it("estourado o teto, a mensagem BOA passa VERDE em vez de travar a sala", async () => {
    for (let i = 0; i < TETO_DE_CHAMADAS_POR_DIA; i++) podeChamarModelo();

    const r = await avaliarCamadaRapida(contexto, MENSAGEM_BOA);
    expect(r.veredito).toBe("VERDE");
    expect(r.falhaTecnica).toBe(false);
    expect(r.detalhe).toContain("teto diário de custo atingido");
  });

  it("vira o dia sozinho, em UTC", () => {
    podeChamarModelo(new Date("2026-09-17T23:59:00Z"));
    expect(estadoDoTeto(new Date("2026-09-17T23:59:30Z")).chamadas).toBe(1);
    expect(estadoDoTeto(new Date("2026-09-18T00:00:30Z")).chamadas).toBe(0);
  });
});

describe("a bagagem chega inteira ao prompt", () => {
  it("as sete frentes estão no prompt, com os títulos", () => {
    const prompt = conhecimentoComercialParaPrompt();
    const frentes = frentesDaDoutrina();

    expect(frentes).toHaveLength(7);
    for (const titulo of frentes) expect(prompt).toContain(titulo);
  });

  it("os nove tipos de porteiro que `classificacao.ts` carimba estão na doutrina", () => {
    const prompt = conhecimentoComercialParaPrompt();
    for (const tipo of [
      "BOT_DE_PEDIDOS",
      "FORMULARIO",
      "CENTRAL_TELEFONICA",
      "SAC",
      "RECEPCIONISTA",
      "CAIXA",
      "ATENDENTE",
      "WHATSAPP_GERAL",
      "OUTRO",
    ]) {
      expect(prompt).toContain(tipo);
    }
  });

  it("as sete objeções reais deste mercado estão nomeadas", () => {
    const prompt = conhecimentoComercialParaPrompt();
    for (const objecao of [
      "JÁ TENHO IFOOD",
      "É CARO",
      "VOU PENSAR",
      "MANDA POR E-MAIL",
      "NÃO SOU EU QUEM DECIDE",
      "NÃO TENHO TEMPO",
      "JÁ TENTEI SISTEMA E NÃO DEU CERTO",
    ]) {
      expect(prompt).toContain(objecao);
    }
  });

  it("a proibição de fingir-se de cliente continua escrita, e reforçada", () => {
    expect(conhecimentoComercialParaPrompt()).toContain("NUNCA se passe por cliente");
  });

  it("a rubrica entra escrita no prompt, com os mesmos números que o código aplica", () => {
    const prompt = conhecimentoComercialParaPrompt();
    expect(prompt).toContain(rubricaParaPrompt());
    expect(prompt).toContain(`mais de ${MAX_LINHAS} linhas`);
  });

  it("a versão do playbook subiu", () => {
    expect(VERSAO_DO_PLAYBOOK_COMERCIAL).toBe("foocci-supervisora-2026-09-17-v3");
    expect(conhecimentoComercialParaPrompt()).toContain(VERSAO_DO_PLAYBOOK_COMERCIAL);
  });

  it("⚠️ a doutrina não afirma preço, prazo nem garantia — verdade do produto vem do TA", () => {
    const prompt = conhecimentoComercialParaPrompt();
    // Nenhum valor em reais e nenhum prazo em dias sai daqui.
    expect(prompt).not.toMatch(/R\$\s?\d/);
    expect(prompt).toContain("verdade publicada");
  });
});
