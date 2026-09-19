/**
 * ⭐ A FILA DE MODELOS — *"porque se uma não dá certo, a gente tenta as outras."*
 *
 * As quatro provas que o CEO pediu, com os CÓDIGOS REAIS da Meta:
 *
 *   1. primeiro cai com `132001` (erro DO MODELO) → o segundo é tentado, e a
 *      mensagem sai;
 *   2. primeiro cai com `131042` (erro DA CONTA — o que derrubou os três em
 *      18/09/2026) → **nenhum outro é tentado**, e o motivo fica gravado;
 *   3. acabaram os modelos → recusa com a LISTA do que foi tentado;
 *   4. lead de formulário **nunca** alcança `foocci_contato_inicial_01/02`,
 *      nem na última posição da fila.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { abordarLead } from "./abordar";

const enviarModelo = vi.hoisted(() => vi.fn());
const canalPronto = vi.hoisted(() => vi.fn(() => true));
const modeloAprovado = vi.hoisted(() => vi.fn());
const pool = vi.hoisted(() => vi.fn());

vi.mock("@/services/foocci-sdr/FoocciSalesChannel", async (original) => {
  const real = await original<typeof import("@/services/foocci-sdr/FoocciSalesChannel")>();
  return { ...real, enviarModeloDeVendas: enviarModelo, canalDeVendasPronto: canalPronto };
});

// Mock PARCIAL: `escolherAleatorio` continua o real, senão a ordem da fila
// deixaria de ser a ordem de produção.
vi.mock("@/services/foocci-sdr/modelosLiberados", async (original) => {
  const real = await original<typeof import("@/services/foocci-sdr/modelosLiberados")>();
  return { ...real, modelosLiberadosParaEnvio: pool };
});

vi.mock("@/services/foocci-sdr/sincronizarModelos", () => ({
  modeloAprovadoDaSala: modeloAprovado,
}));

const ambiente = { ...process.env };

const LEAD = {
  id: "L1",
  nome: "Marina Gambarini",
  whatsapp: "+5511999998888",
  optOutAt: null as Date | null,
  consentAt: new Date("2026-09-01T10:00:00Z"),
  createdAt: new Date("2026-09-01T10:00:00Z"),
  lastContactedAt: null as Date | null,
};

const AGORA = new Date("2026-09-18T13:00:00Z");

const FRIOS = [
  { nome: "foocci_contato_inicial_01", idioma: "pt_BR", variaveis: 1, corpo: "Olá! Este contato é do {{1}}, certo?", nomesParametros: [] },
  { nome: "foocci_contato_inicial_02", idioma: "pt_BR", variaveis: 1, corpo: "Olá! Falo com o {{1}} por aqui?", nomesParametros: [] },
  { nome: "foocci_contato_inicial_03", idioma: "pt_BR", variaveis: 0, corpo: "Olá! Tudo bem?", nomesParametros: [] },
];

const FORMULARIO = {
  nome: "foocci_lead_formulario_01",
  idioma: "pt_BR",
  variaveis: 1,
  corpo: "Oi {{1}}! Vi que você deixou seu contato.",
  nomesParametros: [],
};

/** Os nomes de modelo que chegaram a bater na Meta, na ordem. */
function tentados(): string[] {
  return enviarModelo.mock.calls.map((c) => (c[2] as { nome: string }).nome);
}

function recusa(codigo: string) {
  return { ok: false, error: `Meta recusou (${codigo})`, errorCode: codigo };
}

