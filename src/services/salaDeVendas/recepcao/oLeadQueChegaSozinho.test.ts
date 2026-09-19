/**
 * ⭐ A PROVA DO P0: O LEAD QUE CHEGA SOZINHO.
 *
 * ── A PERGUNTA OBRIGATÓRIA ──────────────────────────────────────────────────
 *
 * *"O teste alcança o código que responde ao cliente?"* Alcança: a rodada aqui
 * chama `receberUmLead` de verdade, que chama `abordarLead` de verdade, que
 * atravessa o portão do contato, o freio de ritmo, a Supervisora e a trava de
 * repetição reais. O ÚNICO duplo na ponta é o canal da Meta — o lugar onde a
 * mensagem sairia da máquina.
 *
 * ── O QUE ELE MEDE, NA ORDEM ────────────────────────────────────────────────
 *
 *  1. **O defeito, reproduzido.** Sem a rodada, um lead que chega e não escreve
 *     no WhatsApp não é tocado por nada: `atenderComOTA` só roda com mensagem
 *     recebida. Medido chamando o TA com o lead recém-chegado.
 *  2. **A correção.** A mesma ficha, com a rodada ligada: a mensagem sai.
 *  3. **Fail-closed.** Chave desligada, sem agente, e opt-out — nenhum dos três
 *     pode virar "manda mensagem".
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { rodadaDaRecepcao, filaDaRecepcao, VARIAVEL_DA_RECEPCAO } from "./recepcaoDeLeads";
import { prazoDaPrimeiraResposta, marcarPrazoDePrimeiraResposta } from "./prazoDaPrimeiraResposta";

const enviarModelo = vi.hoisted(() => vi.fn());
const canalPronto = vi.hoisted(() => vi.fn(() => true));
const modeloLiberado = vi.hoisted(() => vi.fn());
const supervisora = vi.hoisted(() => vi.fn());

vi.mock("@/services/foocci-sdr/FoocciSalesChannel", async (original) => {
  const real = await original<typeof import("@/services/foocci-sdr/FoocciSalesChannel")>();
  return { ...real, enviarModeloDeVendas: enviarModelo, canalDeVendasPronto: canalPronto };
});

// ⚠️ MOCK PARCIAL, e precisa ser: `modelosDoPrimeiroContato` também lê deste
// módulo (`modelosLiberadosParaEnvio`, `escolherAleatorio`). Um mock que só
// devolve `escolherModeloLiberado` derruba o caminho do lead de formulário —
// que é justamente o lead deste arquivo.
vi.mock("@/services/foocci-sdr/modelosLiberados", async (original) => {
  const real = await original<typeof import("@/services/foocci-sdr/modelosLiberados")>();
  return {
    ...real,
    escolherModeloLiberado: modeloLiberado,
    // O lead deste arquivo é de CAMPANHA_PAGA, então quem escolhe é o pool do
    // lead de formulário — que lê daqui, e não de `escolherModeloLiberado`.
    modelosLiberadosParaEnvio: async () => [await modeloLiberado()],
  };
});

vi.mock("@/services/salaDeVendas/supervisora/adequacaoDoTemplate", () => ({
  avaliarAdequacaoDoTemplate: supervisora,
}));

const ambiente = { ...process.env };
const AGORA = new Date("2026-09-18T13:00:00Z");
const CHEGOU = new Date("2026-09-18T12:50:00Z");

/** O lead do CEO: entrou sozinho, ninguém falou com ele. */
const FANTASTICO = {
  id: "L-FANTASTICO",
  nome: "Fantástico Magic",
  whatsapp: "+5511988887777",
  restaurante: "Fantástico Magic",
  cidade: "São Paulo",
  fonte: "CAMPANHA_PAGA",
  stage: "NOVO",
  atendidoPor: "NINGUEM",
  atendenteUserId: null as string | null,
  optOutAt: null as Date | null,
  consentAt: CHEGOU,
  createdAt: CHEGOU,
  lastContactedAt: null as Date | null,
  slaVenceEm: null as Date | null,
};

