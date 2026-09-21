/**
 * CONSENTIMENTO É DE CANAL, NÃO DE PESSOA — a regra, travada em teste.
 *
 * ── O DEFEITO QUE ESTE ARQUIVO FECHA ─────────────────────────────────────────
 *
 * Na rodada de 110 cenários de 21/09/2026, o único FALSO NEGATIVO foi o
 * `cen-105`: uma oferta comercial enviada por WhatsApp a um contato cujo único
 * consentimento registrado era para e-mail. A régua devolveu VERMELHO porque
 * julgou o TOM ("urgência artificial", "pula a descoberta consultiva") — viu uma
 * mensagem ruim e não viu o FATO JURÍDICO. Consentimento para e-mail não
 * autoriza WhatsApp: é LGPD e é risco de banimento da conta na Meta, e por isso
 * é CRÍTICO, não VERMELHO.
 *
 * ── ⚠️ ESTE TESTE NÃO DECORA O GABARITO ──────────────────────────────────────
 *
 * A regra não conhece `cen-105`. Ela recebe um FATO ("o canal desta mensagem
 * não tem consentimento próprio") e julga a MENSAGEM. A prova disso está nos
 * pares: `cen-105`/`cen-106` e `cen-023`/`cen-024` têm a MESMA situação e o
 * mesmo fato de cadastro, e terminam em vereditos opostos — porque um abordá e o
 * outro reconhece a falta de base legal e se abstém. Uma régua que decorasse a
 * resposta reprovaria os dois.
 *
 * Nenhum motor de IA é chamado aqui: a régua é determinística.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { avaliarPelaRubrica, acharDefeitoDeConsentimentoDeCanal, type ConsentimentoDeCanal } from "./rubrica";
import { consentimentoDeCanalDoLead, type ContextoDaRevisao } from "./contexto";
import { avaliarCamadaRapida } from "./camadaRapida";
import { zerarTetoParaTeste } from "./tetoDiario";

/** O fato de cadastro do caso: só e-mail foi consentido; esta mensagem sairia por WhatsApp. */
const SO_EMAIL: ConsentimentoDeCanal = {
  canalDaMensagem: "whatsapp",
  canaisComConsentimento: ["email"],
};

const CAMINHO_DOS_CENARIOS = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "docs",
  "academia-comercial",
  "cenarios-avaliacao.json",
);

interface Cenario {
  id: string;
  respostaProposta: string;
  veredictoEsperado: string;
}

const CENARIOS: Cenario[] = JSON.parse(readFileSync(CAMINHO_DOS_CENARIOS, "utf-8")).cenarios;

function cenario(id: string): Cenario {
  const c = CENARIOS.find((x) => x.id === id);
  if (!c) throw new Error(`cenário ${id} não existe no arquivo de avaliação`);
  return c;
}

/** O contexto que a camada rápida recebe em produção, com o fato de canal medido. */
const CONTEXTO_SO_EMAIL: ContextoDaRevisao = {
  ultimaMensagemDoCliente: null,
  resumoIncremental: "",
  etapaDoFunil: "GERAL",
  perfilDoLead: "lead fictício de teste",
  regrasComerciais: [],
  tomDaMarca: "direto, cordial",
  ultimosAlertasDesteAtendimento: [],
  irritacaoDoLead: 0,
  pediuParar: false,
  conhecimentoDaAcademia: [],
  consentimentoDeCanal: SO_EMAIL,
};

describe("⚠️ o teste alcança o código que responde ao cliente", () => {
  it("cen-105 volta CRITICO pela camada rápida REAL, sem chamar motor de IA nenhum", async () => {
    zerarTetoParaTeste();
    const r = await avaliarCamadaRapida(CONTEXTO_SO_EMAIL, cenario("cen-105").respostaProposta);
    expect(r.veredito).toBe("CRITICO");
    expect(r.falhaTecnica).toBe(false);
    // Nenhum motor rodou: a régua decidiu sozinha, de graça.
    expect(r.engineProvider).toBeNull();
    expect(r.detalhe).toContain("CONTATO_SEM_CONSENTIMENTO_DO_CANAL");
  });
});

