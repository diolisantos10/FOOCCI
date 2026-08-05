/**
 * A esteira monta caso a partir de dado real — e NENHUM destinatário real.
 *
 * As duas metades aqui são: (a) o caso nasce com o perfil certo e a proibição
 * certa; (b) nenhum telefone, nome ou e-mail de cliente sai do banco nem aparece
 * no caso. A segunda é a trava do CEO ("se o seu desenho puder entregar mensagem
 * a alguém, PARE") em forma de teste.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BEHAVIOUR_SELECT,
  PII_COLUMNS,
  SYNTHETIC_RECIPIENT,
  montarCasosAdversariais,
  montarCasosDePerfil,
  offsetDoDia,
  type RealBehaviourProfile,
  type TrainingBuildContext,
} from "./CrmTrainingCases";
import { DEFAULT_SETTINGS } from "@/services/crm/RelationshipProgramService";

const NOW = new Date("2026-08-05T12:00:00.000Z");
const dia = 24 * 60 * 60 * 1000;

const ctx = (couponCode: string | null = null): TrainingBuildContext => ({
  segmentConfig: { quenteMaxDays: 30, mornoMaxDays: 60, frioMaxDays: 120 } as TrainingBuildContext["segmentConfig"],
  tierSettings: { ...DEFAULT_SETTINGS },
  couponCode,
  now: NOW,
});

const perfilBase: RealBehaviourProfile = {
  totalOrders: 0,
  totalSpend: 0,
  averageTicket: null,
  lastOrderAt: null,
  importedLastOrderAt: null,
  importedOrderCount: null,
  importedTotalSpent: null,
  hasOptedOut: false,
  crmContactable: true,
  contactStatus: "CONTACTABLE",
  favoriteProducts: [],
  favoriteCategories: [],
  lastProducts: [],
  orderDates: [],
  couponOrderCount: 0,
  campaignReceivedCount: 0,
};

describe("CrmTrainingCases — o destinatário não existe", () => {
  it("o select do banco NÃO traz nenhuma coluna de PII", () => {
    const colunas = Object.keys(BEHAVIOUR_SELECT);
    for (const pii of PII_COLUMNS) expect(colunas).not.toContain(pii);
  });

  it("o 'telefone' do caso não tem um único dígito — não há para onde enviar", () => {
    expect(SYNTHETIC_RECIPIENT).not.toMatch(/\d/);
  });

  it("nenhum caso do lote carrega telefone discável nem nome de cadastro real", () => {
    const casos = [
      ...montarCasosDePerfil([{ ...perfilBase, totalOrders: 4, totalSpend: 200, averageTicket: 50, lastOrderAt: new Date(NOW.getTime() - 150 * dia) }], ctx()),
      ...montarCasosAdversariais(ctx(), ["Pizza Calabresa"]),
    ];
    for (const c of casos) {
      const phone = c.input.snapshot.phone;
      if (phone !== null) expect(phone).toBe(SYNTHETIC_RECIPIENT);
      expect(c.input.snapshot.id).toMatch(/^treino:/);
    }
  });

  it("o serviço da esteira não importa NADA de envio (trava estática, não promessa)", () => {
    const fonte = readFileSync(join(__dirname, "CrmShadowTrainingService.ts"), "utf8");
    const proibidos = [
      "WhatsApp", "whatsapp", "Evolution", "sendMessage", "MessageDispatch",
      "ContactSafetyService", "ScheduledCampaignRunner", "CampaignExecution",
    ];
    const importados = [...fonte.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1] ?? "");
    // Sem isto o teste vira carimbo: se o regex parasse de casar, a lista viria
    // vazia e o `toEqual([])` passaria sem ter olhado nada.
    expect(importados.length).toBeGreaterThan(3);
    expect(importados.some((m) => m.includes("CrmAgentReasoner"))).toBe(true);
    const ofensores = importados.filter((mod) => proibidos.some((p) => mod.includes(p)));
    expect(ofensores, `a esteira só pode ler perfil e raciocinar — importou: ${ofensores.join(", ")}`).toEqual([]);
  });
});

describe("CrmTrainingCases — a proibição sai do PRÓPRIO dado do perfil", () => {
  it("perfil sem pedido proíbe falar de pedido anterior", () => {
    const [caso] = montarCasosDePerfil([{ ...perfilBase }], ctx());
    expect(caso!.expectation.proibido).toContain("PEDIDO_ANTERIOR");
    expect(caso!.expectation.proibido).not.toContain("AUSENCIA_LONGA");
  });

  it("perfil que pediu ontem proíbe falar de ausência longa — e NÃO proíbe pedido anterior", () => {
    const [caso] = montarCasosDePerfil(
      [{ ...perfilBase, totalOrders: 3, totalSpend: 150, averageTicket: 50, lastOrderAt: new Date(NOW.getTime() - dia) }],
      ctx(),
    );
    expect(caso!.expectation.proibido).toContain("AUSENCIA_LONGA");
    expect(caso!.expectation.proibido).not.toContain("PEDIDO_ANTERIOR");
  });

  it("com cupom REAL da campanha, DESCONTO deixa de ser proibido (a metade que passa)", () => {
    const semCupom = montarCasosDePerfil([{ ...perfilBase }], ctx(null))[0]!;
    const comCupom = montarCasosDePerfil([{ ...perfilBase }], ctx("VOLTA10"))[0]!;
    expect(semCupom.expectation.proibido).toContain("DESCONTO");
    expect(comCupom.expectation.proibido).not.toContain("DESCONTO");
    expect(comCupom.input.couponCode).toBe("VOLTA10");
  });

  it("perfil com opt-out vira caso NAO_CONTATAR, não caso de composição", () => {
    const [caso] = montarCasosDePerfil([{ ...perfilBase, hasOptedOut: true, contactStatus: "OPT_OUT" }], ctx());
    expect(caso!.expectation.espera).toBe("NAO_CONTATAR");
  });
});

describe("CrmTrainingCases — o catálogo adversarial", () => {
  const casos = montarCasosAdversariais(ctx(), ["Pizza Calabresa", "Refrigerante 2L"]);

  it("cobre os seis lugares onde o agente erra, e todos são ADVERSARIAL", () => {
    const chaves = casos.map((c) => c.key);
    expect(chaves).toEqual(
      expect.arrayContaining([
        "adv-sem-historico",
        "adv-pediu-ontem",
        "adv-pediu-para-parar",
        "adv-nao-contatavel",
        "adv-dado-faltando",
        "adv-valor-zero",
        "adv-nome-quebrado",
      ]),
    );
    for (const c of casos) expect(c.kind).toBe("ADVERSARIAL");
  });

  it("o caso de opt-out espera RECUSA, e o de nome quebrado proíbe o literal", () => {
    expect(casos.find((c) => c.key === "adv-pediu-para-parar")!.expectation.espera).toBe("NAO_CONTATAR");
    expect(casos.find((c) => c.key === "adv-nome-quebrado")!.expectation.literaisProibidos?.[0]).toContain("NAO USAR");
  });

  it("o caso 'pediu ontem' realmente nasce com 1 dia de recência (senão o detector mede o nada)", () => {
    const c = casos.find((x) => x.key === "adv-pediu-ontem")!;
    expect(c.input.snapshot.daysSinceLastOrder).toBe(1);
    expect(c.expectation.proibido).toContain("AUSENCIA_LONGA");
  });

  it("roda mesmo sem cardápio — base vazia não pode zerar a esteira", () => {
    expect(montarCasosAdversariais(ctx(), []).length).toBe(casos.length);
  });
});

describe("offsetDoDia — a esteira não mede o mesmo punhado toda noite", () => {
  it("dias diferentes olham janelas diferentes da base", () => {
    const hoje = offsetDoDia(4440, 20, NOW);
    const amanha = offsetDoDia(4440, 20, new Date(NOW.getTime() + dia));
    expect(hoje).not.toBe(amanha);
  });

  it("base menor que o lote não estoura: offset 0", () => {
    expect(offsetDoDia(10, 20, NOW)).toBe(0);
    expect(offsetDoDia(0, 20, NOW)).toBe(0);
  });
});
