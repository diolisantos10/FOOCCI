/**
 * A PROPOSTA, DO RASCUNHO AO CLIENTE.
 *
 * ── POR QUE O BANCO FALSO AQUI GUARDA ESTADO ────────────────────────────────
 *
 * Mesma razão de `jornadaComercial.test.ts`: o que precisa ser provado aqui não
 * é regra pura, é IDEMPOTÊNCIA — "o mesmo webhook duas vezes não ganha duas
 * vezes" só é demonstrável contra algo que LEMBRE da primeira vez e recuse a
 * segunda. Por isso este falso respeita as restrições de unicidade que o banco
 * tem de verdade (`EventoDaJornada.chaveDeIdempotencia`, `Cliente.oportunidadeId`,
 * `MotivoDePerda.slug`) e a semântica do `updateMany` condicionado.
 *
 * ── E POR QUE A TRAVA DE ENVIO É TESTADA NOS DOIS ESTADOS ───────────────────
 *
 * Uma trava só testada desligada prova que ela não estorva. Só testada ligada
 * prova que ela barra. As duas juntas provam que ela é uma trava, e não uma
 * condição que sempre cai para o mesmo lado — que é como uma régua verde nasce
 * sobre o componente errado.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Os dubles: o motor de envio e o gateway de pagamento ────────────────────
//
// Nenhum dos dois é reescrito aqui. `entregarMensagem` é a porta única de saída
// da casa e continua sendo ela que decide; o que o duble faz é ENCENAR as duas
// respostas que ela dá de verdade — entregue, e recusada pela trava.

const entregarMensagem = vi.fn();
const registrarSaida = vi.fn();
const findByIdempotencyKey = vi.fn();
const criarAssinatura = vi.fn();
const ensurePreapproval = vi.fn();

vi.mock("./entrega", () => ({ entregarMensagem: (...a: unknown[]) => entregarMensagem(...a) }));
vi.mock("./conversa", () => ({ registrarSaida: (...a: unknown[]) => registrarSaida(...a) }));
vi.mock("@/services/billing/PlanSubscriptionService", () => ({
  PlanSubscriptionService: {
    findByIdempotencyKey: (...a: unknown[]) => findByIdempotencyKey(...a),
    create: (...a: unknown[]) => criarAssinatura(...a),
    ensurePreapproval: (...a: unknown[]) => ensurePreapproval(...a),
  },
}));

import {
  TRANSICOES_DA_PROPOSTA,
  LIMITE_DE_DESCONTO_PCT,
  VALIDADE_PADRAO_EM_DIAS,
  SLUG_DA_PERDA_POR_EXPIRACAO,
  validarMovimentoDaProposta,
  catalogoDePlanos,
  itemDoCatalogo,
  criarProposta,
  moverProposta,
  marcarPropostaVista,
  recusarProposta,
  expirarPropostasVencidas,
  lerPropostasDoLead,
  oportunidadeDaProposta,
} from "./propostas";
import {
  chaveDaAssinaturaDaProposta,
  propostaDaChave,
  itemDaProposta,
  textoDaProposta,
  gerarLinkDePagamento,
  enviarPropostaNoWhatsApp,
  ganharPeloPagamento,
} from "./checkoutDaProposta";
import { AUTORIA_SISTEMA, type Autoria } from "./jornadaComercial";
import { PLAN_CYCLE_CENTS, firstChargeCents } from "@/lib/billing/pricing";

const AGORA = new Date("2026-09-17T12:00:00Z");
const GENTE: Autoria = { autor: "HUMANO", userId: "user-1", label: "Ana" };

// ─────────────────────────────────────────────────────────────────────────────
// O banco falso — só o que estes serviços usam, com as restrições que importam
// ─────────────────────────────────────────────────────────────────────────────

type Linha = Record<string, unknown>;

function bancoFalso() {
  let sequencia = 0;
  const novoId = (prefixo: string) => `${prefixo}-${++sequencia}`;

  const tabelas = {
    siteLead: [] as Linha[],
    empresa: [] as Linha[],
    oportunidade: [] as Linha[],
    cliente: [] as Linha[],
    eventoDaJornada: [] as Linha[],
    leadProposta: [] as Linha[],
    motivoDePerda: [] as Linha[],
  };
  type Tabela = keyof typeof tabelas;

  const UNICAS: Record<Tabela, string[][]> = {
    siteLead: [],
    empresa: [["chaveDeDedupe"]],
    oportunidade: [["chaveDeOrigem"]],
    cliente: [["oportunidadeId"]],
    eventoDaJornada: [["chaveDeIdempotencia"]],
    leadProposta: [],
    motivoDePerda: [["slug"]],
  };

  function colide(tabela: Tabela, linha: Linha): boolean {
    return UNICAS[tabela].some((chave) => {
      // Em Postgres NULL não colide com NULL — é por isso que uma nota sem chave
      // de idempotência pode repetir.
      if (chave.some((c) => linha[c] === null || linha[c] === undefined)) return false;
      return tabelas[tabela].some((existente) => chave.every((c) => existente[c] === linha[c]));
    });
  }

  /** Só os operadores que os serviços realmente usam: `in` e `lt`. */
  function bate(valor: unknown, criterio: unknown): boolean {
    if (criterio !== null && typeof criterio === "object") {
      const c = criterio as Linha;
      if ("in" in c) return (c.in as unknown[]).includes(valor);
      if ("notIn" in c) return !(c.notIn as unknown[]).includes(valor);
      if ("lt" in c) return (valor as Date)?.getTime() < (c.lt as Date).getTime();
      if ("not" in c) return valor !== c.not;
      return Object.entries(c).every(([k, v]) => (valor as Linha)?.[k] === v);
    }
    return valor === criterio;
  }

  function casa(linha: Linha, where: Linha): boolean {
    return Object.entries(where).every(([campo, valor]) => bate(linha[campo], valor));
  }

  function achar(tabela: Tabela, where: Linha): Linha | undefined {
    return tabelas[tabela].find((linha) => casa(linha, where));
  }

  /** `select: { lead: { select: … } }` — a única junção que os serviços pedem. */
  function juntar(tabela: Tabela, linha: Linha, select?: Linha): Linha {
    if (tabela !== "leadProposta" || !select?.lead) return linha;
    const lead = tabelas.siteLead.find((l) => l.id === linha.leadId) ?? null;
    return { ...linha, lead };
  }

  function api(tabela: Tabela, prefixo: string) {
    return {
      createMany: async ({ data, skipDuplicates }: { data: Linha[]; skipDuplicates?: boolean }) => {
        let count = 0;
        for (const bruta of data) {
          const linha = { id: novoId(prefixo), ...bruta };
          if (skipDuplicates && colide(tabela, linha)) continue;
          tabelas[tabela].push(linha);
          count++;
        }
        return { count };
      },
      create: async ({ data }: { data: Linha }) => {
        const linha = { id: novoId(prefixo), createdAt: AGORA, criadoEm: AGORA, ...data };
        if (colide(tabela, linha)) throw new Error("unique constraint");
        tabelas[tabela].push(linha);
        return linha;
      },
      findUnique: async ({ where, select }: { where: Linha; select?: Linha }) => {
        const l = achar(tabela, where);
        return l ? juntar(tabela, l, select) : null;
      },
      findFirst: async ({ where, select }: { where?: Linha; select?: Linha } = {}) => {
        const l = where ? achar(tabela, where) : tabelas[tabela][0];
        return l ? juntar(tabela, l, select) : null;
      },
      findMany: async ({ where, take }: { where?: Linha; take?: number } = {}) => {
        const achados = where ? tabelas[tabela].filter((l) => casa(l, where)) : [...tabelas[tabela]];
        return take ? achados.slice(0, take) : achados;
      },
      updateMany: async ({ where, data }: { where: Linha; data: Linha }) => {
        const alvos = tabelas[tabela].filter((l) => casa(l, where));
        alvos.forEach((l) => Object.assign(l, data));
        return { count: alvos.length };
      },
      update: async ({ where, data }: { where: Linha; data: Linha }) => {
        const alvo = achar(tabela, where);
        if (!alvo) throw new Error(`não achei ${tabela} para atualizar`);
        Object.assign(alvo, data);
        return alvo;
      },
    };
  }

  return {
    tabelas,
    siteLead: api("siteLead", "lead"),
    empresa: api("empresa", "emp"),
    oportunidade: api("oportunidade", "op"),
    cliente: api("cliente", "cli"),
    eventoDaJornada: api("eventoDaJornada", "ev"),
    leadProposta: api("leadProposta", "prop"),
    motivoDePerda: api("motivoDePerda", "mot"),
  };
}

