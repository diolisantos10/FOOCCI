/**
 * O site não promete QUANTOS campos o formulário tem, nem QUAIS são.
 *
 * ─── O defeito que este teste existe para impedir ────────────────────────────
 * Até 08/08/2026 quatro lugares do site diziam, com todas as letras:
 *
 *     "São dois campos: seu nome e seu WhatsApp."
 *
 * O formulário tinha SEIS campos, e tinha havia meses. A frase não "ficou"
 * errada — ela envelheceu sozinha, num commit que mexeu no formulário e não em
 * nenhum dos parágrafos, que moram em outra pasta. Ninguém liga uma coisa à
 * outra na hora de mudar o formulário, e é exatamente por isso que a regra tem de
 * ser um teste e não uma recomendação.
 *
 * ─── A regra ─────────────────────────────────────────────────────────────────
 * Copy do site comercial descreve **o que a pessoa ganha**, nunca a conta do que
 * ela digita. Duas formas ficam proibidas:
 *
 *   1. contar campos ("dois campos", "3 campos", "um único campo");
 *   2. enumerar os obrigatórios ("nome e WhatsApp") — enumeração é a mesma
 *      promessa em outras palavras, e foi ela que ficou falsa no minuto em que o
 *      e-mail passou a ser exigido.
 *
 * ─── Por que só o texto que RENDERIZA ────────────────────────────────────────
 * O teste tira comentários antes de olhar. Comentário que explica o defeito (e
 * cita a frase antiga para ninguém repô-la) é memória, não promessa — proibir a
 * citação apagaria justamente o aviso.
 *
 * ─── A única exceção, e o que a mantém honesta ───────────────────────────────
 * O PRÓPRIO formulário conta campos ("Faltam 2 campos"), e isso é o contrário do
 * defeito: não é uma promessa sobre o tamanho do formulário, é a resposta ao que
 * a pessoa acabou de fazer. Para a exceção não virar buraco, o último teste exige
 * que esse número venha de `problemas.length` — ou seja, que seja CONTADO, nunca
 * escrito à mão.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";

const SRC = path.resolve(__dirname, "..", "..", "..");
const RAIZES = [
  path.join(SRC, "components", "marketing"),
  path.join(SRC, "app", "site"),
];

/** Contagem de campo: numeral ou número por extenso colado em "campo/campos". */
const CONTA_CAMPOS =
  /\b(um|uma|dois|duas|tr[êe]s|quatro|cinco|seis|sete|oito|nove|dez|\d+)\s+(?:[úu]nicos?\s+)?campos?\b/i;

/** Enumeração dos obrigatórios — a mesma promessa, sem o número. */
const ENUMERA_OBRIGATORIOS = /\bnome\s+e\s+(?:o\s+)?(?:seu\s+)?whats\s?app\b/i;

function arquivosDeCopy(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...arquivosDeCopy(full));
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Remove comentários de bloco e de linha. Grosseiro de propósito: pode comer um
 * `//` dentro de uma string (uma URL), e isso só torna o teste mais permissivo —
 * nunca produz alarme falso, que é o erro que importa evitar aqui.
 */
function semComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

const ARQUIVOS = RAIZES.flatMap(arquivosDeCopy);

/** O formulário conta o que está PENDENTE — ver o cabeçalho. */
const FORMULARIO = path.join(SRC, "components", "marketing", "DemoForm.tsx");
const COPY = ARQUIVOS.filter((f) => f !== FORMULARIO);

describe("o site não promete quantidade nem lista de campos do formulário", () => {
  it("há copy de site para varrer (senão o teste passa por vazio)", () => {
    expect(ARQUIVOS.length).toBeGreaterThan(30);
  });

  it("nenhum texto visível conta os campos do formulário", () => {
    const culpados: string[] = [];
    for (const file of COPY) {
      const texto = semComentarios(readFileSync(file, "utf8"));
      const achou = texto.match(CONTA_CAMPOS);
      if (achou) culpados.push(`${path.relative(SRC, file)}: "${achou[0]}"`);
    }
    expect(
      culpados,
      'Copy do site conta campos do formulário. Esse número envelhece a cada ' +
        'mudança de formulário — em 08/08 quatro páginas diziam "São dois campos" ' +
        "com o formulário já em seis. Descreva o que a pessoa ganha, não quantos " +
        "campos ela preenche.",
    ).toEqual([]);
  });

  it("nenhum texto visível enumera os campos obrigatórios", () => {
    const culpados: string[] = [];
    for (const file of ARQUIVOS) {
      const texto = semComentarios(readFileSync(file, "utf8"));
      const achou = texto.match(ENUMERA_OBRIGATORIOS);
      if (achou) culpados.push(`${path.relative(SRC, file)}: "${achou[0]}"`);
    }
    expect(
      culpados,
      'Copy do site enumera os campos obrigatórios ("nome e WhatsApp"). Desde ' +
        "08/08/2026 o e-mail também é obrigatório, então a lista está incompleta — " +
        "e vai ficar incompleta de novo na próxima mudança. Fale em “seus dados de " +
        "contato”.",
    ).toEqual([]);
  });

  it("a exceção não é buraco: o número do formulário é CONTADO, não escrito", () => {
    const fonte = semComentarios(readFileSync(FORMULARIO, "utf8"));

    // O plural sai de `problemas.length` — se alguém trocar por um literal, a
    // contagem volta a ser uma afirmação sobre o formulário e some daqui.
    expect(
      /\$\{problemas\.length\}\s*campos/.test(fonte),
      "O resumo do formulário deixou de contar `problemas.length` e passou a " +
        "afirmar um número de campos. A exceção deste teste existe só enquanto o " +
        "número for uma contagem do que está pendente.",
    ).toBe(true);

    // E o singular só aparece atrás da comparação com 1 — nunca solto.
    expect(/problemas\.length === 1/.test(fonte)).toBe(true);
  });

  it("controle positivo: as duas regras REPROVAM a frase que existia", () => {
    // Sem isto, um regex quebrado deixaria os dois testes acima verdes para sempre.
    const frase = "São dois campos: seu nome e seu WhatsApp.";
    expect(CONTA_CAMPOS.test(frase)).toBe(true);
    expect(ENUMERA_OBRIGATORIOS.test(frase)).toBe(true);
    expect(CONTA_CAMPOS.test("Você deixa seu contato e a gente chama.")).toBe(false);
    expect(ENUMERA_OBRIGATORIOS.test("Você deixa seus dados de contato.")).toBe(false);
  });
});
