/**
 * O TA FALANDO COM O MODELO ATRÁS — e as três coisas que o modelo NÃO decide.
 *
 * ── O QUE ESTE ARQUIVO GUARDA ───────────────────────────────────────────────
 *
 * Em 26/08/2026 o TA deixou de responder por correspondência e passou a ter um
 * modelo redigindo. O ganho é óbvio: a conversa deixou de ser dura. O risco
 * também é: um modelo é a peça do sistema que erra melhor — em português
 * impecável, com aparência de fundamentado.
 *
 * Estes casos provam que três decisões continuam sendo de código:
 *
 *   1. **escalar para gente** — o modelo não vota;
 *   2. **o que pode ser afirmado** — o verificador reprova depois dele;
 *   3. **haver resposta** — sem chave, sem rede ou reprovado duas vezes, o
 *      caminho determinístico responde. O TA nunca fica mudo.
 *
 * O modelo é dublê aqui de propósito. Nenhum caso liga na OpenAI: teste que
 * depende de rede é teste que reprova por sorte, e portão que reprova por sorte
 * ensina a rodar de novo até passar.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const criar = vi.hoisted(() => vi.fn());
vi.mock("@/lib/openai", () => ({
  openai: { chat: { completions: { create: criar } } },
}));

import { falar } from "./falar";
import { tabelaPublicada } from "../precos";

const ambiente = { ...process.env };

function modeloResponde(texto: string) {
  criar.mockResolvedValue({ choices: [{ message: { content: texto } }] });
}

beforeEach(() => {
  criar.mockReset();
  process.env.OPENAI_API_KEY = "sk-teste-nao-e-uma-chave-real";
  modeloResponde("Oi! O Foocci monta o pedido junto com o cliente, no seu próprio canal. Quantas unidades você tem?");
});

afterEach(() => {
  process.env = { ...ambiente };
});

describe("⭐ escalar para gente é decisão de CÓDIGO, nunca do modelo", () => {
  it("pedido de humano para antes de o modelo ser chamado", () => {
    // A trava mais importante do arquivo. Um modelo simpático tenta resolver — e
    // "tentar resolver" um pedido de pessoa é ignorar o pedido.
    return falar({ mensagem: "quero falar com uma pessoa, por favor" }).then((r) => {
      expect(r.handoff.deve).toBe(true);
      expect(r.origem).toBe("handoff-deterministico");
      expect(criar, "o modelo foi consultado num caso de handoff").not.toHaveBeenCalled();
    });
  });

  it("pedido de desconto também para — negociar é fora da alçada", () => {
    return falar({ mensagem: "consegue fazer um preço melhor? preciso de desconto" }).then((r) => {
      expect(r.handoff.deve).toBe(true);
      expect(criar).not.toHaveBeenCalled();
    });
  });

  it("⭐ e o modelo NÃO consegue criar um handoff que o código não decidiu", () => {
    // O outro lado da mesma trava: o modelo escrevendo "vou chamar alguém" não
    // muda o estado da conversa. Quem passa o bastão é a ponte, lendo `handoff`.
    modeloResponde("Claro, vou chamar alguém do time para falar com você agora!");
    return falar({ mensagem: "como funciona o cardápio digital?" }).then((r) => {
      expect(r.handoff.deve).toBe(false);
    });
  });

  it("conversa comum NÃO escala, e o modelo redige", async () => {
    // A metade que passa. Sem ela, um gatilho que disparasse sempre passaria em
    // todos os casos acima e o modelo nunca seria chamado.
    const r = await falar({ mensagem: "como funciona o cardápio digital?" });
    expect(r.handoff.deve).toBe(false);
    expect(r.origem).toBe("modelo");
    expect(criar).toHaveBeenCalledTimes(1);
  });
});

describe('⭐ "não sei" é o ÚNICO motivo em que o modelo ganha a chance', () => {
  // A regra que mudou em 26/08/2026. `INFORMACAO_NAO_CONFIRMADA` nasceu quando o
  // TA conhecia dezesseis frases; hoje ele tem o Manual inteiro atrás. Escalar
  // toda pergunta que a base ESTREITA não responde mandaria quase toda conversa
  // real para a fila humana — e fila que recebe tudo é fila que ninguém atende.

  /**
   * Uma pergunta que a base ESTREITA não cobre e o Manual cobre bem.
   *
   * E não é um caso de laboratório: "como funciona o pagamento?" é das perguntas
   * mais comuns numa venda de verdade. Antes desta mudança ela ia direto para a
   * fila humana — o TA tinha o capítulo de pagamentos atrás e escalava assim
   * mesmo, porque a base de dezesseis frases não a respondia.
   */
  const FORA_DA_BASE_ESTREITA = "como funciona o pagamento por pix?";

  it("o modelo responde, e a escalada por falta de saber NÃO acontece", async () => {
    modeloResponde("O cliente paga por Pix na hora, direto no checkout. Você recebe na sua conta. Faz sentido pro seu delivery?");

    const r = await falar({ mensagem: FORA_DA_BASE_ESTREITA });

    expect(r.origem).toBe("modelo");
    expect(r.handoff.deve, "escalou mesmo tendo respondido").toBe(false);
  });

  it("⭐ mas o modelo fora do ar faz a escalada acontecer, como sempre aconteceu", async () => {
    // A prova de que a trava não afrouxou: ela passou a perguntar antes de
    // disparar. Sem este caso, a mudança acima teria desligado o "não chuta".
    criar.mockRejectedValue(new Error("503"));

    const r = await falar({ mensagem: FORA_DA_BASE_ESTREITA });

    expect(r.origem).toBe("chao-deterministico");
    expect(r.handoff.deve).toBe(true);
    expect(r.handoff.motivo).toBe("INFORMACAO_NAO_CONFIRMADA");
  });

  it("e o modelo reprovado também escala — inventar não conta como saber", async () => {
    modeloResponde("Sim, o Pix integra com o iFood e garanto que aumenta 30% a recompra.");

    const r = await falar({ mensagem: FORA_DA_BASE_ESTREITA });

    expect(r.origem).toBe("chao-deterministico");
    expect(r.handoff.deve).toBe(true);
  });
});

