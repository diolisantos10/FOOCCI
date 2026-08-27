/**
 * QUEM ATENDE — e os três jeitos de a distribuição dar errado sem gritar.
 *
 * ── O QUE ESTES CASOS GUARDAM ───────────────────────────────────────────────
 *
 *  · **entregar sempre ao mesmo** — a conta de carga erra e um agente acumula
 *    tudo enquanto os outros ficam em zero. Ninguém percebe: cada conversa,
 *    isolada, parece normal;
 *  · **desempatar por acaso** — o time vazio (todos com zero) é o caso comum,
 *    e se o desempate não for estável, um problema relatado não se reproduz;
 *  · **quebrar quando o time não existe** — instalação nova, banco sem agente.
 *    O cliente já escreveu, e uma exceção aqui derruba o turno inteiro.
 */

import { describe, it, expect, vi } from "vitest";
import { escolherAgente } from "./quemAtende";
import { TIME_DE_AGENTES } from "./timeDeAgentes";

const [PRIMEIRO, SEGUNDO, TERCEIRO] = TIME_DE_AGENTES;

function banco(
  time: Array<{ id: string; email: string; nome: string }>,
  carga: Array<{ atendenteUserId: string | null; _count: { _all: number } }> = [],
) {
  return {
    internalUser: { findMany: vi.fn(async () => time) },
    siteLead: { groupBy: vi.fn(async () => carga) },
  };
}

describe("⭐ quem está mais livre pega", () => {
  it("entrega ao agente com menos clientes abertos", async () => {
    const db = banco(
      [
        { id: "u1", email: PRIMEIRO!.email, nome: PRIMEIRO!.nome },
        { id: "u2", email: SEGUNDO!.email, nome: SEGUNDO!.nome },
      ],
      [
        { atendenteUserId: "u1", _count: { _all: 7 } },
        { atendenteUserId: "u2", _count: { _all: 2 } },
      ],
    );

    const r = await escolherAgente(db as never);
    expect(r?.userId, "entregou a quem já tinha mais").toBe("u2");
    expect(r?.nome).toBe(SEGUNDO!.nome);
  });

  it("⭐ quem tem ZERO ganha de quem tem um — ausência conta como zero", async () => {
    // O `groupBy` não devolve linha para quem não tem lead nenhum. Ler a
    // ausência como "sem dado" e pular o agente entregaria tudo a quem já
    // trabalha — o defeito exatamente ao contrário do pretendido.
    const db = banco(
      [
        { id: "u1", email: PRIMEIRO!.email, nome: PRIMEIRO!.nome },
        { id: "u2", email: SEGUNDO!.email, nome: SEGUNDO!.nome },
      ],
      [{ atendenteUserId: "u1", _count: { _all: 1 } }],
    );

    const r = await escolherAgente(db as never);
    expect(r?.userId, "ignorou o agente que estava livre").toBe("u2");
  });

  it("só conta cliente ABERTO — devolver para a fila não pesa", async () => {
    // Sem isto, quem devolve trabalho é punido por devolver, e a conta premia
    // justamente quem segura conversa parada.
    const db = banco([{ id: "u1", email: PRIMEIRO!.email, nome: PRIMEIRO!.nome }]);
    await escolherAgente(db as never);

    const args = db.siteLead.groupBy.mock.calls[0]![0] as {
      where: { atendidoPor: { in: string[] } };
    };
    expect(args.where.atendidoPor.in).toEqual(["IA", "HUMANO", "AGUARDANDO_HUMANO"]);
    expect(args.where.atendidoPor.in, "NINGUEM entrou na conta de carga").not.toContain("NINGUEM");
  });
});

describe("⭐ o empate é resolvido pela lista, não pelo acaso", () => {
  it("todos com zero → vence a ordem do time", async () => {
    // Sala nova, madrugada vazia: é o caso COMUM, não a exceção. Desempate por
    // acaso daria um agente diferente a cada reinício, e nenhum jeito de
    // reproduzir um problema relatado.
    const db = banco([
      { id: "u1", email: PRIMEIRO!.email, nome: PRIMEIRO!.nome },
      { id: "u2", email: SEGUNDO!.email, nome: SEGUNDO!.nome },
      { id: "u3", email: TERCEIRO!.email, nome: TERCEIRO!.nome },
    ]);

    for (let i = 0; i < 5; i++) {
      const r = await escolherAgente(db as never);
      expect(r?.userId, "o desempate mudou entre chamadas").toBe("u1");
    }
  });

  it("⭐ a ordem do BANCO não muda a escolha", async () => {
    // O banco não garante ordem de retorno. Percorrer o que ele devolveu — em
    // vez da lista — faria o desempate variar entre consultas idênticas.
    const time = [
      { id: "u3", email: TERCEIRO!.email, nome: TERCEIRO!.nome },
      { id: "u1", email: PRIMEIRO!.email, nome: PRIMEIRO!.nome },
      { id: "u2", email: SEGUNDO!.email, nome: SEGUNDO!.nome },
    ];

    const r = await escolherAgente(banco(time) as never);
    expect(r?.userId, "seguiu a ordem do banco em vez da ordem do time").toBe("u1");
  });
});

describe("⭐ o time que não existe", () => {
  it("devolve null em vez de quebrar", async () => {
    // Instalação nova. O cliente já escreveu: melhor um atendimento sem nome do
    // que nenhum atendimento. Quem chama grava `atendenteUserId: null`.
    const r = await escolherAgente(banco([]) as never);
    expect(r).toBeNull();
  });

  it("nem consulta a carga quando não há agente", async () => {
    const db = banco([]);
    await escolherAgente(db as never);
    expect(db.siteLead.groupBy, "foi ao banco atrás de carga de ninguém").not.toHaveBeenCalled();
  });

  it("só considera agente ATIVO e do papel certo", async () => {
    // Um agente desligado pelo dono não pode voltar a receber cliente por uma
    // porta lateral.
    const db = banco([{ id: "u1", email: PRIMEIRO!.email, nome: PRIMEIRO!.nome }]);
    await escolherAgente(db as never);

    const args = db.internalUser.findMany.mock.calls[0]![0] as {
      where: { isActive: boolean; role: string };
    };
    expect(args.where.isActive).toBe(true);
    expect(args.where.role).toBe("AGENTE_IA");
  });

  it("ignora quem está no banco mas não é do time", async () => {
    // Uma conta com o papel certo e e-mail de fora não é agente do time — e
    // não pode receber cliente por estar no mesmo papel.
    const db = banco([{ id: "estranho", email: "outro@foocci.com.br", nome: "Outro" }]);
    const r = await escolherAgente(db as never);
    expect(r, "entregou cliente a quem não é do time").toBeNull();
  });
});
