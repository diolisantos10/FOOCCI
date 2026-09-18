/**
 * ⭐ A CONSCIÊNCIA DO CONTATO FRIO — a prova de que ela ACORDOU.
 *
 * ── A PERGUNTA OBRIGATÓRIA DESTA CASA ───────────────────────────────────────
 *
 * *O teste alcança o código que responde ao cliente?*
 *
 * `gatekeeper.test.ts` já provava que `objetivoDaProspeccao()` devolve
 * `DESCOBRIR_DECISOR` quando a empresa está em `PRONTA_PARA_SDR`. E, ainda
 * assim, em produção o agente não sabia de nada: **nenhum lead abordado tinha
 * `Empresa` ligada**, a função devolvia `null`, e o objetivo nunca entrava no
 * prompt. Régua verde sobre a função isolada, defeito intacto no caminho real.
 *
 * Por isso o caso decisivo deste arquivo passa por `atenderComOTA` — a única
 * função do produto que faz um robô falar com um estranho — e olha o que chega
 * a `falar()`, que é o texto que governa o que o cliente lê.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ⚠️ O dublê de `falar` é o que dá acesso à CONDUTA COMPOSTA. Sem ele o teste
// só veria o texto final — e o texto final varia; a conduta é o contrato.
const falarEspiao = vi.fn();
vi.mock("./ta/falar", async () => {
  const real = await vi.importActual<typeof import("./ta/falar")>("./ta/falar");
  return {
    ...real,
    falar: (...args: unknown[]) => {
      falarEspiao(...args);
      return (real.falar as (...a: never[]) => unknown)(...(args as never[]));
    },
  };
});

import { atenderComOTA } from "./ta/atender";
import { objetivoDaProspeccao } from "@/services/foocci-sdr/gatekeeper/objetivo";
import { lerInteresseNoProduto } from "./ta/memoria";
import { ehLead, veioDeListaFria, comoSeChama } from "./frioOuLead";
import { ROTULO_CURTO } from "./rotulosDaSala";
import { ROTULO_ETAPA } from "@/services/foocci-crm/foocciCrmFunnel";

const AGORA = new Date("2026-09-15T12:00:00Z"); // terça, 09:00 em São Paulo

interface Ajustes {
  lead?: Record<string, unknown>;
}

/** O banco mínimo para o TA rodar um turno inteiro. */
function banco(a: Ajustes = {}) {
  const lead = {
    id: "frio-1",
    nome: "Atendimento Sushi House",
    atendidoPor: "IA",
    optOutAt: null,
    temperatura: null,
    fonte: "LISTA_PROSPECCAO",
    virouLeadEm: null,
    empresa: null,
    contato: null,
    ...a.lead,
  };

  return {
    sdrIaConfig: {
      findUnique: vi.fn().mockResolvedValue({
        ligado: true,
        maxSemResposta: 3,
        versaoAtivaId: "v1",
        horaInicio: 9,
        horaFim: 20,
      }),
    },
    siteLead: {
      findUnique: vi.fn().mockResolvedValue(lead),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    leadMensagem: {
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi.fn().mockResolvedValue({ ocorreuEm: AGORA }),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: "m1" }),
    },
    siteLeadInteraction: { create: vi.fn().mockResolvedValue({}) },
    eventoDaJornada: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    leadHandoff: { create: vi.fn().mockResolvedValue({ id: "h1" }) },
    leadQualificacao: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
    },
    internalUser: { findMany: vi.fn().mockResolvedValue([]) },
  };
}

/** A conduta que o TA compôs neste turno — o texto que governa o que sai. */
function condutaDoTurno(): string {
  const turno = falarEspiao.mock.calls[0]?.[0] as { conduta?: string } | undefined;
  if (!turno) throw new Error("o TA não chegou a compor: `falar` nunca foi chamada");
  return turno.conduta ?? "";
}

beforeEach(() => falarEspiao.mockClear());

// ─────────────────────────────────────────────────────────────────────────────
// 1. ⭐ O CASO DECISIVO — o objetivo ACORDOU no caminho real
// ─────────────────────────────────────────────────────────────────────────────