type BancoFalso = ReturnType<typeof bancoFalso>;
const comoPrisma = (db: BancoFalso) => db as unknown as Parameters<typeof criarProposta>[0];

/** Uma empresa, um lead e uma oportunidade em QUALIFICACAO — o ponto de partida. */
async function cenario(db: BancoFalso, ajustes: Linha = {}) {
  const empresa = await db.empresa.create({ data: { nome: "Sushi House", chaveDeDedupe: "sushi-house|sp" } });
  const lead = await db.siteLead.create({
    data: {
      nome: "Marina Alves",
      restaurante: "Sushi House",
      email: "marina@sushihouse.com.br",
      whatsapp: "11988887777",
    },
  });
  const oportunidade = await db.oportunidade.create({
    data: {
      empresaId: empresa.id,
      leadId: lead.id,
      estagio: "QUALIFICACAO",
      chaveDeOrigem: `origem-${Math.random()}`,
      ...ajustes,
    },
  });
  return { empresaId: empresa.id as string, leadId: lead.id as string, oportunidadeId: oportunidade.id as string };
}

async function semearMotivo(db: BancoFalso, slug: string, exigeDetalhe = false) {
  const m = await db.motivoDePerda.create({ data: { slug, rotulo: slug, ativo: true, exigeDetalhe } });
  return m.id as string;
}

