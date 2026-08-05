/**
 * O SITE NÃO PODE DIZER QUE O FOOCCI AINDA VAI EXISTIR.
 *
 * Por que este teste existe, e não uma faxina: a limpeza dos "em breve" já foi
 * feita uma vez, dada como concluída — e a frase **"está chegando"** sobreviveu no
 * fecho da home por dois dias, na única página que o dono abre vindo do anúncio.
 * Ele lia o site inteiro sendo convencido e, na última linha antes do rodapé, era
 * informado de que ainda não era hora. Enquanto isso `/contratar/novo` já cobrava
 * cartão e prometia loja pronta na hora.
 *
 * Faxina conserta o que alguém lembrou de olhar. Varredura conserta o que ninguém
 * lembrou — e linguagem de pré-lançamento volta por descuido, num parágrafo novo
 * escrito no piloto automático, não por decisão.
 *
 * É o guardrail 7 nas DUAS direções: a casa proíbe vender como pronto o que está em
 * piloto, e proíbe pelo mesmo motivo anunciar como futuro o que já está à venda.
 * Mentira em qualquer direção custa a mesma confiança.
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const RAIZ = process.cwd();

/**
 * A superfície que o visitante REALMENTE vê. `/site/**` são as páginas públicas e
 * `components/marketing` é o que elas montam.
 */
const PASTAS = ["src/app/site", "src/components/marketing"];

/**
 * Exceções, cada uma com o motivo — exceção sem motivo é o começo do teste virar
 * decoração.
 *
 *  · `preview/`: o portão do pré-lançamento privado. Está guardado de propósito
 *    (ver `src/app/site/entrar/page.tsx`) e NÃO é renderizado — `/preview` é
 *    redirecionado para `/site` pelo `middleware.ts`. Se um dia voltar a ser
 *    montado, ele volta a valer para este teste: tire-o daqui junto.
 *  · arquivos `.test.ts`: descrevem o defeito para poder proibi-lo.
 */
const ISENTOS = [
  path.join("src", "components", "marketing", "preview"),
];

/**
 * As frases proibidas. Não é lista de palavras feias: cada uma põe o produto no
 * FUTURO para quem está lendo agora.
 */
const PROIBIDAS = [
  "está chegando",
  "esta chegando",
  "em breve",
  "está sendo preparado",
  "esta sendo preparado",
  "vai chegar",
  "aguarde o lançamento",
  "lista de espera",
];

/** Todo arquivo de código sob as pastas, menos os isentos e os próprios testes. */
function arquivosDoSite(): string[] {
  const achados: string[] = [];

  const andar = (dir: string) => {
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
      const completo = path.join(dir, entrada.name);
      const relativo = path.relative(RAIZ, completo);
      if (ISENTOS.some((iso) => relativo.startsWith(iso))) continue;
      if (entrada.isDirectory()) { andar(completo); continue; }
      if (!/\.(tsx|ts)$/.test(entrada.name)) continue;
      if (/\.test\.tsx?$/.test(entrada.name)) continue;
      achados.push(completo);
    }
  };

  for (const pasta of PASTAS) {
    const completo = path.join(RAIZ, pasta);
    if (fs.existsSync(completo)) andar(completo);
  }
  return achados;
}

/**
 * Só o texto que VAI PARA A TELA. Comentário é onde a gente explica por que a frase
 * foi banida — se o teste olhasse comentário, este próprio arquivo e o cabeçalho do
 * `FinalCTASection` o reprovariam, e a única saída seria parar de documentar. Teste
 * que pune a explicação ensina a apagar a explicação.
 */
function semComentarios(codigo: string): string {
  return codigo
    .replace(/\/\*[\s\S]*?\*\//g, " ")   // bloco  /* … */  (cobre JSX {/* … */})
    .replace(/(^|[^:])\/\/.*$/gm, "$1"); // linha  // …     (o [^:] poupa https://)
}

describe("o site não anuncia o Foocci como produto futuro", () => {
  const arquivos = arquivosDoSite();

  it("varre uma quantidade plausível de arquivos (senão o teste passa por estar vazio)", () => {
    // Sem esta âncora, um erro de caminho faria a lista vir vazia e TODAS as
    // asserções abaixo passariam — verde por não ter olhado nada.
    expect(arquivos.length).toBeGreaterThan(20);
  });

  for (const frase of PROIBIDAS) {
    it(`nenhum texto visível diz "${frase}"`, () => {
      const culpados: string[] = [];

      for (const arquivo of arquivos) {
        const visivel = semComentarios(fs.readFileSync(arquivo, "utf8")).toLowerCase();
        if (visivel.includes(frase)) culpados.push(path.relative(RAIZ, arquivo));
      }

      // O alerta carrega a própria evidência (guardrail 6): quem quebrar isto lê o
      // arquivo e o motivo, não só "falhou".
      expect(
        culpados,
        `Texto de pré-lançamento em: ${culpados.join(", ")}\n` +
          `O Foocci está à venda — /contratar/novo cobra cartão hoje. ` +
          `Escreva no presente ou, se a frase for mesmo necessária, ` +
          `documente a exceção em ISENTOS com o motivo.`,
      ).toEqual([]);
    });
  }
});