describe("⭐ o número frio que cai em porteiro tem OBJETIVO", () => {
  it("ANTES: lead sem Empresa ligada — o TA compõe SEM objetivo nenhum", async () => {
    // Este é o estado medido em produção nos 750 leads abordados: a função da
    // consciência existia, estava ligada, e não tinha o dado de que depende.
    const db = banco({ lead: { empresa: null, contato: null } });

    await atenderComOTA(db as never, {
      leadId: "frio-1",
      mensagem: "1 - Fazer pedido 2 - Acompanhar pedido",
      agora: AGORA,
    });

    expect(objetivoDaProspeccao({ estagioDaEmpresa: null })).toBeNull();
    expect(condutaDoTurno()).not.toContain("descobrir quem decide");
  });

  it("DEPOIS: com a Empresa ligada em PRONTA_PARA_SDR, a conduta manda achar o decisor", async () => {
    const db = banco({
      lead: { empresa: { estagio: "PRONTA_PARA_SDR" }, contato: { ehDecisor: false } },
    });

    await atenderComOTA(db as never, {
      leadId: "frio-1",
      mensagem: "1 - Fazer pedido 2 - Acompanhar pedido",
      agora: AGORA,
    });

    expect(objetivoDaProspeccao({ estagioDaEmpresa: "PRONTA_PARA_SDR" })).toBe("DESCOBRIR_DECISOR");

    const conduta = condutaDoTurno();
    expect(conduta).toContain("descobrir quem decide");
    // E o objetivo é o do CEO: o responsável comercial/administrativo.
    expect(conduta).toMatch(/respons[aá]vel pela opera[cç][aã]o comercial/i);
    // ⛔ E não é furar o porteiro mentindo.
    expect(conduta).toContain("NUNCA se passe por cliente");
  });

  it("no porteiro, o agente NÃO parte para o pitch", async () => {
    const db = banco({ lead: { empresa: { estagio: "GATEKEEPER" }, contato: null } });
    await atenderComOTA(db as never, {
      leadId: "frio-1",
      mensagem: "aqui é o atendimento automático",
      agora: AGORA,
    });
    expect(condutaDoTurno()).not.toContain("hipótese de dor");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. A POSTURA DA ABORDAGEM — regra 3, no texto que sai
// ─────────────────────────────────────────────────────────────────────────────

describe("abordagem fria: o agente se apresenta antes de trabalhar", () => {
  it("a apresentação chega ao prompt, e não fica só em comentário", async () => {
    const db = banco({ lead: { empresa: { estagio: "PRONTA_PARA_SDR" }, contato: null } });
    await atenderComOTA(db as never, {
      leadId: "frio-1",
      mensagem: "quem é?",
      agora: AGORA,
    });

    const conduta = condutaDoTurno();
    expect(conduta).toMatch(/representante do Foocci/i);
    expect(conduta).toMatch(/neg[óo]cio novo/i);
    expect(conduta).toMatch(/n[úu]mero .{0,4}fri/i);
  });

  it("depois do decisor a apresentação continua — ele também nunca nos pediu nada", async () => {
    const db = banco({ lead: { empresa: { estagio: "DECISOR_ENCONTRADO" }, contato: null } });
    await atenderComOTA(db as never, {
      leadId: "frio-1",
      mensagem: "sou eu que decido, pode falar",
      agora: AGORA,
    });

    const conduta = condutaDoTurno();
    expect(conduta).toMatch(/representante do Foocci/i);
    expect(conduta).toContain("hipótese de dor");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. ⭐ LISTA FRIA ≠ LEAD — antes e depois do interesse
// ─────────────────────────────────────────────────────────────────────────────

describe("⭐ o contato frio NÃO é lead antes do interesse — e é depois", () => {
  it("antes: quem nós fomos caçar não é lead, e não se chama lead", () => {
    const frio = { fonte: "LISTA_PROSPECCAO" as const, virouLeadEm: null };
    expect(veioDeListaFria(frio)).toBe(true);
    expect(ehLead(frio)).toBe(false);
    expect(comoSeChama(frio)).toBe("contato frio");
  });

  it("depois: promovido pelo interesse, ele É lead", () => {
    const promovido = { fonte: "LISTA_PROSPECCAO" as const, virouLeadEm: AGORA };
    expect(ehLead(promovido)).toBe(true);
    expect(comoSeChama(promovido)).toBe("lead");
  });

  it("quem deixou o próprio contato já é lead, sem promoção nenhuma", () => {
    expect(ehLead({ fonte: "FORMULARIO_DEMONSTRACAO", virouLeadEm: null })).toBe(true);
    expect(ehLead({ fonte: "CAMPANHA_PAGA", virouLeadEm: null })).toBe(true);
    expect(ehLead({ fonte: "WHATSAPP_DIRETO", virouLeadEm: null })).toBe(true);
  });

  it("⭐ no caminho real: 'me explica melhor' promove — e 'quem é?' NÃO", async () => {
    // O primeiro turno: a pessoa só quer saber quem está falando. Isso é
    // defesa, não interesse. Promovê-la encheria a fila do vendedor de gente
    // que nunca pediu nada.
    const defensivo = banco({ lead: { empresa: { estagio: "PRONTA_PARA_SDR" } } });
    await atenderComOTA(defensivo as never, {
      leadId: "frio-1",
      mensagem: "quem é? não conheço",
      agora: AGORA,
    });
    const promocoesDefensivas = defensivo.siteLead.updateMany.mock.calls.filter(
      (c) => (c[0] as { data?: Record<string, unknown> }).data?.virouLeadEm !== undefined,
    );
    expect(promocoesDefensivas).toHaveLength(0);

    // O turno seguinte: ela quer escutar. É AQUI que vira lead.
    const interessado = banco({ lead: { empresa: { estagio: "PRONTA_PARA_SDR" } } });
    await atenderComOTA(interessado as never, {
      leadId: "frio-1",
      mensagem: "me explica melhor como funciona isso aí",
      agora: AGORA,
    });
    const promocao = interessado.siteLead.updateMany.mock.calls.find(
      (c) => (c[0] as { data?: Record<string, unknown> }).data?.virouLeadEm !== undefined,
    );
    expect(promocao).toBeDefined();
    // A escrita é CONDICIONAL: promover duas vezes não reescreve o instante.
    expect((promocao![0] as { where: Record<string, unknown> }).where.virouLeadEm).toBeNull();
    // E a promoção deixa trilha, com a prova do que a pessoa disse.
    const trilha = interessado.siteLeadInteraction.create.mock.calls.map(
      (c) => (c[0] as { data: { nota?: string } }).data.nota ?? "",
    );
    expect(trilha.some((n) => /virou LEAD/i.test(n))).toBe(true);
  });

  it("a leitura do interesse é determinística, e sabe o que NÃO é interesse", () => {
    expect(lerInteresseNoProduto("me explica melhor")).not.toBeNull();
    expect(lerInteresseNoProduto("quanto custa?")).not.toBeNull();
    expect(lerInteresseNoProduto("quero conhecer, pode mandar material")).not.toBeNull();

    expect(lerInteresseNoProduto("quem é?")).toBeNull();
    expect(lerInteresseNoProduto("não conheço vocês")).toBeNull();
    expect(lerInteresseNoProduto("vou passar para o responsável")).toBeNull();
    expect(lerInteresseNoProduto("1 - Fazer pedido 2 - Acompanhar pedido")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. O SELO NA TELA — lista fria não se chama "lead" em canto nenhum
// ─────────────────────────────────────────────────────────────────────────────

describe("a tela não chama de lead quem não é lead", () => {
  it("a etapa da base fria não usa a palavra 'lead'", () => {
    for (const rotulo of [
      ROTULO_CURTO.DISPONIVEL_PARA_PROSPECCAO,
      ROTULO_ETAPA.DISPONIVEL_PARA_PROSPECCAO,
    ]) {
      expect(rotulo.toLowerCase()).not.toContain("lead");
    }
  });

  it("⭐ o contato de prospecção NASCE em DISPONIVEL_PARA_PROSPECCAO, e não em NOVO", async () => {
    // A trava de verdade: `NOVO` se escreve "Novo lead", e era ali que o
    // restaurante caçado na internet nascia. Um teste só sobre o rótulo passaria
    // com o defeito intacto — o rótulo estava certo; a ETAPA é que era errada.
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const fonte = readFileSync(
      fileURLToPath(new URL("./prospeccao/selecao.ts", import.meta.url)),
      "utf8",
    );
    expect(fonte).toContain('stage: "DISPONIVEL_PARA_PROSPECCAO"');
    expect(fonte).not.toContain('stage: "NOVO"');
  });

  it("e ele já nasce ligado à Empresa — a dívida não volta pela porta da frente", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const fonte = readFileSync(
      fileURLToPath(new URL("./prospeccao/selecao.ts", import.meta.url)),
      "utf8",
    );
    expect(fonte).toContain("garantirEmpresaDoLead");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. ⛔ NENHUM CAMINHO NOVO DE ENVIO
// ─────────────────────────────────────────────────────────────────────────────

describe("⛔ esta frente não manda mensagem em hipótese nenhuma", () => {
  it("o retrofit e a promoção não tocam em nada que envie", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const arquivos = [
      "./prospeccao/empresaDoLead.ts",
      "./frioOuLead.ts",
      "../../../scripts/acordar-consciencia-do-frio.ts",
    ];
    for (const caminho of arquivos) {
      const fonte = readFileSync(fileURLToPath(new URL(caminho, import.meta.url)), "utf8");
      for (const proibido of [
        "enviarTextoDeVendas",
        "entregarMensagem",
        "FoocciSalesChannel",
        "abordarDaFila",
      ]) {
        expect(fonte).not.toContain(proibido);
      }
    }
  });
});
