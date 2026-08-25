/**
 * O ENSAIO NÃO ESCREVE NADA — e isso é estrutural, não uma promessa.
 *
 * A rota existe para o CEO ver o TA trabalhando ANTES de decidir ligá-lo. Se
 * ela gravasse mensagem, tocasse em lead ou chamasse o canal, o ensaio deixaria
 * de ser ensaio: seria a IA operando, com outro nome, antes da decisão que ela
 * existe para informar.
 *
 * Um comentário dizendo "não escreve" não garante nada — basta um `import` num
 * dia apressado. Este teste lê o código-fonte da rota e reprova se qualquer
 * caminho de escrita entrar. É a diferença entre aviso e trava.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const FONTE = readFileSync(path.join(__dirname, "route.ts"), "utf8");

const semComentarios = FONTE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("a rota de ensaio", () => {
  it("não importa o banco", () => {
    expect(semComentarios, "importou prisma — o ensaio passaria a gravar").not.toMatch(
      /from ["']@\/lib\/prisma["']/,
    );
    expect(semComentarios).not.toMatch(/\bprisma\./);
  });

  it("não importa o canal de envio", () => {
    // O caminho que faria uma mensagem de teste chegar num WhatsApp de verdade.
    expect(semComentarios).not.toMatch(/FoocciSalesChannel/);
    expect(semComentarios).not.toMatch(/registrarSaida/);
    expect(semComentarios).not.toMatch(/enviarMensagem/);
  });

  it("não toca em conversa nem em lead", () => {
    expect(semComentarios).not.toMatch(/salaDeVendas\/conversa/);
    expect(semComentarios).not.toMatch(/siteLead/);
    expect(semComentarios).not.toMatch(/leadMensagem/);
  });

  it("continua atrás da guarda da Sala", () => {
    // A metade que passa. Sem ela, um arquivo que não importasse NADA — nem a
    // guarda — passaria em todos os casos acima e deixaria a rota aberta.
    expect(semComentarios).toMatch(/guardarSalaDeVendas/);
  });

  it("responde usando o TA, e não um texto fixo", () => {
    expect(semComentarios).toMatch(/salaDeVendas\/ta\/responder/);
  });
});
