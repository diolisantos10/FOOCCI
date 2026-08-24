/**
 * A PROMESSA QUE A CASA NÃO CUMPRE NÃO PODE VOLTAR.
 *
 * Até 24/08/2026 o site prometia, no fim de sete páginas e dentro do formulário,
 * uma demonstração montada com o cardápio do restaurante de quem clicou. Esse
 * processo NÃO existe: ninguém monta cardápio de prospecto, não há quem faça nem
 * prazo. O CEO leu e não reconheceu — *"isso não existe ainda, não sei nem quem
 * criou, tem que tirar"*.
 *
 * É teste de TEXTO, no mesmo molde do `brandName` e do `ancoraDoFormulario`, e de
 * propósito: a frase volta com facilidade porque ela é bonita, e volta num
 * arquivo que ainda não existe. Reprova inteiro contra o código antigo.
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const RAIZ = process.cwd();

/** Comentário é história; a casa registra o erro de propósito. Só CÓDIGO conta. */
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

const PASTAS = ["src/app/site", "src/components/marketing"];

/** As formas da promessa. Nenhuma delas descreve algo que alguém executa hoje. */
const PROMESSAS = [
  /rodando com o cardápio do seu/i,
  /mostra o sistema rodando/i,
  /com o cardápio e os números do seu/i,
  /atendendo com o cardápio do seu/i,
  /mostra o Foocci funcionando com o cardápio/i,
];

describe("o site não promete demonstração personalizada", () => {
  for (const promessa of PROMESSAS) {
    it(`nenhum arquivo do site diz ${promessa}`, () => {
      const culpados: string[] = [];
      for (const pasta of PASTAS) {
        for (const [rel, fonte] of varrer(pasta)) {
          if (promessa.test(semComentarios(fonte))) culpados.push(rel);
        }
      }
      expect(
        culpados,
        `Voltou a prometer demonstração com o cardápio do cliente — processo que ` +
          `não existe nesta casa: ${culpados.join(", ")}`,
      ).toEqual([]);
    });
  }

  it("a FAQ manda tirar dúvidas com o agente, não pedir demonstração", () => {
    const faq = fs.readFileSync(path.join(RAIZ, "src/components/marketing/FAQSection.tsx"), "utf8");
    expect(semComentarios(faq)).not.toMatch(/[Pp]eça uma demonstração/);
    expect(faq).toMatch(/nossos agentes/);
  });
});

describe("a porta do WhatsApp é uma só", () => {
  it("nenhuma página escreve o link wa.me à mão — todas passam pelo desvio do servidor", () => {
    const permitidos = [
      "src/components/marketing/config.ts", // monta o link do formulário (`whatsappUrl`)
    ];
    const culpados: string[] = [];
    for (const pasta of PASTAS) {
      for (const [rel, fonte] of varrer(pasta)) {
        if (permitidos.includes(rel.replace(/\\/g, "/"))) continue;
        if (/wa\.me\//.test(semComentarios(fonte))) culpados.push(rel);
      }
    }
    expect(
      culpados,
      `Link wa.me escrito à mão. Use AGENTE_URL: o destino tem que poder ser ` +
        `ligado e desligado sem build novo — ${culpados.join(", ")}`,
    ).toEqual([]);
  });

  it("o botão flutuante só é montado quando o canal está no ar", () => {
    const layout = fs.readFileSync(
      path.join(RAIZ, "src/app/site/(gated)/layout.tsx"),
      "utf8",
    );
    expect(layout).toContain("chamada.ativo && <BotaoAgenteFlutuante />");
  });

  it("o layout resolve a chamada no servidor e a passa para o cabeçalho e a barra fixa", () => {
    const layout = fs.readFileSync(
      path.join(RAIZ, "src/app/site/(gated)/layout.tsx"),
      "utf8",
    );
    expect(layout).toContain("chamadaComercial()");
    expect(layout).toContain("<MarketingHeader chamada={chamada} />");
    expect(layout).toContain("<StickyMobileCta chamada={chamada} />");
  });
});
