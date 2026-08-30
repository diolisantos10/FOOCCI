/**
 * ⭐ O MODO DE PRODUÇÃO E O CASO DO LEAD — as duas metades de cada trava.
 *
 * Este arquivo cobre o que mudou na porta do Connect em 30/08/2026, por ordem
 * do CEO: ela passou a aceitar `modo: "producao"` e a carregar o caso do lead da
 * própria casa.
 *
 * ─── O QUE ELE COBRA, E POR QUE CADA UM ────────────────────────────────────
 *
 * 1. `producao` atravessa, e se declara operação real (não rascunho).
 * 2. `producao` **não** afrouxa a recusa nomeada do domínio operacional —
 *    `restaurantId`, `orderId`, `telefone` e companhia continuam barrados nos
 *    DOIS modos. É a separação que a ordem mandou escrever em voz alta, e um
 *    comentário não é trava: aqui ela é medida.
 * 3. `caso` só entra em produção, tem forma conferida e tetos com recusa.
 * 4. As travas que saíram da auditoria de hoje continuam de pé em produção:
 *    o piso do segredo, o dono do fio e a releitura que confere identidade.
 *
 * ─── ⚠️ E A MUTAÇÃO DELIBERADA ─────────────────────────────────────────────
 *
 * Cada bloco abaixo tem, escrita no comentário, a mutação que o derruba. Elas
 * foram RODADAS, uma a uma, e o teste indicado ficou vermelho em cada uma.
 */

import { describe, expect, it } from "vitest";
import {
  CAMPOS_DO_DOMINIO_PROIBIDOS,
  CASO_DO_LEAD_POR_QUE_ELE_PASSA,
  MAX_CAMPO_DO_CASO,
  MAX_TURNOS_DO_CASO,
  MODOS_ACEITOS,
  MODO_DE_ENSAIO,
  MODO_DE_PRODUCAO,
  SINTETICO_EXIGIDO,
  conferirPedido,
} from "../contrato";
import { DIRETOR_DO_PRODUTO, GERENTE_DO_PRODUTO } from "../cadastro";
import { SELO_DE_PRODUCAO, SELO_DE_RASCUNHO, seloDoModo } from "../rascunho";

/** Um corpo de produção mínimo e válido. */
function producao(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    modo: MODO_DE_PRODUCAO,
    sintetico: false,
    acao: "receber",
    de: DIRETOR_DO_PRODUTO,
    para: GERENTE_DO_PRODUTO,
    mensagem: "consulta do agente comercial ao gerente",
    ...extra,
  };
}