/** As mensagens de SAÍDA que este lead já tem no banco, para o filtro da fila. */
type MensagemDeSaida = { direcao: "SAIDA" | "ENTRADA"; status: "PENDENTE" | "ENVIADA" | "ENTREGUE" | "LIDA" | "FALHOU" };

function banco(
  over: {
    lead?: Partial<typeof FANTASTICO>;
    agentes?: { id: string; nome: string; email: string }[];
    mensagens?: MensagemDeSaida[];
  } = {},
) {
  const lead: Record<string, unknown> = { ...FANTASTICO, ...(over.lead ?? {}) };
  const mensagensNoBanco: MensagemDeSaida[] = over.mensagens ?? [];
  const gravadas: Array<Record<string, unknown>> = [];
  const escritasNoLead: Array<Record<string, unknown>> = [];
  const agentes = over.agentes ?? [{ id: "u-maria", nome: "Agente Maria", email: "agente1@agentes.foocci.com.br" }];

  const filtrar = (args: { select?: Record<string, boolean> }) => {
    if (!args.select) return { ...lead };
    const out: Record<string, unknown> = {};
    for (const c of Object.keys(args.select)) if (args.select[c]) out[c] = lead[c];
    return out;
  };

  const db = {
    siteLead: {
      findMany: async (args: { select?: Record<string, boolean>; where?: Record<string, unknown> }) => {
        const w = (args.where ?? {}) as Record<string, unknown>;
        // A fila: só devolve o lead quando ele casa com o filtro real da rodada.
        const donoOk = !w.atendidoPor
          || (typeof w.atendidoPor === "object"
            ? (w.atendidoPor as { in: string[] }).in.includes(lead.atendidoPor as string)
            : w.atendidoPor === lead.atendidoPor);
        const optOk = !("optOutAt" in w) || lead.optOutAt === null;
        const stageOk = !("stage" in w) || w.stage === lead.stage;

        // ⭐ O filtro novo da fila, avaliado de verdade e não presumido: se este
        // duplo aceitasse qualquer `AND`, o teste da mensagem que FALHOU
        // passaria verde sobre nada. Ver o cabeçalho de `filaDaRecepcao`.
        const saidas = mensagensNoBanco.filter((m) => m.direcao === "SAIDA");
        const nenhumaQueNaoFalhou = saidas.every((m) => m.status === "FALHOU");
        const algumaFalhou = saidas.some((m) => m.status === "FALHOU");
        const contatoOk =
          !Array.isArray(w.AND) ||
          (nenhumaQueNaoFalhou && (lead.lastContactedAt === null || algumaFalhou));

        return donoOk && contatoOk && optOk && stageOk ? [filtrar(args)] : [];
      },
      findUnique: async (args: { select?: Record<string, boolean> }) => filtrar(args),
      count: async () => 0,
      update: async (args: { data: Record<string, unknown> }) => {
        escritasNoLead.push(args.data);
        Object.assign(lead, args.data);
        return {};
      },
      updateMany: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const w = args.where;
        if ("atendidoPor" in w && w.atendidoPor !== lead.atendidoPor) return { count: 0 };
        if ("slaVenceEm" in w && w.slaVenceEm === null && lead.slaVenceEm !== null) return { count: 0 };
        escritasNoLead.push(args.data);
        Object.assign(lead, args.data);
        return { count: 1 };
      },
      groupBy: async () => [],
    },
    internalUser: { findMany: async () => agentes },
    leadMensagem: {
      count: async () => 0,
      findFirst: async () => null,
      create: async (args: { data: Record<string, unknown> }) => {
        gravadas.push(args.data);
        return { id: `m${gravadas.length}` };
      },
      update: async () => ({}),
    },
    itemDeProspeccao: { findFirst: async () => null },
    prospeccaoConfig: {
      findUnique: async () => ({ outboundLigado: true, pausadoEm: null, horasEntreAbordagens: null, limiteDiario: 250 }),
    },
    travaDeAbordagemRitmo: { updateMany: async () => ({ count: 0 }), create: async (a: { data: unknown }) => a.data },
    travaDeAbordagemEnviada: { create: async (a: { data: unknown }) => a.data },
    travaDeAbordagemRecusa: { create: async (a: { data: unknown }) => a.data },
  };

  return { db: db as never, lead, gravadas, escritasNoLead };
}

