/**
 * O nome da marca no site público: **Foocci**, tratado no MASCULINO.
 *
 * O site usa "o Foocci" em dezenas de lugares, e o próprio mascote se apresenta assim
 * — "Olá! Sou o Foocci". Mesmo assim cinco textos tinham escorregado para "a Foocci",
 * dois deles escritos na repaginação de 02/08. Numa página comercial que recebe
 * campanha paga, a marca oscilando de gênero de seção para seção é ruído que o
 * visitante sente sem saber nomear.
 *
 * Este teste varre os arquivos do site como TEXTO. É de propósito: um teste de
 * renderização cobriria só o componente montado, e o desvio pode entrar em qualquer
 * string de qualquer seção — inclusive numa que ainda não existe.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = [
  "src/components/marketing",
  "src/app/site",
  "src/lib/site",
];

function walk(dir: string): string[] {
  let out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out = out.concat(walk(p));
    else if (/\.(ts|tsx)$/.test(p) && !/\.test\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

const FILES = ROOTS.flatMap((r) => walk(r));

describe("nome da marca no site público", () => {
  it("encontra os arquivos do site (guarda contra o teste virar vazio)", () => {
    // Sem isto, mover uma pasta faria a varredura passar por não achar nada.
    expect(FILES.length).toBeGreaterThan(10);
  });

  it('trata a marca no masculino — "o Foocci", nunca "a Foocci"', () => {
    const offenders: string[] = [];

    for (const file of FILES) {
      const src = readFileSync(file, "utf8");
      src.split("\n").forEach((line, i) => {
        /*
          "Foocci" sozinho é a MARCA e é masculino. Mas "Foocci Bakery" é o nome de
          uma PADARIA — substantivo feminino —, e "a Foocci Bakery é de mentira" é
          português correto, não deslize de gênero. Sem esta exceção, quem escrever
          sobre a loja de demonstração é forçado a torcer a frase para driblar uma
          regex; a regra continua valendo, com o caso nomeado.
        */
        const semPadaria = line.replace(/Foocci Bakery/g, "«padaria»");
        // \b(a|A)\s+Foocci\b — pega "a Foocci", "A Foocci", "da Foocci", "pela Foocci".
        if (/\b(?:[aA]|[dD]a|[pP]ela|[nN]a|à)\s+Foocci\b/.test(semPadaria)) {
          offenders.push(`${file}:${i + 1} → ${line.trim().slice(0, 90)}`);
        }
      });
    }

    expect(offenders, `Use "o Foocci":\n${offenders.join("\n")}`).toEqual([]);
  });

  it("escreve o nome como Foocci — não Food, Focci ou Fooci", () => {
    const offenders: string[] = [];

    for (const file of FILES) {
      const src = readFileSync(file, "utf8");
      src.split("\n").forEach((line, i) => {
        // Erros de digitação plausíveis do nome. "Food" isolado também é errado no
        // site: a marca não é essa, e a transcrição de voz do CEO já a produziu.
        if (/\b(Focci|Fooci|Foccia|Foodci|Food)\b/.test(line)) {
          offenders.push(`${file}:${i + 1} → ${line.trim().slice(0, 90)}`);
        }
      });
    }

    expect(offenders, `A marca é "Foocci":\n${offenders.join("\n")}`).toEqual([]);
  });
});
