import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * AS DUAS ROTAS QUE VIERAM DA TELA VELHA DO CRM, EXERCITADAS PELA PORTA.
 *
 * ── POR QUE PELA PORTA, E NÃO PELA TELA ─────────────────────────────────────
 *
 * A tela esconde o botão de apagar de quem não pode. Isso não é autorização: é
 * conveniência. Quem souber o endereço chama a rota direto, e é assim que estes
 * testes chamam — sem passar por tela nenhuma. É o caminho do atacante, e é o
 * caminho pelo qual o portão precisa ser exercitado.
 *
 * ── AS DUAS METADES, SEMPRE ─────────────────────────────────────────────────
 *
 * Cada regra aparece duas vezes: barrando quem não pode E deixando passar quem
 * pode. Um arquivo só com a primeira metade ficaria verde numa rota que recusa
 * todo mundo — e uma rota assim é indistinguível de uma rota quebrada.
 */

const autorizarInterno = vi.fn();
const criarEvento = vi.fn();
const findUniqueDoLead = vi.fn();
const registrarContatoManual = vi.fn();
const apagarDadosDoLead = vi.fn();

vi.mock("@/lib/internal-auth", async () => {
  const real = await vi.importActual<typeof import("@/lib/internal-auth")>("@/lib/internal-auth");
  return { ...real, autorizarInterno: (...a: unknown[]) => autorizarInterno(...a) };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    internalAuditEvent: { create: (...a: unknown[]) => criarEvento(...a) },
    siteLead: { findUnique: (...a: unknown[]) => findUniqueDoLead(...a) },
    siteLeadInteraction: { findMany: async () => [] },
    internalUser: { findMany: async () => [] },
  },
}));

// A conversa em si não é o assunto deste arquivo: o que importa aqui é o que a
// rota MONTA em volta dela. A leitura sob identidade devolve o mínimo.
vi.mock("@/services/salaDeVendas/identidadeNoBanco", () => ({
  comSessao: async () => [[], [], null],
}));

vi.mock("@/services/salaDeVendas/contatoManual", async () => {
  const real = await vi.importActual<typeof import("@/services/salaDeVendas/contatoManual")>(
    "@/services/salaDeVendas/contatoManual",
  );
  return { ...real, registrarContatoManual: (...a: unknown[]) => registrarContatoManual(...a) };
});

vi.mock("@/services/salaDeVendas/lgpd", async () => {
  const real = await vi.importActual<typeof import("@/services/salaDeVendas/lgpd")>(
    "@/services/salaDeVendas/lgpd",
  );
  return { ...real, apagarDadosDoLead: (...a: unknown[]) => apagarDadosDoLead(...a) };
});

const CEO = {
  userId: "u-ceo",
  nome: "Dioli",
  role: "MASTER_CEO" as const,
  departamentos: [],
  gerencia: [],
};

const SDR = {
  userId: "u-sdr",
  nome: "Marina",
  role: "AGENTE_HUMANO" as const,
  departamentos: ["vendas"],
  gerencia: [],
};

const AUDITOR = { ...SDR, userId: "u-qa", nome: "QA", role: "AUDITOR_QA" as const };
const GERENTE = { ...SDR, userId: "u-ger", nome: "Paula", role: "GERENTE_DEPARTAMENTO" as const, gerencia: ["vendas"] };

