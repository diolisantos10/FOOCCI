/**
 * O VERIFICADOR — as cinco mentiras que ele não deixa passar.
 *
 * ── POR QUE ESTE ARQUIVO É O MAIS IMPORTANTE DO DIRETÓRIO ───────────────────
 *
 * A partir de 26/08/2026 quem redige a fala do TA é um modelo. O prompt pede que
 * ele não invente; este arquivo prova que, quando ele inventar — e vai —, o
 * texto **não sai**.
 *
 * Cada caso aqui é uma frase que um modelo escreveria com naturalidade, em
 * português impecável, e que custaria caro na vida real. Metade dos casos prova
 * que o portão barra; a outra metade prova que ele deixa passar a versão honesta
 * da MESMA frase. Um verificador que só barra vira um verificador desligado no
 * dia em que ele reprovar a resposta certa três vezes seguidas.
 */

import { describe, it, expect } from "vitest";
import { verificarResposta, valoresPermitidos } from "./verificador";
import { tabelaPublicada } from "../precos";

/** Um preço que existe de verdade, tirado da tabela viva. */
const PRECO_REAL = tabelaPublicada()[0]!.ciclos.find((c) => c.ciclo === "MENSAL")!.doCiclo;

describe("preço — o defeito que já nasce como pedido de reembolso", () => {
  it("⭐ barra valor que não está na tabela", () => {
    const r = verificarResposta("O plano Essencial sai por R$ 149,00 por mês, fechado.");
    expect(r.aprovada).toBe(false);
    expect(r.motivos).toContain("precoForaDaTabela");
    expect(r.detalhe).toContain("149");
  });

  it("deixa passar o preço REAL, escrito como a tabela escreve", () => {
    // A metade que passa, e ela é a que mantém o portão ligado: um verificador
    // que barrasse o preço certo seria desativado por incômodo na primeira semana.
    const r = verificarResposta(`O plano custa ${PRECO_REAL} por mês.`);
    expect(r.aprovada, r.detalhe).toBe(true);
  });

  it("a lista de valores vem da tabela viva, e não é vazia", () => {
    // Se `valoresPermitidos()` voltasse vazio, TODO preço seria barrado — e o TA
    // ficaria mudo justamente na pergunta mais comum de todas.
    expect(valoresPermitidos().size).toBeGreaterThan(3);
  });

  it("texto sem preço nenhum passa", () => {
    expect(verificarResposta("Posso te explicar como funciona o pedido guiado?").aprovada).toBe(true);
  });
});

describe("prazo — o compromisso que quem redige não pode assumir", () => {
  it("barra 'em 3 dias você está no ar'", () => {
    const r = verificarResposta("Fechando hoje, em 3 dias você já está no ar com tudo funcionando.");
    expect(r.aprovada).toBe(false);
    expect(r.motivos).toContain("prometeuPrazo");
  });

  it("barra 'amanhã você já está vendendo'", () => {
    expect(verificarResposta("Amanhã você já está vendendo pelo sistema.").motivos)
      .toContain("prometeuPrazo");
  });

  it("mas falar de prazo SEM prometer passa", () => {
    // O TA precisa poder responder "quanto tempo demora?" com honestidade.
    const r = verificarResposta("A implantação depende do tamanho do seu cardápio. Quer que eu chame alguém do time para te dar um prazo certo?");
    expect(r.aprovada, r.detalhe).toBe(true);
  });
});

describe("garantia de resultado — fecha hoje, vira processo depois", () => {
  it("barra 'aumenta 30% o faturamento'", () => {
    const r = verificarResposta("Com o Foocci você aumenta 30% o faturamento no primeiro mês.");
    expect(r.aprovada).toBe(false);
    expect(r.motivos).toContain("garantiuResultado");
  });

  it("barra 'garanto que'", () => {
    expect(verificarResposta("Garanto que você para de pagar comissão.").motivos)
      .toContain("garantiuResultado");
  });

  it("mas descrever o que o produto FAZ passa", () => {
    const r = verificarResposta("O pedido sai pelo seu próprio canal, então não há comissão de marketplace nessa venda.");
    expect(r.aprovada, r.detalhe).toBe(true);
  });
});

