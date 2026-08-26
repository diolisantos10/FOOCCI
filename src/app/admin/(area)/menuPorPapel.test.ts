/**
 * O MENU FECHA POR PAPEL — e o "ver como" nunca abre nada.
 *
 * ── O QUE ESTE TESTE GUARDA ─────────────────────────────────────────────────
 *
 * Em 25/08/2026 o CEO abriu o Admin em produção e concluiu que o menu estava
 * escancarado para todo mundo. Não estava — ele tinha entrado pela senha
 * compartilhada, que não carrega papel e por desenho mostra tudo. Mas a
 * conclusão dele era razoável, e é o tipo de coisa que só se resolve deixando
 * **conferível**.
 *
 * Daí o seletor "ver como". E daí este teste, que guarda a única coisa que pode
 * dar errado nele: **espiar o menu de alguém não pode virar permissão**. Um
 * seletor que amplia o que a pessoa alcança é escalada de privilégio com cara
 * de conveniência — e ela entra no repositório parecendo uma facilidade.
 *
 * Por isso o teste lê o código-fonte da barra: a garantia precisa ser estrutural.
 * Uma asserção de comportamento provaria que HOJE não amplia; ler o fonte prova
 * que o caminho para ampliar não existe.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const FONTE = readFileSync(path.join(__dirname, "AdminSidebar.tsx"), "utf8");
const SEM_COMENTARIOS = FONTE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("o menu por papel", () => {
  it("o vendedor alcança a área comercial e nada mais", () => {
    // Critério 6 do CEO, e é o caso que mais importa: vinte portas que devolvem
    // 403 ensinam que o sistema é imprevisível, e a pessoa passa a não confiar
    // no que ela PODE clicar.
    const bloco = /AGENTE_HUMANO:\s*\[([^\]]*)\]/.exec(SEM_COMENTARIOS);
    expect(bloco, "AGENTE_HUMANO sumiu do mapa do menu").not.toBeNull();

    const rotas = bloco![1]!.match(/"[^"]+"/g) ?? [];
    // Em 26/08/2026 a Sala saiu de dentro do Admin e virou `/comercial`. O
    // escopo do vendedor continua sendo UM item — o endereço é que mudou.
    // (Não `/atendimento`: aquele já é a caixa de conversas do restaurante.)
    expect(rotas).toEqual(['"/comercial"']);
  });

  it("CEO e Diretor veem tudo — e isso é declarado, não esquecido", () => {
    // A metade que passa. Sem ela, um mapa que fechasse TUDO para todos
    // passaria no caso acima e deixaria a casa sem ninguém enxergando nada.
    expect(SEM_COMENTARIOS).toMatch(/MASTER_CEO:\s*null/);
    expect(SEM_COMENTARIOS).toMatch(/DIRETOR_FOOCCI:\s*null/);
  });

  it("gerente e auditoria têm escopo próprio, e nenhum é o do vendedor", () => {
    for (const papel of ["GERENTE_DEPARTAMENTO", "AUDITOR_QA"]) {
      const bloco = new RegExp(`${papel}:\\s*\\[([^\\]]*)\\]`).exec(SEM_COMENTARIOS);
      expect(bloco, `${papel} sumiu do mapa`).not.toBeNull();
      const rotas = bloco![1]!.match(/"[^"]+"/g) ?? [];
      expect(rotas.length, `${papel} com escopo vazio`).toBeGreaterThan(1);
      expect(rotas, `${papel} sem a Sala`).toContain('"/comercial"');
    }
  });
});

describe('o seletor "ver como"', () => {
  it("só quem manda na casa pode espiar", () => {
    const bloco = /PODE_ESPIAR = new Set\(\[([^\]]*)\]\)/.exec(SEM_COMENTARIOS);
    expect(bloco, "a lista de quem pode espiar sumiu").not.toBeNull();

    const papeis = bloco![1]!.match(/"[^"]+"/g) ?? [];
    expect(papeis.sort()).toEqual(['"DIRETOR_FOOCCI"', '"MASTER_CEO"']);
    // O vendedor NÃO pode: ele espiaria o menu do CEO e aprenderia o mapa do
    // que não alcança — inofensivo em tela, mas é o começo do caminho errado.
    expect(papeis).not.toContain('"AGENTE_HUMANO"');
  });

  it("⭐ espiar afeta o MENU e nada mais", () => {
    // O caso que carrega este arquivo. `papelDoMenu` é a única coisa que o
    // seletor alimenta, e ela só entra em `permitidos` — que é usado para
    // FILTRAR a lista, nunca para autorizar.
    expect(SEM_COMENTARIOS).toMatch(/const papelDoMenu = podeEspiar && espiando \? espiando : papel/);
    expect(SEM_COMENTARIOS).toMatch(/const permitidos = papelDoMenu \?/);

    // E o estado do seletor não sai da barra: nada de cookie, nada de fetch,
    // nada de cabeçalho. Se um destes aparecer perto de `espiando`, o seletor
    // deixou de ser conferência e virou identidade.
    for (const caminho of [/document\.cookie/, /localStorage/, /x-.*-papel/i]) {
      expect(SEM_COMENTARIOS, `o seletor passou a persistir identidade: ${caminho}`)
        .not.toMatch(caminho);
    }
  });

  it("espiar cai no papel real quando quem espia não pode", () => {
    // A trava que impede um `setEspiando` acidental de ampliar o que alguém vê.
    expect(SEM_COMENTARIOS).toContain("podeEspiar && espiando");
  });
});
