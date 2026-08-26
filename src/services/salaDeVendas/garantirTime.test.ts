/**
 * GARANTIR O TIME — e os dois jeitos de isto dar errado em silêncio.
 *
 * ── O QUE ESTES CASOS GUARDAM ───────────────────────────────────────────────
 *
 * Esta função roda em caminho de leitura de tela, toda vez que alguém abre a
 * página do agente. Isso cria dois riscos que não aparecem em teste manual:
 *
 *  · **custo** — se ela escrever a cada abertura em vez de só quando falta,
 *    cada visita vira cinco `upsert` mais dez consultas de departamento. Ninguém
 *    percebe até a tela ficar lenta com o banco cheio;
 *  · **sobrescrita** — se o `update` do upsert mexer em `isActive`, um agente
 *    que alguém desligou de propósito volta sozinho toda vez que a tela abrir.
 *    O sintoma seria "eu desliguei e ele voltou", investigado como fantasma.
 *
 * Nenhum dos dois quebra nada na hora. É por isso que estão aqui.
 */

import { describe, it, expect, vi } from "vitest";
import { garantirTimeNoSistema } from "./garantirTime";
import { TIME_DE_AGENTES, PAPEL_DO_TIME } from "./timeDeAgentes";

/**
 * Um banco em que se escolhe QUEM já está lá.
 *
 * Guarda as chamadas de escrita: a metade importante dos casos não olha o
 * resultado, olha se houve escrita — e quanta.
 */
function banco(jaEstao: string[]) {
  const criados: Array<Record<string, unknown>> = [];

  return {
    criados,
    internalUser: {
      findMany: vi.fn(async () => jaEstao.map((email) => ({ email }))),
      upsert: vi.fn(async (args: { create: Record<string, unknown> }) => {
        criados.push(args.create);
        return { id: `id-${criados.length}` };
      }),
    },
    department: {
      findUnique: vi.fn(async () => ({ id: "dep-vendas" })),
    },
    departmentMembership: {
      upsert: vi.fn(async () => ({})),
    },
  };
}

const TODOS = TIME_DE_AGENTES.map((a) => a.email);

describe("⭐ o caminho comum não escreve nada", () => {
  it("com todos já no sistema, faz UMA leitura e nenhuma escrita", () => {
    // O caso que roda toda vez que a tela abre. Escrever aqui seria custo puro,
    // repetido para sempre, por nada.
    const db = banco(TODOS);

    return garantirTimeNoSistema(db as never).then((r) => {
      expect(r).toEqual({ jaEstavam: TIME_DE_AGENTES.length, criados: 0 });
      expect(db.internalUser.findMany).toHaveBeenCalledTimes(1);
      expect(db.internalUser.upsert, "escreveu com o time já completo").not.toHaveBeenCalled();
      expect(db.department.findUnique, "foi ao banco atrás de departamento à toa").not.toHaveBeenCalled();
    });
  });
});

describe("quando falta alguém, ele entra", () => {
  it("⭐ com o banco vazio, cria os cinco", async () => {
    const db = banco([]);
    const r = await garantirTimeNoSistema(db as never);

    expect(r).toEqual({ jaEstavam: 0, criados: TIME_DE_AGENTES.length });
    expect(db.internalUser.upsert).toHaveBeenCalledTimes(TIME_DE_AGENTES.length);
  });

  it("cria SÓ quem falta, não o time inteiro", async () => {
    // Recriar quem já está seria inofensivo (o upsert é idempotente) e caro.
    const faltando = TIME_DE_AGENTES[4]!;
    const db = banco(TODOS.filter((e) => e !== faltando.email));

    const r = await garantirTimeNoSistema(db as never);

    expect(r.criados).toBe(1);
    expect(db.internalUser.upsert).toHaveBeenCalledTimes(1);
    expect(db.criados[0]!.email).toBe(faltando.email);
  });

  it("⭐ o que é criado não tem senha, e tem o papel que não entra", async () => {
    const db = banco([]);
    await garantirTimeNoSistema(db as never);

    for (const c of db.criados) {
      expect(c.role, `${c.email} com papel errado`).toBe(PAPEL_DO_TIME);
      expect(c.passwordHash, `${c.email} nasceu com senha`).toBeUndefined();
    }
  });

  it("entra no departamento de vendas", async () => {
    const db = banco([]);
    await garantirTimeNoSistema(db as never);

    expect(db.departmentMembership.upsert).toHaveBeenCalledTimes(TIME_DE_AGENTES.length);
  });
});

describe("⭐ o que ele nunca faz", () => {
  it("não sobrescreve quem já existe — o update é vazio", async () => {
    // O fantasma: um `update` que mexe em `isActive` reativaria, a cada
    // abertura de tela, um agente que alguém desligou de propósito.
    const db = banco([]);
    await garantirTimeNoSistema(db as never);

    const args = db.internalUser.upsert.mock.calls[0]![0] as { update: Record<string, unknown> };
    expect(
      Object.keys(args.update),
      `o update do upsert escreve: ${JSON.stringify(args.update)}`,
    ).toEqual([]);
  });

  it("um agente que falha não impede os outros", async () => {
    // A função roda em caminho de leitura de tela. Uma exceção aqui derrubaria
    // a página do agente inteira — e ela existe para mostrar o interruptor do
    // TA, que é mais importante que a lista.
    const db = banco([]);
    let n = 0;
    db.internalUser.upsert.mockImplementation(async (args: { create: Record<string, unknown> }) => {
      n += 1;
      if (n === 2) throw new Error("unique constraint");
      db.criados.push(args.create);
      return { id: `id-${n}` };
    });

    const r = await garantirTimeNoSistema(db as never);

    expect(r.criados).toBe(TIME_DE_AGENTES.length - 1);
  });

  it("⭐ banco fora do ar não derruba quem chamou", async () => {
    // A primeira versão deste caso afirmava `rejects.toThrow()` — ou seja,
    // documentava como correto exatamente o oposto do que o nome dele diz, e
    // do que o comentário da função promete. Passava, e estava errado.
    //
    // O que precisa valer: a leitura falha, a tela do agente ABRE assim mesmo,
    // e o número devolvido não mente dizendo que o time está lá.
    const db = banco([]);
    db.internalUser.findMany.mockRejectedValue(new Error("ECONNREFUSED"));

    const r = await garantirTimeNoSistema(db as never);
    expect(r).toEqual({ jaEstavam: 0, criados: 0 });
  });
});
