/**
 * A trava contra o drift que apagou o estado da loja do julgamento (06/08/2026).
 *
 * O defeito não foi um `if` errado: foi uma tabela mantida em dois arquivos, em
 * que só um acompanhou o PR #111. Estes testes prendem as duas pontas —
 * a tabela não pode ter buraco, e a fila não pode mandar a verdade volátil para
 * o fim, atrás do cardápio.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TRUTH_LABELS, TRUTH_PRIORITY, truthPriorityIndex, FIRST_BULKY_TRUTH_SOURCE } from "./truthLabels";

describe("truthLabels — uma tabela só, sem buraco", () => {
  it("toda fonte rotulada tem posição na fila, e vice-versa", () => {
    expect([...TRUTH_PRIORITY].sort()).toEqual(Object.keys(TRUTH_LABELS).sort());
  });

  it("as três fontes do PR #111 existem e vêm ANTES do cardápio", () => {
    for (const chave of ["loja", "entrega", "local"]) {
      expect(TRUTH_LABELS[chave], `fonte "${chave}" sem rótulo`).toBeTruthy();
      expect(truthPriorityIndex(chave)).toBeLessThan(truthPriorityIndex("products"));
    }
  });

  it("o estado da loja AGORA é o primeiro da fila — é o fato que muda a cada minuto", () => {
    expect(TRUTH_PRIORITY[0]).toBe("loja");
  });

  it("fonte não classificada entra ANTES dos blocos grandes, nunca no fim da fila", () => {
    // O comportamento antigo (índice 99) jogava chave nova para o fim, onde o
    // corte a apagava — foi exatamente assim que `loja` sumiu.
    expect(truthPriorityIndex("fonte_que_ninguem_listou")).toBeLessThan(
      truthPriorityIndex(FIRST_BULKY_TRUTH_SOURCE),
    );
    expect(truthPriorityIndex("fonte_que_ninguem_listou")).toBeGreaterThan(truthPriorityIndex("hours"));
  });

  /**
   * A metade que prova que a correção alcança a REALIDADE, não só a tabela:
   * toda chave que o adaptador de restaurante escreve em `truthSources` precisa
   * estar rotulada. Sem isto, a próxima fonte nasce órfã do mesmo jeito.
   */
  it("toda chave emitida pelo RestaurantKnowledgeAdapter está rotulada", () => {
    const fonte = readFileSync(join(__dirname, "RestaurantKnowledgeAdapter.ts"), "utf8");

    /**
     * Recorta SÓ o nível 1 do objeto: chave aninhada não é fonte de verdade.
     * A sonda que não sabe contar chave devolve lixo, e lixo aqui vira alarme
     * que ninguém investiga.
     */
    const chavesDoBloco = (abre: number): string[] => {
      const inicio = fonte.indexOf("{", abre);
      let nivel = 0;
      let topo = "";
      let fim = inicio;
      for (let i = inicio; i < fonte.length; i++) {
        const c = fonte[i]!;
        if (c === "{") nivel++;
        else if (c === "}") {
          nivel--;
          if (nivel === 0) { fim = i; break; }
        }
        if (nivel === 1 && c !== "{" && c !== "}") topo += c;
      }
      const achadas = new Set<string>();
      // `products,` · `materials: [...]` — chave declarada direto no nível 1.
      for (const m of topo.matchAll(/(?:^|[\s,])([a-zA-Z_][a-zA-Z0-9_]*)\s*[,:]/g)) achadas.add(m[1]!);
      // `...(prices ? { prices } : {})` — condicional; some no recorte de nível 1.
      for (const m of fonte.slice(inicio, fim).matchAll(/\.\.\.\(\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\?/g)) achadas.add(m[1]!);
      return [...achadas];
    };

    // TODAS as emissões — o adaptador tem mais de um `return` (o vazio do
    // caminho sem restaurante inclusive). Ler só a primeira daria PASS por
    // olhar o bloco errado, que é pior que não ter teste.
    const chaves = new Set<string>();
    let blocos = 0;
    for (let i = fonte.indexOf("truthSources: {"); i >= 0; i = fonte.indexOf("truthSources: {", i + 1)) {
      blocos++;
      for (const k of chavesDoBloco(i)) chaves.add(k);
    }
    expect(blocos, "não achei bloco truthSources no adaptador").toBeGreaterThan(0);

    const emitidas = [...chaves];
    expect(emitidas.length, "a sonda não leu chave nenhuma").toBeGreaterThan(5);
    const orfas = emitidas.filter((k) => !(k in TRUTH_LABELS));
    expect(orfas, `fontes sem rótulo em truthLabels.ts: ${orfas.join(", ")}`).toEqual([]);
  });
});
