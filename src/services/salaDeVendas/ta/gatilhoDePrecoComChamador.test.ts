/**
 * ⭐⭐ O GATILHO DE PREÇO GANHA CHAMADOR — e o caso do Marcos dispara.
 *
 * ─── A PERGUNTA QUE FALTOU QUATRO VEZES NESTA CASA ─────────────────────────
 *
 *   **QUEM CHAMA ISSO?**
 *
 * `motivoDeHandoffPorPreco` estava escrita, testada e órfã: nenhum caminho de
 * produção chegava até ela. O defeito-assinatura desta casa é a peça pronta sem
 * chamador, e este arquivo existe para que ele não volte por aqui.
 *
 * O caminho de produção, ponta a ponta, é:
 *
 *   webhook da Meta (`api/webhooks/meta/whatsapp/route.ts`)
 *     → `receberMensagemDeVendas` (`foocci-sdr/FoocciSalesInbound.ts`)
 *       → `atenderComOTA` (`salaDeVendas/ta/atender.ts`)
 *         → `foraDaAlcadaNaMensagem` → `motivoDeHandoffPorPreco`   ← AQUI
 *           → `consultarGerente` → POST /api/connect/despacho
 *           → `passarParaGente` (a fila humana, que NÃO some)
 *
 * Os testes de baixo entram por `atenderComOTA`, que é o degrau de produção
 * imediatamente acima do gatilho — e o teste de amarração no fim deste arquivo
 * confere, lendo o próprio código-fonte, que os degraus acima existem.
 */

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { atenderComOTA, AVISO_DE_QUE_VEM_GENTE } from "./atender";
import {
  assuntosDePrecoNaMensagem,
  foraDaAlcadaNaMensagem,
  motivoDeHandoffPorPreco,
} from "../precos";

/** A mensagem que originou este trabalho, palavra por palavra. */
const MENSAGEM_DO_MARCOS =
  "Preciso de resposta objetiva sobre: 1) proposta para 28-30 posts/mês, 3 carrosséis/semana, " +
  "ciclo de 30 dias; 2) se topam pagamento via parceria/permuta, sem dinheiro.";

const AGORA = new Date("2026-08-25T12:00:00Z");

