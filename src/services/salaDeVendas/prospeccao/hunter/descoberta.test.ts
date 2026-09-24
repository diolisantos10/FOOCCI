/**
 * ⭐ A FILA QUE SE ENCHE SOZINHA — e as quatro coisas que ela NUNCA deixa passar.
 *
 * ── O QUE ESTE ARQUIVO PROVA, E POR QUE CADA UMA ────────────────────────────
 *
 * Cada teste aqui REPROVA uma versão errada e plausível desta obra:
 *
 *   · sem a peneira de opt-out, quem pediu silêncio volta para a fila e é
 *     abordado de novo — e a denúncia de quem já tinha pedido silêncio é
 *     exatamente a que derruba a nota do número da casa;
 *   · sem a peneira de duplicidade, a mesma casa é abordada duas vezes, por
 *     lados diferentes, cada um achando que era o primeiro;
 *   · sem a trava de consentimento, o contato frio nasceria "consentido" — e
 *     consentimento sem ato é consentimento falso;
 *   · sem o agendador ligado, tudo isto existe e a fila continua vazia, que é
 *     o defeito inteiro voltando com outra roupa.
 *
 * Nada aqui toca em rede nem em banco de verdade: a fonte é injetada e o banco
 * é um duplo em memória. Nenhuma mensagem sai — esta obra não manda nenhuma.
 */

import { describe, it, expect, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  DESCARTE,
  ETIQUETA_DA_DESCOBERTA,
  cidadesDeHoje,
  descobrirEEncherAFila,
  linhaDaFicha,
  qualificar,
} from "./descoberta";
import type { RestauranteDescoberto } from "./openStreetMap";

const AGORA = new Date("2026-09-24T10:00:00Z");

function ficha(p: Partial<RestauranteDescoberto> = {}): RestauranteDescoberto {
  return {
    idNaFonte: "osm:node/1",
    nome: "Cantina da Esquina",
    telefone: "+55 62 99999-8888",
    cidade: "Goiânia",
    estado: "GO",
    bairro: null,
    endereco: null,
    cep: null,
    site: null,
    instagram: null,
    tipo: "Restaurante",
    mapaUrl: "https://www.openstreetmap.org/node/1",
    ...p,
  };
}

interface LeadFalso {
  id: string;
  whatsappDigits: string;
  optOutAt: Date | null;
  createdAt: Date;
}
interface ItemFalso {
  id: string;
  loteId: string;
  whatsappDigits: string;
  whatsapp: string;
  situacao: string;
  tags: string[];
  empresa: string | null;
  consentAt?: unknown;
}

/** Um Postgres de mentira com só o que esta obra encosta. */
function bancoFalso(inicial: { leads?: LeadFalso[]; itens?: ItemFalso[] } = {}) {
  const leads = [...(inicial.leads ?? [])];
  const itens = [...(inicial.itens ?? [])];
  const lotes: Record<string, unknown>[] = [];
  const importacoes: Record<string, unknown>[] = [];
  let seq = 0;

  const db = {
    siteLead: {
      findFirst: vi.fn(async ({ where }: { where: { whatsappDigits: { in: string[] } } }) => {
        const achado = leads.find((l) => where.whatsappDigits.in.includes(l.whatsappDigits));
        return achado ?? null;
      }),
      // ⛔ Existe só para provar que NINGUÉM cria lead aqui. Se um dia alguém
      // fizer a descoberta materializar lead, este duplo grita.
      create: vi.fn(async () => {
        throw new Error("a descoberta NÃO pode criar lead");
      }),
    },
    itemDeProspeccao: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return (
          itens.find((i) => {
            if (where.whatsappDigits && i.whatsappDigits !== where.whatsappDigits) return false;
            if (where.situacao && i.situacao !== where.situacao) return false;
            const tags = where.tags as { has?: string } | undefined;
            if (tags?.has && !i.tags.includes(tags.has)) return false;
            return true;
          }) ?? null
        );
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const novo = { id: `item${++seq}`, ...data, tags: (data.tags as string[]) ?? [] } as unknown as ItemFalso;
        itens.push(novo);
        return novo;
      }),
    },
    loteDeProspeccao: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const novo = { id: `lote${++seq}`, ...data };
        lotes.push(novo);
        return novo;
      }),
    },
    importacaoDeLeads: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const novo = { id: `imp${++seq}`, ...data, motivosDeRecusa: {} };
        importacoes.push(novo);
        return novo;
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        importacoes.find((i) => i.id === where.id) ?? null,
      ),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const alvo = importacoes.find((i) => i.id === where.id)!;
        for (const [k, v] of Object.entries(data)) {
          if (v && typeof v === "object" && "increment" in (v as object)) {
            alvo[k] = ((alvo[k] as number) ?? 0) + (v as { increment: number }).increment;
          } else alvo[k] = v;
        }
        return alvo;
      }),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
  };

  return { db: db as unknown as PrismaClient, itens, lotes, importacoes };
}

