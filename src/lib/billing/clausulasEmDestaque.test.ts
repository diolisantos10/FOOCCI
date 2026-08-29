/**
 * AS CLÁUSULAS QUE LIMITAM DIREITO PRECISAM SER LIDAS SEM CLIQUE.
 *
 * CDC, art. 54 §4º: *"As cláusulas que implicarem limitação de direito do
 * consumidor deverão ser redigidas com destaque, permitindo sua imediata e fácil
 * compreensão."*
 *
 * ── O defeito que este arquivo impede ───────────────────────────────────────
 *
 * Até 29/08/2026, nas DUAS telas onde o contrato é apresentado antes do aceite,
 * as duas cláusulas mais duras estavam onde a lei não quer:
 *
 *   · `/contratar/novo` — dentro do bloco que só aparece depois de clicar em
 *     "Ler o Termo" (`showTerms`), com o checkbox de aceite logo abaixo. Quem
 *     tem pressa aceita sem abrir — e o normal é ter pressa.
 *   · `/contratar/[token]` — as últimas de nove seções, dentro de uma caixa com
 *     rolagem própria de meia tela.
 *
 * Presentes, e ilegíveis. Ninguém escondeu nada de propósito: texto longo vai
 * parar atrás de um clique porque é o que se faz com texto longo. É por isso que
 * a trava é um teste, e não um combinado.
 *
 * ── AS DUAS METADES, SEMPRE ─────────────────────────────────────────────────
 *
 * Cada regra aparece duas vezes: recusando o que não presta E deixando passar o
 * que presta. Um arquivo só com a primeira metade ficaria verde contra um
 * `clausulasEmDestaque()` que devolvesse lista vazia — e uma lista vazia é
 * exatamente o defeito, com o agravante de o componente sumir sem erro nenhum.
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  TERMS_SECTIONS,
  TERMS_VERSION,
  TITULOS_EM_DESTAQUE,
  clausulasEmDestaque,
} from "./terms";

const RAIZ = process.cwd();
const ler = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

/** Comentários fora: o destaque tem de estar no que RENDERIZA, não no porquê. */
function semComentarios(fonte: string): string {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join("\n");
}

// ═══════════════════════════════════════════════════════════════════════════
// A LISTA
// ═══════════════════════════════════════════════════════════════════════════