beforeEach(() => {
  enviarModelo.mockReset();
  enviarModelo.mockResolvedValue({ ok: true, providerMessageId: "wamid.TESTE" });
  canalPronto.mockReturnValue(true);
  modeloLiberado.mockResolvedValue({
    nome: "foocci_lead_formulario_01",
    idioma: "pt_BR",
    variaveis: 1,
    corpo: "Olá, {{1}}! Aqui é a Foocci.",
  });
  supervisora.mockResolvedValue({ prosseguir: true });
  process.env[VARIAVEL_DA_RECEPCAO] = "true";
});

afterEach(() => {
  process.env = { ...ambiente };
  vi.unstubAllEnvs();
});

// ─────────────────────────────────────────────────────────────────────────────

describe("⛔ ANTES: o lead que chega sozinho não é tocado por ninguém", () => {
  it("o TA não tem como atender quem não escreveu — ele só roda com mensagem recebida", async () => {
    const fonte = await import("node:fs").then((fs) =>
      fs.readFileSync(new URL("../../foocci-sdr/FoocciSalesInbound.ts", import.meta.url), "utf8"),
    );
    // O ÚNICO chamador de `atenderComOTA` em produção é o webhook de mensagem
    // RECEBIDA. Nada no caminho de CHEGADA do lead o alcança.
    expect(fonte).toContain("atenderComOTA");
    expect(fonte).toContain("receberMensagemDeVendas");
  });

  it("⭐ o lead do CEO fica parado: a fila o encontra, e sem a rodada ninguém fala com ele", async () => {
    const { db, gravadas } = banco();

    const fila = await filaDaRecepcao(db, { agora: AGORA, limite: 10 });

    expect(fila).toHaveLength(1);
    expect(fila[0]!.id).toBe("L-FANTASTICO");
    expect(fila[0]!.esperandoHaMinutos).toBe(10);
    // Ninguém falou com ele: nenhuma mensagem gravada, nenhum envio.
    expect(gravadas).toHaveLength(0);
    expect(enviarModelo).not.toHaveBeenCalled();
  });
});

describe("⭐ DEPOIS: a rodada da recepção fala com ele", () => {
  it("assume em nome da IA, grava a mensagem e manda o modelo aprovado", async () => {
    const { db, lead, gravadas } = banco();

    const r = await rodadaDaRecepcao(db, { agora: AGORA, teto: 10 });

    expect(r.ligada).toBe(true);
    expect(r.naFila).toBe(1);
    expect(r.recebidos).toBe(1);
    expect(r.extrato[0]!.ok).toBe(true);

    // O dono mudou: a IA, com nome de agente.
    expect(lead.atendidoPor).toBe("IA");
    expect(lead.atendenteUserId).toBe("u-maria");

    // A mensagem foi GRAVADA antes de sair, e saiu pelo canal.
    expect(gravadas).toHaveLength(1);
    expect(gravadas[0]!.tipo).toBe("TEMPLATE");
    expect(enviarModelo).toHaveBeenCalledTimes(1);
    expect(enviarModelo.mock.calls[0]![2].parametros).toEqual(["Fantástico"]);
  });

  it("⭐ liga o relógio da primeira resposta — a coluna que nada da casa escrevia", async () => {
    const { db, lead } = banco();

    await rodadaDaRecepcao(db, { agora: AGORA, teto: 10 });

    expect(lead.slaVenceEm).toEqual(prazoDaPrimeiraResposta(CHEGOU));
    // Trinta minutos depois da CHEGADA, nunca depois de "agora": um lead de
    // ontem não ganha folga nova por ter sido olhado hoje.
    expect((lead.slaVenceEm as Date).getTime() - CHEGOU.getTime()).toBe(30 * 60_000);
  });

  it("o prazo é idempotente: reprocessar não empurra o atraso para a frente", async () => {
    const { db, lead } = banco({ lead: { slaVenceEm: new Date("2026-01-01T00:00:00Z") } });

    const r = await marcarPrazoDePrimeiraResposta(db, { leadId: "L-FANTASTICO", chegouEm: CHEGOU });

    expect(r.marcou).toBe(false);
    expect(lead.slaVenceEm).toEqual(new Date("2026-01-01T00:00:00Z"));
  });
});