// ═══════════════════════════════════════════════════════════════════════════
describe("⭐ o caso do Marcos dispara — a classificação, em código", () => {
  /**
   * MUTAÇÃO: apagar a entrada `permuta` de `GATILHOS_DE_ASSUNTO`
   * → este fica vermelho, e o caso real volta a passar batido.
   */
  it("⭐ a mensagem do Marcos levanta OS DOIS assuntos, não um", () => {
    expect(assuntosDePrecoNaMensagem(MENSAGEM_DO_MARCOS).sort()).toEqual(
      ["escopoAcimaDaCapacidade", "permuta"].sort(),
    );
  });

  it("⭐ e os dois estão FORA DA ALÇADA, cada um com o motivo já escrito", () => {
    const fora = foraDaAlcadaNaMensagem(MENSAGEM_DO_MARCOS);
    expect(fora).toHaveLength(2);
    for (const f of fora) {
      expect(f.motivo.length).toBeGreaterThan(0);
      expect(f.motivo).toMatch(/Decide:/);
    }
  });

  it("cada metade da mensagem dispara sozinha também", () => {
    expect(assuntosDePrecoNaMensagem("proposta para 28-30 posts/mês, 3 carrosséis/semana")).toContain(
      "escopoAcimaDaCapacidade",
    );
    expect(assuntosDePrecoNaMensagem("topam pagamento via parceria/permuta, sem dinheiro?")).toContain(
      "permuta",
    );
  });

  /**
   * ⭐ A OUTRA METADE, e ela é a que protege a fila.
   *
   * MUTAÇÃO: alargar o padrão de `permuta` para `/parceria/i` sozinho
   * → "vamos ser parceiros de longo prazo" passa a escalar e este fica
   * vermelho. Uma fila que recebe tudo é uma fila que ninguém atende.
   */
  it("⭐ A OUTRA METADE — conversa comum NÃO escala", () => {
    const inocentes = [
      "oi, tudo bem?",
      "quanto custa o plano crescimento?",
      "vocês integram com ifood?",
      "quero uma parceria de longo prazo com vocês",
      "meu restaurante faz 3 pratos novos por semana",
      "que legal, adorei a proposta de valor de vocês",
    ];
    for (const m of inocentes) {
      expect(foraDaAlcadaNaMensagem(m), m).toEqual([]);
    }
  });

  it("o que a Sala SABE responder não entra na lista de fora da alçada", () => {
    // Reconhecido e respondível: não escala. É a diferença entre "não sei" e
    // "não posso decidir".
    expect(motivoDeHandoffPorPreco("tabela")).toBeNull();
    expect(motivoDeHandoffPorPreco("formaDePagamento")).toBeNull();
    expect(motivoDeHandoffPorPreco("descontoAlemDaTabela")).toBeNull();
    // E os que ninguém decidiu, escalam.
    expect(motivoDeHandoffPorPreco("permuta")).not.toBeNull();
    expect(motivoDeHandoffPorPreco("escopoAcimaDaCapacidade")).not.toBeNull();
  });

  it("⚠️ permuta NÃO é `formaDePagamento` — a distinção está escrita nos motivos", () => {
    const permuta = motivoDeHandoffPorPreco("permuta")!;
    expect(permuta).toMatch(/não passa por ele|fora do checkout/i);
  });

  it("mensagem vazia não classifica nada — e não quebra", () => {
    expect(assuntosDePrecoNaMensagem("")).toEqual([]);
    expect(assuntosDePrecoNaMensagem("   ")).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// O CHAMADOR DE PRODUÇÃO — entrando por `atenderComOTA`
// ═══════════════════════════════════════════════════════════════════════════

function banco(lead: Record<string, unknown> = {}) {
  return {
    sdrIaConfig: {
      findUnique: vi.fn().mockResolvedValue({
        ligado: true,
        maxSemResposta: 3,
        versaoAtivaId: "v1",
        horaInicio: 9,
        horaFim: 20,
      }),
    },
    siteLead: {
      findUnique: vi.fn().mockResolvedValue({
        id: "l1",
        nome: "Marcos",
        atendidoPor: "IA",
        optOutAt: null,
        score: 40,
        stage: "EM_QUALIFICACAO",
        atendenteUserId: null,
        temperatura: null,
        ...lead,
      }),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    leadMensagem: {
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi.fn().mockResolvedValue({ ocorreuEm: AGORA }),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: "m1" }),
    },
    siteLeadInteraction: { create: vi.fn().mockResolvedValue({}) },
    leadHandoff: { create: vi.fn().mockResolvedValue({ id: "h1" }) },
    internalUser: { findMany: vi.fn().mockResolvedValue([]) },
  };
}

describe("⭐⭐ QUEM CHAMA ISSO — o caminho de produção, de ponta a ponta", () => {
  /**
   * ⭐ O TESTE CENTRAL DESTE TRABALHO.
   *
   * MUTAÇÃO: apagar a linha `const foraDaAlcada = foraDaAlcadaNaMensagem(...)`
   * de `atender.ts` e voltar a condição para `r.handoff.deve && r.handoff.motivo`
   * → este teste fica vermelho, e o gatilho volta a ser órfão.
   */
  it("⭐ a mensagem do Marcos, entrando por `atenderComOTA`, CHAMA GENTE", async () => {
    const db = banco();
    const r = await atenderComOTA(db as never, {
      leadId: "l1",
      mensagem: MENSAGEM_DO_MARCOS,
      agora: AGORA,
    });

    expect(r.falou, JSON.stringify(r)).toBe(false);
    if (r.falou) return;
    expect(r.chamouGente).toBe(true);
  });

  /**
   * ⭐ A FILA HUMANA É O CHÃO, E ELA NÃO SAI.
   *
   * MUTAÇÃO: trocar `passarParaGente` por um `return` logo depois da consulta
   * → este fica vermelho. Consultar o gerente é o caminho MELHOR, nunca o único.
   */
  it("⭐ a fila humana NÃO some — o handoff é gravado do mesmo jeito", async () => {
    const db = banco();
    await atenderComOTA(db as never, { leadId: "l1", mensagem: MENSAGEM_DO_MARCOS, agora: AGORA });
    expect(db.leadHandoff.create).toHaveBeenCalledTimes(1);
  });

  /**
   * ⭐ O DOSSIÊ DIZ O QUE TRAVA **E** O QUE JÁ FOI FEITO A RESPEITO.
   *
   * Sem o segundo, quem pega a fila aciona o gerente de novo — ou pior, acha
   * que já foi acionado quando não foi.
   *
   * ⚠️ Neste teste a porta do Connect **não está configurada** (o ambiente do
   * vitest não tem `DIOLI_CONNECT_URL`), então a consulta falha de propósito —
   * e é exatamente o caso que mais importa provar: o cliente NÃO fica em
   * silêncio, e a fila fica sabendo que ninguém foi acionado.
   */
  it("⭐ o dossiê registra o que trava e o resultado HONESTO da consulta", async () => {
    const db = banco();
    await atenderComOTA(db as never, { leadId: "l1", mensagem: MENSAGEM_DO_MARCOS, agora: AGORA });

    const dados = db.leadHandoff.create.mock.calls[0]![0].data as Record<string, string>;
    expect(dados.objecoes).toContain("permuta");
    expect(dados.objecoes).toContain("escopoAcimaDaCapacidade");
    // A consulta não aconteceu neste ambiente, e o dossiê diz isso — em vez de
    // omitir, que faria a fila concluir que aconteceu.
    expect(dados.objecoes).toMatch(/Ninguém do outro lado foi acionado|consultou o gerente/);
  });

  /**
   * ⭐ E O CLIENTE NUNCA FICA EM SILÊNCIO — nem quando a consulta falha.
   *
   * MUTAÇÃO: apagar o `registrarSaida` do ramo de handoff → vermelho.
   */
  it("⭐ no caso do Marcos o cliente recebe o aviso de handoff, e uma mensagem só", async () => {
    const db = banco();
    await atenderComOTA(db as never, { leadId: "l1", mensagem: MENSAGEM_DO_MARCOS, agora: AGORA });

    const escritas = db.leadMensagem.create.mock.calls.map(
      (c) => (c[0] as { data: { texto: string } }).data.texto,
    );
    expect(escritas).toHaveLength(1);
    // Aqui quem também disparou foi `PEDE_PROPOSTA` (a palavra "proposta" está
    // na mensagem), então o texto é o aviso determinístico do próprio `falar()`.
    expect(escritas[0]).toMatch(/chamar alguém do time/i);
    // ⚠️ E ele não promete prazo nenhum — SLA que ninguém confere é invenção.
    expect(escritas[0]).not.toMatch(/hoje|amanhã|\d+ ?h(oras)?|minutos/i);
  });

  /**
   * ⭐⭐ O CASO QUE SÓ O GATILHO DE PREÇO PEGA — e o defeito que ele evita.
   *
   * "fechamos em permuta sem dinheiro." não tem "proposta", não tem "desconto",
   * não tem interrogação e não parece pergunta: `falar()` NÃO escala. Antes
   * deste trabalho o TA responderia por cima disso com a sondagem, como se nada
   * tivesse sido pedido.
   *
   * Agora o gatilho de preço para o turno sozinho — e o texto **não pode** ser a
   * fala de venda que `falar()` compôs, senão o cliente responderia à pergunta
   * errada.
   *
   * MUTAÇÃO: trocar `const texto = r.handoff.deve ? r.texto : AVISO...` por
   * `const texto = r.texto` → este teste fica vermelho, e o cliente recebe uma
   * pergunta de sondagem no lugar da resposta ao que ele pediu.
   */
  it("⭐⭐ mensagem que SÓ o gatilho de preço pega: escala, e o texto é o aviso — não a venda", async () => {
    const db = banco();
    const r = await atenderComOTA(db as never, {
      leadId: "l1",
      mensagem: "fechamos em permuta sem dinheiro.",
      agora: AGORA,
    });

    expect(r.falou, JSON.stringify(r)).toBe(false);
    if (r.falou) return;
    expect(r.chamouGente).toBe(true);

    const escritas = db.leadMensagem.create.mock.calls.map(
      (c) => (c[0] as { data: { texto: string } }).data.texto,
    );
    expect(escritas).toHaveLength(1);
    expect(escritas[0]).toBe(AVISO_DE_QUE_VEM_GENTE);
    expect(escritas[0]).not.toMatch(/hoje|amanhã|\d+ ?h(oras)?|minutos/i);
  });

  /**
   * ⭐ A OUTRA METADE do chamador: uma conversa comum continua respondida.
   *
   * Sem este teste, um `foraDaAlcadaNaMensagem` que devolvesse tudo passaria —
   * e o TA viraria uma máquina de encher fila.
   */
  it("⭐ A OUTRA METADE — pergunta comum continua sendo RESPONDIDA pelo TA", async () => {
    const db = banco();
    const r = await atenderComOTA(db as never, {
      leadId: "l1",
      mensagem: "quanto custa o plano crescimento?",
      agora: AGORA,
    });
    expect(r.falou, JSON.stringify(r)).toBe(true);
    expect(db.leadHandoff.create).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("⭐⭐ a amarração do caminho de produção — os degraus ACIMA existem", () => {
  /**
   * Este bloco é a resposta literal a "quem chama isso?", conferida no código e
   * não na memória de quem escreveu. Ele lê os arquivos e cobra que cada degrau
   * chame o próximo. Se alguém apagar um elo, o vermelho aparece aqui.
   *
   * MUTAÇÃO: apagar `import { consultarGerente }` de `atender.ts` → vermelho.
   */
  function fonte(...partes: string[]): string {
    return readFileSync(path.join(process.cwd(), "src", ...partes), "utf8");
  }

  it("o webhook da Meta chama a recepção de vendas", () => {
    const s = fonte("app", "api", "webhooks", "meta", "whatsapp", "route.ts");
    expect(s).toContain("receberMensagemDeVendas");
  });

  it("a recepção de vendas chama o TA", () => {
    const s = fonte("services", "foocci-sdr", "FoocciSalesInbound.ts");
    expect(s).toContain("atenderComOTA");
  });

  it("⭐ o TA chama o gatilho de preço — a peça que estava órfã", () => {
    const s = fonte("services", "salaDeVendas", "ta", "atender.ts");
    expect(s).toContain("foraDaAlcadaNaMensagem");
  });

  it("⭐ o gatilho de preço chama `motivoDeHandoffPorPreco`", () => {
    const s = fonte("services", "salaDeVendas", "precos.ts");
    expect(s).toMatch(/foraDaAlcadaNaMensagem[\s\S]*motivoDeHandoffPorPreco/);
  });

  it("⭐ o TA chama a consulta ao gerente", () => {
    const s = fonte("services", "salaDeVendas", "ta", "atender.ts");
    expect(s).toContain("consultarGerente");
  });

  it("⭐ e a consulta ao gerente vai pela PORTA do Connect, não por atalho", () => {
    const s = fonte("services", "salaDeVendas", "ta", "consultarGerente.ts");
    expect(s).toContain("/api/connect/despacho");
    expect(s).toContain("CABECALHO_DO_SEGREDO");
    // ⛔ E ela não importa o despacho direto, o que puraria a guarda da porta.
    expect(s).not.toContain('from "@/services/connect/despacho"');
  });
});