describe("as cláusulas marcadas para destaque", () => {
  it("são duas, e as duas existem no contrato", () => {
    // A metade que PASSA, e a mais importante: sem ela, tudo abaixo ficaria
    // verde contra uma lista vazia — e o bloco de destaque simplesmente não
    // apareceria na tela, sem erro nenhum para ver.
    const destaque = clausulasEmDestaque();
    expect(destaque).toHaveLength(2);
    expect(destaque.map((c) => c.title)).toEqual([...TITULOS_EM_DESTAQUE]);
  });

  it("⭐ todo título marcado casa com uma seção de verdade do Termo", () => {
    // O jeito silencioso de o destaque morrer: alguém renomeia a seção 8 no
    // Termo e o título aqui deixa de casar. `clausulasEmDestaque()` filtra, a
    // cláusula some da tela, e nada quebra. É este teste que quebra.
    const titulos = TERMS_SECTIONS.map((s) => s.title);
    for (const t of TITULOS_EM_DESTAQUE) {
      expect(titulos, `título marcado que não existe no Termo: ${t}`).toContain(t);
    }
  });

  it("⭐ a limitação de responsabilidade está entre elas", () => {
    // É a cláusula que mais limita quem assina: teto de 12 meses de pagamento e
    // exclusão de lucros cessantes.
    const corpo = clausulasEmDestaque().map((c) => c.body).join(" ");
    expect(corpo).toContain("responsabilidade total da Foocci fica limitada");
    expect(corpo).toContain("12 meses anteriores");
    expect(corpo).toContain("lucros cessantes");
  });

  it("⭐ a cláusula de vigência, cancelamento e dados está entre elas", () => {
    // É onde moram o efeito do cancelamento e o apagamento dos dados em 60 dias
    // — as duas coisas que o cliente descobre tarde demais.
    //
    // Na v1 o efeito era "ao fim do ciclo pago". Na v2 (29/08/2026) passou a ser
    // "ao fim do mês em curso", porque o período não entregue passou a ser
    // devolvido: manter o acesso até o fim do ano pago E devolver o dinheiro
    // dele seriam as duas coisas ao mesmo tempo.
    const corpo = clausulasEmDestaque().map((c) => c.body).join(" ");
    expect(corpo).toContain("ao fim do mês em curso");
    expect(corpo).toContain("60 dias são excluídos");
  });

  it("o destaque respeita a ordem do contrato — não reordena a leitura", () => {
    const posicoes = clausulasEmDestaque().map((c) =>
      TERMS_SECTIONS.findIndex((s) => s.title === c.title),
    );
    expect(posicoes).toEqual([...posicoes].sort((a, b) => a - b));
  });

  it("⛔ o destaque é a cláusula PALAVRA POR PALAVRA — não uma segunda redação", () => {
    // Uma versão "mais amigável" da limitação de responsabilidade seria uma
    // SEGUNDA cláusula. E, por ter sido a lida em destaque, seria ela a valer —
    // contra nós. Por isso a lista guarda títulos, e o corpo vem do contrato.
    for (const c of clausulasEmDestaque()) {
      const original = TERMS_SECTIONS.find((s) => s.title === c.title);
      expect(original, c.title).toBeDefined();
      expect(c.body).toBe(original!.body);
    }
  });

  it("nem toda cláusula é destaque — senão nada é destaque", () => {
    // A outra metade. Se a lista crescesse para as nove seções, o bloco viraria
    // o contrato inteiro colado acima do contrato, e "destaque" deixaria de
    // significar coisa alguma.
    expect(TITULOS_EM_DESTAQUE.length).toBeLessThan(TERMS_SECTIONS.length / 2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AS DUAS TELAS DE ACEITE
// ═══════════════════════════════════════════════════════════════════════════

const TELAS_DE_ACEITE = [
  "src/app/contratar/novo/CheckoutClient.tsx",
  "src/app/contratar/[token]/page.tsx",
];

describe("⭐ onde o contrato é apresentado antes do aceite", () => {
  for (const tela of TELAS_DE_ACEITE) {
    it(`${tela} mostra o bloco de destaque`, () => {
      expect(semComentarios(ler(tela))).toContain("<ClausulasEmDestaque");
    });
  }

  it("⭐ no checkout, o destaque fica FORA do bloco que só abre com clique", () => {
    // O defeito exato. `showTerms` nasce `false`; tudo dentro de
    // `{showTerms && (...)}` é invisível para quem não clicou. O destaque
    // aparece ANTES dessa abertura — e este teste é a única coisa que impede
    // alguém de "organizar" a seção movendo o bloco para dentro.
    const codigo = semComentarios(ler("src/app/contratar/novo/CheckoutClient.tsx"));
    const posDestaque = codigo.indexOf("<ClausulasEmDestaque");
    const posAbertura = codigo.indexOf("{showTerms && (");

    expect(posDestaque, "o destaque sumiu do checkout").toBeGreaterThan(-1);
    expect(posAbertura, "o bloco condicional do Termo sumiu").toBeGreaterThan(-1);
    expect(
      posDestaque,
      "o destaque voltou para dentro do bloco que só abre ao clicar em 'Ler o Termo'",
    ).toBeLessThan(posAbertura);
  });

  it("⭐ no checkout, o destaque vem ANTES do checkbox de aceite", () => {
    // Destaque abaixo do aceite é destaque depois da decisão. A pessoa marca
    // "li e aceito" e só então encontra o que limita o direito dela.
    const codigo = semComentarios(ler("src/app/contratar/novo/CheckoutClient.tsx"));
    expect(codigo.indexOf("<ClausulasEmDestaque")).toBeLessThan(codigo.indexOf('id="aceite"'));
  });

  it("⭐ no link de aceite, o destaque fica FORA da caixa com rolagem", () => {
    // Lá as cláusulas eram as últimas de nove numa caixa de meia tela com
    // `overflow-y-auto`. Estar dentro da caixa é estar atrás de uma rolagem —
    // que é o mesmo problema do clique, com outro gesto.
    const codigo = semComentarios(ler("src/app/contratar/[token]/page.tsx"));
    expect(codigo.indexOf("<ClausulasEmDestaque")).toBeLessThan(codigo.indexOf("overflow-y-auto"));
  });

  it("o destaque vem antes do botão que confirma o aceite", () => {
    const codigo = semComentarios(ler("src/app/contratar/[token]/page.tsx"));
    expect(codigo.indexOf("<ClausulasEmDestaque")).toBeLessThan(codigo.indexOf("<AcceptClient"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// O COMPONENTE
// ═══════════════════════════════════════════════════════════════════════════

describe("o bloco de destaque", () => {
  const fonte = ler("src/components/billing/ClausulasEmDestaque.tsx");

  it("lê o texto do contrato — não escreve cláusula própria", () => {
    expect(semComentarios(fonte)).toContain("clausulasEmDestaque()");
  });

  it("⛔ não esconde nada atrás de <details> nem de estado", () => {
    // O componente existe para desfazer exatamente isso. Um `<details>` aqui
    // recriaria o defeito dentro da própria correção.
    const codigo = semComentarios(fonte);
    expect(codigo).not.toContain("<details");
    expect(codigo).not.toContain("useState");
  });

  it("é uma seção anunciada para quem usa leitor de tela", () => {
    // "Destaque" que só existe em cor não chega a quem navega por áudio.
    expect(fonte).toContain("aria-label");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// A TRAVA DO TEXTO DO CONTRATO
// ═══════════════════════════════════════════════════════════════════════════

describe("⛔ mudar o destaque não pode virar mudar o contrato", () => {
  it("a versão do Termo é a v3 aprovada pelo CEO", () => {
    // O ponto deste teste NUNCA foi a string "v1": é que texto e rótulo andam
    // juntos. Quem mexer no destaque e vir isto reprovar mexeu no texto sem
    // querer — e aí todo aceite anterior viraria afirmação sobre um texto que
    // ninguém consegue reproduzir.
    //
    // Em 29/08/2026 o texto mudou DUAS VEZES, de propósito: a regra de
    // cancelamento e devolução (v2) e, no mesmo dia, o recálculo pelo valor que
    // o cliente realmente pagou (v3). O rótulo subiu junto nas duas, e v1 e v2
    // continuam reproduzíveis em `termsArquivo` — é o que mantém de pé a prova
    // de quem aceitou cada uma.
    expect(TERMS_VERSION).toBe("v3-2026-08-29");
  });

  it("o Termo continua com as nove seções aprovadas", () => {
    expect(TERMS_SECTIONS).toHaveLength(9);
  });
});
