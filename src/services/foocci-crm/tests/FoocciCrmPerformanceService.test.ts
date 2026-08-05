/**
 * A performance por origem — e a mesma trava de amostra, por linha.
 *
 * O risco real: o funil inteiro respeita o mínimo, mas a TABELA POR ORIGEM
 * escapa, e uma campanha com 2 contatos e 1 fechamento aparece com "50% de
 * conversão" no topo do relatório de mídia. Estes testes fecham essa porta.
 */

import { describe, it, expect } from "vitest";
import { montaPerformance, type LeadParaPerformance } from "../FoocciCrmPerformanceService";
import { MIN_LEADS_PARA_TAXA, type FoocciLeadStage } from "../foocciCrmFunnel";

const PERIODO = {
  chave: "30d" as const,
  rotulo: "Últimos 30 dias",
  rotuloAnterior: "vs. 30 dias anteriores",
  inicio: "2026-07-06T03:00:00.000Z",
  fim: "2026-08-05T03:00:00.000Z",
  dias: 30,
};

let contador = 0;
function lead(over: Partial<LeadParaPerformance> = {}): LeadParaPerformance {
  contador++;
  return {
    id: `l${contador}`,
    createdAt: new Date("2026-07-20T12:00:00Z"),
    stage: "NOVO",
    origem: null,
    utmSource: null, utmMedium: null, utmCampaign: null, utmContent: null, utmTerm: null,
    clickId: null, landingPath: null, referrer: null,
    lastContactedAt: null,
    historicoToStages: [],
    ...over,
  };
}

function muitos(n: number, over: Partial<LeadParaPerformance> = {}): LeadParaPerformance[] {
  return Array.from({ length: n }, () => lead(over));
}

describe("resumo", () => {
  it("conta chegadas, fechados, perdidos e quem ainda não foi abordado", () => {
    const r = montaPerformance(
      [
        lead(),
        lead({ lastContactedAt: new Date() }),
        lead({ stage: "FECHADO", lastContactedAt: new Date() }),
        lead({ stage: "PERDIDO", lastContactedAt: new Date() }),
      ],
      PERIODO, 0, 10,
    );

    expect(r.resumo.chegaram).toBe(4);
    expect(r.resumo.naoAbordados).toBe(1);
    expect(r.resumo.fechados).toBe(1);
    expect(r.resumo.perdidos).toBe(1);
    expect(r.resumo.emAndamento).toBe(2);
    expect(r.resumo.baseTotal).toBe(10);
  });

  it("variação sobre base zero é null, não '+100%'", () => {
    const r = montaPerformance([lead(), lead()], PERIODO, 0, 2);
    expect(r.resumo.variacaoPercentual).toBeNull();
  });

  it("com base anterior, a variação é calculada", () => {
    const r = montaPerformance(muitos(6), PERIODO, 4, 10);
    expect(r.resumo.variacaoPercentual).toBeCloseTo(0.5);
  });
});

describe("por origem — a trava de amostra vale por LINHA", () => {
  it("origem com 2 contatos e 1 fechamento NÃO vira 50%", () => {
    const campanha = { utmSource: "facebook", utmCampaign: "Restaurantes-SP" };
    const r = montaPerformance(
      [lead({ ...campanha, stage: "FECHADO" }), lead(campanha)],
      PERIODO, 0, 2,
    );

    const linha = r.origens.find((o) => o.rotulo === "Restaurantes-SP")!;
    expect(linha.chegaram).toBe(2);
    expect(linha.fechados).toBe(1);
    expect(linha.taxaFechamento).toBeNull();
    expect(linha.explicacaoTaxa).toContain("Ainda não dá para dizer");
  });

  it("com amostra suficiente, a taxa da origem aparece", () => {
    const campanha = { utmSource: "facebook", utmCampaign: "Restaurantes-SP" };
    const r = montaPerformance(
      [
        ...muitos(MIN_LEADS_PARA_TAXA - 2, campanha),
        lead({ ...campanha, stage: "FECHADO" }),
        lead({ ...campanha, stage: "FECHADO" }),
      ],
      PERIODO, 0, MIN_LEADS_PARA_TAXA,
    );

    const linha = r.origens.find((o) => o.rotulo === "Restaurantes-SP")!;
    expect(linha.chegaram).toBe(MIN_LEADS_PARA_TAXA);
    expect(linha.taxaFechamento).toBeCloseTo(2 / MIN_LEADS_PARA_TAXA);
  });

  it("separa campanhas diferentes e ordena pela que mais trouxe", () => {
    const r = montaPerformance(
      [
        ...muitos(3, { utmSource: "facebook", utmCampaign: "Campanha A" }),
        ...muitos(5, { utmSource: "instagram", utmCampaign: "Campanha B" }),
      ],
      PERIODO, 0, 8,
    );

    expect(r.origens.map((o) => o.rotulo)).toEqual(["Campanha B", "Campanha A"]);
    expect(r.origens[0]!.canalRotulo).toBe("Instagram");
  });

  it("distingue anúncios da mesma campanha", () => {
    const r = montaPerformance(
      [
        lead({ utmSource: "facebook", utmCampaign: "A", utmContent: "video" }),
        lead({ utmSource: "facebook", utmCampaign: "A", utmContent: "carrossel" }),
      ],
      PERIODO, 0, 2,
    );
    expect(r.origens.map((o) => o.rotulo).sort()).toEqual(["A · carrossel", "A · video"]);
  });

  it("conta quantos chegaram sem NENHUM sinal de campanha", () => {
    // É o alerta que diz ao CEO "seus anúncios estão sem parâmetro" — sem ele, a
    // ausência de atribuição pareceria ausência de tráfego pago.
    const r = montaPerformance(
      [lead(), lead({ origem: "/site/demonstracao" }), lead({ utmCampaign: "A", utmSource: "facebook" })],
      PERIODO, 0, 3,
    );
    expect(r.semOrigemIdentificada).toBe(2);
  });
});

describe("funil por coorte de chegada", () => {
  it("quem foi perdido depois de virar proposta ainda conta no degrau da proposta", () => {
    const historico: FoocciLeadStage[] = ["CONTATADO", "QUALIFICADO", "PROPOSTA", "PERDIDO"];
    const r = montaPerformance([lead({ stage: "PERDIDO", historicoToStages: historico })], PERIODO, 0, 1);

    const proposta = r.funil.etapas.find((e) => e.stage === "PROPOSTA")!;
    expect(proposta.alcancaram).toBe(1);
    expect(r.funil.perdidos).toBe(1);
  });

  it("período vazio devolve tudo zerado sem taxa nenhuma", () => {
    const r = montaPerformance([], PERIODO, 0, 0);
    expect(r.resumo.chegaram).toBe(0);
    expect(r.origens).toHaveLength(0);
    expect(r.funil.pontaAPonta).toBeNull();
    for (const d of r.funil.degraus) expect(d.taxa).toBeNull();
  });
});
