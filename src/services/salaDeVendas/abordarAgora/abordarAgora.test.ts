/**
 * A porta "abordar agora", medida no que ela promete e no que ela NÃO afrouxa.
 *
 *   1. Primeiro modelo recusado pela Meta → o SEGUNDO é tentado, e sai.
 *   2. Quem pediu silêncio não recebe — nem com `ignorarJaContatado: true`.
 *   3. Modelo cuja variável não tem fonte é PULADO, e nunca sai com `{{1}}`
 *      vazio: o próximo da ordem é que sai.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { abordarAgora } from "./abordarAgora";
import { perdoarJaContatado } from "../abordar";

const enviarModelo = vi.hoisted(() => vi.fn());
const canalPronto = vi.hoisted(() => vi.fn(() => true));
const liberados = vi.hoisted(() => vi.fn());

vi.mock("@/services/foocci-sdr/FoocciSalesChannel", async (original) => {
  const real = await original<typeof import("@/services/foocci-sdr/FoocciSalesChannel")>();
  return { ...real, enviarModeloDeVendas: enviarModelo, canalDeVendasPronto: canalPronto };
});

vi.mock("@/services/foocci-sdr/modelosLiberados", async (original) => {
  const real = await original<typeof import("@/services/foocci-sdr/modelosLiberados")>();
  return { ...real, modelosLiberadosParaEnvio: liberados };
});

const AGORA = new Date("2026-09-07T13:00:00Z"); // segunda, 10h em São Paulo.

const LEAD = {
  id: "L1",
  codigo: "337AN",
  nome: "Bruno Almeida",
  whatsapp: "+5511999998888",
  optOutAt: null as Date | null,
  consentAt: new Date("2026-09-01T10:00:00Z"),
  createdAt: new Date("2026-09-01T10:00:00Z"),
  lastContactedAt: null as Date | null,
  restaurante: null as string | null,
  fonte: "CAMPANHA_PAGA" as string | null,
  cidade: null as string | null,
};

/** Duplo de banco enxuto — o mesmo molde de `abordar.test.ts`. */
function banco(over: Partial<typeof LEAD> & { tentativas?: number } = {}) {
  const completo = { ...LEAD, ...over };
  const gravadas: Array<Record<string, unknown>> = [];
  const enviadasPelaTrava = new Set<string>();
  const ritmo = new Set<string>();

  return {
    gravadas,
    db: {
      siteLead: {
        count: async () => 0,
        findUnique: async (args: { select?: Record<string, boolean> }) => {
          if (!args.select) return completo as Record<string, unknown>;
          const filtrado: Record<string, unknown> = {};
          for (const campo of Object.keys(args.select)) {
            if (args.select[campo]) filtrado[campo] = (completo as Record<string, unknown>)[campo];
          }
          return filtrado;
        },
        findMany: async (args: { where: { codigo: { in: string[] } } }) =>
          args.where.codigo.in.includes(completo.codigo) ? [{ id: completo.id, codigo: completo.codigo }] : [],
        update: async () => ({}),
      },
      leadMensagem: {
        count: async () => over.tentativas ?? 0,
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
        /** A devolução da reserva quando a entrega falha — sem ela, a recusa
         *  da Meta no `_01` bloquearia o `_02` por "já falei com essa pessoa". */
        deleteMany: async (args: { where: { telefoneDigits: string; impressao: string } }) => {
          const chave = `${args.where.telefoneDigits}::${args.where.impressao}`;
          return { count: enviadasPelaTrava.delete(chave) ? 1 : 0 };
        },
      },
      travaDeAbordagemRecusa: { create: async (args: { data: unknown }) => args.data },
      supervisoraAvaliacao: { create: async (args: { data: unknown }) => args.data },
    } as never,
  };
}

/** O que a Meta tem aprovado, neste teste. `_02` pede o nome do restaurante. */
const MODELOS = [
  { nome: "foocci_contato_inicial_01", idioma: "pt_BR", variaveis: 1, corpo: "Olá! Este contato é do {{1}}, certo?", nomesParametros: [] },
  { nome: "foocci_contato_inicial_02", idioma: "pt_BR", variaveis: 2, corpo: "Olá! Falo com o {{1}} do {{2}}?", nomesParametros: [] },
  { nome: "foocci_contato_inicial_03", idioma: "pt_BR", variaveis: 0, corpo: "Olá! Tudo bem?", nomesParametros: [] },
];

