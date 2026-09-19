/**
 * O FUNIL FECHA A CONTA — e declara o que não mede.
 *
 * O ponto do relatório é a soma: enviadas + cada degrau tem de dar o total de
 * decisões da janela. Um funil que não fecha não é diagnóstico, é palpite.
 */

import { describe, it, expect } from "vitest";
import { raioXDeDisparos, STATUS_DE_ENVIO, type LeitorDoBanco } from "./funilDeDisparos";

const T = (min: number) => new Date(Date.UTC(2026, 8, 17, 12, min, 0));

type Linha = {
  restaurantId: string | null;
  campaignId: string;
  status: string;
  errorMessage: string | null;
  sentAt: Date | null;
  createdAt: Date;
};

function bancoFalso(linhas: Linha[], extras?: {
  clientes?: number; optOut?: number; semTelefone?: number;
  campanhas?: Array<{ id: string; name: string; status: string; templateId: string | null; lastRunAt: Date | null }>;
  safety?: unknown;
  /** Rodadas de campanha medidas — o degrau cortado antes de virar linha. */
  rodadas?: Array<{ campaignId: string; elegiveis: number; noLote: number; cortados: number }>;
  /** A base lida pela escada da jornada (`medirJornadaDeEstagios`). */
  baseDeClientes?: unknown[];
}): LeitorDoBanco {
  return {
    campaignExecution: { findMany: async () => linhas },
    crmCicloFunil: { findMany: async () => extras?.rodadas ?? [] },
    restaurantCRMProfile: { findUnique: async () => ({ whatsAppSafetyConfig: extras?.safety ?? null }) },
    customer: {
      count: async ({ where }: { where: Record<string, unknown> }) => {
        if (where.hasOptedOut) return extras?.optOut ?? 0;
        if (where.crmContactable === false) return extras?.semTelefone ?? 0;
        return extras?.clientes ?? 0;
      },
      // A escada da jornada lê a base inteira para dizer em quantos estágios
      // cada cliente cai. Sem linhas ela devolve zeros — resposta certa para um
      // restaurante sem base, não omissão: quem quer medir passa `baseDeClientes`.
      findMany: async () => extras?.baseDeClientes ?? [],
    },
    campaign: { findMany: async () => extras?.campanhas ?? [] },
  } as unknown as LeitorDoBanco;
}

const janela = { desde: T(0), ate: T(59) };

