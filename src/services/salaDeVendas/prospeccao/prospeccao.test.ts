/**
 * As travas da prospecção.
 *
 * O fio deste arquivo: **a lista é o ativo, e todo teste aqui existe para provar
 * que ela não é queimada por descuido.** Cada caso é uma forma concreta de
 * queimar — abordar quem pediu silêncio, abordar duas vezes, criar dois donos
 * para a mesma pessoa, estourar o teto, ou gravar consentimento que não houve.
 */

import { describe, it, expect, vi } from "vitest";
import {
  importarLote,
  liberarLote,
  ListaGrandeDemais,
  ProvenienciaAusente,
  MAX_LINHAS_POR_IMPORTACAO,
} from "./lote";
import { montarFilaDeProspeccao } from "./selecao";
import { avaliarAbordagemDeProspeccao } from "@/services/foocci-sdr/LeadContactSafety";

/** Quarta-feira, 14h em São Paulo — dentro da janela, para não misturar causas. */
const AGORA = new Date("2026-09-02T17:00:00Z");

// ═══════════════════════════════════════════════════════════════════════════
// O PORTÃO DA ABORDAGEM FRIA
// ═══════════════════════════════════════════════════════════════════════════

const BASE = {
  telefone: "11987654321",
  optOutAt: null,
  tentativas: 0,
  ultimoContatoEm: null,
  historicoConhecido: true,
  canalPronto: true,
  prospeccaoLiberada: true,
  baseLegalDeclarada: "Lista pública de restaurantes de Curitiba, coletada em 08/2026.",
  agora: AGORA,
};