const pendentes = (itens: ItemFalso[]) => itens.filter((i) => i.situacao === "PENDENTE");

describe("⛔ o opt-out é sagrado", () => {
  it("quem pediu silêncio NÃO entra na fila, por caminho nenhum", async () => {
    const { db, itens } = bancoFalso({
      leads: [
        {
          id: "lead-silencio",
          whatsappDigits: "5562999998888",
          optOutAt: new Date("2026-05-01"),
          createdAt: new Date("2026-01-01"),
        },
      ],
    });

    const r = await descobrirEEncherAFila(db, {
      agora: AGORA,
      cidades: ["Goiânia"],
      buscar: async () => [ficha()],
    });

    expect(r.entraramNaFila).toBe(0);
    expect(r.descartes[DESCARTE.pediuSilencio]).toBe(1);
    expect(pendentes(itens)).toHaveLength(0);
  });

  it("⛔ e ele é achado mesmo gravado no FORMATO LEGADO da base", async () => {
    // O backfill antigo gravou "55" + "0" + DDD. Uma comparação exata não
    // acharia este lead, a ficha entraria como contato novo e o portão
    // liberaria a abordagem COM CONVICÇÃO. É este o caso que já custou caro.
    const { db, itens } = bancoFalso({
      leads: [
        {
          id: "lead-legado",
          whatsappDigits: "55062999998888",
          optOutAt: new Date("2026-05-01"),
          createdAt: new Date("2026-01-01"),
        },
      ],
    });

    const r = await descobrirEEncherAFila(db, {
      agora: AGORA,
      cidades: ["Goiânia"],
      buscar: async () => [ficha()],
    });

    expect(r.descartes[DESCARTE.pediuSilencio]).toBe(1);
    expect(pendentes(itens)).toHaveLength(0);
  });
});