async function propostaPronta(db: BancoFalso) {
  const c = await cenario(db);
  const r = await criarProposta(comoPrisma(db), {
    oportunidadeId: c.oportunidadeId,
    plano: "GROWTH",
    ciclo: "MENSAL",
    autoria: GENTE,
    agora: AGORA,
  });
  if (!r.ok) throw new Error(`o cenário não montou: ${r.causa}`);
  return { ...c, propostaId: r.propostaId };
}

beforeEach(() => {
  vi.clearAllMocks();
  registrarSaida.mockResolvedValue({ ok: true, mensagemId: "msg-1" });
  findByIdempotencyKey.mockResolvedValue(null);
  criarAssinatura.mockImplementation(async (input: Linha) => ({
    id: "sub-1",
    signupIdempotencyKey: input.signupIdempotencyKey,
  }));
  ensurePreapproval.mockResolvedValue({
    ok: true,
    preapprovalId: "pre-1",
    initPoint: "https://mp.example/checkout/pre-1",
    reused: false,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. A MÁQUINA DE ESTADOS, e o catálogo que é de PLANOS
// ─────────────────────────────────────────────────────────────────────────────

describe("a proposta anda pelos estados do desenho", () => {
  it.each([
    ["RASCUNHO", "ENVIADA"],
    ["ENVIADA", "EM_NEGOCIACAO"],
    ["EM_NEGOCIACAO", "ACEITA"],
    ["ENVIADA", "RECUSADA"],
    ["ENVIADA", "EXPIRADA"],
  ] as const)("%s → %s é permitido", (de, para) => {
    expect(validarMovimentoDaProposta({ de, para })).toEqual([]);
  });

  it("aceita, recusada e expirada são fim de linha", () => {
    for (const terminal of ["ACEITA", "RECUSADA", "EXPIRADA"] as const) {
      expect(TRANSICOES_DA_PROPOSTA[terminal]).toEqual([]);
    }
  });

  it("uma proposta expirada não ressuscita — faz-se outra", () => {
    const recusas = validarMovimentoDaProposta({ de: "EXPIRADA", para: "ENVIADA" });
    expect(recusas).toHaveLength(1);
  });
});

describe("o catálogo é o que a Foocci vende, derivado da fonte única", () => {
  it("são os três planos nos três ciclos, e nenhum número é digitado aqui", () => {
    const catalogo = catalogoDePlanos();
    expect(catalogo).toHaveLength(9);
    for (const item of catalogo) {
      expect(item.doCicloCents).toBe(PLAN_CYCLE_CENTS[item.plano][item.ciclo]);
      expect(item.primeiraCobrancaCents).toBe(firstChargeCents(item.plano, item.ciclo));
    }
  });

  it("a primeira cobrança é menor que o ciclo cheio — o meio mês já vem abatido", () => {
    const item = itemDoCatalogo("GROWTH", "MENSAL");
    expect(item.primeiraCobrancaCents).toBeLessThan(item.doCicloCents);
    expect(item.descontoDaPrimeiraPct).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. CRIAR — a porta que não existia
// ─────────────────────────────────────────────────────────────────────────────

describe("criar a proposta", () => {
  it("grava em lead_propostas, com valor da tabela e validade", async () => {
    const db = bancoFalso();
    const c = await cenario(db);

    const r = await criarProposta(comoPrisma(db), {
      oportunidadeId: c.oportunidadeId,
      plano: "GROWTH",
      ciclo: "MENSAL",
      autoria: GENTE,
      agora: AGORA,
    });

    expect(r.ok).toBe(true);
    // A tabela é a que já existia — nenhuma tabela nova nasceu nesta frente.
    expect(db.tabelas.leadProposta).toHaveLength(1);
    const linha = db.tabelas.leadProposta[0]!;
    expect(linha.situacao).toBe("RASCUNHO");
    expect(linha.plano).toBe("GROWTH/MENSAL");
    expect(linha.valorMensalCent).toBe(itemDoCatalogo("GROWTH", "MENSAL").equivalenteAoMesCents);
    expect(linha.criadaPorId).toBe("user-1");
    const validade = (linha.validaAte as Date).getTime() - AGORA.getTime();
    expect(validade).toBe(VALIDADE_PADRAO_EM_DIAS * 24 * 3600 * 1000);
  });

  it("a oportunidade acompanha: QUALIFICACAO vira PROPOSTA, com trilha", async () => {
    const db = bancoFalso();
    const c = await cenario(db);
    await criarProposta(comoPrisma(db), {
      oportunidadeId: c.oportunidadeId, plano: "STARTER", ciclo: "ANUAL", autoria: GENTE, agora: AGORA,
    });

    expect(db.tabelas.oportunidade[0]!.estagio).toBe("PROPOSTA");
    const movimento = db.tabelas.eventoDaJornada.find(
      (e) => e.tipo === "MUDANCA_DE_ESTAGIO" && e.paraEstagio === "PROPOSTA",
    );
    expect(movimento).toBeTruthy();
  });

  it("o vínculo proposta ↔ oportunidade fica na trilha, e é achável nos dois sentidos", async () => {
    const db = bancoFalso();
    const c = await propostaPronta(db);
    expect(await oportunidadeDaProposta(comoPrisma(db), c.propostaId)).toBe(c.oportunidadeId);
  });

  it("⛔ desconto acima da alçada é RECUSADO — não existe caminho para conceder", async () => {
    const db = bancoFalso();
    const c = await cenario(db);

    const r = await criarProposta(comoPrisma(db), {
      oportunidadeId: c.oportunidadeId,
      plano: "PRO",
      ciclo: "MENSAL",
      descontoPedidoPct: LIMITE_DE_DESCONTO_PCT + 10,
      autoria: GENTE,
      agora: AGORA,
    });

    expect(r).toMatchObject({ ok: false, causa: "recusado" });
    // A metade que importa: recusar não pode deixar meia proposta gravada.
    expect(db.tabelas.leadProposta).toHaveLength(0);
  });

  it("oportunidade sem conversa é recusada — a proposta precisa de um lead", async () => {
    const db = bancoFalso();
    const c = await cenario(db, { leadId: null });
    const r = await criarProposta(comoPrisma(db), {
      oportunidadeId: c.oportunidadeId, plano: "GROWTH", ciclo: "MENSAL", autoria: GENTE, agora: AGORA,
    });
    expect(r).toMatchObject({ ok: false, causa: "semLead" });
  });

  it("oportunidade já fechada não recebe proposta nova", async () => {
    const db = bancoFalso();
    const c = await cenario(db, { estagio: "GANHA" });
    const r = await criarProposta(comoPrisma(db), {
      oportunidadeId: c.oportunidadeId, plano: "GROWTH", ciclo: "MENSAL", autoria: GENTE, agora: AGORA,
    });
    expect(r).toMatchObject({ ok: false, causa: "oportunidadeFechada" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. ENVIAR — a trava nos DOIS estados
// ─────────────────────────────────────────────────────────────────────────────

describe("enviar a proposta no WhatsApp", () => {
  it("com a entrega LIGADA: sai pelo motor de sempre e a proposta vira ENVIADA", async () => {
    const db = bancoFalso();
    const c = await propostaPronta(db);
    entregarMensagem.mockResolvedValue({ entregue: true, mensagemId: "msg-1" });

    const r = await enviarPropostaNoWhatsApp(comoPrisma(db), {
      propostaId: c.propostaId, autoria: GENTE, quemMandou: "pessoa", agora: AGORA,
    });

    expect(r.ok).toBe(true);
    // Passou pelo funil único de saída da casa — nenhum caminho novo de envio.
    expect(registrarSaida).toHaveBeenCalledOnce();
    expect(entregarMensagem).toHaveBeenCalledWith(expect.anything(), "msg-1", "pessoa");
    expect(db.tabelas.leadProposta[0]!.situacao).toBe("ENVIADA");
    expect(db.tabelas.leadProposta[0]!.enviadaEm).toEqual(AGORA);
  });

  it("o texto leva plano, primeira cobrança, renovação e o link", async () => {
    const db = bancoFalso();
    const c = await propostaPronta(db);
    entregarMensagem.mockResolvedValue({ entregue: true, mensagemId: "msg-1" });

    await enviarPropostaNoWhatsApp(comoPrisma(db), {
      propostaId: c.propostaId, autoria: GENTE, quemMandou: "pessoa", agora: AGORA,
    });

    const texto = registrarSaida.mock.calls[0]![1].texto as string;
    const item = itemDoCatalogo("GROWTH", "MENSAL");
    expect(texto).toContain(item.nome);
    expect(texto).toContain(item.emReais.primeiraCobranca);
    expect(texto).toContain("https://mp.example/checkout/pre-1");
  });

  it("⛔ com a trava RECUSANDO: a proposta fica em RASCUNHO e o motivo sobe", async () => {
    const db = bancoFalso();
    const c = await propostaPronta(db);
    entregarMensagem.mockResolvedValue({
      entregue: false,
      motivo: "envioDesligado",
      detalhe: "o canal está configurado e a entrega não foi ligada",
    });

    const r = await enviarPropostaNoWhatsApp(comoPrisma(db), {
      propostaId: c.propostaId, autoria: GENTE, quemMandou: "pessoa", agora: AGORA,
    });

    expect(r).toMatchObject({ ok: false, causa: "naoEntregue", motivo: "envioDesligado" });
    // O que não pode acontecer: dizer ENVIADA para uma mensagem que ninguém recebeu.
    expect(db.tabelas.leadProposta[0]!.situacao).toBe("RASCUNHO");
    expect(db.tabelas.leadProposta[0]!.enviadaEm).toBeUndefined();
    // E a mensagem continua registrada: pendente é visível, perdida não.
    expect(registrarSaida).toHaveBeenCalledOnce();
  });

  it("⛔ opt-out barra do mesmo jeito — a trava não é só a chave do dono", async () => {
    const db = bancoFalso();
    const c = await propostaPronta(db);
    entregarMensagem.mockResolvedValue({
      entregue: false, motivo: "leadPediuSilencio", detalhe: "pediu para não receber",
    });

    const r = await enviarPropostaNoWhatsApp(comoPrisma(db), {
      propostaId: c.propostaId, autoria: GENTE, quemMandou: "pessoa", agora: AGORA,
    });

    expect(r).toMatchObject({ ok: false, causa: "naoEntregue", motivo: "leadPediuSilencio" });
    expect(db.tabelas.leadProposta[0]!.situacao).toBe("RASCUNHO");
  });

  it("sem gateway configurado a proposta ainda sai — só que sem link", async () => {
    const db = bancoFalso();
    const c = await propostaPronta(db);
    ensurePreapproval.mockResolvedValue({ ok: false, reason: "gateway_nao_configurado" });
    entregarMensagem.mockResolvedValue({ entregue: true, mensagemId: "msg-1" });

    const r = await enviarPropostaNoWhatsApp(comoPrisma(db), {
      propostaId: c.propostaId, autoria: GENTE, quemMandou: "pessoa", agora: AGORA,
    });

    expect(r).toMatchObject({ ok: true, link: null });
    expect(registrarSaida.mock.calls[0]![1].texto).not.toContain("Para contratar");
  });

  it("o texto sem link não promete link", () => {
    const texto = textoDaProposta({
      primeiroNome: "Marina", item: itemDoCatalogo("PRO", "ANUAL"), link: null, validaAte: null,
    });
    expect(texto).toContain("Marina");
    expect(texto).not.toContain("http");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. O LINK DE PAGAMENTO — reuso e idempotência
// ─────────────────────────────────────────────────────────────────────────────

describe("o link de pagamento", () => {
  it("nasce da assinatura da plataforma, com a chave da proposta", async () => {
    const db = bancoFalso();
    const c = await propostaPronta(db);

    const r = await gerarLinkDePagamento(comoPrisma(db), { propostaId: c.propostaId, autoria: GENTE });

    expect(r).toMatchObject({ ok: true, link: "https://mp.example/checkout/pre-1" });
    expect(criarAssinatura).toHaveBeenCalledOnce();
    const input = criarAssinatura.mock.calls[0]![0] as Linha;
    expect(input.signupIdempotencyKey).toBe(chaveDaAssinaturaDaProposta(c.propostaId));
    expect(input.plan).toBe("GROWTH");
    expect(input.cycle).toBe("MENSAL");
    // Nenhum preço digitado: o valor sai da fonte única, dentro do serviço.
    expect(input.priceCents).toBeUndefined();
  });

  it("gerar duas vezes NÃO cria uma segunda cobrança no cartão", async () => {
    const db = bancoFalso();
    const c = await propostaPronta(db);

    await gerarLinkDePagamento(comoPrisma(db), { propostaId: c.propostaId, autoria: GENTE });
    findByIdempotencyKey.mockResolvedValue({ id: "sub-1" });
    ensurePreapproval.mockResolvedValue({
      ok: true, preapprovalId: "pre-1", initPoint: "https://mp.example/checkout/pre-1", reused: true,
    });
    const segunda = await gerarLinkDePagamento(comoPrisma(db), { propostaId: c.propostaId, autoria: GENTE });

    expect(segunda).toMatchObject({ ok: true, reaproveitado: true });
    expect(criarAssinatura).toHaveBeenCalledOnce();
  });

  it("gateway desligado devolve motivo, e a assinatura fica de pé para o modo manual", async () => {
    const db = bancoFalso();
    const c = await propostaPronta(db);
    ensurePreapproval.mockResolvedValue({ ok: false, reason: "gateway_nao_configurado" });

    const r = await gerarLinkDePagamento(comoPrisma(db), { propostaId: c.propostaId, autoria: GENTE });
    expect(r).toMatchObject({ ok: false, causa: "gatewayNaoConfigurado", assinaturaId: "sub-1" });
  });

  it("a chave leva de volta à proposta, e só à dela", () => {
    expect(propostaDaChave(chaveDaAssinaturaDaProposta("prop-9"))).toBe("prop-9");
    // O checkout público tem chave própria e não pode ser confundido com proposta.
    expect(propostaDaChave("signup:abc")).toBeNull();
    expect(propostaDaChave(null)).toBeNull();
  });

  it("um plano fora do catálogo publicado não vira cobrança", () => {
    expect(itemDaProposta("PLANO_FANTASMA/MENSAL")).toBeNull();
    expect(itemDaProposta(null)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. PAGAR — e o ciclo fecha em GANHO, uma vez só
// ─────────────────────────────────────────────────────────────────────────────

describe("pagou → a oportunidade é ganha e o cliente nasce", () => {
  async function pronta(db: BancoFalso) {
    const c = await propostaPronta(db);
    entregarMensagem.mockResolvedValue({ entregue: true, mensagemId: "msg-1" });
    await enviarPropostaNoWhatsApp(comoPrisma(db), {
      propostaId: c.propostaId, autoria: GENTE, quemMandou: "pessoa", agora: AGORA,
    });
    return c;
  }

  it("a proposta vira ACEITA e a oportunidade GANHA, com cliente", async () => {
    const db = bancoFalso();
    const c = await pronta(db);

    const r = await ganharPeloPagamento(comoPrisma(db), {
      assinaturaId: "sub-1",
      chaveDeIdempotencia: chaveDaAssinaturaDaProposta(c.propostaId),
      receitaCents: 12900,
      autoria: AUTORIA_SISTEMA,
      agora: AGORA,
    });

    expect(r).toMatchObject({ ok: true, aplicou: true, jaEraCliente: false });
    expect(db.tabelas.leadProposta[0]!.situacao).toBe("ACEITA");
    expect(db.tabelas.oportunidade[0]!.estagio).toBe("GANHA");
    expect(db.tabelas.cliente).toHaveLength(1);
    expect(db.tabelas.cliente[0]!.receitaTotalCents).toBe(12900);
  });

  it("⭐ o MESMO webhook duas vezes não ganha duas vezes", async () => {
    const db = bancoFalso();
    const c = await pronta(db);
    const chamada = () =>
      ganharPeloPagamento(comoPrisma(db), {
        assinaturaId: "sub-1",
        chaveDeIdempotencia: chaveDaAssinaturaDaProposta(c.propostaId),
        receitaCents: 12900,
        autoria: AUTORIA_SISTEMA,
        agora: AGORA,
      });

    const primeira = await chamada();
    const segunda = await chamada();

    expect(primeira).toMatchObject({ ok: true, aplicou: true, jaEraCliente: false });
    expect(segunda).toMatchObject({ ok: true, aplicou: true, jaEraCliente: true });
    // A prova: um cliente, e não dois.
    expect(db.tabelas.cliente).toHaveLength(1);
    if (primeira.ok && primeira.aplicou && segunda.ok && segunda.aplicou) {
      expect(segunda.clienteId).toBe(primeira.clienteId);
    }
    // E a trilha não inflou: um ganho, não dois.
    const ganhos = db.tabelas.eventoDaJornada.filter((e) => e.paraEstagio === "GANHA");
    expect(ganhos).toHaveLength(1);
  });

  it("assinatura do checkout público passa reto — não é proposta comercial", async () => {
    const db = bancoFalso();
    await pronta(db);
    const r = await ganharPeloPagamento(comoPrisma(db), {
      assinaturaId: "sub-9", chaveDeIdempotencia: null, autoria: AUTORIA_SISTEMA, agora: AGORA,
    });
    expect(r).toMatchObject({ ok: true, aplicou: false, motivo: "naoEhDeProposta" });
    expect(db.tabelas.cliente).toHaveLength(0);
  });

  it("pagamento em oportunidade PERDIDA não ganha por baixo dos panos — deixa a nota", async () => {
    const db = bancoFalso();
    const c = await pronta(db);
    const motivoId = await semearMotivo(db, "preco-alto");
    await recusarProposta(comoPrisma(db), {
      propostaId: c.propostaId, motivoPerdaId: motivoId, autoria: GENTE, agora: AGORA,
    });

    const r = await ganharPeloPagamento(comoPrisma(db), {
      assinaturaId: "sub-1",
      chaveDeIdempotencia: chaveDaAssinaturaDaProposta(c.propostaId),
      autoria: AUTORIA_SISTEMA,
      agora: AGORA,
    });

    expect(r).toMatchObject({ ok: true, aplicou: false, motivo: "oportunidadeJaFechada" });
    expect(db.tabelas.cliente).toHaveLength(0);
    const nota = db.tabelas.eventoDaJornada.find((e) => e.tipo === "NOTA");
    expect(nota?.motivo).toContain("PERDIDA");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. PERDER — com motivo do catálogo, nunca "arquivar"
// ─────────────────────────────────────────────────────────────────────────────

describe("recusar a proposta", () => {
  it("recusa a proposta E perde a oportunidade, com o motivo estruturado", async () => {
    const db = bancoFalso();
    const c = await propostaPronta(db);
    const motivoId = await semearMotivo(db, "preco-alto");

    const r = await recusarProposta(comoPrisma(db), {
      propostaId: c.propostaId,
      motivoPerdaId: motivoId,
      motivoPerdaDetalhe: "achou caro para o porte",
      autoria: GENTE,
      agora: AGORA,
    });

    expect(r).toMatchObject({ ok: true, oportunidadePerdida: true });
    expect(db.tabelas.leadProposta[0]!.situacao).toBe("RECUSADA");
    const op = db.tabelas.oportunidade[0]!;
    expect(op.estagio).toBe("PERDIDA");
    // O documento: "CRM = PERDIDO + motivo. Nunca simplesmente arquivar conversa."
    expect(op.motivoPerdaId).toBe(motivoId);
    expect(op.fechadaEm).toEqual(AGORA);
  });

  it("⛔ sem motivo não perde — arquivar em silêncio não existe aqui", async () => {
    const db = bancoFalso();
    const c = await propostaPronta(db);

    const r = await recusarProposta(comoPrisma(db), {
      propostaId: c.propostaId, motivoPerdaId: "", autoria: GENTE, agora: AGORA,
    });

    expect(r).toMatchObject({ ok: false, causa: "recusado" });
    expect(db.tabelas.leadProposta[0]!.situacao).toBe("RASCUNHO");
    expect(db.tabelas.oportunidade[0]!.estagio).toBe("PROPOSTA");
  });

  it("motivo que exige detalhe recusa sem detalhe", async () => {
    const db = bancoFalso();
    const c = await propostaPronta(db);
    const motivoId = await semearMotivo(db, "concorrente", true);

    const r = await recusarProposta(comoPrisma(db), {
      propostaId: c.propostaId, motivoPerdaId: motivoId, autoria: GENTE, agora: AGORA,
    });
    expect(r).toMatchObject({ ok: false, causa: "recusado" });

    const comDetalhe = await recusarProposta(comoPrisma(db), {
      propostaId: c.propostaId,
      motivoPerdaId: motivoId,
      motivoPerdaDetalhe: "fechou com a concorrência X",
      autoria: GENTE,
      agora: AGORA,
    });
    expect(comDetalhe.ok).toBe(true);
  });

  it("motivo desativado não serve — o catálogo é o do lead, e vale inteiro", async () => {
    const db = bancoFalso();
    const c = await propostaPronta(db);
    const m = await db.motivoDePerda.create({ data: { slug: "velho", rotulo: "velho", ativo: false } });

    const r = await recusarProposta(comoPrisma(db), {
      propostaId: c.propostaId, motivoPerdaId: m.id as string, autoria: GENTE, agora: AGORA,
    });
    expect(r).toMatchObject({ ok: false, causa: "recusado" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. EXPIRAR
// ─────────────────────────────────────────────────────────────────────────────

describe("a validade que vence", () => {
  const DEPOIS = new Date(AGORA.getTime() + 30 * 24 * 3600 * 1000);

  it("expira a proposta e perde a oportunidade com o motivo do catálogo", async () => {
    const db = bancoFalso();
    await propostaPronta(db);
    await semearMotivo(db, SLUG_DA_PERDA_POR_EXPIRACAO);

    const extrato = await expirarPropostasVencidas(comoPrisma(db), {
      autoria: AUTORIA_SISTEMA, agora: DEPOIS,
    });

    expect(extrato).toMatchObject({ examinadas: 1, expiradas: 1, oportunidadesPerdidas: 1 });
    expect(db.tabelas.leadProposta[0]!.situacao).toBe("EXPIRADA");
    expect(db.tabelas.oportunidade[0]!.estagio).toBe("PERDIDA");
  });

  it("⛔ sem o motivo semeado ela expira e a oportunidade FICA DE PÉ, com o porquê", async () => {
    const db = bancoFalso();
    await propostaPronta(db);

    const extrato = await expirarPropostasVencidas(comoPrisma(db), {
      autoria: AUTORIA_SISTEMA, agora: DEPOIS,
    });

    expect(extrato.expiradas).toBe(1);
    expect(extrato.oportunidadesPerdidas).toBe(0);
    // Perder sem motivo seria arquivar. O que falta aparece, não some.
    expect(extrato.naoExpiradas[0]!.motivo).toContain(SLUG_DA_PERDA_POR_EXPIRACAO);
    expect(db.tabelas.oportunidade[0]!.estagio).toBe("PROPOSTA");
  });

  it("proposta dentro da validade não é tocada", async () => {
    const db = bancoFalso();
    await propostaPronta(db);
    await semearMotivo(db, SLUG_DA_PERDA_POR_EXPIRACAO);

    const extrato = await expirarPropostasVencidas(comoPrisma(db), {
      autoria: AUTORIA_SISTEMA, agora: new Date(AGORA.getTime() + 3600 * 1000),
    });

    expect(extrato).toMatchObject({ examinadas: 0, expiradas: 0 });
    expect(db.tabelas.leadProposta[0]!.situacao).toBe("RASCUNHO");
  });

  it("uma proposta já aceita não expira — terminal é terminal", async () => {
    const db = bancoFalso();
    const c = await propostaPronta(db);
    await moverProposta(comoPrisma(db), {
      propostaId: c.propostaId, de: "RASCUNHO", para: "ENVIADA", autoria: GENTE, agora: AGORA,
    });
    await moverProposta(comoPrisma(db), {
      propostaId: c.propostaId, de: "ENVIADA", para: "ACEITA", autoria: GENTE, agora: AGORA,
    });

    const extrato = await expirarPropostasVencidas(comoPrisma(db), {
      autoria: AUTORIA_SISTEMA, agora: DEPOIS,
    });
    expect(extrato.examinadas).toBe(0);
    expect(db.tabelas.leadProposta[0]!.situacao).toBe("ACEITA");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. O QUE A TELA LÊ
// ─────────────────────────────────────────────────────────────────────────────

describe("a leitura para a tela", () => {
  it("marca como vencida a proposta que passou da validade e ninguém varreu", async () => {
    const db = bancoFalso();
    const c = await propostaPronta(db);

    const dentro = await lerPropostasDoLead(comoPrisma(db), { leadId: c.leadId, agora: AGORA });
    expect(dentro[0]!.vencida).toBe(false);

    const fora = await lerPropostasDoLead(comoPrisma(db), {
      leadId: c.leadId, agora: new Date(AGORA.getTime() + 30 * 24 * 3600 * 1000),
    });
    expect(fora[0]!.vencida).toBe(true);
  });

  it("marcar vista leva de ENVIADA a EM_NEGOCIACAO e carimba a resposta", async () => {
    const db = bancoFalso();
    const c = await propostaPronta(db);
    await moverProposta(comoPrisma(db), {
      propostaId: c.propostaId, de: "RASCUNHO", para: "ENVIADA", autoria: GENTE, agora: AGORA,
    });

    const r = await marcarPropostaVista(comoPrisma(db), {
      propostaId: c.propostaId, autoria: GENTE, agora: AGORA,
    });

    expect(r).toMatchObject({ ok: true, mudou: true });
    expect(db.tabelas.leadProposta[0]!.situacao).toBe("EM_NEGOCIACAO");
    expect(db.tabelas.leadProposta[0]!.respondidaEm).toEqual(AGORA);
  });
});