describe("portão da abordagem fria", () => {
  it("libera quando tudo está declarado e dentro das regras", () => {
    expect(avaliarAbordagemDeProspeccao(BASE).sendable).toBe(true);
  });

  it("⛔ opt-out é terminal, e vence até a base legal mais bem escrita", () => {
    const d = avaliarAbordagemDeProspeccao({ ...BASE, optOutAt: new Date("2026-01-01") });
    expect(d.sendable).toBe(false);
    expect(d.reason).toBe("LEAD_OPT_OUT");
  });

  it("⛔ sem base legal declarada não aborda ninguém", () => {
    // O caso que este teste protege: alguém importa uma planilha achada num
    // grupo, deixa a proveniência vazia e libera. Sem esta trava, o sistema
    // abordaria estranhos sem ninguém conseguir responder de onde vieram.
    const d = avaliarAbordagemDeProspeccao({ ...BASE, baseLegalDeclarada: "   " });
    expect(d.sendable).toBe(false);
    expect(d.reason).toBe("PROSPECCAO_SEM_BASE_LEGAL");
  });

  it("⛔ prospecção desligada barra, mesmo com tudo o resto perfeito", () => {
    const d = avaliarAbordagemDeProspeccao({ ...BASE, prospeccaoLiberada: false });
    expect(d.sendable).toBe(false);
    expect(d.reason).toBe("PROSPECCAO_DESLIGADA");
  });

  it("⛔ histórico desconhecido é NÃO — zero não é histórico limpo", () => {
    const d = avaliarAbordagemDeProspeccao({ ...BASE, historicoConhecido: false });
    expect(d.sendable).toBe(false);
    expect(d.reason).toBe("HISTORICO_DESCONHECIDO");
  });

  it("⛔ o teto de insistência vale igual ao do lead que nos procurou", () => {
    const d = avaliarAbordagemDeProspeccao({ ...BASE, tentativas: 2 });
    expect(d.sendable).toBe(false);
    expect(d.reason).toBe("TETO_DE_TENTATIVAS");
  });

  it("⛔ descanso entre tentativas é respeitado", () => {
    const d = avaliarAbordagemDeProspeccao({
      ...BASE,
      tentativas: 1,
      ultimoContatoEm: new Date(AGORA.getTime() - 2 * 3_600_000),
    });
    expect(d.sendable).toBe(false);
    expect(d.reason).toBe("DESCANSO_ATIVO");
  });

  it("⛔ canal não pronto barra antes de qualquer coisa de negócio", () => {
    const d = avaliarAbordagemDeProspeccao({ ...BASE, canalPronto: false });
    expect(d.sendable).toBe(false);
    expect(d.reason).toBe("CANAL_INDISPONIVEL");
  });

  it("⛔ fora da janela não aborda (domingo de manhã)", () => {
    const domingo = new Date("2026-09-06T13:00:00Z");
    const d = avaliarAbordagemDeProspeccao({ ...BASE, agora: domingo });
    expect(d.sendable).toBe(false);
    expect(d.reason).toBe("FORA_DA_JANELA");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// IMPORTAÇÃO
// ═══════════════════════════════════════════════════════════════════════════

function dbDeImportacao(leadsExistentes: Record<string, string> = {}) {
  const itensCriados: any[] = [];
  return {
    itensCriados,
    db: {
      loteDeProspeccao: {
        create: vi.fn().mockResolvedValue({ id: "lote1" }),
        findUnique: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
      },
      itemDeProspeccao: {
        create: vi.fn(async ({ data }: any) => {
          itensCriados.push(data);
          return { id: `i${itensCriados.length}` };
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      siteLead: {
        findFirst: vi.fn(async ({ where }: any) => {
          const id = leadsExistentes[where.whatsappDigits];
          return id ? { id } : null;
        }),
      },
    } as any,
  };
}

describe("importar a lista", () => {
  it("⛔ recusa lote sem proveniência declarada", async () => {
    const { db } = dbDeImportacao();
    await expect(
      importarLote(db, { nome: "Curitiba", proveniencia: "  ", linhas: [] }),
    ).rejects.toBeInstanceOf(ProvenienciaAusente);
  });

  it("⛔ recusa lista maior que o teto por lote", async () => {
    const { db } = dbDeImportacao();
    const linhas = Array.from({ length: MAX_LINHAS_POR_IMPORTACAO + 1 }, (_, i) => ({
      whatsapp: `1198765${String(i).padStart(4, "0")}`,
    }));
    await expect(
      importarLote(db, { nome: "Gigante", proveniencia: "lista", linhas }),
    ).rejects.toBeInstanceOf(ListaGrandeDemais);
  });

  it("o mesmo telefone repetido no arquivo entra uma vez só", async () => {
    const { db, itensCriados } = dbDeImportacao();
    const r = await importarLote(db, {
      nome: "Curitiba",
      proveniencia: "Lista pública, 08/2026",
      linhas: [
        { whatsapp: "(11) 98765-4321", nome: "Cantina A" },
        { whatsapp: "11987654321", nome: "Cantina A (de novo)" },
      ],
    });

    expect(r.recebidas).toBe(2);
    expect(r.repetidasNoArquivo).toBe(1);
    expect(itensCriados).toHaveLength(1);
  });

  it("⭐ quem já é lead entra como DUPLICADO e aponta para a carteira existente", async () => {
    // O erro que este teste evita é o mais caro da operação: prospectar como
    // estranho alguém que já está conversando com a gente — dois donos, duas
    // abordagens, e o cliente percebendo que a casa não se fala.
    const { db, itensCriados } = dbDeImportacao({ "5511987654321": "lead-existente" });
    const r = await importarLote(db, {
      nome: "Curitiba",
      proveniencia: "Lista pública, 08/2026",
      linhas: [{ whatsapp: "11987654321" }],
    });

    expect(r.jaEramLead).toBe(1);
    expect(r.aceitas).toBe(0);
    expect(itensCriados[0].situacao).toBe("DUPLICADO");
    expect(itensCriados[0].leadId).toBe("lead-existente");
  });

  it("telefone impossível é RECUSADO com motivo, e não some", async () => {
    const { db, itensCriados } = dbDeImportacao();
    const r = await importarLote(db, {
      nome: "Curitiba",
      proveniencia: "Lista pública, 08/2026",
      linhas: [{ whatsapp: "123" }],
    });

    expect(r.invalidas).toBe(1);
    expect(itensCriados[0].situacao).toBe("RECUSADO");
    expect(itensCriados[0].motivo).toBeTruthy();
  });

  it("o lote nasce RASCUNHO — importar não autoriza abordar", async () => {
    const { db } = dbDeImportacao();
    await importarLote(db, {
      nome: "Curitiba",
      proveniencia: "Lista pública, 08/2026",
      linhas: [{ whatsapp: "11987654321" }],
    });
    const dados = (db.loteDeProspeccao.create as any).mock.calls[0][0].data;
    expect(dados.situacao).toBeUndefined(); // o padrão do schema é RASCUNHO
    expect(dados.proveniencia).toBe("Lista pública, 08/2026");
  });
});

describe("liberar o lote", () => {
  it("⛔ não libera lote sem proveniência", async () => {
    const { db } = dbDeImportacao();
    db.loteDeProspeccao.findUnique.mockResolvedValue({
      situacao: "RASCUNHO",
      proveniencia: "  ",
    });
    const r = await liberarLote(db, "lote1", "diego");
    expect(r.ok).toBe(false);
  });

  it("⛔ lote encerrado não volta a abordar", async () => {
    const { db } = dbDeImportacao();
    db.loteDeProspeccao.findUnique.mockResolvedValue({
      situacao: "ENCERRADO",
      proveniencia: "lista",
    });
    expect((await liberarLote(db, "lote1", "diego")).ok).toBe(false);
  });

  it("liberar registra QUEM liberou — autorização sem assinatura não é autorização", async () => {
    const { db } = dbDeImportacao();
    db.loteDeProspeccao.findUnique.mockResolvedValue({
      situacao: "RASCUNHO",
      proveniencia: "Lista pública, 08/2026",
    });
    await liberarLote(db, "lote1", "diego");
    const dados = (db.loteDeProspeccao.update as any).mock.calls[0][0].data;
    expect(dados.situacao).toBe("LIBERADO");
    expect(dados.liberadoPor).toBe("diego");
    expect(dados.liberadoEm).toBeInstanceOf(Date);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// A FILA DO DIA
// ═══════════════════════════════════════════════════════════════════════════

function dbDeFila(config: any, itens: any[] = [], abordagensHoje = 0) {
  const leadsCriados: any[] = [];
  return {
    leadsCriados,
    db: {
      prospeccaoConfig: { findUnique: vi.fn().mockResolvedValue(config) },
      itemDeProspeccao: {
        findMany: vi.fn().mockResolvedValue(itens),
        update: vi.fn().mockResolvedValue({}),
      },
      siteLead: {
        count: vi.fn().mockResolvedValue(abordagensHoje),
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(async ({ data }: any) => {
          leadsCriados.push(data);
          return { id: "novo-lead", optOutAt: null, lastContactedAt: null };
        }),
      },
      leadMensagem: { count: vi.fn().mockResolvedValue(0) },
    } as any,
  };
}

const ITEM = {
  id: "i1",
  loteId: "lote1",
  leadId: null,
  nome: "Cantina do Zé",
  whatsapp: "11987654321",
  whatsappDigits: "5511987654321",
  empresa: "Cantina do Zé",
  cidade: "Curitiba",
  tipo: "Italiana",
  lote: { id: "lote1", proveniencia: "Lista pública, 08/2026", limiteDiario: 20 },
};

describe("a fila do dia", () => {
  it("⛔ sem configuração nenhuma a prospecção está DESLIGADA, não liberada", async () => {
    // A falha que este teste evita é a pior classe: banco novo, tabela vazia, e
    // o código interpretando ausência de configuração como permissão.
    const { db } = dbDeFila(null, [ITEM]);
    const fila = await montarFilaDeProspeccao(db, { canalPronto: true, agora: AGORA });
    expect(fila.liberados).toHaveLength(0);
    expect(fila.motivoDaFilaVazia).toContain("desligada");
  });

  it("⛔ pausa tem efeito imediato, sem deploy", async () => {
    const { db } = dbDeFila(
      { outboundLigado: true, limiteDiario: 20, pausadoEm: new Date(), motivo: "número instável" },
      [ITEM],
    );
    const fila = await montarFilaDeProspeccao(db, { canalPronto: true, agora: AGORA });
    expect(fila.liberados).toHaveLength(0);
    expect(fila.motivoDaFilaVazia).toContain("pausada");
  });

  it("⛔ teto do dia atingido esvazia a fila e diz o número", async () => {
    const { db } = dbDeFila(
      { outboundLigado: true, limiteDiario: 20, pausadoEm: null },
      [ITEM],
      20,
    );
    const fila = await montarFilaDeProspeccao(db, { canalPronto: true, agora: AGORA });
    expect(fila.liberados).toHaveLength(0);
    expect(fila.motivoDaFilaVazia).toContain("20/20");
  });

  it("⭐ o lead criado pela prospecção NUNCA nasce com consentimento", async () => {
    // A mentira que este teste impede: gravar `consentAt` faria o sistema
    // afirmar, para sempre, que esta pessoa nos procurou. Ela não procurou.
    const { db, leadsCriados } = dbDeFila(
      { outboundLigado: true, limiteDiario: 20, pausadoEm: null },
      [ITEM],
    );
    await montarFilaDeProspeccao(db, { canalPronto: true, agora: AGORA });

    expect(leadsCriados).toHaveLength(1);
    expect(leadsCriados[0].consentAt).toBeUndefined();
    expect(leadsCriados[0].fonte).toBe("LISTA_PROSPECCAO");
  });

  it("o barrado aparece na fila com motivo — não é filtrado para a tela ficar bonita", async () => {
    const { db } = dbDeFila(
      { outboundLigado: true, limiteDiario: 20, pausadoEm: null },
      [ITEM],
    );
    // Canal não pronto: o item deve aparecer BARRADO, não sumir.
    const fila = await montarFilaDeProspeccao(db, { canalPronto: false, agora: AGORA });
    expect(fila.liberados).toHaveLength(0);
    expect(fila.barrados).toHaveLength(1);
    expect(fila.barrados[0]!.decisao.reason).toBe("CANAL_INDISPONIVEL");
  });

  it("com tudo ligado e dentro das regras, o item é liberado", async () => {
    const { db } = dbDeFila(
      { outboundLigado: true, limiteDiario: 20, pausadoEm: null },
      [ITEM],
    );
    const fila = await montarFilaDeProspeccao(db, { canalPronto: true, agora: AGORA });
    expect(fila.liberados).toHaveLength(1);
    expect(fila.liberados[0]!.leadId).toBe("novo-lead");
  });
});
