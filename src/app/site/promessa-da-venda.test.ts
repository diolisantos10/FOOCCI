// A PROMESSA QUE O SITE FAZ AO LEAD.
//
// ── Por que este teste existe (10/08/2026) ──────────────────────────────────
//
// O site prometia, em cinco páginas, uma DEMONSTRAÇÃO MONTADA com o cardápio e
// os números do restaurante do lead. Ordem do CEO:
//
//   > "Ninguém vai testar nada com cardápio do restaurante. O SDR vai apenas
//   >  mostrar como funciona o sistema e depois fechar a venda."
//
// É o guardrail 7 aplicado ao comercial, e na sua forma mais cara: prazo não
// cumprido irrita, mas **demonstração prometida e não entregue mata a venda na
// primeira conversa** — o lead descobre exatamente no momento em que já estava
// esperando ver.
//
// Copy volta. Alguém reescreve a chamada em três meses, acha que "com o
// cardápio do seu restaurante" vende melhor, e a promessa renasce. Este teste é
// a trava: ele lê o site inteiro e falha se ela voltar.
//
// ── O QUE ELE NÃO PROÍBE ────────────────────────────────────────────────────
//
// Falar do cardápio como FATO DO PRODUTO continua certo e necessário — "o
// Garçom só oferece o que existe no cardápio", "o verificador barra o que não
// bate com o cardápio". O que está proibido é PROMETER que a demonstração será
// feita com o cardápio DELE.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.join(process.cwd(), "src/app/site");

function arquivosDoSite(dir: string): string[] {
  const saida: string[] = [];
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const caminho = path.join(dir, entrada.name);
    if (entrada.isDirectory()) saida.push(...arquivosDoSite(caminho));
    else if (/\.(tsx|ts)$/.test(entrada.name) && !entrada.name.endsWith(".test.ts")) saida.push(caminho);
  }
  return saida;
}

/** As frases que prometem uma demonstração personalizada. Cada uma existiu no
 *  site e foi removida em 10/08/2026. */
const PROMESSAS_PROIBIDAS = [
  "cardápio do seu restaurante",
  "cardápio e os números do",
  "com o cardápio do seu",
];

describe("o site não promete demonstração montada com o cardápio do lead", () => {
  const arquivos = [...arquivosDoSite(RAIZ), path.join(process.cwd(), "src/components/marketing/CtaBand.tsx")];

  it("nenhuma página do site contém a promessa", () => {
    const encontrados: string[] = [];
    for (const arq of arquivos) {
      const bruto = fs.readFileSync(arq, "utf8");
      // Sem comentários: este arquivo e o CtaBand EXPLICAM a promessa removida,
      // e a explicação citaria o proibido.
      const codigo = bruto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      for (const frase of PROMESSAS_PROIBIDAS) {
        if (codigo.includes(frase)) encontrados.push(`${path.relative(process.cwd(), arq)}: "${frase}"`);
      }
    }
    expect(
      encontrados,
      "a promessa de demonstração com o cardápio do lead voltou ao site:\n" + encontrados.join("\n"),
    ).toEqual([]);
  });

  it("a metade oposta: falar do cardápio como FATO do produto continua permitido", () => {
    // Se este teste falhar, a trava virou censura — e aí ela apagaria a
    // explicação de como o Garçom funciona.
    const todos = arquivos.map((a) => fs.readFileSync(a, "utf8")).join("\n");
    expect(
      todos.includes("cardápio"),
      "o site parou de falar do cardápio por completo — a trava passou do ponto",
    ).toBe(true);
  });
});