describe("⭐ o verificador reprova DEPOIS do modelo", () => {
  it("preço inventado não sai — o modelo é mandado corrigir", async () => {
    const real = tabelaPublicada()[0]!.ciclos.find((c) => c.ciclo === "MENSAL")!.doCiclo;

    criar
      .mockResolvedValueOnce({ choices: [{ message: { content: "Fica R$ 149,00 por mês." } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: `Fica ${real} por mês.` } }] });

    const r = await falar({ mensagem: "quanto custa o plano essencial?" });

    expect(r.texto).not.toContain("149");
    expect(r.origem).toBe("modelo-na-segunda");
    expect(r.reprovacoes[0]!.motivos).toContain("precoForaDaTabela");
  });

  it("a segunda tentativa recebe o MOTIVO, não uma bronca genérica", async () => {
    criar
      .mockResolvedValueOnce({ choices: [{ message: { content: "Sai por R$ 149,00." } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: "Posso te passar os valores certinhos?" } }] });

    await falar({ mensagem: "quanto custa?" });

    // Dizer "você errou" faz o modelo reescrever tudo. Dizer "R$ 149 não está na
    // tabela" faz ele trocar o número e manter o resto — que é o que se quer.
    const segunda = criar.mock.calls[1]![0] as { messages: Array<{ content: string }> };
    const correcao = segunda.messages.map((m) => m.content).join("\n");
    expect(correcao).toContain("149");
    expect(correcao).toContain("REPROVADA");
  });

  it("⭐ reprovado duas vezes, a resposta determinística SAI — o TA não emudece", async () => {
    // Lead esperando é pior que resposta dura. Este é o pior caso do arquivo, e
    // ele tem que ser igual ao melhor caso de ontem.
    modeloResponde("Sim, funciona com o iFood e garanto que aumenta 30% o faturamento.");

    const r = await falar({ mensagem: "quanto custa o plano essencial?" });

    expect(r.origem).toBe("chao-deterministico");
    expect(r.texto.length).toBeGreaterThan(10);
    expect(r.texto).not.toContain("iFood");
    expect(r.reprovacoes.length).toBe(2);
    expect(r.porque).toContain("determinístico");
  });
});

