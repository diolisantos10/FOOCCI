/**
 * A MARCA VEM DO ARQUIVO, NUNCA DO TECLADO.
 *
 * Em 24/08/2026 o CEO abriu o checkout e disse que "mudaram a logomarca".
 * Ninguém mudou: três telas do fluxo de contratação **nasceram** com a marca
 * desenhada com texto e CSS, no commit `16cf3b5` (05/08). Marca aproximada
 * "muda sozinha" a cada ajuste de fonte, peso ou tom de laranja — e ninguém vê,
 * porque não existe erro nenhum para ver.
 *
 * Este teste reprova contra o código anterior nas três telas, e é de TEXTO de
 * propósito: o defeito entra num arquivo que ainda não existe, e sempre com a
 * melhor das intenções ("é só um título").
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const RAIZ = process.cwd();
const ler = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

function semComentarios(fonte: string): string {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join("\n");
}

function varrer(dir: string): [string, string][] {
  const saida: [string, string][] = [];
  const caminhar = (atual: string) => {
    for (const nome of fs.readdirSync(atual)) {
      const completo = path.join(atual, nome);
      if (fs.statSync(completo).isDirectory()) caminhar(completo);
      else if (/\.tsx?$/.test(nome) && !nome.includes(".test.")) {
        saida.push([path.relative(RAIZ, completo), fs.readFileSync(completo, "utf8")]);
      }
    }
  };
  caminhar(path.join(RAIZ, dir));
  return saida;
}

const TELAS_DE_CONTRATACAO = [
  "src/app/contratar/novo/page.tsx",
  "src/app/contratar/obrigado/page.tsx",
  "src/app/contratar/[token]/page.tsx",
];

describe("nenhuma tela redesenha a marca", () => {
  it("o padrão `f<span>oo</span>cci` não existe em lugar nenhum do código", () => {
    const culpados: string[] = [];
    for (const [rel, fonte] of varrer("src")) {
      if (rel.includes("components/brand/")) continue; // é lá que o defeito está documentado
      if (/oo<\/span>cci/.test(semComentarios(fonte))) culpados.push(rel);
    }
    expect(
      culpados,
      `Marca desenhada com texto e CSS. Use <FoocciWordmark/>: ${culpados.join(", ")}`,
    ).toEqual([]);
  });

  it("o arquivo oficial existe onde o brand book diz", () => {
    expect(fs.existsSync(path.join(RAIZ, "public/brand/foocci/foocci-wordmark.png"))).toBe(true);
  });

  for (const tela of TELAS_DE_CONTRATACAO) {
    it(`${tela} mostra a marca pelo componente oficial`, () => {
      expect(semComentarios(ler(tela))).toMatch(/FoocciWordmark/);
    });
  }

  it("as telas não escrevem o caminho do arquivo à mão — leem o componente", () => {
    for (const tela of TELAS_DE_CONTRATACAO) {
      expect(semComentarios(ler(tela))).not.toContain("foocci-wordmark.png");
    }
  });
});

describe("a saída para quem está em dúvida entre os planos", () => {
  const checkout = ler("src/app/contratar/novo/CheckoutClient.tsx");

  it("existe um link para a página de planos, acima da escolha do plano", () => {
    const codigo = semComentarios(checkout);
    expect(codigo).toContain("PRECOS_URL");
    const posLink = codigo.indexOf("PRECOS_URL", codigo.indexOf("1. Seu plano"));
    const posBotoes = codigo.indexOf("planCodes.map");
    expect(posLink, "o link precisa vir ANTES dos botões de plano").toBeLessThan(posBotoes);
  });

  it("o convite não promete nada — sem prazo, desconto ou caso de sucesso", () => {
    const trecho = checkout.slice(checkout.indexOf("1. Seu plano"), checkout.indexOf("planCodes.map"));
    for (const proibido of [/desconto/i, /grátis/i, /gratuito/i, /em até \d/i, /garantia/i]) {
      expect(trecho, `promessa no convite: ${proibido}`).not.toMatch(proibido);
    }
  });

  it("abre em outra aba — comparar preço não pode apagar o cadastro já digitado", () => {
    const trecho = checkout.slice(checkout.indexOf("1. Seu plano"), checkout.indexOf("planCodes.map"));
    expect(trecho).toContain('target="_blank"');
    expect(trecho).toContain('rel="noopener noreferrer"');
  });
});