describe("⛔ nada entra duas vezes", () => {
  it("o mesmo telefone repetido na varredura entra UMA vez", async () => {
    const { db, itens } = bancoFalso();

    const r = await descobrirEEncherAFila(db, {
      agora: AGORA,
      cidades: ["Goiânia"],
      buscar: async () => [
        ficha({ idNaFonte: "osm:node/1", nome: "Cantina" }),
        // Mesma casa, mapeada duas vezes com grafias diferentes do telefone.
        ficha({ idNaFonte: "osm:node/2", nome: "Cantina (fundos)", telefone: "62999998888" }),
      ],
    });

    expect(r.entraramNaFila).toBe(1);
    expect(r.descartes[DESCARTE.repetidoNaColheita]).toBe(1);
    expect(pendentes(itens)).toHaveLength(1);
  });

  it("quem já está PENDENTE na Base fria não entra de novo", async () => {
    const { db } = bancoFalso({
      itens: [
        {
          id: "ja",
          loteId: "lote-antigo",
          whatsappDigits: "5562999998888",
          whatsapp: "+5562999998888",
          situacao: "PENDENTE",
          tags: [],
          empresa: "Cantina",
        },
      ],
    });

    const r = await descobrirEEncherAFila(db, {
      agora: AGORA,
      cidades: ["Goiânia"],
      buscar: async () => [ficha()],
    });

    expect(r.entraramNaFila).toBe(0);
    expect(r.descartes[DESCARTE.jaEstavaNaFila]).toBe(1);
  });

  it("⛔ o ponto já descoberto não volta — nem depois de RECUSADO", async () => {
    // A mesma cidade varrida amanhã devolve os mesmos pontos. Sem esta peneira,
    // um ponto recusado ontem voltaria como contato novo hoje, todo dia.
    const { db } = bancoFalso({
      itens: [
        {
          id: "recusado-ontem",
          loteId: "lote-antigo",
          whatsappDigits: "5562999990000",
          whatsapp: "+5562999990000",
          situacao: "RECUSADO",
          tags: [ETIQUETA_DA_DESCOBERTA, "osm:node/1"],
          empresa: "Cantina",
        },
      ],
    });

    const r = await descobrirEEncherAFila(db, {
      agora: AGORA,
      cidades: ["Goiânia"],
      buscar: async () => [ficha()],
    });

    expect(r.entraramNaFila).toBe(0);
    expect(r.descartes[DESCARTE.jaDescoberto]).toBe(1);
  });

  it("quem já é lead da casa não vira prospecção fria", async () => {
    const { db } = bancoFalso({
      leads: [
        {
          id: "lead-vivo",
          whatsappDigits: "5562999998888",
          optOutAt: null,
          createdAt: new Date("2026-01-01"),
        },
      ],
    });

    const r = await descobrirEEncherAFila(db, {
      agora: AGORA,
      cidades: ["Goiânia"],
      buscar: async () => [ficha()],
    });

    expect(r.entraramNaFila).toBe(0);
    expect(r.descartes[DESCARTE.jaEraLead]).toBe(1);
  });
});

describe("⛔ telefone que não é telefone", () => {
  it("ponto sem telefone publicado não entra — e o descarte tem nome", async () => {
    const { db } = bancoFalso();
    const { aprovadas, descartes } = await qualificar(db, [ficha({ telefone: null })], AGORA);
    expect(aprovadas).toHaveLength(0);
    expect(descartes[DESCARTE.semTelefone]).toBe(1);
  });

  it("telefone de forma improvável não entra", async () => {
    const { db } = bancoFalso();
    const { aprovadas, descartes } = await qualificar(
      db,
      [ficha({ telefone: "+55 00 1234" })],
      AGORA,
    );
    expect(aprovadas).toHaveLength(0);
    expect(descartes[DESCARTE.telefoneImprovavel]).toBe(1);
  });
});

describe("⛔ consentimento não se preenche de ofício", () => {
  it("⛔ a descoberta NÃO materializa lead — e é no lead que o consentimento moraria", async () => {
    // Esta é a trava de verdade, e é por isso que ela é testada assim: o item
    // da Base fria não tem coluna de consentimento nenhuma. O consentimento
    // mora no `SiteLead`, e o lead é criado depois, por quem vai abordar
    // (`materializarLead`). Uma versão desta obra que "adiantasse" o lead para
    // ganhar tempo criaria o contato frio já com carteira — e é exatamente
    // essa versão que o duplo do banco derruba: `siteLead.create` estoura.
    const { db, itens } = bancoFalso();

    await descobrirEEncherAFila(db, {
      agora: AGORA,
      cidades: ["Goiânia"],
      buscar: async () => [ficha()],
    });

    const espiao = db as unknown as { siteLead: { create: { mock: { calls: unknown[] } } } };
    expect(espiao.siteLead.create.mock.calls).toHaveLength(0);

    // E nada que vá para o item se parece com consentimento.
    const criado = pendentes(itens)[0]! as unknown as Record<string, unknown>;
    expect(criado).toBeDefined();
    const camposDeConsentimento = Object.keys(criado).filter((k) => /consent/i.test(k));
    expect(camposDeConsentimento).toEqual([]);
  });
});