function banco(over: {
  lead?: (Partial<typeof LEAD> & { fonte?: string | null; restaurante?: string | null; cidade?: string | null }) | null;
  tentativas?: number;
  jaSairam?: number;
  /** `historicoDeAbordagens`: quando foi a última abordagem por TEMPLATE a
   *  este lead. `undefined` (padrão) = nenhuma ainda. */
  ultimaAbordagemEm?: Date;
  /** O item de prospecção do lead. `null` = não existe nenhum. */
  item?: { lote: { situacao: string; proveniencia: string | null } } | null;
  config?: {
    outboundLigado?: boolean;
    pausadoEm?: Date | null;
    horasEntreAbordagens?: number;
    limiteDiario?: number;
  } | null;
  /** Quantas abordagens de lista já saíram hoje — o teto do dia da prospecção. */
  usadosHoje?: number;
} = {}) {
  const gravadas: Array<Record<string, unknown>> = [];
  const atualizadas: Array<Record<string, unknown>> = [];
  /** `registrarSaida` também carimba `lastContactedAt` no lead. */
  const carimbos: Array<Record<string, unknown>> = [];
  /** Toda consulta feita ao banco, com os argumentos — ver o duplo abaixo. */
  const consultas: Array<Record<string, unknown>> = [];
  /** O estado da trava de repetição — ver os duplos dela mais abaixo. */
  const ritmo = new Set<string>();
  const enviadasPelaTrava = new Set<string>();
  const recusasDaTrava: Array<Record<string, unknown>> = [];

  return {
    gravadas,
    atualizadas,
    carimbos,
    consultas,
    recusasDaTrava,
    db: {
      siteLead: {
        /** `contarAbordagensDeHoje`, reusada do `selecao.ts`. */
        count: async () => over.usadosHoje ?? 0,
        /**
         * ⛔ CORRIGIDO, 11/09/2026 — este duplo devolvia `{...LEAD, ...over.lead}`
         * IGNORANDO o `select` recebido. Foi exatamente esse ponto cego que deixou
         * `cidade` faltar do `select` real de `abordarLead` sem nenhum dos 41
         * testes deste arquivo perceber: o duplo inventava o campo de volta,
         * mesmo quando o código de produção nunca o pedia ao banco.
         *
         * Agora a resposta é FILTRADA pelo `select` recebido, como o Prisma faz de
         * verdade — campo fora do `select` não volta, ponto final. "Duplo de banco
         * que ignora o argumento não testa consulta — testa o retorno que você
         * mesmo escreveu" (doutrina já registrada acima, para `itemDeProspeccao`).
         */
        findUnique: async (args: { select?: Record<string, boolean> }) => {
          consultas.push({ modelo: "siteLead.findUnique", ...args });
          if (over.lead === null) return null;
          const completo: Record<string, unknown> = { ...LEAD, ...(over.lead ?? {}) };
          if (!args.select) return completo;
          const filtrado: Record<string, unknown> = {};
          for (const campo of Object.keys(args.select)) {
            if (args.select[campo]) filtrado[campo] = completo[campo];
          }
          return filtrado;
        },
        update: async (args: { data: Record<string, unknown> }) => {
          carimbos.push(args.data);
          return {};
        },
      },
      leadMensagem: {
        count: async (args: { where: { tipo?: string } }) =>
          // A ponte conta duas coisas diferentes com o mesmo `count`: as
          // tentativas anteriores (sem `tipo`) e o ritmo (com `tipo: TEMPLATE`).
          // ⚠️ Desde 12/09/2026, `historicoDeAbordagens` (a Supervisora sobre
          // `abordar.ts`) TAMBÉM conta com `tipo: TEMPLATE`, mas nos três
          // testes que usam `jaSairam` o freio já barra antes de a Supervisora
          // rodar — nunca chegam aqui com `jaSairam` alto.
          args.where.tipo === "TEMPLATE" ? (over.jaSairam ?? 0) : (over.tentativas ?? 0),
        /** `historicoDeAbordagens` — a última abordagem por TEMPLATE a este
         *  lead. `null` por padrão: nenhum teste deste arquivo testa a
         *  Supervisora de adequação diretamente (ela tem arquivo próprio,
         *  `adequacaoDoTemplate.test.ts`); aqui só precisa não quebrar. */
        findFirst: async () => (over.ultimaAbordagemEm === undefined ? null : { ocorreuEm: over.ultimaAbordagemEm }),
        create: async (args: { data: Record<string, unknown> }) => {
          gravadas.push(args.data);
          return { id: "m1" };
        },
        update: async (args: { data: Record<string, unknown> }) => {
          atualizadas.push(args.data);
          return {};
        },
      },
      itemDeProspeccao: {
        /**
         * ⚠️ GUARDA OS ARGUMENTOS. Achado da revisão adversarial de 08/09/2026:
         * o duplo era `async () => valor`, e por isso **nenhum** dos 822 testes
         * verdes olhava para o `where`, o `orderBy` ou o `select` das consultas
         * novas. Três mutações graves sobreviviam — inclusive trocar
         * `where: { leadId }` por `where: {}`, que faria todo lead de lista
         * herdar o lote de outra pessoa.
         *
         * A regra que fica: **duplo de banco que ignora o argumento não testa
         * consulta — testa o retorno que você mesmo escreveu.**
         */
        findFirst: async (args: Record<string, unknown>) => {
          consultas.push({ modelo: "itemDeProspeccao", ...args });
          return over.item === undefined
            ? { lote: { situacao: "LIBERADO", proveniencia: "Lista pública de CNPJs de restaurantes (SP)" } }
            : over.item;
        },
      },
      prospeccaoConfig: {
        findUnique: async (args: Record<string, unknown>) => {
          consultas.push({ modelo: "prospeccaoConfig", ...args });
          return over.config === undefined
            ? { outboundLigado: true, pausadoEm: null, horasEntreAbordagens: null, limiteDiario: 250 }
            : over.config;
        },
      },

      /**
       * ⭐ A TRAVA DE REPETIÇÃO — 17/09/2026, `travaDeRepeticao.ts`.
       *
       * ⚠️ Estes três duplos **implementam a trava de verdade** (chave primária
       * e `@@unique` compostos), e não um "sempre passa". Um duplo permissivo
       * aqui seria régua verde sobre o componente errado: os 41 casos deste
       * arquivo continuariam verdes com a trava desligada.
       *
       * Cada chamada de `banco()` nasce com as tabelas VAZIAS — que é o estado
       * de um número nunca abordado. O caso da repetição tem arquivo próprio
       * (`travaDeRepeticao.test.ts`).
       */
      travaDeAbordagemRitmo: {
        updateMany: async () => ({ count: ritmo.size === 0 ? 0 : 1 }),
        create: async (args: { data: { telefoneDigits: string } }) => {
          if (ritmo.has(args.data.telefoneDigits)) throw new Error("Unique constraint failed");
          ritmo.add(args.data.telefoneDigits);
          return args.data;
        },
      },
      travaDeAbordagemEnviada: {
        create: async (args: { data: { telefoneDigits: string; impressao: string } }) => {
          const chave = `${args.data.telefoneDigits}::${args.data.impressao}`;
          if (enviadasPelaTrava.has(chave)) throw new Error("Unique constraint failed");
          enviadasPelaTrava.add(chave);
          return args.data;
        },
      },
      travaDeAbordagemRecusa: {
        create: async (args: { data: Record<string, unknown> }) => {
          recusasDaTrava.push(args.data);
          return args.data;
        },
      },
    } as never,
  };
}