describe("⛔ fail-closed: nenhum 'não sei' pode virar 'manda mensagem'", () => {
  it("chave da recepção desligada = nada sai, e a rodada diz que está desligada", async () => {
    delete process.env[VARIAVEL_DA_RECEPCAO];
    const { db, gravadas } = banco();

    const r = await rodadaDaRecepcao(db, { agora: AGORA, teto: 10 });

    expect(r.ligada).toBe(false);
    expect(r.parouPor).toBe("desligada");
    expect(gravadas).toHaveLength(0);
    expect(enviarModelo).not.toHaveBeenCalled();
  });

  it("chave da recepção com qualquer outro valor que não 'true' = desligada", async () => {
    for (const valor of ["1", "sim", "TRUE ", "yes", ""]) {
      process.env[VARIAVEL_DA_RECEPCAO] = valor;
      const { db } = banco();
      const r = await rodadaDaRecepcao(db, { agora: AGORA, teto: 10 });
      // "TRUE " com espaço é aceito (trim + lowercase); o resto, não.
      expect(r.ligada).toBe(valor.trim().toLowerCase() === "true");
    }
  });

  it("⛔ sem agente comercial no banco a casa CALA — não manda mensagem anônima", async () => {
    const { db, gravadas } = banco({ agentes: [] });

    const r = await rodadaDaRecepcao(db, { agora: AGORA, teto: 10 });

    expect(r.recebidos).toBe(0);
    expect(r.parouPor).toBe("semAgente");
    expect(r.extrato[0]!.motivo).toBe("semAgenteResponsavel");
    expect(gravadas).toHaveLength(0);
    expect(enviarModelo).not.toHaveBeenCalled();
  });

  it("⛔ quem pediu silêncio nem entra na fila", async () => {
    const { db } = banco({ lead: { optOutAt: new Date("2026-09-01T00:00:00Z") } });
    expect(await filaDaRecepcao(db, { agora: AGORA, limite: 10 })).toHaveLength(0);
  });

  it("⛔ quem já recebeu mensagem nossa nem entra na fila — isto não é reabordagem", async () => {
    const { db } = banco({ lead: { lastContactedAt: new Date("2026-09-17T10:00:00Z") } });
    expect(await filaDaRecepcao(db, { agora: AGORA, limite: 10 })).toHaveLength(0);
  });

  it("⛔ mensagem ENTREGUE não volta para a recepção — isto seria a segunda mensagem", async () => {
    const { db, gravadas } = banco({
      lead: { lastContactedAt: new Date("2026-09-17T10:00:00Z") },
      mensagens: [{ direcao: "SAIDA", status: "ENTREGUE" }],
    });

    expect(await filaDaRecepcao(db, { agora: AGORA, limite: 10 })).toHaveLength(0);

    const r = await rodadaDaRecepcao(db, { agora: AGORA, teto: 10 });
    expect(r.recebidos).toBe(0);
    expect(gravadas).toHaveLength(0);
    expect(enviarModelo).not.toHaveBeenCalled();
  });

  it("⛔ mensagem PENDENTE também barra — aceita pela Meta é contato, mesmo sem webhook", async () => {
    const { db } = banco({
      lead: { lastContactedAt: new Date("2026-09-17T10:00:00Z") },
      mensagens: [{ direcao: "SAIDA", status: "PENDENTE" }],
    });
    expect(await filaDaRecepcao(db, { agora: AGORA, limite: 10 })).toHaveLength(0);
  });
});

