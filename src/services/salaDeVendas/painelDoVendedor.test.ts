/**
 * O PAINEL DO VENDEDOR e o que o copiloto grava no CRM.
 *
 * ── POR QUE O BANCO FALSO GUARDA ESTADO ─────────────────────────────────────
 *
 * Mesma razão de `jornadaComercial.test.ts`: o que estes testes precisam provar
 * é **o que sobreviveu à gravação** — objeção antiga que não pode ser apagada,
 * dor apurada por gente que não pode ser sobrescrita, evento que não pode ser
 * gravado duas vezes. Nada disso se demonstra contra um mock que aceita tudo e
 * não lembra de nada.
 */

import { describe, it, expect } from "vitest";
import {
  montarPainelDoVendedor,
  oQueFalta,
  lerTurnosParaOCopiloto,
  ITENS_DO_PAINEL,
  ROTULO_DO_ITEM,
  type PainelDoVendedor,
} from "./painelDoVendedor";
import { registrarAprendizadoDoCopiloto, montarNota, chaveDe } from "./copilotoNoCrm";

type Linha = Record<string, unknown>;

interface Semente {
  lead?: Linha;
  qualificacao?: Linha | null;
  empresa?: Linha | null;
  contato?: Linha | null;
  oportunidade?: Linha | null;
  handoffs?: Linha[];
  interacoes?: Linha[];
  mensagens?: Linha[];
}

/**
 * O banco falso — só o que estes dois serviços tocam, e com as restrições que
 * mudam o resultado (`chaveDeIdempotencia` única).
 */
function bancoFalso(s: Semente = {}) {
  const lead: Linha = {
    id: "lead-1",
    nome: "Ana",
    stage: "NOVO",
    score: null,
    temperatura: null,
    origem: null,
    utmSource: null,
    utmCampaign: null,
    proximaAcaoEm: null,
    proximaAcaoNota: null,
    empresaId: null,
    contatoId: null,
    ...s.lead,
  };

  const estado = {
    lead,
    qualificacao: s.qualificacao ?? null,
    empresa: s.empresa ?? null,
    contato: s.contato ?? null,
    oportunidade: s.oportunidade ? ({ objecoes: [] as string[], ...s.oportunidade } as Linha) : null,
    handoffs: s.handoffs ?? [],
    interacoes: s.interacoes ?? [],
    mensagens: s.mensagens ?? [],
    eventos: [] as Linha[],
  };

  const recortar = (linha: Linha | null, select?: Record<string, unknown>): Linha | null => {
    if (!linha) return null;
    if (!select) return { ...linha };
    const saida: Linha = {};
    for (const [k, v] of Object.entries(select)) {
      if (v === true) saida[k] = linha[k] ?? null;
    }
    return saida;
  };

  const db = {
    siteLead: {
      findUnique: async ({ where, select }: { where: { id: string }; select?: Record<string, unknown> }) => {
        if (where.id !== estado.lead.id) return null;
        const base = recortar(estado.lead, select) ?? {};
        if (select?.qualificacao) {
          base.qualificacao = recortar(
            estado.qualificacao,
            (select.qualificacao as { select: Record<string, unknown> }).select,
          );
        }
        if (select?.empresa) {
          base.empresa = recortar(
            estado.empresa,
            (select.empresa as { select: Record<string, unknown> }).select,
          );
        }
        if (select?.contato) {
          base.contato = recortar(
            estado.contato,
            (select.contato as { select: Record<string, unknown> }).select,
          );
        }
        return base;
      },
      update: async ({ data }: { data: Linha }) => {
        Object.assign(estado.lead, data);
        return { ...estado.lead };
      },
    },
    leadHandoff: {
      findFirst: async ({ where }: { where: { leadId: string; para: { in: string[] } } }) => {
        const achados = estado.handoffs.filter(
          (h) => h.leadId === where.leadId && where.para.in.includes(h.para as string),
        );
        return achados.length ? { ...achados[achados.length - 1] } : null;
      },
    },
    siteLeadInteraction: {
      count: async () => estado.interacoes.length,
      findFirst: async () =>
        estado.interacoes.length ? { ...estado.interacoes[estado.interacoes.length - 1] } : null,
      findMany: async ({ take }: { take?: number }) =>
        [...estado.interacoes].reverse().slice(0, take ?? 50),
      create: async ({ data }: { data: Linha }) => {
        estado.interacoes.push({ createdAt: new Date(), ...data });
        return { ...data };
      },
    },
    oportunidade: {
      findFirst: async () => (estado.oportunidade ? { ...estado.oportunidade } : null),
      update: async ({ data }: { data: Linha }) => {
        Object.assign(estado.oportunidade as Linha, data);
        return { ...(estado.oportunidade as Linha) };
      },
    },
    leadMensagem: {
      findMany: async ({ take }: { take?: number }) => [...estado.mensagens].slice(0, take ?? 60),
    },
    eventoDaJornada: {
      createMany: async ({ data }: { data: Linha[] }) => {
        let count = 0;
        for (const linha of data) {
          const chave = linha.chaveDeIdempotencia;
          if (chave && estado.eventos.some((e) => e.chaveDeIdempotencia === chave)) continue;
          estado.eventos.push({ ...linha });
          count += 1;
        }
        return { count };
      },
    },
  };

  // O molde é o que estes serviços realmente chamam, não o `PrismaClient`
  // inteiro — por isso a conversão passa por `unknown`.
  return { db: db as unknown as Parameters<typeof montarPainelDoVendedor>[0], estado };
}

