/**
 * O APAGAMENTO — a única função desta casa que destrói dado sem volta.
 *
 * ── POR QUE ESTE ARQUIVO É MAIS DURO QUE OS OUTROS ──────────────────────────
 *
 * Todo defeito aqui é irreversível. Não existe "corrige na próxima versão": o
 * contato apagado por engano não volta, e o backup é ferramenta de desastre, não
 * de operação. Então cada trava é exercitada nas DUAS metades — porque uma
 * função que recusasse tudo passaria em metade destes casos e deixaria a Foocci
 * sem como cumprir a LGPD, que é o outro jeito de errar.
 *
 * ── O QUE ESTES CASOS GUARDAM ───────────────────────────────────────────────
 *
 *  · **apagar sem confirmação** — um `{ leadId }` solto, disparado por um clique
 *    duplo ou por um laço de script, apagaria a base contato a contato;
 *  · **apagar a pessoa ERRADA** — o id vem da URL. Se a ficha aberta for de
 *    outra pessoa, um "sim" apaga quem estiver do outro lado. O nome digitado só
 *    confere com um contato;
 *  · **apagar sem registro** — apagamento irreversível sem trilha é
 *    indistinguível de vazamento. Trilha e delete andam na MESMA transação;
 *  · **trilha guardando o dado que ela apagou** — escrever o nome de quem pediu
 *    para ser esquecido, na linha que prova o esquecimento, é manter o dado
 *    pessoal com outro nome.
 */

import { describe, it, expect, vi } from "vitest";
import type { SessaoInterna } from "@/lib/internal-auth";
import { apagarDadosDoLead, podeApagarDadosDoLead, nomesConferem } from "./lgpd";

const CEO: SessaoInterna = {
  userId: "u-ceo",
  nome: "Dioli",
  role: "MASTER_CEO",
  departamentos: [],
  gerencia: [],
};

const SDR: SessaoInterna = {
  userId: "u-sdr",
  nome: "Marina",
  role: "AGENTE_HUMANO",
  departamentos: ["vendas"],
  gerencia: [],
};

const GERENTE: SessaoInterna = {
  userId: "u-ger",
  nome: "Paula",
  role: "GERENTE_DEPARTAMENTO",
  departamentos: ["vendas"],
  gerencia: ["vendas"],
};

const QUANDO = new Date("2026-08-28T10:00:00.000Z");

/**
 * Um banco falso que registra a ORDEM do que aconteceu.
 *
 * A ordem importa: o registro na trilha e o `delete` precisam estar dentro da
 * mesma transação, e é isso que `passos` prova.
 */
function banco(nomeGravado: string | null, contagens = { interacoes: 3, mensagens: 12 }) {
  const passos: string[] = [];
  const trilha: Array<Record<string, unknown>> = [];

  const tx = {
    internalAuditEvent: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        passos.push("trilha");
        trilha.push(args.data);
        return {};
      }),
    },
    siteLead: {
      delete: vi.fn(async () => {
        passos.push("delete");
        return {};
      }),
    },
  };

  return {
    passos,
    trilha,
    apagou: tx.siteLead.delete,
    escreveuTrilha: tx.internalAuditEvent.create,
    siteLead: {
      findUnique: vi.fn(async () => (nomeGravado === null ? null : { id: "l1", nome: nomeGravado })),
      delete: tx.siteLead.delete,
    },
    siteLeadInteraction: { count: vi.fn(async () => contagens.interacoes) },
    leadMensagem: { count: vi.fn(async () => contagens.mensagens) },
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<void>) => {
      passos.push("abriu transação");
      return fn(tx);
    }),
  };
}

const PEDIDO = {
  leadId: "l1",
  confirmacaoNome: "Ana Paula",
  origemDoPedido: "TITULAR" as const,
  sessao: CEO,
  agora: QUANDO,
};

describe("⭐ quem pode apagar", () => {
  it("o CEO pode", () => {
    expect(podeApagarDadosDoLead(CEO)).toBe(true);
  });

  it("o Diretor pode", () => {
    expect(podeApagarDadosDoLead({ ...CEO, role: "DIRETOR_FOOCCI" })).toBe(true);
  });

  it("o SDR humano NÃO pode — quem passa o dia com o dedo na ficha é quem mais erra o clique", () => {
    expect(podeApagarDadosDoLead(SDR)).toBe(false);
  });

  it("o gerente do departamento NÃO pode — administrar o trabalho não é destruir a base", () => {
    expect(podeApagarDadosDoLead(GERENTE)).toBe(false);
  });

  it("o auditor NÃO pode — quem audita não mexe no que auditou", () => {
    expect(podeApagarDadosDoLead({ ...SDR, role: "AUDITOR_QA" })).toBe(false);
  });
});

describe("⭐ a confirmação pelo nome", () => {
  it("nome certo confere, ignorando caixa, acento e espaço sobrando", () => {
    expect(nomesConferem("  jose da silva ", "José da Silva")).toBe(true);
  });

  it("nome de OUTRA pessoa não confere", () => {
    expect(nomesConferem("João da Silva", "José da Silva")).toBe(false);
  });

  it("texto qualquer não confere — a confirmação não é enfeite", () => {
    expect(nomesConferem("sim", "José da Silva")).toBe(false);
    expect(nomesConferem("confirmo", "José da Silva")).toBe(false);
  });

  it("vazio contra vazio NÃO confere: senão um contato sem nome apagaria com um clique em branco", () => {
    expect(nomesConferem("", "")).toBe(false);
  });
});

