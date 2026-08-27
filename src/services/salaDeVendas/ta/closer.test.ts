/**
 * O CLOSER — a segunda postura, e as duas formas de ela não existir.
 *
 * ── O QUE ESTE ARQUIVO ESTÁ REALMENTE GUARDANDO ─────────────────────────────
 *
 * O CEO desenhou a estrutura em 27/08/2026: *"Aí a gente passa pro closer, que
 * aí é um agente muito mais agressivo, que só vai deixar o cliente sair de lá
 * com a assinatura fechada."*
 *
 * Há duas maneiras de entregar isso e não ter entregado nada:
 *
 *  · **ofício escrito e nunca vestido.** O texto do closer existe no arquivo,
 *    ninguém o passa ao modelo, e todo lead continua sendo sondado. É o defeito
 *    que já apareceu TRÊS vezes nesta base — `enviarTextoDeVendas` sem chamador,
 *    os cinco agentes sem conversa, a régua de temperatura sem invocação. Ler o
 *    código não denuncia: parece completo;
 *  · **closer solto na conversa errada.** Ele ataca quem ninguém mediu, ou quem
 *    acabou de pedir uma pessoa. Aí o prejuízo é número bloqueado, e número
 *    bloqueado não vende mais nada nunca.
 *
 * Por isso quase todos os casos daqui olham o **systemPrompt que saiu para o
 * modelo**. É o único lugar onde "o closer assumiu" é um fato verificável, e não
 * uma intenção escrita num arquivo.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { blocoDoOficio, posturaDoLead, OFICIO_DO_FECHAMENTO } from "./oficio";
import { falar } from "./falar";
import { atenderComOTA } from "./atender";

const chamar = vi.hoisted(() => vi.fn());
const escolher = vi.hoisted(() => vi.fn());

vi.mock("@/services/brain/engines/OpenAIEngineAdapter", () => ({
  callStructuredJson: chamar,
  callText: chamar,
}));
vi.mock("@/services/brain/engines/AIEngineRouter", () => ({
  selectEngineRouted: escolher,
}));

beforeEach(() => {
  chamar.mockReset();
  escolher.mockReset();
  escolher.mockResolvedValue({ provider: "OPENAI", model: "x" });
});

describe("⭐ quando o closer assume — a linha que o CEO nomeou", () => {
  it("QUENTE e PRIORIDADE_MAXIMA vestem o closer", () => {
    expect(posturaDoLead("QUENTE")).toBe("fechar");
    expect(posturaDoLead("PRIORIDADE_MAXIMA")).toBe("fechar");
  });

  it("⭐ MORNO continua com o sondador — e isso é decisão, não esquecimento", () => {
    // O morno é o *"quer fechar mas não neste mês"*. Ele precisa de agendamento,
    // não de ataque: um closer em cima dele adianta um "não" que não precisava
    // existir, e um "não" dito em voz alta é muito mais difícil de desfazer do
    // que um silêncio.
    expect(posturaDoLead("MORNO")).toBe("qualificar");
    expect(posturaDoLead("FRIO")).toBe("qualificar");
  });

  it("⭐⭐ quem ninguém mediu NUNCA cai no closer", () => {
    // O caso mais caro dos três. `null` não é frio: é desconhecido. Soltar o
    // agente agressivo em cima de quem nunca foi sondado é atacar sem saber nem
    // se a pessoa é do público — e o custo é o canal, não a venda.
    expect(posturaDoLead(null)).toBe("qualificar");
    expect(posturaDoLead(undefined)).toBe("qualificar");
    expect(posturaDoLead("DESQUALIFICADO")).toBe("qualificar");
    expect(posturaDoLead("NUTRICAO")).toBe("qualificar");
  });

  it("temperatura desconhecida cai no lado seguro", () => {
    // Uma faixa nova no enum não pode significar "solta o closer" por omissão.
    expect(posturaDoLead("FAIXA_QUE_AINDA_NAO_EXISTE")).toBe("qualificar");
  });
});

describe("⭐ as duas posturas dizem coisas OPOSTAS — e é para dizerem", () => {
  it('o sondador aceita "vou pensar"; o closer pergunta qual é a objeção', () => {
    // Este é o ponto exato onde o CEO pediu agressividade, e onde o ofício do
    // atendimento manda o contrário. Se os dois textos concordassem aqui, o
    // closer não seria closer — seria o mesmo agente com outro nome.
    const sondar = blocoDoOficio("qualificar");
    const fechar = blocoDoOficio("fechar");

    expect(sondar, "o sondador parou de aceitar o adiamento").toMatch(/vou pensar.*aceite/is);
    expect(fechar, "o closer aceita o adiamento igual ao sondador").toMatch(
      /vou pensar.*não é o fim/is,
    );
    expect(fechar).not.toBe(sondar);
  });

  it("o closer não recomeça a descoberta", () => {
    // O erro que mais rápido esfria um lead quente: ele já contou tudo, e do
    // nada perguntam de novo.
    expect(blocoDoOficio("fechar")).toMatch(/não recomece a descoberta/i);
  });

  it("⭐ e ele pede a decisão com todas as letras", () => {
    // A diferença medível entre um SDR e um closer: o SDR termina em pergunta
    // aberta, o closer termina em decisão. Sem esta linha o modelo escreve
    // simpatia sem pedir nada e a conversa morre de morte natural.
    expect(blocoDoOficio("fechar")).toMatch(/fecha comigo/i);
  });
});

describe("⭐ onde a agressividade acaba — e por que não basta estar escrito", () => {
  it("o ofício do closer manda parar no não e no pedido de silêncio", () => {
    const fechar = blocoDoOficio("fechar");
    expect(fechar).toMatch(/um "?não"? claro é um não/i);
    expect(fechar).toMatch(/parar de receber mensagem/i);
  });

  it("⭐ mas o freio de verdade é a ORDEM do código, não a linha do ofício", async () => {
    // Guardrail 4 da casa: prompt é aviso, código é trava. O ofício acima é
    // aviso — o modelo pode ignorá-lo, e sob instrução de ser agressivo é
    // exatamente o que ele tenderia a fazer.
    //
    // A trava é que `falar()` resolve o handoff ANTES do modelo. Quando o lead
    // pede uma pessoa, o modelo não é consultado — então não existe caminho em
    // que o closer "tenta contornar" para fechar antes. Ele nem é acordado.
    const r = await falar(
      { mensagem: "quero falar com uma pessoa", nome: "Zé", jaPerguntou: [], historico: [] },
      undefined,
      "fechar",
    );

    expect(r.handoff.deve, "o pedido de gente não virou handoff").toBe(true);
    expect(r.origem).toBe("handoff-deterministico");
    expect(chamar, "o closer foi consultado num caso de gente").not.toHaveBeenCalled();
  });

  it("⭐ pedido de desconto também não passa pelo closer", async () => {
    // Desconto é fora da alçada por decisão, não por capacidade. Um closer
    // agressivo é justamente quem mais tentaria negociar para não perder a
    // venda — e por isso ele não é chamado.
    const r = await falar(
      { mensagem: "consegue fazer por menos? me dá um desconto", jaPerguntou: [], historico: [] },
      undefined,
      "fechar",
    );

    expect(r.handoff.deve).toBe(true);
    expect(chamar, "o closer foi negociar desconto sozinho").not.toHaveBeenCalled();
  });
});

describe("⭐ o ofício do closer CHEGA ao modelo — o teste contra a peça sem chamador", () => {
  it("⭐⭐ a instrução que sai para o modelo é a do fechamento, não a da sondagem", async () => {
    // O caso que este arquivo existe para ter. Sem ele, tudo acima passaria com
    // o closer escrito e jamais vestido: `posturaDoLead` devolvendo "fechar",
    // `blocoDoOficio("fechar")` produzindo o texto certo, e `falar()` mandando o
    // ofício da sondagem para o modelo assim mesmo.
    chamar.mockResolvedValue("Fecha comigo hoje e eu já deixo tudo pronto?");

    await falar(
      { mensagem: "gostei, como funciona?", nome: "Zé", jaPerguntou: [], historico: [] },
      undefined,
      "fechar",
    );

    expect(chamar, "o modelo não foi chamado — o caso não prova nada").toHaveBeenCalled();
    const { systemPrompt } = chamar.mock.calls[0]![0] as { systemPrompt: string };

    expect(systemPrompt, "o ofício do closer não chegou ao modelo").toMatch(
      /não recomece a descoberta/i,
    );
    expect(systemPrompt, "foi o ofício da sondagem que saiu, não o do closer").not.toMatch(
      /vou pensar.*aceite\. pergunte o que ficou faltando/is,
    );
  });

  it("⭐ e sem postura declarada é a SONDAGEM que sai", async () => {
    // O outro lado da mesma trava. Um `falar()` chamado sem postura — código
    // antigo, rota nova, teste — não pode significar "solta o closer".
    chamar.mockResolvedValue("Que tipo de restaurante você tem?");

    await falar({ mensagem: "oi, vi o site", jaPerguntou: [], historico: [] });

    const { systemPrompt } = chamar.mock.calls[0]![0] as { systemPrompt: string };
    expect(systemPrompt, "o closer assumiu por omissão").not.toMatch(/não recomece a descoberta/i);
    expect(systemPrompt).toMatch(/uma pergunta por mensagem/i);
  });

  it("⭐ o próprio `blocoDoOficio` sem argumento também sonda", () => {
    // O caso acima passa pelo padrão de `falar()`. Este cobre o padrão de
    // `blocoDoOficio` em si — dois padrões diferentes, e cada um cai sozinho.
    // Sem este, trocar o default deste arquivo para "fechar" passaria batido,
    // e qualquer chamador novo nasceria com o closer ligado sem pedir.
    expect(blocoDoOficio(), "o padrão do ofício virou o closer").not.toMatch(
      /não recomece a descoberta/i,
    );
  });
});

/**
 * ── ⭐⭐ A CORRENTE INTEIRA: DA LINHA DO BANCO ATÉ O QUE O MODELO LÊ ─────────
 *
 * Tudo acima prova pedaços. Nenhum caso acima prova o que o CEO comprou.
 *
 * A prova de que aprendi a lição: ao quebrar isto de propósito — trocando
 * `posturaDoLead(lead.temperatura)` por `posturaDoLead(null)` em `atender.ts` —
 * **nenhum teste caiu**. `posturaDoLead` continuava certa, `blocoDoOficio`
 * continuava certo, `falar()` continuava repassando. E o closer nunca assumiria
 * uma conversa de verdade, porque o único lugar que sabe a temperatura do lead
 * é a consulta ao banco, e ela tinha parado de ser lida.
 *
 * É o defeito assinatura desta base — peça pronta, testada, sem chamador — e ele
 * quase entrou pela quarta vez. Este bloco é o que fecha a corrente: linha do
 * banco → `atenderComOTA` → `falar` → `cerebro` → o texto que o modelo lê.
 */
