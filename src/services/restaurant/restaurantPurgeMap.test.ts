/**
 * O PORTÃO QUE IMPEDE O ÓRFÃO DE NASCER.
 *
 * O mapa da purga é uma lista escrita à mão, e lista escrita à mão apodrece: basta
 * alguém acrescentar um modelo novo com `restaurantId` para a purga passar a deixar
 * linha para trás — apontando para um restaurante que não existe mais, invisível a
 * toda consulta por `join` e a toda consulta por `restaurantId`.
 *
 * Este arquivo relê o `schema.prisma` de verdade e reprova nesse caso. É guardrail 4
 * aplicado: não é "lembre de atualizar o mapa", é uma trava que quebra o CI.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  SLUGS_PROTEGIDOS,
  ORDEM_DE_PURGA,
  TABELAS_ORDENADAS,
  TABELAS_VARREDURA,
  TABELAS_PRESERVADAS,
  TABELAS_PROFUNDAS,
  ALCANCE_ESPECIAL,
  ondeDaTabela,
  sqlContagemProfunda,
  sqlExportProfundo,
} from "./restaurantPurgeMap";

/** Tabelas que o schema declara com coluna `restaurantId`, lidas na fonte. */
function tabelasComRestaurantIdNoSchema(): string[] {
  const src = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
  const modelos = [...src.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)];
  const saida: string[] = [];
  for (const [, nome, corpo] of modelos) {
    if (!/^\s*restaurantId\s+/m.test(corpo)) continue;
    const mapa = /@@map\("([^"]+)"\)/.exec(corpo);
    saida.push(mapa ? mapa[1] : nome);
  }
  return saida.sort();
}

describe("mapa da purga × schema.prisma", () => {
  it("(1) toda tabela com restaurantId está na ordem de purga OU declarada como preservada", () => {
    const noSchema = tabelasComRestaurantIdNoSchema();
    const cobertas = new Set([...ORDEM_DE_PURGA, ...Object.keys(TABELAS_PRESERVADAS)]);
    const faltando = noSchema.filter((t) => !cobertas.has(t));

    expect(
      faltando,
      `Tabela(s) com restaurantId fora do mapa da purga: ${faltando.join(", ")}.\n` +
        `Ou entram em ORDEM_DE_PURGA, ou entram em TABELAS_PRESERVADAS com o motivo escrito. ` +
        `Ficar de fora em silêncio é criar linha órfã na próxima exclusão.`,
    ).toEqual([]);
  });

  it("(2) o mapa não inventa tabela que o schema não tem", () => {
    const noSchema = new Set(tabelasComRestaurantIdNoSchema());
    const inventadas = [...ORDEM_DE_PURGA, ...Object.keys(TABELAS_PRESERVADAS)].filter(
      (t) => !noSchema.has(t),
    );
    expect(inventadas, `Tabelas no mapa que não existem mais no schema: ${inventadas.join(", ")}`).toEqual([]);
  });

  it("(3) nenhuma tabela aparece duas vezes na ordem de purga", () => {
    const vistas = new Set<string>();
    const repetidas = ORDEM_DE_PURGA.filter((t) => (vistas.has(t) ? true : (vistas.add(t), false)));
    expect(repetidas).toEqual([]);
  });

  it("(4) as tabelas preservadas não estão também na ordem de purga", () => {
    const naOrdem = Object.keys(TABELAS_PRESERVADAS).filter((t) => ORDEM_DE_PURGA.includes(t));
    expect(naOrdem).toEqual([]);
  });
});