describe("⭐ apagar exige confirmação explícita, e não roda sem ela", () => {
  it("sem nome digitado, recusa e NÃO apaga nada", async () => {
    const db = banco("Ana Paula");

    const r = await apagarDadosDoLead(db as never, { ...PEDIDO, confirmacaoNome: "   " });

    expect(r).toEqual({ ok: false, causa: "semConfirmacao" });
    expect(db.apagou).not.toHaveBeenCalled();
    expect(db.escreveuTrilha).not.toHaveBeenCalled();
    // Nem chegou a olhar o contato: pedido malformado não passa perto dele.
    expect(db.siteLead.findUnique).not.toHaveBeenCalled();
  });

  it("nome ERRADO recusa e NÃO apaga — é a trava contra apagar a pessoa errada", async () => {
    const db = banco("Ana Paula");

    const r = await apagarDadosDoLead(db as never, { ...PEDIDO, confirmacaoNome: "Ana Maria" });

    expect(r).toEqual({ ok: false, causa: "confirmacaoNaoConfere" });
    expect(db.apagou).not.toHaveBeenCalled();
  });

  it("origem do pedido desconhecida recusa e NÃO apaga", async () => {
    const db = banco("Ana Paula");

    const r = await apagarDadosDoLead(db as never, {
      ...PEDIDO,
      origemDoPedido: "PORQUE_SIM" as never,
    });

    expect(r).toEqual({ ok: false, causa: "pedidoDesconhecido" });
    expect(db.apagou).not.toHaveBeenCalled();
  });

  it("lead que não existe devolve causa própria — e não um sucesso mudo", async () => {
    const db = banco(null);

    const r = await apagarDadosDoLead(db as never, PEDIDO);

    expect(r).toEqual({ ok: false, causa: "leadNaoExiste" });
    expect(db.apagou).not.toHaveBeenCalled();
  });

  it("⭐ A METADE QUE PASSA: com o nome certo e a origem declarada, apaga de verdade", async () => {
    // Sem este caso, uma função que recusasse TUDO passaria em todos os de cima
    // — e a Foocci ficaria sem como cumprir um pedido de eliminação.
    const db = banco("Ana Paula");

    const r = await apagarDadosDoLead(db as never, PEDIDO);

    expect(r).toEqual({
      ok: true,
      apagadoEm: QUANDO,
      apagados: { interacoes: 3, mensagens: 12 },
    });
    expect(db.apagou).toHaveBeenCalledWith({ where: { id: "l1" } });
  });
});

describe("⭐ a trilha e o apagamento andam juntos", () => {
  it("os dois acontecem DENTRO da mesma transação, com a trilha primeiro", async () => {
    // Trilha antes do delete, na mesma transação: se o delete falhar, o registro
    // volta atrás junto. Se fosse depois, uma queda no meio apagaria o dado sem
    // deixar registro — e apagamento sem registro é indistinguível de vazamento.
    const db = banco("Ana Paula");

    await apagarDadosDoLead(db as never, PEDIDO);

    expect(db.passos).toEqual(["abriu transação", "trilha", "delete"]);
  });

  it("a trilha diz QUEM executou, QUANDO e por qual pedido", async () => {
    const db = banco("Ana Paula");

    await apagarDadosDoLead(db as never, PEDIDO);

    expect(db.trilha[0]).toMatchObject({
      actorId: "u-ceo",
      actorLabel: "Dioli (u-ceo)",
      acao: "apagar_dados_do_lead",
      recurso: "lead:l1",
      resultado: "PERMITIDO",
      ocorridoEm: QUANDO,
    });
    expect(db.trilha[0]!.detalhe).toMatchObject({
      origemDoPedido: "TITULAR",
      interacoesApagadas: 3,
      mensagensApagadas: 12,
    });
  });

  it("⭐ a trilha NÃO guarda o nome de quem pediu para ser esquecido", async () => {
    // Guardar o nome na linha que prova o esquecimento é manter o dado pessoal
    // com outro nome — e numa tabela que ninguém pensa em limpar.
    const db = banco("Ana Paula");

    await apagarDadosDoLead(db as never, PEDIDO);

    const escrito = JSON.stringify(db.trilha[0]);
    expect(escrito, "o nome do contato vazou para a trilha").not.toContain("Ana Paula");
    expect(escrito).not.toContain("Ana");
  });

  it("as contagens são lidas ANTES do delete — depois não há mais o que contar", async () => {
    const db = banco("Ana Paula", { interacoes: 5, mensagens: 0 });

    const r = await apagarDadosDoLead(db as never, PEDIDO);

    expect(db.siteLeadInteraction.count).toHaveBeenCalled();
    expect(db.leadMensagem.count).toHaveBeenCalled();
    expect(r.ok && r.apagados).toEqual({ interacoes: 5, mensagens: 0 });
  });

  it("contato de teste também é declarado — os dois motivos não viram o mesmo carimbo", async () => {
    const db = banco("Lead Fake");

    const r = await apagarDadosDoLead(db as never, {
      ...PEDIDO,
      confirmacaoNome: "lead fake",
      origemDoPedido: "CONTATO_DE_TESTE",
    });

    expect(r.ok).toBe(true);
    expect(db.trilha[0]!.detalhe).toMatchObject({ origemDoPedido: "CONTATO_DE_TESTE" });
  });
});
