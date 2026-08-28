/**
 * O NÚMERO DE VENDAS MORA NUM LUGAR SÓ.
 *
 * ── O DEFEITO QUE ESTE ARQUIVO EXISTE PARA IMPEDIR ──────────────────────────
 *
 * Em 28/08/2026, com o CEO trocando o número na Meta, medi: o mesmo telefone
 * estava escrito em **dois** arquivos independentes, e com políticas
 * diferentes — um aceitava troca por variável do Railway, o outro recusava
 * variável de propósito.
 *
 * Trocar o número pelo Railway mudaria **metade do site**. A outra metade
 * continuaria mandando gente para o telefone antigo, e o sintoma seria zero: o
 * botão funciona, o link abre, a conversa começa — no aparelho errado.
 *
 * Este teste é o que impede o terceiro lugar de aparecer.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { NUMERO_DE_VENDAS } from "../numeroDeVendas";
import { WHATSAPP_SALES_NUMBER } from "@/components/marketing/config";
import { linkDoWhatsAppDeVendas } from "../canalDeVendas";

/** O único arquivo autorizado a conter o número escrito à mão. */
const A_FONTE = "src/lib/site/numeroDeVendas.ts";

function varrer(dir: string, achados: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (nome === "node_modules" || nome === ".next") continue;
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) varrer(caminho, achados);
    else if (/\.(ts|tsx)$/.test(nome)) achados.push(caminho);
  }
  return achados;
}

describe("⭐⭐ o número de vendas mora num lugar só", () => {
  it("⭐⭐ nenhum outro arquivo escreve o número à mão", () => {
    const raiz = join(process.cwd(), "src");
    const culpados: string[] = [];

    for (const arquivo of varrer(raiz)) {
      const relativo = arquivo.slice(process.cwd().length + 1);
      if (relativo === A_FONTE) continue;
      // Testes podem usar números de mentira à vontade — o que não pode é um
      // arquivo de produção decidir por conta própria para onde o cliente vai.
      if (/\.test\.tsx?$/.test(relativo)) continue;

      if (readFileSync(arquivo, "utf8").includes(NUMERO_DE_VENDAS)) {
        culpados.push(relativo);
      }
    }

    expect(
      culpados,
      `Número de vendas escrito à mão fora da fonte única.\n` +
        `Importe de "@/lib/site/numeroDeVendas" — senão trocar o número muda ` +
        `só parte do site, sem erro e sem log:\n  ${culpados.join("\n  ")}`,
    ).toEqual([]);
  });

  it("⭐ as duas pontas do site leem o MESMO número", () => {
    // A metade que passa. Sem ela, uma fonte única que exportasse a string
    // errada passaria no teste de cima e quebraria o site inteiro de uma vez.
    expect(WHATSAPP_SALES_NUMBER, "o site público divergiu da fonte")
      .toBe(NUMERO_DE_VENDAS);
    expect(linkDoWhatsAppDeVendas(), "o link do servidor divergiu da fonte")
      .toContain(NUMERO_DE_VENDAS);
  });

  it("⭐ a fonte é um módulo puro — sem import e sem process.env", () => {
    /*
      É o que permite servidor e navegador lerem a mesma constante. Em 27/08 a
      política de senha precisou virar módulo próprio pelo mesmo motivo: um
      import inocente arrastou Prisma para dentro do bundle do navegador.
    */
    const fonte = readFileSync(join(process.cwd(), A_FONTE), "utf8");
    const codigo = fonte.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

    expect(codigo, "a fonte única ganhou um import").not.toMatch(/^\s*import\s/m);
    expect(codigo, "a fonte única passou a depender do ambiente").not.toContain("process.env");
  });

  it("o número está no formato que o WhatsApp aceita: DDI + DDD + dígitos", () => {
    expect(NUMERO_DE_VENDAS).toMatch(/^55\d{2}9?\d{8}$/);
  });
});