beforeEach(() => {
  enviarModelo.mockReset();
  canalPronto.mockReturnValue(true);
  pool.mockResolvedValue(FRIOS);
  modeloAprovado.mockResolvedValue(null);
  process.env.FOOCCI_SDR_MODELO_IDIOMA = "pt_BR";
});

afterEach(() => {
  process.env = { ...ambiente };
});

const LEAD_FRIO = { restaurante: "Divino Sabor", fonte: "LISTA_PROSPECCAO" };

/**
 * ⭐⭐ A PROVA QUE FALTAVA — 19/09/2026, lead Jones Sartori.
 *
 * A Meta ACEITA a chamada, devolve `wamid` e a mensagem fica PENDENTE; o
 * `failed`, quando vem, vem depois, por webhook. Aceitação com `wamid` **é**
 * sucesso, e a fila encerra ali. As três provas do erro já existiam; faltava a
 * do acerto, que é onde a repetição nasceu.
 */
describe("⭐⭐ aceito com `wamid`: UM envio, e a fila encerra", () => {
  it("a Meta aceita o primeiro modelo → nenhum segundo modelo é tentado", async () => {
    const { db, gravadas, atualizadas } = banco({ lead: LEAD_FRIO });
    enviarModelo.mockResolvedValue({ ok: true, providerMessageId: "wamid.HBgNNTU..." });

    const r = await abordarLead(db, { leadId: "L1", autorUserId: "u1", agora: AGORA });

    expect(r.abordou, JSON.stringify(r)).toBe(true);
    // ⛔ A régua inteira: um envio, uma linha, nenhuma segunda volta da fila.
    expect(enviarModelo).toHaveBeenCalledTimes(1);
    expect(tentados()).toHaveLength(1);
    expect(gravadas).toHaveLength(1);
    expect(atualizadas.some((a) => a.status === "FALHOU")).toBe(false);
    expect(atualizadas.some((a) => a.status === "ENVIADA")).toBe(true);
  });

  it("⛔ PENDENTE não é falha: o `failed` que chegasse depois não reabre a fila", async () => {
    // A fila não espera webhook nenhum. Se esperasse, esta chamada teria de
    // devolver `abordou: false` — e o segundo modelo sairia.
    const { db } = banco({ lead: LEAD_FRIO });
    enviarModelo.mockResolvedValue({ ok: true, providerMessageId: "wamid.PENDENTE" });

    const r = await abordarLead(db, { leadId: "L1", autorUserId: "u1", agora: AGORA });

    expect(r.abordou).toBe(true);
    expect(enviarModelo).toHaveBeenCalledTimes(1);
  });
});