describe("o funil fecha a conta", () => {
  it("enviadas + todos os degraus = total de decisões", async () => {
    const linhas: Linha[] = [
      { restaurantId: "r1", campaignId: "c1", status: "SENT",    errorMessage: null,                   sentAt: T(1),  createdAt: T(1) },
      { restaurantId: "r1", campaignId: "c1", status: "READ",    errorMessage: null,                   sentAt: T(2),  createdAt: T(2) },
      { restaurantId: "r1", campaignId: "c1", status: "BLOCKED", errorMessage: "BLOCKED_COOLDOWN",     sentAt: null,  createdAt: T(3) },
      { restaurantId: "r1", campaignId: "c1", status: "BLOCKED", errorMessage: "BLOCKED_COOLDOWN",     sentAt: null,  createdAt: T(3) },
      { restaurantId: "r1", campaignId: "c1", status: "BLOCKED", errorMessage: "CUSTOMER_OPTED_OUT",   sentAt: null,  createdAt: T(4) },
      { restaurantId: "r1", campaignId: "c1", status: "FAILED",  errorMessage: "SEND_FAILED",          sentAt: null,  createdAt: T(5) },
      { restaurantId: "r1", campaignId: "c1", status: "SKIPPED", errorMessage: null,                   sentAt: null,  createdAt: T(6) },
    ];
    const r = await raioXDeDisparos(bancoFalso(linhas), janela);
    const rest = r.restaurantes[0]!;

    expect(rest.enviadas).toBe(2);
    const somaDosDegraus = rest.degraus.reduce((s, d) => s + d.quantidade, 0);
    expect(rest.enviadas + somaDosDegraus).toBe(rest.totalDeDecisoes);
    expect(rest.totalDeDecisoes).toBe(linhas.length);
  });

  it("agrupa o degrau BLOCKED pelo código de máquina, do maior para o menor", async () => {
    const linhas: Linha[] = [
      { restaurantId: "r1", campaignId: "c1", status: "BLOCKED", errorMessage: "BLOCKED_COOLDOWN",   sentAt: null, createdAt: T(3) },
      { restaurantId: "r1", campaignId: "c1", status: "BLOCKED", errorMessage: "BLOCKED_COOLDOWN",   sentAt: null, createdAt: T(3) },
      { restaurantId: "r1", campaignId: "c1", status: "BLOCKED", errorMessage: "CUSTOMER_OPTED_OUT", sentAt: null, createdAt: T(4) },
      { restaurantId: "r1", campaignId: "c1", status: "BLOCKED", errorMessage: null,                 sentAt: null, createdAt: T(4) },
    ];
    const r = await raioXDeDisparos(bancoFalso(linhas), janela);
    const bloqueado = r.restaurantes[0]!.degraus.find((d) => d.degrau === "BLOCKED")!;
    expect(bloqueado.quantidade).toBe(4);
    expect(bloqueado.porMotivo).toEqual([
      { codigo: "BLOCKED_COOLDOWN", quantidade: 2 },
      { codigo: "CUSTOMER_OPTED_OUT", quantidade: 1 },
      { codigo: "SEM_CODIGO", quantidade: 1 },
    ]);
  });

  it("todo status de envio conta como enviada — e só eles", async () => {
    for (const status of STATUS_DE_ENVIO) {
      const r = await raioXDeDisparos(
        bancoFalso([{ restaurantId: "r1", campaignId: "c1", status, errorMessage: null, sentAt: T(1), createdAt: T(1) }]),
        janela,
      );
      expect(r.restaurantes[0]!.enviadas, status).toBe(1);
    }
    const pendente = await raioXDeDisparos(
      bancoFalso([{ restaurantId: "r1", campaignId: "c1", status: "PENDING", errorMessage: null, sentAt: null, createdAt: T(1) }]),
      janela,
    );
    expect(pendente.restaurantes[0]!.enviadas).toBe(0);
  });

  it("separa por restaurante e soma o total geral", async () => {
    const linhas: Linha[] = [
      { restaurantId: "r1", campaignId: "c1", status: "SENT",    errorMessage: null, sentAt: T(1), createdAt: T(1) },
      { restaurantId: "r2", campaignId: "c2", status: "SENT",    errorMessage: null, sentAt: T(1), createdAt: T(1) },
      { restaurantId: "r2", campaignId: "c2", status: "BLOCKED", errorMessage: "X",  sentAt: null, createdAt: T(2) },
    ];
    const r = await raioXDeDisparos(bancoFalso(linhas), janela);
    expect(r.totais).toEqual({ enviadas: 2, decisoes: 3, restaurantes: 2 });
  });

  it("linha antiga sem restaurantId não some — vira `(sem restaurante)`", async () => {
    const r = await raioXDeDisparos(
      bancoFalso([{ restaurantId: null, campaignId: "c1", status: "SENT", errorMessage: null, sentAt: T(1), createdAt: T(1) }]),
      janela,
    );
    expect(r.restaurantes.map((x) => x.restaurantId)).toEqual(["(sem restaurante)"]);
    expect(r.totais.enviadas).toBe(1);
  });

  it("restaurante pedido sem nenhuma linha aparece zerado, não sumido", async () => {
    const r = await raioXDeDisparos(bancoFalso([]), { ...janela, restaurantIds: ["r9"] });
    expect(r.restaurantes).toHaveLength(1);
    expect(r.restaurantes[0]!.restaurantId).toBe("r9");
    expect(r.restaurantes[0]!.enviadas).toBe(0);
    expect(r.restaurantes[0]!.totalDeDecisoes).toBe(0);
  });
});

describe("o teto devolvido é o EFETIVO, não o que está salvo na tela", () => {
  it("sem override manual, o teto salvo pelo lojista é ignorado e vale o da Meta", async () => {
    const r = await raioXDeDisparos(
      bancoFalso(
        [{ restaurantId: "r1", campaignId: "c1", status: "SENT", errorMessage: null, sentAt: T(1), createdAt: T(1) }],
        { safety: { dailyGlobalCap: 50, manualOverride: false } },
      ),
      janela,
    );
    const tetos = r.restaurantes[0]!.tetos;
    expect(tetos.diarioGlobal).toBe(900);
    expect(tetos.overrideManual).toBe(false);
    expect(tetos.minutosEntreCiclos).toBe(9);
  });

  it("com override manual, o valor do lojista é o que vale", async () => {
    const r = await raioXDeDisparos(
      bancoFalso(
        [{ restaurantId: "r1", campaignId: "c1", status: "SENT", errorMessage: null, sentAt: T(1), createdAt: T(1) }],
        { safety: { dailyGlobalCap: 50, manualOverride: true } },
      ),
      janela,
    );
    expect(r.restaurantes[0]!.tetos.diarioGlobal).toBe(50);
    expect(r.restaurantes[0]!.tetos.overrideManual).toBe(true);
  });
});

describe("ausência de informação não é informação", () => {
  it("as lacunas estruturais são declaradas, com o motivo escrito", async () => {
    const r = await raioXDeDisparos(bancoFalso([]), { ...janela, restaurantIds: ["r1"] });
    expect(r.naoMedidoGlobal.length).toBeGreaterThan(0);
    for (const lacuna of r.naoMedidoGlobal) {
      expect(lacuna.degrau.length).toBeGreaterThan(0);
      expect(lacuna.motivo.length).toBeGreaterThan(20);
    }
    expect(r.restaurantes[0]!.naoMedido).toEqual(r.naoMedidoGlobal);
  });
});

