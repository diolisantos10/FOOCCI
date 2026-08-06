/**
 * A PORTA DO SDR NÃO PODE ABRIR NO LUGAR ERRADO.
 *
 * Em 06/08/2026 a página `/site/demonstracao` foi eliminada (decisão do CEO) e o
 * formulário virou a ÚLTIMA SEÇÃO de `/site/precos`, endereçada por âncora. Todo
 * botão "Agende uma demonstração" do site — header, barra fixa do celular, faixa
 * de fechamento de oito páginas, rodapé e checkout — passou a apontar para lá.
 *
 * O que este teste protege é a classe de defeito MUDO desse desenho, e ela tem
 * três formas — nenhuma delas quebra o build, nenhuma aparece em erro de log:
 *
 *   1. **A âncora some ou é renomeada.** O link continua abrindo `/site/precos`,
 *      só que no topo dos planos, com o formulário três telas abaixo. Ninguém vê
 *      defeito: a página carrega, o botão "funciona", e o visitante que veio pedir
 *      demonstração simplesmente não encontra onde pedir.
 *   2. **Alguém escreve o caminho à mão de novo.** `DEMO_URL` é uma linha
 *      justamente para que o destino se mude numa linha. Um `href="/site/..."`
 *      literal numa página escapa da próxima mudança e vira link órfão — foi assim
 *      que nasceram as âncoras mortas `/site#solucoes` e `/site#crm`.
 *   3. **A rota velha vira 404.** `/site/demonstracao` foi divulgada e está em
 *      índice de busca; `/site/agendar` já redirecionava para ela. Apagar o
 *      arquivo é perder lead sem nenhum sinal — 404 de porta de lead não aparece
 *      em relatório nenhum.
 *
 * É teste de TEXTO, como `brandName` e `semPreLancamento`, e de propósito: o
 * desvio entra em qualquer arquivo novo, inclusive num que ainda não existe.
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { DEMO_URL, DEMO_PAGE_PATH } from "../config";

const RAIZ = process.cwd();

/** `/site/precos#demonstracao` → `{ caminho, ancora }`. */
const [CAMINHO, ANCORA] = DEMO_URL.split("#");

/** `/site/precos` → `src/app/site/(gated)/precos/page.tsx`. */
function arquivoDaPagina(rota: string): string {
  const resto = rota.replace(/^\/site\/?/, "");
  return path.join(RAIZ, "src/app/site/(gated)", resto, "page.tsx");
}

function ler(rel: string): string {
  return fs.readFileSync(path.join(RAIZ, rel), "utf8");
}

/**
 * Tira os comentários — blocos `/* … *\/` e linhas de `//` ou de continuação `*`.
 * Sem isso o teste acusaria a própria documentação que explica a mudança, e um
 * teste que proíbe escrever a história vira um teste que a gente apaga.
 */
function semComentarios(fonte: string): string {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join("\n");
}

/** Varre uma pasta inteira devolvendo [caminho relativo, conteúdo]. */
function varrer(dir: string): [string, string][] {
  const saida: [string, string][] = [];
  const caminhar = (atual: string) => {
    for (const nome of fs.readdirSync(atual)) {
      const completo = path.join(atual, nome);
      if (fs.statSync(completo).isDirectory()) caminhar(completo);
      else if (/\.tsx?$/.test(nome)) saida.push([path.relative(RAIZ, completo), fs.readFileSync(completo, "utf8")]);
    }
  };
  caminhar(path.join(RAIZ, dir));
  return saida;
}

describe("a âncora do formulário de demonstração", () => {
  it("DEMO_URL aponta para uma página com âncora — não para uma página solta", () => {
    expect(ANCORA, `DEMO_URL ("${DEMO_URL}") perdeu a âncora`).toBeTruthy();
    expect(CAMINHO).toBe(DEMO_PAGE_PATH);
  });

  it("a página de destino REALMENTE tem o id da âncora", () => {
    const arquivo = arquivoDaPagina(CAMINHO!);
    expect(fs.existsSync(arquivo), `${CAMINHO} não existe como página`).toBe(true);
    const fonte = fs.readFileSync(arquivo, "utf8");
    expect(
      fonte.includes(`id="${ANCORA}"`),
      `A página ${CAMINHO} não tem id="${ANCORA}". Todo CTA comercial do site cai ` +
        `no topo dela, com o formulário fora da tela — e nada acusa o defeito.`,
    ).toBe(true);
  });

  it("a página de destino monta o formulário de verdade (DemoForm), não uma cópia", () => {
    const fonte = fs.readFileSync(arquivoDaPagina(CAMINHO!), "utf8");
    expect(
      fonte.includes("<DemoForm"),
      `A página ${CAMINHO} não monta <DemoForm>. Reescrever o formulário perde a ` +
        `validação de WhatsApp do servidor, a captura de origem da visita, o código ` +
        `do lead e a preservação do que foi digitado quando o envio falha.`,
    ).toBe(true);
  });

  it("nenhuma página escreve o caminho do formulário à mão — todas leem DEMO_URL", () => {
    const literais = /["'](\/site\/(demonstracao|agendar))["']/;
    const culpados: string[] = [];
    for (const pasta of ["src/app/site", "src/components/marketing"]) {
      for (const [rel, fonte] of varrer(pasta)) {
        if (rel.includes(".test.")) continue;
        // Só CÓDIGO conta. Os comentários desta casa citam a rota velha de
        // propósito — é assim que a próxima sessão descobre por que ela existe.
        if (literais.test(semComentarios(fonte))) culpados.push(rel);
      }
    }
    expect(
      culpados,
      `Caminho de rota aposentada escrito à mão. Use DEMO_URL: ${culpados.join(", ")}`,
    ).toEqual([]);
  });

  it("as rotas aposentadas continuam existindo como redirecionamento — nunca 404", () => {
    for (const rota of ["demonstracao", "agendar"]) {
      const rel = `src/app/site/(gated)/${rota}/page.tsx`;
      expect(fs.existsSync(path.join(RAIZ, rel)), `${rel} sumiu — /site/${rota} passa a dar 404`).toBe(true);
      const fonte = ler(rel);
      expect(fonte).toContain("permanentRedirect");
      expect(fonte).toContain("DEMO_URL");
    }
  });

  it("o sitemap não pede indexação de uma rota que redireciona", () => {
    const fonte = ler("src/app/sitemap.ts");
    const listadas = [...fonte.matchAll(/path:\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(listadas).not.toContain("/site/demonstracao");
    expect(listadas).not.toContain("/site/agendar");
    expect(listadas).toContain(DEMO_PAGE_PATH);
  });
});