describe("⭐ integração — a pergunta que mais decide a venda", () => {
  it("barra 'funciona com o iFood'", () => {
    // O exemplo canônico: dito a quem tira metade do faturamento do iFood, fecha
    // o negócio na hora e explode na implantação.
    const r = verificarResposta("Sim, o Foocci funciona com o iFood.");
    expect(r.aprovada).toBe(false);
    expect(r.motivos).toContain("integracaoInventada");
    expect(r.detalhe).toContain("ifood");
  });

  it("⭐ 'sem problema nenhum' é ênfase, e não negação", () => {
    // A regressão de 26/08/2026, e vale escrita porque quase passou despercebida.
    // A primeira versão procurava negação em qualquer lugar da frase, com uma
    // lista que incluía "nenhum" e "sem". Resultado: a mentira mais cara que este
    // arquivo existe para barrar foi lida como negação e APROVADA.
    const r = verificarResposta("Sim, o Foocci funciona com o iFood sem problema nenhum.");
    expect(r.aprovada, r.detalhe).toBe(false);
    expect(r.motivos).toContain("integracaoInventada");
  });

  it("barra 'integramos com o Rappi'", () => {
    expect(verificarResposta("Nós integramos com o Rappi também.").motivos)
      .toContain("integracaoInventada");
  });

  it("⭐ mas NEGAR a integração é resposta honesta, e passa", () => {
    // O caso que separa este verificador de um `includes`. Barrar isto obrigaria
    // o TA a desviar do assunto justamente na pergunta que mais decide a venda —
    // e desviar é pior que dizer não.
    const r = verificarResposta("Hoje o Foocci não integra com o iFood. Ele funciona no seu canal próprio.");
    expect(r.aprovada, r.detalhe).toBe(true);
  });

  it("a negação vale por FRASE, não pelo parágrafo inteiro", () => {
    // Duas frases, uma afirmando o que existe e outra afirmando o que não
    // existe. Tratar o parágrafo como um bloco deixaria a segunda passar de
    // carona na negação da primeira — ou barraria as duas.
    const r = verificarResposta("Não trabalhamos com marketplace. E integramos com o iFood também.");
    expect(r.aprovada).toBe(false);
    expect(r.motivos).toContain("integracaoInventada");
  });

  it("integração que EXISTE passa", () => {
    const r = verificarResposta("O pagamento é pelo Mercado Pago, com Pix na hora.");
    expect(r.aprovada, r.detalhe).toBe(true);
  });
});

describe("fechar em nome do cliente — inventar um ato que não aconteceu", () => {
  it("barra 'já deixei contratado'", () => {
    const r = verificarResposta("Perfeito, já deixei contratado o plano Crescimento para você.");
    expect(r.aprovada).toBe(false);
    expect(r.motivos).toContain("fechouPeloCliente");
  });

  it("mas mandar o cliente fechar no checkout passa", () => {
    const r = verificarResposta("Quem fecha é você, no site. Te mando o link e você assina em dois minutos.");
    expect(r.aprovada, r.detalhe).toBe(true);
  });
});

describe("o vazio nunca vira aprovação", () => {
  it("texto vazio é reprovado com motivo", () => {
    // Guardrail 1: ausência de informação não é informação. Um modelo que
    // devolve string vazia não produziu uma resposta aprovável.
    for (const nada of ["", "   ", "\n\n"]) {
      const r = verificarResposta(nada);
      expect(r.aprovada).toBe(false);
      expect(r.motivos).toContain("vazio");
    }
  });
});

describe("uma resposta pode ter mais de um problema", () => {
  it("todos os motivos são nomeados, não só o primeiro", () => {
    // Devolver só o primeiro faria a correção virar um jogo de tentativa e erro:
    // arruma o preço, reprova de novo pelo prazo, arruma o prazo, reprova pela
    // garantia. Quem lê o ensaio precisa ver a lista inteira de uma vez.
    const r = verificarResposta(
      "Por R$ 149,00 em 3 dias você está no ar e garanto que aumenta 30% o faturamento.",
    );
    expect(r.aprovada).toBe(false);
    expect(r.motivos).toEqual(
      expect.arrayContaining(["precoForaDaTabela", "prometeuPrazo", "garantiuResultado"]),
    );
  });
});