describe("ordem obrigatória — as arestas ON DELETE RESTRICT do banco", () => {
  const posicao = (t: string) => ORDEM_DE_PURGA.indexOf(t);

  /*
    Cada caso abaixo corresponde a uma chave estrangeira RESTRICT emitida na
    migração inicial. Inverter qualquer um destes pares faz o Postgres recusar a
    exclusão inteira com violação de chave — e é exatamente aí que alguém parte
    para SQL cru sem rede.
  */
  it.each([
    ["orders", "customers", "orders.customerId RESTRICT"],
    ["order_drafts", "customers", "order_drafts.customerId RESTRICT"],
    ["conversations", "customers", "conversations.customerId RESTRICT"],
    ["orders", "order_drafts", "orders.orderDraftId RESTRICT"],
    ["campaigns", "customer_segments", "campaigns.segmentId RESTRICT"],
  ])("(5) %s sai antes de %s — %s", (antes, depois) => {
    expect(posicao(antes)).toBeGreaterThanOrEqual(0);
    expect(posicao(depois)).toBeGreaterThanOrEqual(0);
    expect(posicao(antes)).toBeLessThan(posicao(depois));
  });

  it("(6) a cauda ordenada vem depois de toda a varredura", () => {
    const ultimoDaVarredura = Math.max(...TABELAS_VARREDURA.map(posicao));
    const primeiroDaCauda = Math.min(...TABELAS_ORDENADAS.map(posicao));
    expect(primeiroDaCauda).toBeGreaterThan(ultimoDaVarredura);
  });
});

describe("alcance por tabela — a coluna desnormalizada que mentiria na contagem", () => {
  it("(7) campaign_executions alcança também as linhas com restaurantId nulo", () => {
    // A coluna é nulável e desnormalizada; quem manda é campaignId. Contar só por
    // restaurantId mostraria menos linhas do que somem, e a rede de segurança
    // guardaria menos do que vai sumir — que é o pior dos dois erros.
    const onde = ondeDaTabela("campaign_executions");
    expect(onde).toContain(`"campaignId" IN (SELECT "id" FROM "campaigns"`);
    expect(onde).toContain(`"restaurantId" = $1`);
  });

  it("(8) toda tabela sem caso especial usa o alcance padrão", () => {
    for (const t of ORDEM_DE_PURGA) {
      if (t in ALCANCE_ESPECIAL) continue;
      expect(ondeDaTabela(t)).toBe(`"restaurantId" = $1`);
    }
  });

  it("(9) todo alcance especial é parametrizado e não interpola valor", () => {
    for (const [tabela, onde] of Object.entries(ALCANCE_ESPECIAL)) {
      expect(ORDEM_DE_PURGA, `${tabela} tem alcance especial mas não está na ordem`).toContain(tabela);
      expect(onde).toContain("$1");
      expect(onde).not.toMatch(/\$\{/);
    }
  });

  it("(10) campaign_executions é varrido ANTES de campanhas — senão a subconsulta acha vazio", () => {
    // A cláusula especial pergunta ao `campaigns` quais campanhas são do
    // restaurante. Se `campaigns` já tivesse saído, a resposta seria "nenhuma" e a
    // varredura deixaria as execuções órfãs para trás sem erro nenhum.
    expect(ORDEM_DE_PURGA.indexOf("campaign_executions")).toBeLessThan(
      ORDEM_DE_PURGA.indexOf("campaigns"),
    );
  });
});

describe("SLUGS_PROTEGIDOS", () => {
  it("(11) contém exatamente os dois que o CEO mandou manter", () => {
    expect([...SLUGS_PROTEGIDOS].sort()).toEqual(["foocci-bakery", "sushi-cazza"]);
  });
});

describe("SQL das tabelas profundas", () => {
  it("(12) toda consulta profunda é parametrizada por $1 e nunca interpola valor", () => {
    for (const t of TABELAS_PROFUNDAS) {
      expect(t.de, `${t.tabela} sem parâmetro $1`).toContain("$1");
      expect(t.de, `${t.tabela} parece interpolar valor`).not.toMatch(/\$\{/);
    }
  });

  it("(13) a exportação puxa as colunas do ALVO, não `*` do JOIN", () => {
    // `SELECT *` num JOIN devolveria as colunas do pai coladas nas do filho, e a
    // rede deixaria de ser fiel à tabela que ela diz representar.
    for (const t of TABELAS_PROFUNDAS) {
      expect(sqlExportProfundo(t)).toContain(`SELECT ${t.alias}.*`);
      expect(sqlExportProfundo(t)).not.toMatch(/SELECT \* /);
    }
  });

  it("(14) a contagem profunda conta, e não seleciona linha", () => {
    for (const t of TABELAS_PROFUNDAS) {
      expect(sqlContagemProfunda(t)).toContain("COUNT(*)::bigint AS n");
    }
  });
});