const CHEIO: Semente = {
  lead: {
    stage: "QUALIFICADO",
    score: 62,
    temperatura: "QUENTE",
    origem: "/precos",
    utmSource: "meta",
    utmCampaign: "pizzarias-set",
    proximaAcaoEm: new Date("2026-09-20T12:00:00Z"),
    proximaAcaoNota: "ligar depois do almoço",
    empresaId: "emp-1",
    contatoId: "ct-1",
  },
  qualificacao: {
    segmento: "pizzaria",
    unidades: 2,
    volumeMensal: 900,
    canaisAtuais: ["ifood", "whatsapp"],
    sistemaAtual: "Consumer",
    dorPrincipal: "perde pedido no pico",
    planoDeInteresse: "crescimento",
    urgencia: "esse mês",
    poderDeDecisao: "decide sozinho",
    faixaDeOrcamento: "até 500",
  },
  empresa: {
    nome: "Pizzaria do Zé",
    categoria: "pizzaria",
    cidade: "Recife",
    estado: "PE",
    numeroDeUnidades: 2,
    marketplaces: ["ifood"],
    deliveryProprio: false,
    cardapioProprio: null,
    sistemaIdentificado: "Consumer",
    scoreIcp: 71,
    fonteDaDescoberta: "planilha-outscraper",
    estagio: "PRONTA_PARA_SDR",
  },
  contato: {
    nome: "José",
    cargo: "dono",
    canal: "whatsapp",
    ehDecisor: true,
    comoFoiDescoberto: "atendente passou o número",
    confianca: "ALTA",
  },
  oportunidade: {
    id: "op-1",
    empresaId: "emp-1",
    estagio: "QUALIFICACAO",
    valorPotencialCents: 39900,
    produtoDeInteresse: "crescimento",
    probabilidade: 40,
    previsaoDeFechamento: null,
    objecoes: ["já tem sistema"],
    dorIdentificada: "perde pedido no pico",
  },
  handoffs: [
    { leadId: "lead-1", para: "AGUARDANDO_HUMANO", resumo: "Quer trocar de sistema.", dorIdentificada: null, objecoes: "acha caro", proximaAcao: "mandar comparativo", createdAt: new Date() },
  ],
  interacoes: [{ createdAt: new Date("2026-09-10T10:00:00Z"), tipo: "CAPTURA", actor: "site", nota: null, interna: false }],
};