/** Um corpo de homologação mínimo e válido. */
function ensaio(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    modo: MODO_DE_ENSAIO,
    sintetico: true,
    acao: "receber",
    de: DIRETOR_DO_PRODUTO,
    para: GERENTE_DO_PRODUTO,
    mensagem: "ensaio",
    ...extra,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
describe("⭐ os dois modos — e nenhum deles tem padrão", () => {
  /**
   * MUTAÇÃO: em `contrato.ts`, trocar a trava do modo por
   * `const modo = (corpo.modo ?? MODO_DE_ENSAIO) as ModoDoConnect;`
   * → o teste de modo ausente fica verde e ESTE fica vermelho.
   */
  it("os dois modos aceitos são exatamente estes dois — nem mais, nem menos", () => {
    expect([...MODOS_ACEITOS]).toEqual(["homologacao", "producao"]);
  });

  it("produção atravessa a conferência do contrato", () => {
    const c = conferirPedido(producao());
    expect(c.ok, JSON.stringify(c)).toBe(true);
    if (!c.ok) return;
    expect(c.pedido.modo).toBe(MODO_DE_PRODUCAO);
    expect(c.pedido.sintetico).toBe(false);
  });

  it("A OUTRA METADE — homologação continua atravessando exatamente como antes", () => {
    const c = conferirPedido(ensaio());
    expect(c.ok, JSON.stringify(c)).toBe(true);
    if (!c.ok) return;
    expect(c.pedido.modo).toBe(MODO_DE_ENSAIO);
    expect(c.pedido.sintetico).toBe(true);
  });

  /**
   * ⭐ MUTAÇÃO: fazer `sintetico` cair por omissão no valor do modo —
   * `const sintetico = corpo.sintetico ?? SINTETICO_EXIGIDO[modo];`
   * → estes dois ficam vermelhos. É o padrão silencioso voltando pela porta dos
   * fundos, e é exatamente o que o cabeçalho do contrato promete não fazer.
   */
  it("`sintetico` ausente é recusado — nos DOIS modos, sem padrão", () => {
    for (const modo of MODOS_ACEITOS) {
      const corpo = modo === MODO_DE_PRODUCAO ? producao() : ensaio();
      delete corpo.sintetico;
      const c = conferirPedido(corpo);
      expect(c.ok, modo).toBe(false);
      if (c.ok) continue;
      expect(c.motivo, modo).toMatch(/sintetico inválido/i);
    }
  });

  it("cada modo exige o SEU booleano, e o do vizinho é recusado", () => {
    expect(SINTETICO_EXIGIDO[MODO_DE_ENSAIO]).toBe(true);
    expect(SINTETICO_EXIGIDO[MODO_DE_PRODUCAO]).toBe(false);

    expect(conferirPedido(producao({ sintetico: true })).ok).toBe(false);
    expect(conferirPedido(ensaio({ sintetico: false })).ok).toBe(false);
  });

  it('"false" em texto não é false — não há coerção em produção também', () => {
    const c = conferirPedido(producao({ sintetico: "false" }));
    expect(c.ok).toBe(false);
    if (c.ok) return;
    expect(c.motivo).toMatch(/não há coerção/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("⛔ produção NÃO abre a porta para o domínio operacional — a separação", () => {
  /**
   * ⭐⭐ ESTE É O BLOCO QUE IMPORTA MAIS, E O MOTIVO ESTÁ NA ORDEM:
   *
   * "no dia em que alguém quiser a segunda, vai ser tentador dizer que a
   *  primeira já abriu o caminho. Foi assim que quatro portas ganharam o mesmo
   *  defeito hoje."
   *
   * MUTAÇÃO: no laço da allowlist de `conferirPedido`, envolver a recusa num
   * `if (modo !== MODO_DE_PRODUCAO)` — ou seja, "em produção deixa passar".
   * → TODOS os casos abaixo ficam vermelhos, um por campo.
   */
  it("todo campo do domínio operacional é recusado pelo NOME — em produção também", () => {
    for (const campo of CAMPOS_DO_DOMINIO_PROIBIDOS) {
      const c = conferirPedido(producao({ [campo]: "valor-impecável" }));
      expect(c.ok, campo).toBe(false);
      if (c.ok) continue;
      expect(c.motivo, campo).toContain(`"${campo}"`);
      expect(c.motivo, campo).toMatch(/não é entrada desta porta/i);
    }
  });

  it("A OUTRA METADE — em homologação eles continuam recusados, idênticos", () => {
    for (const campo of CAMPOS_DO_DOMINIO_PROIBIDOS) {
      const c = conferirPedido(ensaio({ [campo]: "valor-impecável" }));
      expect(c.ok, campo).toBe(false);
    }
  });

  it("⭐ a recusa é a MESMA nos dois modos, palavra por palavra", () => {
    // Se um dia alguém escrever um motivo mais leniente "só para produção", a
    // divergência aparece aqui antes de aparecer numa auditoria.
    for (const campo of CAMPOS_DO_DOMINIO_PROIBIDOS) {
      const a = conferirPedido(producao({ [campo]: "x" }));
      const b = conferirPedido(ensaio({ [campo]: "x" }));
      expect(a.ok).toBe(false);
      expect(b.ok).toBe(false);
      if (a.ok || b.ok) continue;
      expect(a.motivo, campo).toBe(b.motivo);
    }
  });

  it("campo desconhecido continua sendo recusa nomeada em produção", () => {
    const c = conferirPedido(producao({ tenantId: "t1" }));
    expect(c.ok).toBe(false);
    if (c.ok) return;
    expect(c.motivo).toMatch(/"tenantId"/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("⭐ o caso do lead — só em produção, com forma conferida", () => {
  const caso = {
    leadId: "lead-1",
    nome: "Marcos",
    email: "marcos@exemplo.com.br",
    telefone: "+55 11 90000-0000",
    resumo: "pediu proposta para volume acima do plano e propôs permuta sem dinheiro",
    briefing: "28–30 posts/mês, 3 carrosséis/semana, ciclo de 30 dias",
    oQueTrava: "escopo acima da tabela e permuta",
    historico: [{ deQuem: "cliente", texto: "terceira vez que escrevo" }],
  };

  /**
   * MUTAÇÃO: apagar `if (modo !== MODO_DE_PRODUCAO) return recusa` de
   * `conferirCaso` → o teste do ensaio (logo abaixo) fica vermelho.
   */
  it("o caso atravessa em produção, inteiro e sem perder campo", () => {
    const c = conferirPedido(producao({ caso }));
    expect(c.ok, JSON.stringify(c)).toBe(true);
    if (!c.ok) return;
    expect(c.pedido.caso).not.toBeNull();
    expect(c.pedido.caso?.nome).toBe("Marcos");
    expect(c.pedido.caso?.telefone).toBe("+55 11 90000-0000");
    expect(c.pedido.caso?.briefing).toContain("carrosséis");
    expect(c.pedido.caso?.historico).toHaveLength(1);
  });

  it("A OUTRA METADE — o caso é recusado em homologação, com o motivo escrito", () => {
    const c = conferirPedido(ensaio({ caso }));
    expect(c.ok).toBe(false);
    if (c.ok) return;
    expect(c.motivo).toMatch(/"caso" não entra em modo "homologacao"/);
    expect(c.motivo).toMatch(/producao/);
  });

  it("sem `caso`, o pedido conferido diz `null` — e não `undefined` de esquecimento", () => {
    const c = conferirPedido(producao());
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(c.pedido.caso).toBeNull();
  });

  /**
   * MUTAÇÃO: trocar `if (!resumo)` por `if (false)` em `conferirCaso`
   * → este fica vermelho.
   */
  it("`caso.resumo` é obrigatório — caso sem o caso dentro é recusa", () => {
    for (const semResumo of [{}, { resumo: "" }, { resumo: "   " }, { nome: "Marcos" }]) {
      const c = conferirPedido(producao({ caso: semResumo }));
      expect(c.ok, JSON.stringify(semResumo)).toBe(false);
      if (c.ok) continue;
      expect(c.motivo).toMatch(/"caso.resumo" é obrigatório/);
    }
  });

  it("a allowlist vale DENTRO do caso também — campo desconhecido é recusa nomeada", () => {
    const c = conferirPedido(producao({ caso: { resumo: "r", restaurantId: "r1" } }));
    expect(c.ok).toBe(false);
    if (c.ok) return;
    expect(c.motivo).toMatch(/"caso.restaurantId" não é entrada desta porta/);
  });

  /**
   * MUTAÇÃO: trocar a recusa por corte — `valor.slice(0, MAX_CAMPO_DO_CASO)`
   * → este fica vermelho. É a mesma doutrina de `mensagem` e `assunto`: cortar
   * faria a porta gravar um caso diferente do enviado sem dizer a ninguém, e é
   * sobre esse texto que o gerente decide.
   */
  it("estourar o teto de um campo é RECUSA, nunca corte silencioso", () => {
    const c = conferirPedido(
      producao({ caso: { resumo: "r", briefing: "b".repeat(MAX_CAMPO_DO_CASO + 1) } }),
    );
    expect(c.ok).toBe(false);
    if (c.ok) return;
    expect(c.motivo).toMatch(/"caso.briefing" grande demais/);
    expect(c.motivo).toMatch(/corte silencioso/i);
  });

  it("A OUTRA METADE — exatamente no teto, passa", () => {
    const c = conferirPedido(
      producao({ caso: { resumo: "r", briefing: "b".repeat(MAX_CAMPO_DO_CASO) } }),
    );
    expect(c.ok, JSON.stringify(c)).toBe(true);
  });

  it("histórico acima do teto é recusa — meia conversa não vira conversa inteira", () => {
    const turnos = Array.from({ length: MAX_TURNOS_DO_CASO + 1 }, () => ({
      deQuem: "cliente",
      texto: "oi",
    }));
    const c = conferirPedido(producao({ caso: { resumo: "r", historico: turnos } }));
    expect(c.ok).toBe(false);
    if (c.ok) return;
    expect(c.motivo).toMatch(/máximo é/);
  });

  it("turno sem autor ou sem texto é recusado, com o índice dito", () => {
    const c = conferirPedido(
      producao({ caso: { resumo: "r", historico: [{ deQuem: "cliente", texto: "ok" }, { texto: "?" }] } }),
    );
    expect(c.ok).toBe(false);
    if (c.ok) return;
    expect(c.motivo).toMatch(/"caso.historico\[1\]" inválido/);
  });

  it("o motivo pelo qual o caso passa está escrito no código, e diz o que continua barrado", () => {
    expect(CASO_DO_LEAD_POR_QUE_ELE_PASSA).toMatch(/finalidade pela qual o lead o forneceu/);
    expect(CASO_DO_LEAD_POR_QUE_ELE_PASSA).toMatch(/domínio operacional do produto/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("⭐ o selo — produção não vira rascunho, e rascunho não vira produção", () => {
  /**
   * MUTAÇÃO: fazer `seloDoModo` devolver sempre `SELO_DE_RASCUNHO`
   * → o primeiro fica vermelho. Fazê-la devolver sempre `SELO_DE_PRODUCAO`
   * → o segundo fica vermelho.
   */
  it("produção sai com o selo de operação real", () => {
    expect(seloDoModo(MODO_DE_PRODUCAO)).toBe(SELO_DE_PRODUCAO);
    expect(SELO_DE_PRODUCAO.rascunho).toBe(false);
    expect(SELO_DE_PRODUCAO.natureza).toBe("OPERACAO_REAL");
  });

  it("A OUTRA METADE — homologação continua saindo com o selo de rascunho", () => {
    expect(seloDoModo(MODO_DE_ENSAIO)).toBe(SELO_DE_RASCUNHO);
    expect(SELO_DE_RASCUNHO.rascunho).toBe(true);
  });

  it("⭐ e o selo de produção NÃO promete resposta do gerente — ela é `null`, escrita", () => {
    // A porta entrega e não colhe resposta (`caixa.ts`). Um selo que omitisse o
    // assunto deixaria quem lê concluir que a resposta veio.
    expect(SELO_DE_PRODUCAO.resposta_do_gerente).toBeNull();
    expect("resposta_do_gerente" in SELO_DE_PRODUCAO).toBe(true);
    expect(SELO_DE_PRODUCAO.aviso).toMatch(/NÃO é: a resposta do gerente/);
  });
});
