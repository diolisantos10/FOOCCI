/**
 * ⭐⭐ A TRADUÇÃO É COMPLETA — e é ela que decide se a escalada existe.
 *
 * ─── O DEFEITO QUE ESTE ARQUIVO IMPEDE DE VOLTAR ────────────────────────────
 *
 * Medido contra o núcleo REAL, em produção, em 30/08/2026: **zero interseção**
 * entre o vocabulário da Sala (`permuta`, `escopoAcimaDaCapacidade`,
 * `prazoDeImplantacao`) e o vocabulário fechado da casa. Toda escalada do Foocci
 * morria em `assunto_fora_do_vocabulario`, e o cliente esperava um gerente que
 * nunca foi perguntado.
 *
 * ⚠️ **E a suíte dava verde**, porque o núcleo de mentira aceitava qualquer
 * assunto. É a mesma classe de falha do `foraDaAlcada`, e a lição que ficou é a
 * que este arquivo aplica: **o gêmeo do outro lado tem que ser exigente, e a
 * cobertura da tradução tem que ser cobrada em código.**
 *
 * ─── A TRAVA, E ELA É DO TIPO "GÊMEA" ──────────────────────────────────────
 *
 * Um gatilho novo em `precos.ts` que escale sem par aqui reprova. Não é aviso e
 * não é convenção: é o mesmo desenho de `gemeas.test.ts` da casa — a cópia é
 * inevitável (o produto fala a língua dele), então o que se faz é torná-la
 * **verificável**.
 */

import { describe, it, expect } from "vitest";
import {
  ASSUNTO_NO_NUCLEO,
  DESTINATARIO_NO_NUCLEO,
  ENDERECO_DO_DESTINATARIO,
  ENDERECO_DO_REMETENTE,
  REMETENTE_NO_NUCLEO,
  ehAssuntoDaCasa,
  traduzirAssuntos,
} from "../foocci/traducao";
import { ASSUNTOS_DE_DECISAO } from "../contrato";
import {
  GATILHOS_DE_ASSUNTO,
  foraDaAlcadaNaMensagem,
  motivoDeHandoffPorPreco,
  type AssuntoDePreco,
} from "@/services/salaDeVendas/precos";
import { DIRETOR_DO_PRODUTO, GERENTE_DO_PRODUTO } from "@/services/connect/cadastro";

const MENSAGEM_DO_MARCOS =
  "Preciso de resposta objetiva sobre: 1) proposta para 28-30 posts/mês, 3 carrosséis/semana, " +
  "ciclo de 30 dias; 2) se topam pagamento via parceria/permuta, sem dinheiro.";

