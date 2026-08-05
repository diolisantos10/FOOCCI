/**
 * "Último envio" do diagnóstico de campanhas — a trava do número que mentia.
 *
 * O raio-x do CRM de 05/08/2026 pegou a rota `/api/admin/diagnostics/crm-campaigns`
 * respondendo `lastExecutionAt: null` ("nunca") para `recuperar-perdidos`, que
 * tinha 948 envios nos 30 dias anteriores. A causa não é o dado: é o `ORDER BY`.
 *
 * No Postgres, `ORDER BY "sentAt" DESC` devolve **NULLS FIRST**. As linhas
 * BLOCKED, FAILED e PENDING nascem com `sentAt` nulo — e o restaurante examinado
 * tinha 1.702 bloqueios de cooldown. O `findFirst` sem filtro pegava uma delas e
 * a rota concluía "nunca enviou".
 *
 * Por que isto merece trava e não só conserto: este é o número que alguém lê
 * para decidir se o CRM está calado. Um "nunca" falso não parece defeito — parece
 * diagnóstico. É a forma mais cara de errar.
 *
 * O teste não sobe Postgres: ele REPRODUZ a regra de ordenação do Postgres numa
 * função de 8 linhas e roda as duas consultas contra ela — a de antes e a de
 * agora. A quarta asserção prende a rota ao filtro, para o conserto não ser
 * desfeito por uma "simplificação" do `where`.
 *
 * NENHUMA mensagem é enviada neste arquivo.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

type Linha = { sentAt: Date | null };

/**
 * `findFirst({ where, orderBy: { sentAt: "desc" } })` como o Postgres o executa:
 * DESC ordena NULLS FIRST, e é exatamente isso que produzia o "nunca".
 */
function findFirstComoNoPostgres(
  linhas: Linha[],
  where: { sentAt?: { not: null } } = {},
): Linha | null {
  const filtradas = where.sentAt?.not === null ? linhas.filter((l) => l.sentAt !== null) : linhas;
  const ordenadas = [...filtradas].sort((a, b) => {
    if (a.sentAt === null && b.sentAt === null) return 0;
    if (a.sentAt === null) return -1;           // NULLS FIRST
    if (b.sentAt === null) return 1;
    return b.sentAt.getTime() - a.sentAt.getTime();
  });
  return ordenadas[0] ?? null;
}

/** Recria o estado exato do restaurante examinado: muito bloqueio, e envio real. */
const LINHAS: Linha[] = [
  { sentAt: null },                             // BLOCKED — cooldown de 24 h
  { sentAt: null },                             // BLOCKED — cooldown de 24 h
  { sentAt: new Date("2026-08-02T18:00:00Z") }, // o envio mais recente de verdade
  { sentAt: new Date("2026-07-19T12:00:00Z") },
  { sentAt: null },                             // FAILED
];

describe("último envio de uma campanha com bloqueios no meio", () => {
  it("o silêncio de antes: sem filtrar sentAt, a resposta é 'nunca' — e é mentira", () => {
    const lastExec = findFirstComoNoPostgres(LINHAS);
    expect(lastExec?.sentAt ?? null).toBeNull();
  });

  it("com o filtro, devolve o envio mais recente de verdade", () => {
    const lastExec = findFirstComoNoPostgres(LINHAS, { sentAt: { not: null } });
    expect(lastExec?.sentAt?.toISOString()).toBe("2026-08-02T18:00:00.000Z");
  });

  it("campanha que REALMENTE nunca enviou continua devolvendo nulo", () => {
    const soBloqueios: Linha[] = [{ sentAt: null }, { sentAt: null }];
    expect(findFirstComoNoPostgres(soBloqueios, { sentAt: { not: null } })).toBeNull();
  });

  it("a rota de diagnóstico carrega o filtro — a trava contra a regressão", () => {
    const texto = readFileSync("src/app/api/admin/diagnostics/crm-campaigns/route.ts", "utf-8");
    const inicio = texto.indexOf("let lastExecutionAt");
    expect(inicio).toBeGreaterThan(-1);
    const trecho = texto.slice(inicio, inicio + 400);
    expect(trecho).toContain("sentAt: { not: null }");
  });
});