describe("a régua enxerga o fato jurídico, não o tom", () => {
  it("cen-105: oferta por WhatsApp com consentimento só de e-mail é CRITICO, pela régua", () => {
    const parecer = avaliarPelaRubrica(cenario("cen-105").respostaProposta, SO_EMAIL);
    expect(parecer.veredito).toBe("CRITICO");
    expect(parecer.achados.map((a) => a.codigo)).toContain("CONTATO_SEM_CONSENTIMENTO_DO_CANAL");
    // Guardrail 6: veredito mudo não existe — o trecho que disparou vem junto.
    const achado = parecer.achados.find((a) => a.codigo === "CONTATO_SEM_CONSENTIMENTO_DO_CANAL")!;
    expect(achado.evidencia.length).toBeGreaterThan(0);
    expect(achado.explicacao).toContain("consentimento é de CANAL, não de pessoa");
  });

  it("cen-023: a mesma regra pega a ABORDAGEM fria por WhatsApp, não só a oferta", () => {
    expect(avaliarPelaRubrica(cenario("cen-023").respostaProposta, SO_EMAIL).veredito).toBe("CRITICO");
  });

  it("⚠️ o par que prova que não é o gabarito decorado: quem se abstém é VERDE", () => {
    // Mesma situação, mesmo fato de cadastro, mensagem oposta.
    for (const id of ["cen-024", "cen-106"]) {
      const parecer = avaliarPelaRubrica(cenario(id).respostaProposta, SO_EMAIL);
      expect(parecer.achados.map((a) => a.codigo)).not.toContain("CONTATO_SEM_CONSENTIMENTO_DO_CANAL");
      expect(parecer.veredito).toBe("VERDE");
    }
  });

  it("a regra vale para QUALQUER caso do mesmo tipo — inclusive um texto que não está em cenário nenhum", () => {
    const educada = "Boa tarde, Sr. Marcelo. Segue nossa proposta comercial, sem compromisso. Fico à disposição.";
    // Tom impecável, sem urgência, sem pressão: ainda assim não há base legal para o canal.
    expect(avaliarPelaRubrica(educada, SO_EMAIL).veredito).toBe("CRITICO");
    // E o mesmo texto, no canal consentido, não tem defeito de canal nenhum.
    expect(
      avaliarPelaRubrica(educada, { canalDaMensagem: "email", canaisComConsentimento: ["email"] }).achados,
    ).toHaveLength(0);
  });

  it("sem fato medido, a regra NÃO acusa — ausência de informação não é informação", () => {
    expect(avaliarPelaRubrica(cenario("cen-105").respostaProposta, null).achados.map((a) => a.codigo)).not.toContain(
      "CONTATO_SEM_CONSENTIMENTO_DO_CANAL",
    );
    expect(acharDefeitoDeConsentimentoDeCanal("qualquer oferta", undefined)).toHaveLength(0);
  });

  it("uma conversa sem conteúdo comercial não vira violação por existir", () => {
    const operacional = "Recebi seu retorno, obrigado. Qualquer coisa é só me chamar.";
    expect(acharDefeitoDeConsentimentoDeCanal(operacional, SO_EMAIL)).toHaveLength(0);
  });
});

describe("⛔ nenhum dos outros cenários muda de veredito por causa desta regra", () => {
  it("sem o fato de canal, a régua devolve exatamente o que devolvia antes", () => {
    for (const c of CENARIOS) {
      const antes = avaliarPelaRubrica(c.respostaProposta);
      const depois = avaliarPelaRubrica(c.respostaProposta, null);
      expect(depois.veredito).toBe(antes.veredito);
      expect(depois.detalhe).toBe(antes.detalhe);
    }
  });

  it("com o fato de canal, só os cenários DE canal ganham o achado novo", () => {
    const afetados = CENARIOS.filter(
      (c) =>
        avaliarPelaRubrica(c.respostaProposta, SO_EMAIL).achados.some(
          (a) => a.codigo === "CONTATO_SEM_CONSENTIMENTO_DO_CANAL",
        ),
    ).map((c) => c.id);
    // O fato só é medido nos quatro cenários de consentimento por canal; nos
    // demais ele é `null` na avaliação real. Aqui forçamos o fato em TODOS de
    // propósito, para ver o alcance da regra: ela pega abordagem comercial —
    // que é o que exige base legal — e nada além disso.
    expect(afetados).toContain("cen-105");
    expect(afetados).toContain("cen-023");
    expect(afetados).not.toContain("cen-106");
    expect(afetados).not.toContain("cen-024");
  });
});

describe("o fato de canal, em produção, é medido e não presumido", () => {
  it("quem escreveu no WhatsApp consentiu com o WhatsApp", () => {
    const c = consentimentoDeCanalDoLead({ fonte: "WHATSAPP_DIRETO", consentAt: new Date("2026-09-01") });
    expect(c?.canaisComConsentimento).toEqual(["whatsapp"]);
  });

  it("sem consentimento datado, ou sem canal conhecido, a resposta honesta é `null`", () => {
    expect(consentimentoDeCanalDoLead({ fonte: "WHATSAPP_DIRETO", consentAt: null })).toBeNull();
    expect(consentimentoDeCanalDoLead({ fonte: "FORMULARIO_DEMONSTRACAO", consentAt: new Date() })).toBeNull();
    expect(consentimentoDeCanalDoLead(null)).toBeNull();
  });
});