describe("o TA nunca fica mudo", () => {
  it("sem chave do modelo, responde pelo caminho antigo — e nem tenta", async () => {
    delete process.env.OPENAI_API_KEY;

    const r = await falar({ mensagem: "quanto custa o plano essencial?" });

    expect(r.origem).toBe("chao-deterministico");
    expect(r.texto.length).toBeGreaterThan(10);
    expect(criar, "tentou falar com o modelo sem chave").not.toHaveBeenCalled();
  });

  it("modelo fora do ar não derruba nada", async () => {
    criar.mockRejectedValue(new Error("503 Service Unavailable"));

    const r = await falar({ mensagem: "vocês têm relatório de vendas?" });

    expect(r.origem).toBe("chao-deterministico");
    expect(r.texto.length).toBeGreaterThan(10);
  });

  it("resposta vazia do modelo também cai no chão", async () => {
    modeloResponde("");
    const r = await falar({ mensagem: "vocês têm relatório de vendas?" });
    expect(r.origem).toBe("chao-deterministico");
  });
});

describe("o modelo lê o que a casa mandou ler", () => {
  it("⭐ o conhecimento do produto vai junto na pergunta", async () => {
    await falar({ mensagem: "como funciona o pagamento por pix?" });

    const sistema = (criar.mock.calls[0]![0] as { messages: Array<{ content: string }> })
      .messages[0]!.content;

    // O contexto é montado pela casa, e não buscado pelo modelo: ele não tem
    // como decidir não ler.
    expect(sistema).toContain("O QUE VOCÊ SABE SOBRE O PRODUTO");
    expect(sistema.toLowerCase()).toContain("pix");
  });

  it("o preço da TABELA vai junto quando a pergunta é de preço", async () => {
    await falar({ mensagem: "quanto custa o plano crescimento?" });

    const sistema = (criar.mock.calls[0]![0] as { messages: Array<{ content: string }> })
      .messages[0]!.content;

    const real = tabelaPublicada().find((p) => /cresc/i.test(p.nome))!
      .ciclos.find((c) => c.ciclo === "MENSAL")!.doCiclo;

    expect(sistema).toContain("O QUE VOCÊ PODE AFIRMAR");
    expect(sistema).toContain(real);
  });

  it("⭐ o que NÃO existe nunca entra no contexto", async () => {
    // A ponta final do muro de `conhecimento.ts`: nem por acidente o backlog
    // chega ao modelo, porque se chegar ele fala.
    await falar({ mensagem: "o que vocês estão desenvolvendo agora?" });

    const sistema = (criar.mock.calls[0]![0] as { messages: Array<{ content: string }> })
      .messages[0]!.content.toLowerCase();

    for (const marca of ["gaps conhecidos", "backlog", "precisa evoluir"]) {
      expect(sistema, `contexto vazou: ${marca}`).not.toContain(marca);
    }
  });

  it("o histórico da conversa vai junto — senão ele cumprimenta duas vezes", async () => {
    await falar({
      mensagem: "e quanto custa?",
      historico: [
        { deQuem: "cliente", texto: "oi, vi o site de vocês" },
        { deQuem: "ta", texto: "Oi! Aqui é o TA, do Foocci." },
      ],
    });

    const msgs = (criar.mock.calls[0]![0] as { messages: Array<{ role: string; content: string }> })
      .messages;

    // O histórico viaja DENTRO do conteúdo do usuário, e não como turnos
    // separados: `callStructuredJson` manda um `system` e um `user`, que é o
    // contrato do motor do Brain para todo agente da casa. É como o
    // `BrainReasoner` já faz com `sanitizedHistory`.
    const doUsuario = msgs.filter((m) => m.role === "user").map((m) => m.content).join("\n");

    expect(doUsuario).toContain("vi o site");
    expect(doUsuario).toContain("TA");
    expect(doUsuario).toContain("CONVERSA ATÉ AQUI");
  });
});