// ═══════════════════════════════════════════════════════════════════════════
describe("⭐⭐ TODO assunto que escala tem par no vocabulário da casa", () => {
  /** Os assuntos que, hoje, de fato viram consulta. */
  const QUE_ESCALAM: AssuntoDePreco[] = GATILHOS_DE_ASSUNTO.map((g) => g.assunto).filter(
    (a) => motivoDeHandoffPorPreco(a) !== null,
  );

  it("o conjunto que escala não está vazio — senão este arquivo não mede nada", () => {
    expect(QUE_ESCALAM.length).toBeGreaterThan(0);
  });

  /**
   * ⭐⭐ A TRAVA.
   *
   * MUTAÇÃO: acrescentar um gatilho novo em `GATILHOS_DE_ASSUNTO` que escale
   * (ex.: `exclusividadeTerritorial`) e não pôr o par em `ASSUNTO_NO_NUCLEO`
   * → este fica vermelho. Sem ele, o gatilho novo sairia da fábrica mudo: o
   *   assunto seria descartado na tradução e o gerente nunca saberia que
   *   alguém perguntou aquilo.
   */
  it("⭐⭐ cada assunto que escala tem tradução, e ela está no vocabulário fechado", () => {
    const semPar = QUE_ESCALAM.filter((a) => ASSUNTO_NO_NUCLEO[a] === undefined);
    expect(
      semPar,
      semPar.length === 0
        ? ""
        : [
            "",
            "⛔ ASSUNTO QUE ESCALA E NÃO TEM PAR NO VOCABULÁRIO DA CASA:",
            ...semPar.map((a) => `  · ${a}`),
            "",
            "Sem o par, o núcleo recusa o despacho com `assunto_fora_do_vocabulario` — e o cliente",
            "espera um gerente que nunca foi perguntado. Escolha o par em `conector/foocci/traducao.ts`",
            `entre: ${ASSUNTOS_DE_DECISAO.join(", ")}.`,
            "",
          ].join("\n"),
    ).toEqual([]);
  });

  it("⭐ e toda tradução declarada aponta para uma palavra que a casa conhece", () => {
    for (const [local, daCasa] of Object.entries(ASSUNTO_NO_NUCLEO)) {
      expect(ehAssuntoDaCasa(daCasa as string), `${local} → ${daCasa}`).toBe(true);
    }
  });

  /**
   * ⚠️ A OUTRA METADE: o mapa não inventa entrada para assunto que a Sala SABE
   * responder. Um par ali diria que aquilo um dia escala — e não escala.
   */
  it("⚠️ A OUTRA METADE — o que a Sala responde sozinha NÃO está no mapa", () => {
    for (const a of ["tabela", "descontoPublicado", "comoFecha", "formaDePagamento"] as AssuntoDePreco[]) {
      expect(motivoDeHandoffPorPreco(a), a).toBeNull();
      expect(ASSUNTO_NO_NUCLEO[a], a).toBeUndefined();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("⭐ a tradução do caso do Marcos, item a item", () => {
  it("⭐ as duas perguntas dele saem no vocabulário da casa, na ordem em que ele fez", () => {
    const t = traduzirAssuntos(foraDaAlcadaNaMensagem(MENSAGEM_DO_MARCOS));

    expect(t.semTraducao).toEqual([]);
    expect(t.paraONucleo.map((f) => f.assunto)).toEqual([
      "forma_de_pagamento_nao_padrao",
      "volume_acima_da_capacidade",
    ]);
    // ⭐ E o MOTIVO atravessa intacto — o vocabulário fechado é do assunto, e o
    // motivo é o que o gerente lê para decidir.
    for (const f of t.paraONucleo) expect(f.motivo).toMatch(/Decide:/);
  });

  it("⭐ permuta é FORMA DE PAGAMENTO, e não preço — a distinção é a da Sala", () => {
    // Permuta não é um valor menor: é outro meio de pagamento. É a mesma
    // distinção que `precos.ts` já faz ao separar permuta de `formaDePagamento`.
    expect(ASSUNTO_NO_NUCLEO.permuta).toBe("forma_de_pagamento_nao_padrao");
    expect(ASSUNTO_NO_NUCLEO.permuta).not.toBe("preco_ou_desconto");
  });

  /**
   * ⚠️ O que não tem par NÃO some. Sai nomeado, para o dossiê da fila poder
   * dizer o que a consulta não conseguiu perguntar.
   */
  it("⚠️ assunto sem par sai NOMEADO em `semTraducao`, nunca descartado calado", () => {
    const t = traduzirAssuntos([
      { assunto: "permuta", motivo: "m1" },
      { assunto: "exclusividadeTerritorial", motivo: "m2" },
    ]);
    expect(t.paraONucleo).toHaveLength(1);
    expect(t.semTraducao).toEqual(["exclusividadeTerritorial"]);
  });

  it("lista vazia traduz para lista vazia, e não quebra", () => {
    expect(traduzirAssuntos([])).toEqual({ paraONucleo: [], semTraducao: [] });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("⭐ os dois registros do mesmo cargo, e a ponte entre eles", () => {
  /**
   * ⭐ MUTAÇÃO: trocar `REMETENTE_NO_NUCLEO` de volta para `"diretor-foocci"`
   * → este fica vermelho, e a escalada volta a morrer em
   *   `remetente_desconhecido` na porta do núcleo.
   */
  it("⭐ o remetente e o destinatário são os do DIRETÓRIO, não os do organograma", () => {
    expect(REMETENTE_NO_NUCLEO).toBe("diretor");
    expect(DESTINATARIO_NO_NUCLEO).toBe("gerente-de-produto-e-ia");
  });

  it("⭐ e eles são MESMO diferentes dos slugs internos — a ponte tem razão de existir", () => {
    expect(REMETENTE_NO_NUCLEO).not.toBe(DIRETOR_DO_PRODUTO);
    expect(DESTINATARIO_NO_NUCLEO).not.toBe(GERENTE_DO_PRODUTO);
    // E os internos continuam sendo os internos: esta correção NÃO mexeu na
    // autoridade da porta de ENTRADA do produto, que é outra lista e outra
    // finalidade.
    expect(DIRETOR_DO_PRODUTO).toBe("diretor-foocci");
    expect(GERENTE_DO_PRODUTO).toBe("agente-gerente-produto");
  });

  it("o endereço corporativo inteiro é coerente com a chave, nos dois", () => {
    expect(ENDERECO_DO_REMETENTE.endsWith(`.${REMETENTE_NO_NUCLEO}`)).toBe(true);
    expect(ENDERECO_DO_DESTINATARIO.endsWith(`.${DESTINATARIO_NO_NUCLEO}`)).toBe(true);
    // A sala vai no meio do endereço, e ela é a do departamento dono do agente.
    expect(ENDERECO_DO_DESTINATARIO).toContain(".produto.");
    expect(ENDERECO_DO_REMETENTE).toContain(".direcao.");
  });
});