// ─────────────────────────────────────────────────────────────────────────────
describe("o painel entrega os catorze itens", () => {
  it("o contrato lista exatamente catorze itens, todos com rótulo", () => {
    expect(ITENS_DO_PAINEL).toHaveLength(14);
    for (const item of ITENS_DO_PAINEL) {
      expect(ROTULO_DO_ITEM[item]).toBeTruthy();
    }
  });

  it("com a base cheia, nada falta", async () => {
    const { db } = bancoFalso(CHEIO);
    const r = await montarPainelDoVendedor(db, { leadId: "lead-1" });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const p = r.painel;

    expect(p.resumoDaIA).toBe("Quer trocar de sistema.");
    expect(p.origem).toBe("meta");
    expect(p.campanha).toBe("pizzarias-set");
    expect(p.produto).toBe("crescimento");
    expect(p.necessidade).toBe("perde pedido no pico");
    expect(p.objecoes).toEqual(["já tem sistema", "acha caro"]);
    expect(p.leadScore).toEqual({ valor: 62, temperatura: "QUENTE" });
    expect(p.historico).toHaveLength(1);
    expect(p.interacoesAnteriores?.total).toBe(1);
    expect(p.oQueOHunterAchou?.empresa).toBe("Pizzaria do Zé");
    expect(p.oQueOSdrDescobriu?.sistemaAtual).toBe("Consumer");
    expect(p.decisor?.nome).toBe("José");
    expect(p.estagio).toBe("QUALIFICADO");
    expect(p.proximaAcao?.nota).toBe("ligar depois do almoço");
    expect(p.oportunidade?.id).toBe("op-1");

    expect(p.ausentes).toEqual([]);
  });

  it("⛔ campo sem dado continua AUSENTE — nada é inventado", async () => {
    const { db } = bancoFalso();
    const r = await montarPainelDoVendedor(db, { leadId: "lead-1" });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const p = r.painel;

    expect(p.resumoDaIA).toBeNull();
    expect(p.origem).toBeNull();
    expect(p.campanha).toBeNull();
    expect(p.produto).toBeNull();
    expect(p.necessidade).toBeNull();
    expect(p.objecoes).toEqual([]);
    expect(p.leadScore).toBeNull();
    expect(p.decisor).toBeNull();
    expect(p.oQueOHunterAchou).toBeNull();
    expect(p.oQueOSdrDescobriu).toBeNull();
    expect(p.proximaAcao).toBeNull();
    expect(p.oportunidade).toBeNull();

    // Nenhum campo virou string de enfeite.
    const texto = JSON.stringify(p);
    expect(texto).not.toMatch(/não informado/i);
    expect(texto).not.toMatch(/a confirmar/i);

    // E a falta vira lista — que é o que transforma branco em pergunta.
    expect(p.ausentes).toEqual([
      "resumoDaIA",
      "origem",
      "campanha",
      "produto",
      "necessidade",
      "objecoes",
      "leadScore",
      "historico",
      "interacoesAnteriores",
      "oQueOHunterAchou",
      "oQueOSdrDescobriu",
      "decisor",
      "proximaAcao",
    ]);
  });

  it("score zero NÃO é score ausente", async () => {
    const { db } = bancoFalso({ lead: { score: 0, temperatura: "FRIO" } });
    const r = await montarPainelDoVendedor(db, { leadId: "lead-1" });
    if (!r.ok) throw new Error("painel deveria montar");

    expect(r.painel.leadScore).toEqual({ valor: 0, temperatura: "FRIO" });
    expect(r.painel.ausentes).not.toContain("leadScore");
  });

  it("contato que NÃO é decisor não vira decisor", async () => {
    const { db } = bancoFalso({
      lead: { contatoId: "ct-2" },
      contato: { nome: "Recepção", cargo: null, canal: "telefone", ehDecisor: false, comoFoiDescoberto: null, confianca: "BAIXA" },
    });
    const r = await montarPainelDoVendedor(db, { leadId: "lead-1" });
    if (!r.ok) throw new Error("painel deveria montar");

    // Apresentar um gatekeeper como decisor manda o vendedor negociar com quem
    // não assina — e isso queima a conta, não só a ligação.
    expect(r.painel.decisor).toBeNull();
    expect(r.painel.ausentes).toContain("decisor");
  });

  it("ficha de qualificação em branco não conta como descoberta", async () => {
    const { db } = bancoFalso({
      qualificacao: {
        segmento: null, unidades: null, volumeMensal: null, canaisAtuais: [],
        sistemaAtual: null, dorPrincipal: null, planoDeInteresse: null,
        urgencia: null, poderDeDecisao: null, faixaDeOrcamento: null,
      },
    });
    const r = await montarPainelDoVendedor(db, { leadId: "lead-1" });
    if (!r.ok) throw new Error("painel deveria montar");

    expect(r.painel.oQueOSdrDescobriu).toBeNull();
    expect(r.painel.ausentes).toContain("oQueOSdrDescobriu");
  });

  it("objeção repetida nas duas fontes aparece uma vez só", async () => {
    const { db } = bancoFalso({
      oportunidade: { id: "op-1", empresaId: null, estagio: "X", valorPotencialCents: null, produtoDeInteresse: null, probabilidade: null, previsaoDeFechamento: null, objecoes: ["Acha caro"], dorIdentificada: null },
      handoffs: [{ leadId: "lead-1", para: "HUMANO", resumo: "r", objecoes: "acha caro", createdAt: new Date() }],
    });
    const r = await montarPainelDoVendedor(db, { leadId: "lead-1" });
    if (!r.ok) throw new Error("painel deveria montar");
    expect(r.painel.objecoes).toEqual(["Acha caro"]);
  });

  it("lead inexistente é recusa nomeada, não exceção", async () => {
    const { db } = bancoFalso();
    const r = await montarPainelDoVendedor(db, { leadId: "nao-existe" });
    expect(r).toEqual({ ok: false, causa: "leadNaoExiste" });
  });

  it("`oQueFalta` nunca acusa o estágio, que é obrigatório", () => {
    const vazio = {
      objecoes: [], historico: [], leadScore: null, interacoesAnteriores: null,
      resumoDaIA: null, origem: null, campanha: null, produto: null,
      necessidade: null, oQueOHunterAchou: null, oQueOSdrDescobriu: null,
      decisor: null, proximaAcao: null, estagio: "NOVO",
    } as unknown as PainelDoVendedor;
    expect(oQueFalta(vazio)).not.toContain("estagio");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("os turnos que vão ao copiloto", () => {
  it("entrada vira cliente, saída vira foocci, e mídia sem texto não entra", async () => {
    const { db } = bancoFalso({
      mensagens: [
        { direcao: "ENTRADA", texto: "oi", legenda: null },
        { direcao: "SAIDA", texto: null, legenda: "olha a foto" },
        { direcao: "ENTRADA", texto: "   ", legenda: null },
      ],
    });

    const turnos = await lerTurnosParaOCopiloto(db, { leadId: "lead-1" });
    expect(turnos).toEqual([
      { deQuem: "cliente", texto: "oi" },
      { deQuem: "foocci", texto: "olha a foto" },
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("o copiloto registra no CRM como IA", () => {
  const AUTORIA_IA = { autor: "IA" as const, userId: "u-1", label: "copiloto (confirmado por Ana)" };

  it("grava trilha, objeção e linha do tempo — com autor IA", async () => {
    const { db, estado } = bancoFalso(CHEIO);

    const r = await registrarAprendizadoDoCopiloto(db, {
      leadId: "lead-1",
      evento: "aprendizado",
      autoria: AUTORIA_IA,
      objecoes: ["acha caro: achei meio caro"],
      necessidade: "perde pedido no pico",
      proximaAcao: "mandar comparativo",
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.gravados).toContain("trilha");
    expect(r.gravados).toContain("objeções na oportunidade");

    const evento = estado.eventos[0]!;
    expect(evento.autor).toBe("IA");
    expect(evento.autorUserId).toBe("u-1");
    expect(evento.tipo).toBe("NOTA");
    expect(evento.fonte).toBe("copiloto-do-vendedor");
    // A trilha se pendura na OPORTUNIDADE, que é a entidade real da jornada.
    expect(evento.entidade).toBe("OPORTUNIDADE");
    expect(evento.entidadeId).toBe("op-1");

    // E a nota é legível por gente daqui a três semanas.
    expect(evento.nota).toContain("Necessidade:");
    expect(evento.nota).toContain("Objeções:");
  });

  it("⛔ objeção antiga NÃO é apagada pela leitura de hoje", async () => {
    const { db, estado } = bancoFalso(CHEIO);
    await registrarAprendizadoDoCopiloto(db, {
      leadId: "lead-1",
      evento: "aprendizado",
      autoria: AUTORIA_IA,
      objecoes: ["acha caro"],
    });

    expect(estado.oportunidade?.objecoes).toEqual(["já tem sistema", "acha caro"]);
  });

  it("⛔ dor apurada por gente NÃO é sobrescrita pelo modelo", async () => {
    const { db, estado } = bancoFalso(CHEIO);
    await registrarAprendizadoDoCopiloto(db, {
      leadId: "lead-1",
      evento: "aprendizado",
      autoria: AUTORIA_IA,
      necessidade: "quer relatório bonito",
    });

    expect(estado.oportunidade?.dorIdentificada).toBe("perde pedido no pico");
  });

  it("⛔ próxima ação combinada por gente NÃO é sobrescrita", async () => {
    const { db, estado } = bancoFalso(CHEIO);
    await registrarAprendizadoDoCopiloto(db, {
      leadId: "lead-1",
      evento: "aprendizado",
      autoria: AUTORIA_IA,
      proximaAcao: "sugestão do modelo",
    });

    expect(estado.lead.proximaAcaoNota).toBe("ligar depois do almoço");
  });

  it("próxima ação entra quando o campo está vazio", async () => {
    const { db, estado } = bancoFalso();
    await registrarAprendizadoDoCopiloto(db, {
      leadId: "lead-1",
      evento: "aprendizado",
      autoria: AUTORIA_IA,
      proximaAcao: "perguntar qual sistema usa hoje",
    });

    expect(estado.lead.proximaAcaoNota).toBe("perguntar qual sistema usa hoje");
  });

  it("apertar duas vezes com a mesma leitura grava UM evento", async () => {
    const { db, estado } = bancoFalso(CHEIO);
    const pedido = {
      leadId: "lead-1",
      evento: "aprendizado" as const,
      autoria: AUTORIA_IA,
      objecoes: ["acha caro"],
      necessidade: null,
      proximaAcao: null,
    };

    await registrarAprendizadoDoCopiloto(db, pedido);
    await registrarAprendizadoDoCopiloto(db, pedido);

    expect(estado.eventos).toHaveLength(1);
  });

  it("nada para gravar é recusa nomeada, não gravação vazia", async () => {
    const { db, estado } = bancoFalso(CHEIO);
    const r = await registrarAprendizadoDoCopiloto(db, {
      leadId: "lead-1",
      evento: "aprendizado",
      autoria: AUTORIA_IA,
      objecoes: ["   "],
      necessidade: "",
      proximaAcao: null,
    });

    expect(r).toEqual({ ok: false, causa: "nadaParaGravar" });
    expect(estado.eventos).toHaveLength(0);
  });

  it("lead sem empresa, contato ou oportunidade não inventa entidade na trilha", async () => {
    const { db, estado } = bancoFalso();
    const r = await registrarAprendizadoDoCopiloto(db, {
      leadId: "lead-1",
      evento: "aprendizado",
      autoria: AUTORIA_IA,
      objecoes: ["acha caro"],
    });

    expect(r.ok).toBe(true);
    // Evento apontando para um registro que não existe é história falsa, que é
    // pior que história faltando. A gravação segue pela linha do tempo do lead.
    expect(estado.eventos).toHaveLength(0);
    if (r.ok) expect(r.gravados).toContain("linha do tempo do lead");
  });

  it("nota do copiloto na linha do tempo é INTERNA — o lead nunca vê", async () => {
    const { db, estado } = bancoFalso(CHEIO);
    await registrarAprendizadoDoCopiloto(db, {
      leadId: "lead-1",
      evento: "aprendizado",
      autoria: AUTORIA_IA,
      objecoes: ["acha caro"],
    });

    const nova = estado.interacoes[estado.interacoes.length - 1]!;
    expect(nova.interna).toBe(true);
    expect(String(nova.nota)).toContain("Copiloto:");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("devolver para a IA deixa rastro de quem e para quê", () => {
  it("grava na trilha com autor HUMANO e o objetivo por escrito", async () => {
    const { db, estado } = bancoFalso(CHEIO);

    const r = await registrarAprendizadoDoCopiloto(db, {
      leadId: "lead-1",
      evento: "devolvido",
      objetivo: "confirmar o horário da demonstração de quinta",
      autoria: { autor: "HUMANO", userId: "u-9", label: "Ana" },
    });

    expect(r.ok).toBe(true);
    const evento = estado.eventos[0]!;
    expect(evento.autor).toBe("HUMANO");
    expect(evento.autorUserId).toBe("u-9");
    expect(evento.autorLabel).toBe("Ana");
    expect(String(evento.nota)).toContain("devolvida para a IA");
    expect(String(evento.nota)).toContain("demonstração de quinta");
  });

  it("devolver NÃO mexe na oportunidade nem na próxima ação do lead", async () => {
    const { db, estado } = bancoFalso(CHEIO);
    const objecoesAntes = [...((estado.oportunidade?.objecoes as string[]) ?? [])];

    await registrarAprendizadoDoCopiloto(db, {
      leadId: "lead-1",
      evento: "devolvido",
      objetivo: "confirmar horário",
      autoria: { autor: "HUMANO", userId: "u-9", label: "Ana" },
      objecoes: ["isto não deve entrar"],
      proximaAcao: "isto também não",
    });

    expect(estado.oportunidade?.objecoes).toEqual(objecoesAntes);
    expect(estado.lead.proximaAcaoNota).toBe("ligar depois do almoço");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("peças pequenas", () => {
  it("a nota sai em português, na ordem que um humano lê", () => {
    expect(
      montarNota({ objecoes: ["caro"], necessidade: "perde pedido", proximaAcao: "ligar" }),
    ).toBe("Necessidade: perde pedido · Objeções: caro · Próxima ação: ligar");
  });

  it("a chave de idempotência muda quando o aprendizado muda", () => {
    expect(chaveDe("l", "aprendizado", "a")).not.toBe(chaveDe("l", "aprendizado", "b"));
    expect(chaveDe("l", "aprendizado", "a")).toBe(chaveDe("l", "aprendizado", "a"));
  });
});
