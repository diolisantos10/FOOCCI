/**
 * A TABELA DO CEO, LINHA POR LINHA — cada uma tem um teste com o nome dela.
 *
 * Se uma linha da tabela sumir do código, o teste que leva o nome dela quebra.
 */

import { describe, it, expect } from "vitest";
import { decidirReabordagem, type FatosDaConversa } from "./rota";
import { TEXTOS } from "./textos";

const AGORA = new Date("2026-09-18T12:00:00.000Z");
const ONTEM = new Date("2026-09-17T20:00:00.000Z"); // 16h atrás — dentro da janela
const SEMANA_PASSADA = new Date("2026-09-10T12:00:00.000Z"); // fora da janela

function fatos(p: Partial<FatosDaConversa> = {}): FatosDaConversa {
  return {
    leadId: "lead-1",
    telefone: "5511988887777",
    stage: "DISPONIVEL_PARA_PROSPECCAO",
    optOutAt: null,
    estagioDaEmpresa: "GATEKEEPER",
    contatoEhDecisor: null,
    ultimaEntradaEm: null,
    textoDaUltimaEntrada: null,
    ...p,
  };
}

describe("a tabela de decisão da reabordagem", () => {
  it("pediu para parar → não aborda, nunca (ficha carimbada)", () => {
    const d = decidirReabordagem(fatos({ optOutAt: new Date("2026-08-01") }), AGORA);
    expect(d.acao).toBe("NAO_ABORDA");
    expect(d.canal).toBe("NENHUM");
    expect(d.texto).toBeNull();
  });

  it("pediu para parar POR ESCRITO, e a ficha ainda não sabe → não aborda", () => {
    const d = decidirReabordagem(
      fatos({
        ultimaEntradaEm: ONTEM,
        textoDaUltimaEntrada: "Por favor, não me mande mais mensagens.",
      }),
      AGORA,
    );
    expect(d.acao).toBe("NAO_ABORDA");
    expect(d.regra).toBe("pediuParaPararNoTexto");
  });

  it("já está em demo/proposta/negociação/ganho → fora da campanha, é continuação", () => {
    for (const stage of ["DEMO_AGENDADA", "PROPOSTA_ENVIADA", "EM_NEGOCIACAO", "GANHO"] as const) {
      const d = decidirReabordagem(fatos({ stage }), AGORA);
      expect(d.acao, stage).toBe("FORA_DA_CAMPANHA");
      expect(d.canal).toBe("NENHUM");
    }
  });

  it("decisor já identificado → vai para o SDR/TA, e a campanha não fala", () => {
    const d = decidirReabordagem(fatos({ contatoEhDecisor: true }), AGORA);
    expect(d.acao).toBe("PARA_SDR");
    expect(d.canal).toBe("NENHUM");
    expect(d.objetivo).toBe("GERAR_OPORTUNIDADE");
  });

  it("nunca respondeu → fora da janela, sai por TEMPLATE aprovado", () => {
    const d = decidirReabordagem(fatos(), AGORA);
    expect(d.acao).toBe("ABORDAGEM_INICIAL");
    expect(d.canal).toBe("TEMPLATE");
    expect(d.texto).toBeNull();
    expect(d.objetivo).toBe("DESCOBRIR_DECISOR");
  });

  it("cliente falou há menos de 24h → retoma NA JANELA, sem template", () => {
    const d = decidirReabordagem(
      fatos({ ultimaEntradaEm: ONTEM, textoDaUltimaEntrada: "Oi, boa tarde, como posso ajudar?" }),
      AGORA,
    );
    expect(d.canal).toBe("JANELA");
    expect(d.acao).toBe("PERGUNTA_SE_RESPONSAVEL");
    expect(d.texto).toBe(TEXTOS.perguntaSeResponsavel);
  });

  it("fora da janela de 24h → retoma por TEMPLATE, mesmo tendo respondido antes", () => {
    const d = decidirReabordagem(
      fatos({
        ultimaEntradaEm: SEMANA_PASSADA,
        textoDaUltimaEntrada: "Oi, boa tarde, como posso ajudar?",
      }),
      AGORA,
    );
    expect(d.canal).toBe("TEMPLATE");
    expect(d.texto).toBeNull();
  });

  it("bot/menu respondeu COM opção para gente → navega por ela, e só por ela", () => {
    const d = decidirReabordagem(
      fatos({
        ultimaEntradaEm: ONTEM,
        textoDaUltimaEntrada:
          "Bem-vindo! Escolha:\n1 - Fazer pedido\n2 - Ver cardápio digital\n3 - Falar com um atendente",
      }),
      AGORA,
    );
    expect(d.acao).toBe("NAVEGA_MENU");
    expect(d.canal).toBe("JANELA");
    expect(d.texto).toBe("3");
  });

  it("⛔ bot/menu SEM opção para gente → revisão, e ninguém finge ser cliente", () => {
    const d = decidirReabordagem(
      fatos({
        ultimaEntradaEm: ONTEM,
        textoDaUltimaEntrada:
          "Olá! Para fazer seu pedido, informe nome e endereço. Ver o cardápio: https://ifood.com.br/x",
      }),
      AGORA,
    );
    expect(d.acao).toBe("REVISAO");
    expect(d.regra).toBe("botSemOpcaoParaGente");
    expect(d.texto).toBeNull();
  });

  it("humano respondeu, cargo desconhecido → pergunta se é o responsável", () => {
    const d = decidirReabordagem(
      fatos({ ultimaEntradaEm: ONTEM, textoDaUltimaEntrada: "Oi, do que se trata?" }),
      AGORA,
    );
    expect(d.acao).toBe("PERGUNTA_SE_RESPONSAVEL");
    expect(d.texto).toBe(TEXTOS.perguntaSeResponsavel);
  });

  it("não é o responsável → pede o contato certo", () => {
    const d = decidirReabordagem(
      fatos({ ultimaEntradaEm: ONTEM, textoDaUltimaEntrada: "Não sou eu, não cuido disso." }),
      AGORA,
    );
    expect(d.acao).toBe("PEDE_CONTATO_CERTO");
    expect(d.texto).toBe(TEXTOS.pedeContatoCerto);
  });

  it("porteiro humano (recepção) → pede o contato de quem decide", () => {
    const d = decidirReabordagem(
      fatos({ ultimaEntradaEm: ONTEM, textoDaUltimaEntrada: "Aqui é a recepção do restaurante." }),
      AGORA,
    );
    expect(d.acao).toBe("PEDE_CONTATO_CERTO");
    expect(d.texto).toBe(TEXTOS.pedeContatoAoPorteiro);
  });

  it("⭐ indicou TELEFONE → cadastra o decisor e abre conversa nova", () => {
    const d = decidirReabordagem(
      fatos({
        ultimaEntradaEm: ONTEM,
        textoDaUltimaEntrada: "Oi, fala com a Juliana, o número dela é (11) 98888-1234",
      }),
      AGORA,
    );
    expect(d.acao).toBe("CADASTRA_DECISOR");
    expect(d.decisor?.telefone).toContain("98888");
    expect(d.decisor?.nome).toBe("Juliana");
  });

  it("indicou a PESSOA mas não o número → pede o telefone, não inventa um", () => {
    const d = decidirReabordagem(
      fatos({ ultimaEntradaEm: ONTEM, textoDaUltimaEntrada: "Oi, fala com a Juliana, ela que cuida disso." }),
      AGORA,
    );
    expect(d.acao).toBe("PEDE_CONTATO_CERTO");
    expect(d.regra).toBe("indicouDecisorSemTelefone");
  });

  it("ambíguo → não inventa: separa para revisão", () => {
    const d = decidirReabordagem(
      fatos({ ultimaEntradaEm: ONTEM, textoDaUltimaEntrada: "ok" }),
      AGORA,
    );
    expect(d.acao).toBe("REVISAO");
    expect(d.regra).toBe("respostaSemSinalLegivel");
  });

  it("sem telefone legível → revisão, e não se adivinha número", () => {
    const d = decidirReabordagem(fatos({ telefone: "123" }), AGORA);
    expect(d.acao).toBe("REVISAO");
    expect(d.regra).toBe("semTelefone");
  });
});

describe("⛔ nenhuma decisão produz texto quando a ação não fala", () => {
  it("toda ação que não fala sai com canal NENHUM ou texto nulo", () => {
    const casos: FatosDaConversa[] = [
      fatos({ optOutAt: new Date() }),
      fatos({ stage: "GANHO" }),
      fatos({ contatoEhDecisor: true }),
      fatos({ telefone: null }),
      fatos({ ultimaEntradaEm: ONTEM, textoDaUltimaEntrada: "ok" }),
    ];
    for (const c of casos) {
      const d = decidirReabordagem(c, AGORA);
      expect(["NAO_ABORDA", "FORA_DA_CAMPANHA", "PARA_SDR", "REVISAO"]).toContain(d.acao);
      expect(d.texto).toBeNull();
      expect(d.canal).toBe("NENHUM");
    }
  });
});