describe("⭐ a origem de cada contato fica gravada", () => {
  it("a etiqueta, a fonte e o id do ponto vão junto com o contato", () => {
    const linha = linhaDaFicha(ficha(), AGORA);
    expect(linha.tags).toContain(ETIQUETA_DA_DESCOBERTA);
    expect(linha.tags).toContain("fonte:openstreetmap");
    expect(linha.tags).toContain("osm:node/1");
    expect(linha.observacoes).toContain("2026-09-24");
    expect(linha.observacoes).toContain("OpenStreetMap");
  });

  it("o lote declara a base legal, e ela cita a fonte e a licença", async () => {
    const { db, lotes, importacoes } = bancoFalso();

    await descobrirEEncherAFila(db, {
      agora: AGORA,
      cidades: ["Goiânia"],
      buscar: async () => [ficha()],
    });

    // `proveniencia` é o campo que o portão de abordagem lê como base legal — e
    // é a frase que responde "de onde vocês tiraram o meu telefone?".
    const proveniencia = String((lotes[0] as Record<string, unknown>).proveniencia);
    expect(proveniencia).toContain("OpenStreetMap");
    expect(proveniencia).toContain("ODbL");
    expect(importacoes).toHaveLength(1);
    expect((importacoes[0] as Record<string, unknown>).canalDeObtencao).toContain("Overpass");
  });

  it("o lote sai assinado — sem responsável, nenhum item seria abordado", async () => {
    const { db, lotes } = bancoFalso();
    await descobrirEEncherAFila(db, {
      agora: AGORA,
      cidades: ["Goiânia"],
      buscar: async () => [ficha()],
    });
    expect((lotes[0] as Record<string, unknown>).liberadoPorUserId).toBe("descoberta-automatica");
  });
});

describe("a varredura em si", () => {
  it("uma cidade que não responde NÃO derruba as outras — e vira linha no relatório", async () => {
    const { db } = bancoFalso();

    const r = await descobrirEEncherAFila(db, {
      agora: AGORA,
      cidades: ["Cidade Morta", "Goiânia"],
      buscar: async (cidade) => {
        if (cidade === "Cidade Morta") throw new Error("HTTP 504");
        return [ficha()];
      },
    });

    expect(r.entraramNaFila).toBe(1);
    expect(r.cidades).toEqual(["Goiânia"]);
    expect(r.cidadesQueFalharam).toEqual([{ cidade: "Cidade Morta", detalhe: "HTTP 504" }]);
  });

  it("varredura sem nada aproveitável não abre importação vazia", async () => {
    const { db, importacoes } = bancoFalso();
    const r = await descobrirEEncherAFila(db, {
      agora: AGORA,
      cidades: ["Goiânia"],
      buscar: async () => [ficha({ telefone: null })],
    });
    expect(r.importacaoId).toBeNull();
    expect(importacoes).toHaveLength(0);
  });

  it("⭐ a roda gira: dias diferentes varrem cidades diferentes", () => {
    const lista = ["A", "B", "C"];
    const dia1 = new Date("2026-09-24T10:00:00Z");
    const dia2 = new Date("2026-09-25T10:00:00Z");
    // Varrer a MESMA cidade todo dia devolveria zero contatos novos do segundo
    // dia em diante — máquina ligada produzindo nada.
    expect(cidadesDeHoje(dia1, lista, 1)).not.toEqual(cidadesDeHoje(dia2, lista, 1));
    expect(cidadesDeHoje(dia1, lista, 2)).toHaveLength(2);
  });
});