describe("⭐⭐ o lead QUENTE do banco chega ao modelo como closer", () => {
  function banco(temperatura: string | null) {
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
          nome: "Marina Duarte",
          atendidoPor: "IA",
          optOutAt: null,
          atendenteUserId: null,
          temperatura,
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
      leadScoreFator: {
        deleteMany: vi.fn().mockResolvedValue({}),
        createMany: vi.fn().mockResolvedValue({}),
      },
      $transaction: vi.fn(),
    };
  }

  /** Terça-feira, 09:00 em São Paulo — dentro da janela de atendimento. */
  const AGORA = new Date("2026-08-25T12:00:00Z");

  /** O `systemPrompt` da PRIMEIRA chamada em que o modelo redigiu a fala. */
  function instrucaoQueSaiu(): string | null {
    for (const c of chamar.mock.calls) {
      const arg = c[0] as { systemPrompt?: string };
      if (arg?.systemPrompt?.includes("TOM:")) return arg.systemPrompt;
    }
    return null;
  }

  it("⭐⭐ temperatura QUENTE na linha do banco vira ofício de fechamento", async () => {
    chamar.mockResolvedValue("Fecha comigo hoje? Eu já deixo tudo pronto pra amanhã.");

    await atenderComOTA(banco("QUENTE") as never, {
      leadId: "l1",
      mensagem: "gostei, e como funciona pra começar?",
      agora: AGORA,
    });

    const instrucao = instrucaoQueSaiu();
    expect(instrucao, "o modelo nem chegou a redigir — o caso não prova nada").not.toBeNull();
    expect(instrucao, "o lead estava QUENTE e o closer não assumiu").toMatch(
      /não recomece a descoberta/i,
    );
  });

  it("⭐ e temperatura null — ninguém mediu — continua sondando", async () => {
    // A outra metade. Um teste que só provasse o caso QUENTE passaria numa
    // implementação que soltasse o closer em TODA conversa, que é o pior
    // resultado possível: agressividade em cima de quem ninguém qualificou.
    chamar.mockResolvedValue("Que tipo de restaurante você tem?");

    await atenderComOTA(banco(null) as never, {
      leadId: "l1",
      mensagem: "oi, vi o site de vocês",
      agora: AGORA,
    });

    const instrucao = instrucaoQueSaiu();
    expect(instrucao).not.toBeNull();
    expect(instrucao, "o closer assumiu um lead que ninguém mediu").not.toMatch(
      /não recomece a descoberta/i,
    );
  });
});

describe("o ofício do closer está escrito inteiro", () => {
  it("todo bloco tem título e linhas — bloco vazio é ofício que não instrui nada", () => {
    expect(OFICIO_DO_FECHAMENTO.length).toBeGreaterThan(3);
    for (const b of OFICIO_DO_FECHAMENTO) {
      expect(b.titulo.length, "bloco sem título").toBeGreaterThan(0);
      expect(b.linhas.length, b.titulo).toBeGreaterThan(2);
      for (const l of b.linhas) expect(l.length, b.titulo).toBeGreaterThan(10);
    }
  });

  it("⭐ e ele não pode autorizar o que a casa proíbe", () => {
    // Um ofício agressivo escrito sem cuidado convida o modelo a inventar prazo
    // ou desconto para vencer a objeção — e aí o verificador reprova a resposta,
    // o chão determinístico sai, e o closer vira um agente que nunca fala.
    const fechar = blocoDoOficio("fechar");
    expect(fechar).toMatch(/nunca invente prazo, desconto, valor ou garantia/i);
    expect(fechar).toMatch(/desconto não é seu/i);
  });
});
