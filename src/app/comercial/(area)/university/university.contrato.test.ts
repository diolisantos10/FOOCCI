/**
 * O CONTRATO DA TELA DA FOOCCI UNIVERSITY.
 *
 * Esta tela nasceu de um defeito: a Academia Comercial foi publicada em
 * produção e ficou DESLIGADA, porque a trava "o código nunca publica sozinho"
 * estava certa e não havia mão humana que pudesse acioná-la. Os casos abaixo
 * guardam as duas metades desse aprendizado — a maçaneta existe, e a trava
 * continua de pé.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROTAS, abasDoComercial } from "@/lib/sala/rotas";

const RAIZ = process.cwd();
const CLIENT = readFileSync(join(RAIZ, "src/app/comercial/(area)/university/UniversityClient.tsx"), "utf8");
const ROTA_CONTEUDO = readFileSync(
  join(RAIZ, "src/app/api/admin/sala-de-vendas/supervisora/academia/conteudo/route.ts"),
  "utf8",
);

/**
 * O fonte SEM os comentários.
 *
 * Os dois arquivos EXPLICAM, em prosa, por que não publicam — e é bom que
 * expliquem. Um caso que procurasse a palavra no arquivo inteiro reprovaria
 * exatamente a documentação que queremos manter. O que não pode existir é a
 * CHAMADA.
 */
const semComentarios = (fonte: string): string =>
  fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("a maçaneta existe e está no lugar certo", () => {
  it("⭐ gestão e auditoria alcançam a aba; quem é medido pela conversa não", () => {
    for (const papel of ["MASTER_CEO", "DIRETOR_FOOCCI", "GERENTE_DEPARTAMENTO", "AUDITOR_QA"] as const) {
      expect(abasDoComercial(papel).some((a) => a.href === ROTAS.university), papel).toBe(true);
    }
    expect(abasDoComercial("AGENTE_HUMANO").some((a) => a.href === ROTAS.university)).toBe(false);
  });

  it("⛔ o estado vazio diz que os agentes NÃO receberam o conhecimento", () => {
    // Uma faixa em branco aqui deixaria o CEO concluir que a Academia está
    // ligada. Este é o estado do dia em que a tela nasceu.
    expect(CLIENT).toContain("Nenhuma versão publicada — os agentes ainda não receberam este conhecimento.");
  });

  it("diz o que está valendo antes de oferecer botão", () => {
    const valendo = CLIENT.indexOf("O que está valendo agora");
    const versoes = CLIENT.indexOf('titulo="As versões"');
    expect(valendo).toBeGreaterThan(-1);
    expect(versoes).toBeGreaterThan(-1);
    expect(valendo).toBeLessThan(versoes);
  });
});

describe("⛔ a trava não afrouxou", () => {
  it("publicar passa por confirmação de gente", () => {
    expect(CLIENT).toContain("window.confirm");
    expect(CLIENT).toContain("Isto muda o que os agentes falam com cliente de verdade");
  });

  it("a tela não conhece o banco nem o interruptor — ela chama a rota", () => {
    const codigo = semComentarios(CLIENT);
    expect(codigo).not.toContain("prisma");
    expect(codigo).not.toContain("academiaInterruptor");
    expect(CLIENT).toContain('"/api/admin/sala-de-vendas/supervisora/academia"');
  });

  it("o endpoint novo é SÓ de leitura, e usa a mesma guarda do painel", () => {
    expect(ROTA_CONTEUDO).toContain("guardarPainelDaSupervisora");
    const codigo = semComentarios(ROTA_CONTEUDO);
    expect(codigo).not.toContain("export async function POST");
    expect(codigo).not.toContain("publicarVersaoDaAcademia");
  });

  it("o botão não é oferecido a quem a rota vai recusar", () => {
    expect(CLIENT).toContain("podePublicar");
    expect(CLIENT).toContain("setPodePublicar(corpo.data.podePublicar === true)");
  });
});