const ORDEM = ["foocci_contato_inicial_01", "foocci_contato_inicial_02", "foocci_contato_inicial_03"];

beforeEach(() => {
  enviarModelo.mockReset();
  enviarModelo.mockResolvedValue({ ok: true, providerMessageId: "wamid.X" });
  canalPronto.mockReturnValue(true);
  liberados.mockResolvedValue(MODELOS);
});

describe("a ordem dos modelos", () => {
  it("⭐ primeiro modelo recusado pela Meta → o segundo é tentado", async () => {
    // `_01` é recusado; `_02` passa. A trava de repetição devolve a reserva do
    // `_01`, então o `_02` não é barrado por "já falei com essa pessoa".
    enviarModelo.mockImplementation(async (_d: unknown, _t: unknown, m: { nome: string }) =>
      m.nome === "foocci_contato_inicial_01"
        ? { ok: false, error: "META_131042 · pagamento" }
        : { ok: true, providerMessageId: "wamid.OK" },
    );

    const { db } = banco({ restaurante: "Cantina do Bruno" });
    const r = await abordarAgora(db, { codigos: ["337AN"], modelos: ORDEM, autorUserId: "u1", agora: AGORA });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const lead = r.leads[0]!;
    expect(lead.abordou).toBe(true);
    expect(lead.modeloQueSaiu).toBe("foocci_contato_inicial_02");
    expect(lead.tentativas.map((t) => t.modelo)).toEqual([
      "foocci_contato_inicial_01",
      "foocci_contato_inicial_02",
    ]);
    // O erro CRU da Meta chega ao relatório — é a informação pela qual a porta existe.
    expect(lead.tentativas[0]!.motivo).toBe("aMetaRecusou");
    expect(lead.tentativas[0]!.detalhe).toContain("META_131042");
  });

  it("para na primeira que sai — não manda três mensagens ao mesmo lead", async () => {
    const { db } = banco({ restaurante: "Cantina do Bruno" });
    const r = await abordarAgora(db, { codigos: ["337AN"], modelos: ORDEM, autorUserId: "u1", agora: AGORA });

    expect(r.ok && r.leads[0]!.tentativas).toHaveLength(1);
    expect(enviarModelo).toHaveBeenCalledTimes(1);
  });
});