function pedido(url: string, corpo: unknown): NextRequest {
  return new NextRequest(
    new Request(`https://foocci.com.br${url}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corpo),
    }),
  );
}

const CONTATO_VALIDO = {
  leadId: "l1",
  tipo: "LIGACAO",
  ocorridoEm: "2026-08-27T14:00:00.000Z",
  nota: "atendeu, quer ver na quinta",
};

const APAGAMENTO_VALIDO = {
  leadId: "l1",
  confirmacaoNome: "Ana Paula",
  origemDoPedido: "TITULAR",
};

beforeEach(() => {
  autorizarInterno.mockReset().mockReturnValue({ ok: true, sessao: SDR });
  criarEvento.mockReset().mockResolvedValue({});
  // O lead é do SDR: a terceira camada (`podeVerOLead`) deixa passar.
  findUniqueDoLead.mockReset().mockResolvedValue({
    atendenteUserId: "u-sdr",
    atendidoPor: "HUMANO",
  });
  registrarContatoManual
    .mockReset()
    .mockResolvedValue({ ok: true, interacaoId: "i1", quando: new Date(), contouComoAbordagem: true });
  apagarDadosDoLead
    .mockReset()
    .mockResolvedValue({ ok: true, apagadoEm: new Date(), apagados: { interacoes: 1, mensagens: 2 } });
});

// ═══════════════════════════════════════════════════════════════════════════
// REGISTRO DE CONTATO MANUAL
// ═══════════════════════════════════════════════════════════════════════════

describe("⭐ registrar contato manual — quem entra", () => {
  it("o SDR registra: é o trabalho dele", async () => {
    const { POST } = await import("./contato-manual/route");
    const res = await POST(pedido("/api/admin/sala-de-vendas/contato-manual", CONTATO_VALIDO));

    expect(res.status).toBe(200);
    expect(registrarContatoManual).toHaveBeenCalled();
  });

  it("sem sessão interna, 401 e o serviço NÃO é chamado", async () => {
    autorizarInterno.mockReturnValue({
      ok: false,
      status: 401,
      motivo: "sem sessão interna",
      sessao: null,
    });

    const { POST } = await import("./contato-manual/route");
    const res = await POST(pedido("/api/admin/sala-de-vendas/contato-manual", CONTATO_VALIDO));

    expect(res.status).toBe(401);
    expect(registrarContatoManual).not.toHaveBeenCalled();
  });

  it("o auditor lê e não escreve: 403, e o serviço não é chamado", async () => {
    autorizarInterno.mockReturnValue({ ok: true, sessao: AUDITOR });

    const { POST } = await import("./contato-manual/route");
    const res = await POST(pedido("/api/admin/sala-de-vendas/contato-manual", CONTATO_VALIDO));

    expect(res.status).toBe(403);
    expect(registrarContatoManual).not.toHaveBeenCalled();
  });

  it("lead de OUTRO atendente responde 404 — a terceira camada continua de pé", async () => {
    findUniqueDoLead.mockResolvedValue({ atendenteUserId: "outro", atendidoPor: "HUMANO" });

    const { POST } = await import("./contato-manual/route");
    const res = await POST(pedido("/api/admin/sala-de-vendas/contato-manual", CONTATO_VALIDO));

    expect(res.status).toBe(404);
    expect(registrarContatoManual).not.toHaveBeenCalled();
  });
});

describe("⭐ registrar contato manual — quem e quando são obrigatórios", () => {
  it("⭐ o AUTOR vem da sessão, e o corpo não consegue escolher outro", async () => {
    const { POST } = await import("./contato-manual/route");
    await POST(
      pedido("/api/admin/sala-de-vendas/contato-manual", {
        ...CONTATO_VALIDO,
        quemUserId: "u-outro",
        actor: "u-outro",
      }),
    );

    expect(registrarContatoManual).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ quemUserId: "u-sdr" }),
    );
  });

  it("⭐ sem `ocorridoEm`, 400 — e o serviço NÃO é chamado", async () => {
    const { ocorridoEm: _, ...semData } = CONTATO_VALIDO;

    const { POST } = await import("./contato-manual/route");
    const res = await POST(pedido("/api/admin/sala-de-vendas/contato-manual", semData));

    expect(res.status).toBe(400);
    expect(registrarContatoManual).not.toHaveBeenCalled();
  });

  it("data ilegível também é 400 — não vira 'hoje' por conveniência", async () => {
    const { POST } = await import("./contato-manual/route");
    const res = await POST(
      pedido("/api/admin/sala-de-vendas/contato-manual", {
        ...CONTATO_VALIDO,
        ocorridoEm: "ontem de tarde",
      }),
    );

    expect(res.status).toBe(400);
    expect(registrarContatoManual).not.toHaveBeenCalled();
  });

  it("a metade que passa: com data válida, ela chega ao serviço como o instante informado", async () => {
    const { POST } = await import("./contato-manual/route");
    await POST(pedido("/api/admin/sala-de-vendas/contato-manual", CONTATO_VALIDO));

    const args = registrarContatoManual.mock.calls[0]![1] as { quando: Date };
    expect(args.quando.toISOString()).toBe("2026-08-27T14:00:00.000Z");
  });

  it("tipo fora da lista é 400 — mudar de etapa tem rota própria", async () => {
    const { POST } = await import("./contato-manual/route");
    const res = await POST(
      pedido("/api/admin/sala-de-vendas/contato-manual", {
        ...CONTATO_VALIDO,
        tipo: "MUDANCA_ETAPA",
      }),
    );

    expect(res.status).toBe(400);
    expect(registrarContatoManual).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// APAGAMENTO (LGPD)
// ═══════════════════════════════════════════════════════════════════════════

describe("⭐ apagar dados — só o CEO e o Diretor", () => {
  it("o CEO apaga", async () => {
    // A metade que PASSA. Sem ela, uma rota que recusasse todo mundo ficaria
    // verde em tudo abaixo — e a Foocci não conseguiria cumprir a LGPD.
    autorizarInterno.mockReturnValue({ ok: true, sessao: CEO });

    const { POST } = await import("./apagar-dados/route");
    const res = await POST(pedido("/api/admin/sala-de-vendas/apagar-dados", APAGAMENTO_VALIDO));

    expect(res.status).toBe(200);
    expect(apagarDadosDoLead).toHaveBeenCalled();
  });

  it("o SDR humano NÃO apaga: 403, e o serviço nem é chamado", async () => {
    autorizarInterno.mockReturnValue({ ok: true, sessao: SDR });

    const { POST } = await import("./apagar-dados/route");
    const res = await POST(pedido("/api/admin/sala-de-vendas/apagar-dados", APAGAMENTO_VALIDO));

    expect(res.status).toBe(403);
    expect(apagarDadosDoLead).not.toHaveBeenCalled();
  });

  it("o gerente do departamento NÃO apaga", async () => {
    autorizarInterno.mockReturnValue({ ok: true, sessao: GERENTE });

    const { POST } = await import("./apagar-dados/route");
    const res = await POST(pedido("/api/admin/sala-de-vendas/apagar-dados", APAGAMENTO_VALIDO));

    expect(res.status).toBe(403);
    expect(apagarDadosDoLead).not.toHaveBeenCalled();
  });

  it("⭐ a tentativa negada entra na trilha, com quem tentou e por quê", async () => {
    // Numa rota irreversível, a tentativa negada é o alarme. Sem registro,
    // "ninguém tentou apagar a base" seria suposição.
    autorizarInterno.mockReturnValue({ ok: true, sessao: SDR });

    const { POST } = await import("./apagar-dados/route");
    await POST(pedido("/api/admin/sala-de-vendas/apagar-dados", APAGAMENTO_VALIDO));

    expect(criarEvento).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          acao: "apagar_dados_do_lead",
          resultado: "NEGADO",
          actorLabel: "Marina (u-sdr)",
        }),
      }),
    );
  });

  it("sem sessão interna, 401 e o serviço não é chamado", async () => {
    autorizarInterno.mockReturnValue({
      ok: false,
      status: 401,
      motivo: "sem sessão interna",
      sessao: null,
    });

    const { POST } = await import("./apagar-dados/route");
    const res = await POST(pedido("/api/admin/sala-de-vendas/apagar-dados", APAGAMENTO_VALIDO));

    expect(res.status).toBe(401);
    expect(apagarDadosDoLead).not.toHaveBeenCalled();
  });
});

describe("⭐ apagar dados — a confirmação explícita não é opcional", () => {
  beforeEach(() => {
    autorizarInterno.mockReturnValue({ ok: true, sessao: CEO });
  });

  it("⭐ sem o nome digitado, 400 — e NADA é apagado", async () => {
    const { confirmacaoNome: _, ...semNome } = APAGAMENTO_VALIDO;

    const { POST } = await import("./apagar-dados/route");
    const res = await POST(pedido("/api/admin/sala-de-vendas/apagar-dados", semNome));

    expect(res.status).toBe(400);
    expect(apagarDadosDoLead).not.toHaveBeenCalled();
  });

  it("nome em branco não vale como confirmação", async () => {
    const { POST } = await import("./apagar-dados/route");
    const res = await POST(
      pedido("/api/admin/sala-de-vendas/apagar-dados", {
        ...APAGAMENTO_VALIDO,
        confirmacaoNome: "    ",
      }),
    );

    expect(res.status).toBe(400);
    expect(apagarDadosDoLead).not.toHaveBeenCalled();
  });

  it("um `confirmo: true` no lugar do nome não apaga nada", async () => {
    // O jeito clássico de a confirmação virar enfeite: um booleano que qualquer
    // laço de script manda.
    const { confirmacaoNome: _, ...semNome } = APAGAMENTO_VALIDO;

    const { POST } = await import("./apagar-dados/route");
    const res = await POST(
      pedido("/api/admin/sala-de-vendas/apagar-dados", { ...semNome, confirmo: true }),
    );

    expect(res.status).toBe(400);
    expect(apagarDadosDoLead).not.toHaveBeenCalled();
  });

  it("sem declarar de onde veio o pedido, 400 — LGPD e limpeza de base não são a mesma coisa", async () => {
    const { origemDoPedido: _, ...semOrigem } = APAGAMENTO_VALIDO;

    const { POST } = await import("./apagar-dados/route");
    const res = await POST(pedido("/api/admin/sala-de-vendas/apagar-dados", semOrigem));

    expect(res.status).toBe(400);
    expect(apagarDadosDoLead).not.toHaveBeenCalled();
  });

  it("⭐ a metade que passa: com nome e origem, o pedido chega ao serviço com a sessão junto", async () => {
    const { POST } = await import("./apagar-dados/route");
    await POST(pedido("/api/admin/sala-de-vendas/apagar-dados", APAGAMENTO_VALIDO));

    expect(apagarDadosDoLead).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        leadId: "l1",
        confirmacaoNome: "Ana Paula",
        origemDoPedido: "TITULAR",
        // Quem executa vem da sessão assinada, nunca do corpo do pedido.
        sessao: CEO,
      }),
    );
  });

  it("o nome errado devolve 400 com frase de gente, e diz que nada foi apagado", async () => {
    apagarDadosDoLead.mockResolvedValue({ ok: false, causa: "confirmacaoNaoConfere" });

    const { POST } = await import("./apagar-dados/route");
    const res = await POST(
      pedido("/api/admin/sala-de-vendas/apagar-dados", {
        ...APAGAMENTO_VALIDO,
        confirmacaoNome: "Ana Maria",
      }),
    );

    expect(res.status).toBe(400);
    const corpo = (await res.json()) as { error: string };
    expect(corpo.error).toContain("Nada foi apagado");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// A FICHA — o que a rota da conversa entrega para a tela desenhar
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Aqui o que se prova é a LIGAÇÃO, e não a régua.
 *
 * As réguas têm teste próprio (`fichaDoLead.test.ts`), e elas passariam mesmo se
 * a rota esquecesse de pedir a coluna `desafio` no `select` — o campo chegaria
 * `undefined`, a resposta sumiria da ficha, e nenhum teste de unidade acusaria.
 * É exatamente o defeito que a tela de atendimento tinha antes desta migração.
 */
describe("⭐ a ficha do lead carrega o que veio da tela velha", () => {
  const LEAD_MAGRO = {
    // O que `podeVerOLead` lê:
    atendenteUserId: "u-sdr",
    atendidoPor: "HUMANO",
    // O lead como o `select` da rota o entrega — sem nada preenchido:
    id: "l1",
    nome: "Ana Paula",
    whatsapp: "5511999999999",
    email: null,
    restaurante: null,
    cidade: null,
    tipo: null,
    desafio: null,
    stage: "NOVO",
    score: null,
    temperatura: null,
    createdAt: new Date("2026-08-27T10:00:00.000Z"),
    codigo: null,
    origem: null,
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    utmContent: null,
    utmTerm: null,
    clickId: null,
    landingPath: null,
    referrer: null,
    optOutAt: null,
    consentAt: null,
    proximaAcaoEm: null,
    proximaAcaoNota: null,
    qualificacao: null,
    atendente: null,
  };

  function leitura(url = "/api/admin/sala-de-vendas/conversa?leadId=l1") {
    return new NextRequest(new Request(`https://foocci.com.br${url}`));
  }

  async function corpoDaFicha(lead: Record<string, unknown>) {
    findUniqueDoLead.mockResolvedValue(lead);
    const { GET } = await import("./conversa/route");
    const res = await GET(leitura());
    expect(res.status).toBe(200);
    return (await res.json()) as {
      data: {
        respostas: Array<{ pergunta: string; resposta: string }>;
        origem: { rotulo: string; temSinalDeCampanha: boolean };
        contatosManuais: unknown[];
        podeApagarDados: boolean;
        opcoes: { contatoManual: unknown[]; origemDoPedidoDeApagamento: unknown[] };
      };
    };
  }

  it("⭐ lead SEM respostas de formulário não quebra: vem lista vazia", async () => {
    const j = await corpoDaFicha(LEAD_MAGRO);

    expect(j.data.respostas).toEqual([]);
    expect(j.data.contatosManuais).toEqual([]);
  });

  it("⭐ lead SEM UTM diz 'Direto / não identificado' — e não um campo vazio", async () => {
    const j = await corpoDaFicha(LEAD_MAGRO);

    expect(j.data.origem.rotulo).toBe("Direto / não identificado");
    expect(j.data.origem.temSinalDeCampanha).toBe(false);
  });

  it("⭐ a metade que passa: o que a pessoa respondeu chega inteiro, o DESAFIO junto", async () => {
    const j = await corpoDaFicha({
      ...LEAD_MAGRO,
      restaurante: "Cantina da Nona",
      cidade: "Santos",
      tipo: "Italiano",
      desafio: "Perco pedido no WhatsApp",
    });

    expect(j.data.respostas).toEqual([
      { pergunta: "Nome do restaurante", resposta: "Cantina da Nona" },
      { pergunta: "Cidade", resposta: "Santos" },
      { pergunta: "Tipo de restaurante", resposta: "Italiano" },
      { pergunta: "Principal desafio", resposta: "Perco pedido no WhatsApp" },
    ]);
  });

  it("⭐ a metade que passa: com campanha, a origem chega montada", async () => {
    const j = await corpoDaFicha({
      ...LEAD_MAGRO,
      utmSource: "facebook",
      utmCampaign: "black-friday",
      utmContent: "video-15s",
    });

    expect(j.data.origem.rotulo).toBe("black-friday · video-15s");
    expect(j.data.origem.temSinalDeCampanha).toBe(true);
  });

  it("⭐ a rota PEDE ao banco as colunas que a ficha mostra", async () => {
    // Olhar só o resultado não basta: o objeto vem de um `findUnique` fingido, e
    // ele devolve tudo que eu escrevi no teste. Se a rota esquecesse de pedir a
    // coluna no `select`, em produção ela chegaria `undefined`, a resposta
    // sumiria da ficha, e todo teste continuaria verde. Quem tem de ser
    // verificado é o PEDIDO — foi assim que a Sala ficou sem o `desafio`.
    await corpoDaFicha(LEAD_MAGRO);

    // A segunda chamada é a do lead inteiro; a primeira é a de `podeVerOLead`.
    const args = findUniqueDoLead.mock.calls[1]![0] as { select: Record<string, boolean> };

    for (const coluna of [
      "desafio",
      "utmSource",
      "utmMedium",
      "utmCampaign",
      "utmContent",
      "utmTerm",
      "clickId",
      "landingPath",
      "referrer",
      "origem",
    ]) {
      expect(args.select[coluna], `a rota não pediu a coluna ${coluna}`).toBe(true);
    }
  });

  it("o SDR não recebe o sinal para desenhar o botão de apagar", async () => {
    const j = await corpoDaFicha(LEAD_MAGRO);
    expect(j.data.podeApagarDados).toBe(false);
  });

  it("o CEO recebe — e as opções vêm de quem as valida, não da tela", async () => {
    autorizarInterno.mockReturnValue({ ok: true, sessao: CEO });

    const j = await corpoDaFicha(LEAD_MAGRO);

    expect(j.data.podeApagarDados).toBe(true);
    expect(j.data.opcoes.contatoManual.length).toBeGreaterThan(0);
    expect(j.data.opcoes.origemDoPedidoDeApagamento).toEqual([
      { valor: "TITULAR", rotulo: "A própria pessoa pediu (LGPD)" },
      { valor: "CONTATO_DE_TESTE", rotulo: "Contato de teste — limpeza da base" },
    ]);
  });
});