describe("⭐ erro DO MODELO: tenta o próximo", () => {
  it("primeiro cai com 132001 → o segundo é tentado e a mensagem sai", async () => {
    const { db, gravadas, atualizadas } = banco({ lead: LEAD_FRIO });
    enviarModelo
      .mockResolvedValueOnce(recusa("132001"))
      .mockResolvedValueOnce({ ok: true, providerMessageId: "wamid.2" });

    const r = await abordarLead(db, { leadId: "L1", autorUserId: "u1", agora: AGORA });

    expect(r.abordou, JSON.stringify(r)).toBe(true);
    expect(tentados()).toHaveLength(2);
    expect(tentados()[0]).not.toBe(tentados()[1]);
    // Uma linha por tentativa: a que falhou fica FALHOU com o diário, a que
    // saiu vira ENVIADA.
    expect(gravadas).toHaveLength(2);
    const falhou = atualizadas.find((a) => a.status === "FALHOU");
    expect(String(falhou?.erro)).toContain("132001");
    expect(String(falhou?.erro)).toContain("familia=doModelo");
    expect(atualizadas.some((a) => a.status === "ENVIADA")).toBe(true);
  });

  it("acabaram os modelos → recusa com a lista do que foi tentado", async () => {
    const { db } = banco({ lead: LEAD_FRIO });
    enviarModelo.mockResolvedValue(recusa("132001"));

    const r = await abordarLead(db, { leadId: "L1", autorUserId: "u1", agora: AGORA });

    expect(r.abordou).toBe(false);
    expect(r.abordou === false && r.motivo).toBe("aMetaRecusou");
    expect(tentados()).toHaveLength(3);
    const detalhe = r.abordou === false ? r.detalhe : "";
    expect(detalhe).toContain("acabaram os modelos");
    for (const m of FRIOS) expect(detalhe).toContain(m.nome);
    // A ORDEM fica legível: 1), 2), 3).
    expect(detalhe).toContain("1)");
    expect(detalhe).toContain("3)");
  });
});

describe("⛔ erro DA CONTA: para, e não queima o número", () => {
  it("primeiro cai com 131042 → nenhum outro é tentado, e o motivo fica gravado", async () => {
    const { db, atualizadas } = banco({ lead: LEAD_FRIO });
    enviarModelo.mockResolvedValue(recusa("131042"));

    const r = await abordarLead(db, { leadId: "L1", autorUserId: "u1", agora: AGORA });

    expect(r.abordou).toBe(false);
    expect(tentados()).toHaveLength(1);
    const detalhe = r.abordou === false ? r.detalhe : "";
    expect(detalhe).toContain("PAROU");
    expect(detalhe).toContain("131042");
    expect(detalhe).toContain("familia=daConta");
    expect(String(atualizadas.find((a) => a.status === "FALHOU")?.erro)).toContain("131042");
  });

  it("⛔ código desconhecido também PARA — fail-closed", async () => {
    const { db } = banco({ lead: LEAD_FRIO });
    enviarModelo.mockResolvedValue({ ok: false, error: "algo novo", errorCode: "999999" });

    const r = await abordarLead(db, { leadId: "L1", autorUserId: "u1", agora: AGORA });

    expect(r.abordou).toBe(false);
    expect(tentados()).toHaveLength(1);
    expect(r.abordou === false && r.detalhe).toContain("familia=desconhecido");
  });
});

describe("⛔ a trava de grupo não afrouxa com a fila", () => {
  it("lead de formulário nunca tenta contato_inicial_01/02, nem na última posição", async () => {
    pool.mockResolvedValue([FORMULARIO, ...FRIOS]);
    const { db } = banco({
      lead: { restaurante: "Divino Sabor", fonte: "CAMPANHA_PAGA" },
    });
    enviarModelo.mockResolvedValue(recusa("132001"));

    const r = await abordarLead(db, { leadId: "L1", autorUserId: "u1", agora: AGORA });

    expect(r.abordou).toBe(false);
    expect(tentados()).not.toContain("foocci_contato_inicial_01");
    expect(tentados()).not.toContain("foocci_contato_inicial_02");
    expect(tentados()).toContain("foocci_lead_formulario_01");
    // ⛔ NENHUMA ponte entre os grupos — nem o `_03`. "Neutro" é julgamento
    // nosso sobre o texto; quem preencheu o formulário lê uma abordagem a
    // desconhecido. Sem modelo morno, não sai nada (fail-closed).
    expect(tentados()).not.toContain("foocci_contato_inicial_03");
  });
});