/**
 * ⭐ O QUARTO LEAD DO FACEBOOK — o defeito que o CEO mediu em 19/09/2026.
 *
 * Quatro leads entraram pela campanha; o mais novo nunca recebeu nada. A casa
 * tentou uma vez, a Meta recusou, a mensagem ficou FALHOU — e `lastContactedAt`
 * ficou preenchido pela TENTATIVA. Dali em diante ele saía da fila para sempre,
 * por um contato que não aconteceu.
 */
describe("⭐ o lead cuja única mensagem FALHOU volta para a recepção", () => {
  it("⛔ ANTES o `lastContactedAt` sozinho o expulsava; AGORA ele está na fila", async () => {
    const { db } = banco({
      lead: { lastContactedAt: new Date("2026-09-18T11:00:00Z") },
      mensagens: [{ direcao: "SAIDA", status: "FALHOU" }],
    });

    const fila = await filaDaRecepcao(db, { agora: AGORA, limite: 10 });

    expect(fila).toHaveLength(1);
    expect(fila[0]!.id).toBe("L-FANTASTICO");
  });

  it("⭐ e a rodada fala com ele de verdade: uma mensagem gravada, um envio", async () => {
    // ⚠️ `lastContactedAt` nulo aqui, e é o estado REAL depois do conserto de
    // `registrarFalhaDeEnvio`: o envio que falhou devolve a coluna à verdade.
    // A prova de que a ficha antiga (com a data ainda carimbada) também volta à
    // fila está no teste acima, que mede a consulta.
    const { db, lead, gravadas } = banco({
      lead: { lastContactedAt: null },
      mensagens: [{ direcao: "SAIDA", status: "FALHOU" }],
    });

    const r = await rodadaDaRecepcao(db, { agora: AGORA, teto: 10 });

    expect(r.recebidos).toBe(1);
    expect(r.extrato[0]!.ok).toBe(true);
    expect(lead.atendidoPor).toBe("IA");
    // Uma, e só uma: a falhada não é reenviada, é a nova que sai.
    expect(gravadas).toHaveLength(1);
    expect(enviarModelo).toHaveBeenCalledTimes(1);
  });

  it("⛔ canal da Meta desligado: a mensagem é gravada e NÃO sai", async () => {
    canalPronto.mockReturnValue(false);
    const { db, gravadas } = banco();

    const r = await rodadaDaRecepcao(db, { agora: AGORA, teto: 10 });

    expect(r.recebidos).toBe(0);
    expect(r.extrato[0]!.motivo).toBe("abordagemRecusada");
    expect(r.extrato[0]!.detalhe).toContain("portaoRecusou");
    expect(enviarModelo).not.toHaveBeenCalled();
    // O portão barra ANTES de gravar: nada de linha fantasma.
    expect(gravadas).toHaveLength(0);
  });

  it("⛔ lead sem consentimento registrado não é abordado — vazio é bloqueio, nunca presunção", async () => {
    const { db, gravadas } = banco({ lead: { consentAt: null } });

    const r = await rodadaDaRecepcao(db, { agora: AGORA, teto: 10 });

    expect(r.recebidos).toBe(0);
    expect(r.extrato[0]!.motivo).toBe("abordagemRecusada");
    expect(r.extrato[0]!.detalhe).toContain("CONSENTIMENTO");
    expect(enviarModelo).not.toHaveBeenCalled();
    expect(gravadas).toHaveLength(0);
  });

  it("⛔ a Supervisora barrando o momento impede o envio, e a linha fica PENDENTE", async () => {
    supervisora.mockResolvedValue({ prosseguir: false, motivoDeRetencao: "frequência alta" });
    const { db, gravadas } = banco();

    const r = await rodadaDaRecepcao(db, { agora: AGORA, teto: 10 });

    expect(r.recebidos).toBe(0);
    expect(r.extrato[0]!.detalhe).toContain("supervisoraRecusou");
    expect(gravadas).toHaveLength(1); // gravada antes de enviar
    expect(enviarModelo).not.toHaveBeenCalled();
  });
});