describe("⛔ o que `ignorarJaContatado` NÃO afrouxa", () => {
  it("⛔ quem pediu silêncio não recebe, nem com ignorarJaContatado: true", async () => {
    const { db } = banco({ optOutAt: new Date("2026-09-05T10:00:00Z"), restaurante: "Cantina do Bruno" });

    const r = await abordarAgora(db, {
      codigos: ["337AN"],
      modelos: ORDEM,
      ignorarJaContatado: true,
      autorUserId: "u1",
      agora: AGORA,
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.leads[0]!.abordou).toBe(false);
    expect(r.leads[0]!.tentativas[0]!.motivo).toBe("portaoRecusou");
    expect(r.leads[0]!.tentativas[0]!.detalhe).toContain("LEAD_OPT_OUT");
    // E o que importa de verdade: NADA saiu, por modelo nenhum da ordem.
    expect(enviarModelo).not.toHaveBeenCalled();
  });

  it("perdoa APENAS teto de tentativas e descanso — a lista é de inclusão", () => {
    const recusa = (reason: "TETO_DE_TENTATIVAS" | "DESCANSO_ATIVO" | "LEAD_OPT_OUT" | "LEAD_TELEFONE_INVALIDO") =>
      ({ sendable: false as const, reason, detail: "x" });

    expect(perdoarJaContatado(recusa("TETO_DE_TENTATIVAS"), true).sendable).toBe(true);
    expect(perdoarJaContatado(recusa("DESCANSO_ATIVO"), true).sendable).toBe(true);
    expect(perdoarJaContatado(recusa("LEAD_OPT_OUT"), true).sendable).toBe(false);
    expect(perdoarJaContatado(recusa("LEAD_TELEFONE_INVALIDO"), true).sendable).toBe(false);
    // Sem a chave, nada é perdoado.
    expect(perdoarJaContatado(recusa("TETO_DE_TENTATIVAS"), false).sendable).toBe(false);
  });

  it("⭐ com a chave, o lead já contatado é reabordado; sem ela, o portão barra", async () => {
    // Duas tentativas já saíram (teto) e a última foi há uma hora (descanso).
    const jaContatado = {
      tentativas: 2,
      lastContactedAt: new Date("2026-09-07T12:00:00Z"),
      restaurante: "Cantina do Bruno",
    };

    const sem = await abordarAgora(banco(jaContatado).db, {
      codigos: ["337AN"], modelos: ORDEM, autorUserId: "u1", agora: AGORA,
    });
    expect(sem.ok && sem.leads[0]!.abordou).toBe(false);
    expect(sem.ok && sem.leads[0]!.tentativas[0]!.detalhe).toContain("TETO_DE_TENTATIVAS");

    const com = await abordarAgora(banco(jaContatado).db, {
      codigos: ["337AN"], modelos: ORDEM, ignorarJaContatado: true, autorUserId: "u1", agora: AGORA,
    });
    expect(com.ok && com.leads[0]!.abordou).toBe(true);
  });
});

describe("⛔ variável sem fonte", () => {
  it("⭐ modelo cuja variável não tem dado é PULADO — nunca sai com {{1}} vazio", async () => {
    // Lead de Lead Ads: tem o nome da pessoa, NÃO tem o nome do restaurante.
    // `_01` pede uma variável (a saudação, que existe) → sai.
    // Forçamos a ordem a começar pelo `_02`, que pede DUAS — a segunda é o
    // restaurante, e ele não existe.
    const { db } = banco({ restaurante: null });
    const r = await abordarAgora(db, {
      codigos: ["337AN"],
      modelos: ["foocci_contato_inicial_02", "foocci_contato_inicial_01"],
      autorUserId: "u1",
      agora: AGORA,
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [pulado, saiu] = r.leads[0]!.tentativas;
    expect(pulado!.motivo).toBe("semDadoParaOModelo");
    expect(pulado!.detalhe).toContain("nome do restaurante");
    expect(saiu!.enviou).toBe(true);

    // ⛔ A prova que importa: o ÚNICO envio foi o do `_01`, e o `{{1}}` dele
    // levou o nome da pessoa — nunca vazio, nunca "undefined".
    expect(enviarModelo).toHaveBeenCalledTimes(1);
    const modelo = enviarModelo.mock.calls[0]![2] as { nome: string; parametros: string[] };
    expect(modelo.nome).toBe("foocci_contato_inicial_01");
    expect(modelo.parametros).toEqual(["Bruno"]);
  });

  it("modelo que não está liberado não vira sorteio de consolação", async () => {
    const { db } = banco({ restaurante: "Cantina do Bruno" });
    const r = await abordarAgora(db, {
      codigos: ["337AN"],
      modelos: ["foocci_modelo_que_nao_existe", "foocci_contato_inicial_03"],
      autorUserId: "u1",
      agora: AGORA,
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.leads[0]!.tentativas[0]!.motivo).toBe("modeloNaoLiberado");
    expect(r.leads[0]!.modeloQueSaiu).toBe("foocci_contato_inicial_03");
  });
});

describe("a entrada", () => {
  it("código que não existe vira linha de erro, e não lead a menos em silêncio", async () => {
    const { db } = banco();
    const r = await abordarAgora(db, { codigos: ["NAOEXISTE"], modelos: ORDEM, autorUserId: "u1", agora: AGORA });
    expect(r.ok && r.leads[0]!.erro).toContain("NAOEXISTE");
    expect(enviarModelo).not.toHaveBeenCalled();
  });

  it("sem `modelos`, recusa — esta porta existe para escolher o texto", async () => {
    const { db } = banco();
    const r = await abordarAgora(db, { codigos: ["337AN"], modelos: [], autorUserId: "u1", agora: AGORA });
    expect(r.ok).toBe(false);
  });
});
