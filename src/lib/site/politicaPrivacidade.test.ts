/**
 * UMA POLÍTICA DE PRIVACIDADE, E O CONSENTIMENTO APONTANDO PARA ELA.
 *
 * ── O defeito que este arquivo impede ───────────────────────────────────────
 *
 * Até 29/08/2026 havia DUAS políticas no ar, com datas diferentes: a completa em
 * `/privacidade` (30/07) e uma de pré-lançamento em `/site/politica-de-privacidade`
 * (04/06). O consentimento do formulário do site gravava a **mais velha**, e o
 * rodapé — único caminho até a política a partir do formulário — levava a essa
 * mesma página velha, que dizia cobrir só o site. Resultado: um registro de
 * consentimento que apontava para um texto escrito antes de existir formulário.
 *
 * Um registro assim é pior que registro nenhum: parece prova.
 *
 * ── AS DUAS METADES, SEMPRE ─────────────────────────────────────────────────
 *
 * Cada regra aparece duas vezes: recusando o que não presta E deixando passar o
 * que presta. Um arquivo só com a primeira metade ficaria verde contra um
 * `descreveVersaoConsentida` que dissesse "não catalogada" para tudo — e uma
 * função assim é indistinguível de uma quebrada, com o agravante de parecer
 * rigorosa.
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  POLITICA_PRIVACIDADE_CAMINHO,
  POLITICA_PRIVACIDADE_VERSAO,
  POLITICA_PRIVACIDADE_ATUALIZADA_EM,
  POLITICAS_RECOLHIDAS,
  descreveVersaoConsentida,
} from "./politicaPrivacidade";

const RAIZ = process.cwd();
const ler = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

// ═══════════════════════════════════════════════════════════════════════════
// A FONTE ÚNICA
// ═══════════════════════════════════════════════════════════════════════════

describe("a política é uma só, e a fonte dela é este arquivo", () => {
  it("a versão é uma data ISO — para ordenar sozinha e nunca virar 'v2'", () => {
    // A metade que PASSA. `consentPolicyVersion` é gravado no banco; um formato
    // que não ordena obriga a decorar a cronologia para responder "qual veio
    // antes" numa auditoria.
    expect(POLITICA_PRIVACIDADE_VERSAO).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("⭐ a versão gravada NÃO é a de pré-lançamento", () => {
    // O defeito exato, em uma linha. `2026-06-04` é a política de pré-lançamento
    // — a que o consentimento gravava enquanto a pessoa era levada a outra.
    expect(POLITICA_PRIVACIDADE_VERSAO).not.toBe("2026-06-04");
    expect(POLITICA_PRIVACIDADE_VERSAO).toBe("2026-07-30");
  });

  it("o caminho é o da política pública, e é absoluto", () => {
    // `/privacidade` está em `PUBLIC_PATHS` do middleware: é a única alcançável
    // sem sessão, e é a exigida pela revisão de app da Meta e do Google. Um
    // caminho relativo aqui viraria link quebrado dependendo da página.
    expect(POLITICA_PRIVACIDADE_CAMINHO).toBe("/privacidade");
    expect(POLITICA_PRIVACIDADE_CAMINHO.startsWith("/")).toBe(true);
  });

  it("⭐ a data que a pessoa lê e a versão gravada são o MESMO dia", () => {
    // O jeito de as duas se separarem em silêncio: alguém muda o texto, atualiza
    // a data visível e esquece a chave (ou o contrário). A partir daí o registro
    // diz uma coisa e a página diz outra, e ninguém vê erro nenhum.
    const [ano, mes, dia] = POLITICA_PRIVACIDADE_VERSAO.split("-");
    const MESES = [
      "janeiro", "fevereiro", "março", "abril", "maio", "junho",
      "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
    ];
    expect(POLITICA_PRIVACIDADE_ATUALIZADA_EM).toBe(
      `${Number(dia)} de ${MESES[Number(mes) - 1]} de ${ano}`,
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// O PASSADO, QUE NÃO SE REESCREVE
// ═══════════════════════════════════════════════════════════════════════════

describe("as versões recolhidas continuam nomeadas", () => {
  it("⭐ a política de pré-lançamento está catalogada, com o porquê", () => {
    // Ela existe no banco: todo contato gravado entre 14/08 e 29/08/2026 tem
    // `consentPolicyVersion = "2026-06-04"`. Apagá-la daqui não apagaria o dado
    // — só tornaria o dado ilegível, que é a pior das duas coisas.
    const antiga = POLITICAS_RECOLHIDAS.find((p) => p.versao === "2026-06-04");
    expect(antiga).toBeDefined();
    expect(antiga!.ondeFicava).toBe("/site/politica-de-privacidade");
    expect(antiga!.porque.length).toBeGreaterThan(40);
  });

  it("nenhuma versão recolhida colide com a que está no ar", () => {
    // Se a atual aparecesse na lista de recolhidas, `descreveVersaoConsentida`
    // ainda diria "atual" (a comparação vem antes), e a ficha mostraria como
    // vigente uma versão que a própria lista declara morta.
    expect(POLITICAS_RECOLHIDAS.map((p) => p.versao)).not.toContain(
      POLITICA_PRIVACIDADE_VERSAO,
    );
  });

  it("cada recolhida traz data de recolhimento em ISO", () => {
    for (const p of POLITICAS_RECOLHIDAS) {
      expect(p.recolhidaEm, p.versao).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(p.versao, p.versao).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// A LEITURA DO QUE FOI CONSENTIDO
// ═══════════════════════════════════════════════════════════════════════════

describe("o que a ficha do contato diz sobre a versão consentida", () => {
  it("a versão em vigor é apresentada como em vigor", () => {
    // A metade que PASSA. Sem ela, tudo abaixo ficaria verde contra uma função
    // que dissesse "não catalogada" para qualquer entrada.
    const r = descreveVersaoConsentida(POLITICA_PRIVACIDADE_VERSAO);
    expect(r.situacao).toBe("atual");
    expect(r.rotulo).toContain(POLITICA_PRIVACIDADE_VERSAO);
  });

  it("⭐ a versão recolhida é nomeada como anterior — não reinterpretada", () => {
    // O ponto inteiro do "deixe o passado visível". A tentação é traduzir tudo
    // para a política de hoje; isso transformaria um consentimento a um texto de
    // pré-lançamento numa afirmação de que a pessoa leu o texto atual.
    const r = descreveVersaoConsentida("2026-06-04");
    expect(r.situacao).toBe("recolhida");
    expect(r.rotulo).toContain("2026-06-04");
    expect(r.rotulo).toContain("anterior");
  });

  it("⭐ nulo é 'não registrada' — e NUNCA 'não consentiu'", () => {
    // Guardrail 1: ausência de informação não é informação. Contato anterior a
    // 14/08/2026 não tem versão gravada porque o campo não existia — dizer
    // "não consentiu" seria concluir uma negação do silêncio, e apagaria a
    // captura legítima de quem preencheu o formulário.
    for (const vazio of [null, undefined, ""]) {
      const r = descreveVersaoConsentida(vazio);
      expect(r.situacao, String(vazio)).toBe("naoRegistrada");
      expect(r.rotulo, String(vazio)).toContain("não registrada");
      expect(r.rotulo.toLowerCase(), String(vazio)).not.toContain("não consentiu");
    }
  });

  it("versão que ninguém catalogou aparece crua, sem inventar significado", () => {
    // Só acontece se alguém mexer na constante sem registrar a que saiu. Mostrar
    // o valor cru é o que permite descobrir isso; traduzir para "atual" ou para
    // "recolhida" esconderia justamente o erro de manutenção.
    const r = descreveVersaoConsentida("2025-01-01");
    expect(r.situacao).toBe("desconhecida");
    expect(r.rotulo).toContain("2025-01-01");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// NINGUÉM DIGITA A POLÍTICA À MÃO — VARREDURA DE TEXTO
// ═══════════════════════════════════════════════════════════════════════════

describe("⭐ a versão gravada e a que a pessoa vê saem da mesma constante", () => {
  it("quem grava o consentimento importa a constante — não escreve a data", () => {
    // O defeito reaparece exatamente assim: alguém repete a data no serviço
    // "só para não importar". A partir daí as duas se separam na primeira
    // atualização da política, e ninguém vê erro nenhum.
    const fonte = ler("src/services/site/SiteLeadService.ts");
    expect(fonte).toContain("POLITICA_PRIVACIDADE_VERSAO");
    expect(fonte).not.toMatch(/consentPolicyVersion:\s*"/);
  });

  it("⭐ o formulário LINKA a política que o envio consente", () => {
    /* Era o buraco real: `consentAt` era gravado e a política não aparecia em
     * lugar nenhum da tela do formulário — o único caminho era o rodapé, e o
     * rodapé levava a OUTRA política. Consentimento a um texto que a pessoa não
     * teve como ver é carimbo, não prova.
     *
     * Confere o LINK, e não a frase: um texto solto dizendo "concordo com a
     * política" sem caminho para ela é o mesmo nada com outra redação. E o
     * `href` sai da constante — a mesma que é gravada no banco. */
    const fonte = ler("src/components/marketing/DemoForm.tsx");
    expect(fonte).toContain("href={POLITICA_PRIVACIDADE_CAMINHO}");
    expect(fonte).toContain("Política de Privacidade");
    expect(fonte).toMatch(/Ao enviar, você concorda com a/);
  });

  it("⭐ a página pública lê a data da constante, sem repeti-la", () => {
    // A data era uma string solta nesta página. Foi assim que o site passou a
    // ter duas datas de política ao mesmo tempo.
    const fonte = ler("src/app/privacidade/page.tsx");
    expect(fonte).toContain("POLITICA_PRIVACIDADE_ATUALIZADA_EM");
    expect(fonte).not.toContain("30 de julho de 2026");
  });

  it("⭐ a página de pré-lançamento não é mais uma segunda política", () => {
    // Ela permanece como ROTA (está no rodapé publicado, no sitemap e em links
    // guardados), mas não pode voltar a ter texto próprio: era o texto dela,
    // com data própria, que fazia existirem duas políticas.
    const fonte = ler("src/app/site/(gated)/politica-de-privacidade/page.tsx");
    expect(fonte).toContain("permanentRedirect");
    expect(fonte).toContain("POLITICA_PRIVACIDADE_CAMINHO");
    // Nenhum bloco de política sobrou.
    expect(fonte).not.toContain("LegalBlock");
  });

  it("o rodapé do site aponta para a política canônica", () => {
    const fonte = ler("src/components/marketing/MarketingFooter.tsx");
    expect(fonte).toContain("POLITICA_PRIVACIDADE_CAMINHO");
    expect(fonte).not.toContain('href: "/site/politica-de-privacidade"');
  });
});