describe("a cadência", () => {
  it("conta os minutos distintos com atividade e a última atividade", async () => {
    const linhas: Linha[] = [
      { restaurantId: "r1", campaignId: "c1", status: "SENT",    errorMessage: null, sentAt: T(1),  createdAt: T(1) },
      { restaurantId: "r1", campaignId: "c1", status: "SENT",    errorMessage: null, sentAt: T(1),  createdAt: T(1) },
      { restaurantId: "r1", campaignId: "c1", status: "BLOCKED", errorMessage: "X",  sentAt: null,  createdAt: T(21) },
    ];
    const r = await raioXDeDisparos(bancoFalso(linhas), janela);
    expect(r.restaurantes[0]!.cadencia.minutosComAtividade).toBe(2);
    expect(r.restaurantes[0]!.cadencia.ultimaAtividadeEm).toBe(T(21).toISOString());
  });
});

/** Fábrica curta de linha de execução para os casos da conta do dia. */
function linha(x: { campaignId: string; status: string; createdAt: Date; errorMessage?: string | null }): Linha {
  return {
    restaurantId: "r1", campaignId: x.campaignId, status: x.status,
    errorMessage: x.errorMessage ?? null,
    sentAt: (STATUS_DE_ENVIO as readonly string[]).includes(x.status) ? x.createdAt : null,
    createdAt: x.createdAt,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// A CONTA DO DIA, pela porta de leitura de verdade (D-0E3).
// ─────────────────────────────────────────────────────────────────────────────
describe("a conta do dia: de quantos eu podia, quantos mandei, quem barrou o resto", () => {
  const CAMP = "cmp1";
  const t = (m: number) => new Date(Date.UTC(2026, 8, 17, 12, m));

  it("fecha a invariante com cada degrau nomeado pela regra que barrou", async () => {
    const linhas = [
      ...Array.from({ length: 6 }, (_, i) => linha({ campaignId: CAMP, status: "SENT", createdAt: t(i) })),
      ...Array.from({ length: 3 }, (_, i) => linha({ campaignId: CAMP, status: "BLOCKED", errorMessage: "CUSTOMER_OPTED_OUT", createdAt: t(i) })),
      ...Array.from({ length: 1 }, (_, i) => linha({ campaignId: CAMP, status: "SKIPPED", errorMessage: "MISSING_PHONE", createdAt: t(i) })),
    ];
    const db = bancoFalso(linhas, {
      rodadas: [{ campaignId: CAMP, elegiveis: 40, noLote: 10, cortados: 30 }],
    });
    const r = await raioXDeDisparos(db, { desde: t(0), ate: t(59) });
    const conta = r.restaurantes[0]!.contaDoDia;

    expect(conta.podiaHoje).toBe(900);       // teto efetivo da Meta
    expect(conta.enviouHoje).toBe(6);
    expect(conta.sobraDoDia).toBe(894);
    expect(conta.fechamento.fecha).toBe(true);   // 6 + 4 + 30 = 40
    expect(conta.fechamento.diferenca).toBe(0);
    expect(conta.barrados).toContainEqual({ degrau: "BLOCKED:CUSTOMER_OPTED_OUT", quantidade: 3 });
    expect(conta.barrados).toContainEqual({ degrau: "SKIPPED:MISSING_PHONE", quantidade: 1 });
    expect(conta.totalCortadoAntesDoBanco).toBe(30);
    expect(conta.alarme?.nivel).toBe("GRAVE");   // podia 900, mandou 6
  });

  it("sem rodada registrada a conta NÃO se declara fechada (ausência não é informação)", async () => {
    const db = bancoFalso([linha({ campaignId: CAMP, status: "SENT", createdAt: t(0) })]);
    const r = await raioXDeDisparos(db, { desde: t(0), ate: t(59) });
    const conta = r.restaurantes[0]!.contaDoDia;
    expect(conta.fechamento.fecha).toBe(false);
    expect(conta.fechamento.elegivel).toBeNull();
  });

  it("envio de outro módulo (carrinho) conta no teto do dia, mas NÃO entra na invariante", async () => {
    // O carrinho abandonado consome o teto — então aparece em `enviouHoje`.
    // Mas ele não nasce de um elegível de campanha: entrar na invariante faria a
    // soma estourar o elegível e gritar alarme falso para sempre.
    const linhas = [
      linha({ campaignId: CAMP, status: "SENT", createdAt: t(0) }),
      linha({ campaignId: "carrinho", status: "SENT", createdAt: t(1) }),
    ];
    const db = bancoFalso(linhas, { rodadas: [{ campaignId: CAMP, elegiveis: 1, noLote: 1, cortados: 0 }] });
    const conta = (await raioXDeDisparos(db, { desde: t(0), ate: t(59) })).restaurantes[0]!.contaDoDia;
    expect(conta.enviouHoje).toBe(2);
    expect(conta.enviouNoCiclo).toBe(1);
    expect(conta.fechamento.fecha).toBe(true);
  });
});
