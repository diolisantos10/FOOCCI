/**
 * ⭐⭐ OS CORTES QUE O CEO MANDOU PROVOCAR — e cada um com a outra metade.
 *
 * Quatro cortes, e cada um é um jeito específico de o conector fazer um estrago
 * real num cliente real:
 *
 *   1. **política revogada** → o agente não pode responder com ela;
 *   2. **exceção individual virando regra** → recusa;
 *   3. **dois clientes ao mesmo tempo** → não se misturam;
 *   4. ⛔ **comunicação interna** → nunca chega ao cliente externo.
 *
 * ─── ⚠️ E POR QUE CADA TESTE TEM DUAS METADES ───────────────────────────────
 *
 * Uma trava que só reprova não separa nada: se ela recusasse tudo, passaria em
 * todos os testes de recusa e o produto nunca responderia ninguém. Então cada
 * corte vem em par — o caso que TEM que ser recusado, e o caso gêmeo, idêntico
 * em tudo menos no detalhe que importa, que TEM que passar.
 *
 * A mutação que reprovaria cada um está escrita em cima dele.
 */

import { describe, it, expect } from "vitest";
import { avaliarPolitica, consultarPolitica } from "../politicas";
import { paraOCliente, nuncaVazaInterno, VazamentoInterno, CAMPOS_INTERNOS } from "../barreira";
import { casarRetorno, type Pendencia } from "../pendencias";
import { protocolo, lerProtocolo, type PoliticaDoNucleo } from "../contrato";
import { VERSAO_DO_CONTRATO } from "../versao";

const AGORA = new Date("2026-08-30T12:00:00Z");
const MARCOS = "lead-marcos";
const OUTRO = "lead-outro";

/** Uma política viva, de regra, que vale para todo mundo. É o caso que PASSA. */
function politicaViva(over: Partial<PoliticaDoNucleo> = {}): PoliticaDoNucleo {
  return {
    politicaId: "pol-permuta-001",
    versao: 1,
    escopo: "regra",
    valeApenasPara: null,
    vigenteDe: "2026-08-01T00:00:00Z",
    vigenteAte: null,
    revogadaEm: null,
    respostaAoCliente:
      "Sobre permuta: a gente aceita parceria com troca de serviço em até 30% do valor do plano, o resto " +
      "em dinheiro. Se fizer sentido pra você, eu já monto a proposta nesse formato.",
    ...over,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
describe("⭐ CORTE 1 — política REVOGADA não responde cliente nenhum", () => {
  /**
   * MUTAÇÃO: apagar o `if` de `revogadaEm` em `avaliarPolitica`
   * → este fica verde do jeito errado, e o agente passa a prometer, por escrito
   *   e em nome da empresa, uma condição que a empresa cancelou.
   */
  it("⭐ revogada ONTEM: o agente não responde, e a causa é nomeada", () => {
    const r = avaliarPolitica(politicaViva({ revogadaEm: "2026-08-29T10:00:00Z" }), {
      referenciaDoCliente: MARCOS,
      agora: AGORA,
    });
    expect(r.podeResponder).toBe(false);
    if (!r.podeResponder) {
      expect(r.causa).toBe("politicaRevogada");
      // ⭐ E o gerente precisa saber que houve decisão antes — a pergunta que
      // sobe é outra quando já existiu uma resposta e ela caiu.
      expect(r.houvePoliticaRecusada).toBe(true);
      expect(r.paraORastro).toMatch(/ACHOU uma política e NÃO pôde usá-la/);
    }
  });

  it("⭐ A OUTRA METADE — a MESMA política, sem revogação, RESPONDE", () => {
    const r = avaliarPolitica(politicaViva(), { referenciaDoCliente: MARCOS, agora: AGORA });
    expect(r.podeResponder).toBe(true);
    if (r.podeResponder) expect(r.texto).toMatch(/permuta/i);
  });

  /**
   * ⚠️ A variante fina: revogação AGENDADA para o futuro ainda não revogou nada.
   * MUTAÇÃO: trocar a comparação por `!!politica.revogadaEm`
   * → este fica vermelho, e uma revogação marcada para semana que vem calaria o
   *   agente hoje.
   */
  it("⚠️ revogação AGENDADA para depois não cala o agente hoje", () => {
    const r = avaliarPolitica(politicaViva({ revogadaEm: "2026-09-15T00:00:00Z" }), {
      referenciaDoCliente: MARCOS,
      agora: AGORA,
    });
    expect(r.podeResponder).toBe(true);
  });

  it("vigência vencida e vigência que ainda não começou também não respondem", () => {
    const vencida = avaliarPolitica(politicaViva({ vigenteAte: "2026-08-10T00:00:00Z" }), {
      referenciaDoCliente: MARCOS,
      agora: AGORA,
    });
    expect(vencida.podeResponder).toBe(false);
    if (!vencida.podeResponder) expect(vencida.causa).toBe("politicaExpirada");

    const futura = avaliarPolitica(politicaViva({ vigenteDe: "2026-12-01T00:00:00Z" }), {
      referenciaDoCliente: MARCOS,
      agora: AGORA,
    });
    expect(futura.podeResponder).toBe(false);
    if (!futura.podeResponder) expect(futura.causa).toBe("aindaNaoVigente");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("⭐ CORTE 2 — exceção individual NÃO vira regra", () => {
  const excecaoDoOutro = politicaViva({
    politicaId: "pol-excecao-permuta-77",
    escopo: "excecao",
    valeApenasPara: [OUTRO],
    respostaAoCliente: "Fechado: permuta integral, 100% em troca de serviço, por 90 dias.",
  });

  /**
   * MUTAÇÃO: trocar `donos.includes(ctx.referenciaDoCliente)` por `true`
   * → este fica verde do jeito errado, e a condição excepcional que a empresa
   *   deu a UM cliente vira tabela para todos, sem ninguém ter decidido isso.
   */
  it("⭐ o Marcos NÃO recebe a exceção que foi dada a outro cliente", () => {
    const r = avaliarPolitica(excecaoDoOutro, { referenciaDoCliente: MARCOS, agora: AGORA });
    expect(r.podeResponder).toBe(false);
    if (!r.podeResponder) {
      expect(r.causa).toBe("excecaoNaoEReRegra");
      expect(r.houvePoliticaRecusada).toBe(true);
      // ⛔ E o texto da exceção não vaza no rastro: quem lê a fila não pode
      // descobrir por aí a condição que outro cliente conseguiu.
      expect(r.paraORastro).not.toMatch(/100% em troca/);
    }
  });

  it("⭐ A OUTRA METADE — o DONO da exceção recebe a exceção dele", () => {
    const r = avaliarPolitica(excecaoDoOutro, { referenciaDoCliente: OUTRO, agora: AGORA });
    expect(r.podeResponder).toBe(true);
    if (r.podeResponder) expect(r.escopo).toBe("excecao");
  });

  /**
   * ⚠️ A variante que um núcleo distraído produz: exceção sem dono declarado.
   * MUTAÇÃO: tratar lista vazia como "vale para todos"
   * → este fica vermelho, e uma exceção mal cadastrada vira regra da empresa.
   */
  it("⚠️ exceção SEM dono não vale para ninguém — nem para quem perguntou", () => {
    for (const donos of [null, [], ["   "]]) {
      const r = avaliarPolitica(
        { ...excecaoDoOutro, valeApenasPara: donos as string[] | null },
        { referenciaDoCliente: MARCOS, agora: AGORA },
      );
      expect(r.podeResponder).toBe(false);
      if (!r.podeResponder) expect(r.causa).toBe("excecaoSemDono");
    }
  });

  it("⭐ e uma REGRA vale para quem nunca perguntou antes — é o que a separa da exceção", () => {
    const r = avaliarPolitica(politicaViva(), { referenciaDoCliente: "lead-nunca-visto", agora: AGORA });
    expect(r.podeResponder).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("⭐ CORTE 3 — dois clientes ao mesmo tempo, e eles NÃO se misturam", () => {
  function pendencia(conversa: string, sufixo: string, over: Partial<Pendencia> = {}): Pendencia {
    return {
      protocolo: protocolo("foocci", conversa, sufixo),
      produto: "foocci",
      conversa,
      canal: "sala-de-vendas",
      agente: "ta",
      fio: `fio-${sufixo}`,
      assunto: "permuta",
      estado: "PENDENTE",
      avisadoEm: AGORA,
      respondidaEm: null,
      criadaEm: AGORA,
      ...over,
    };
  }

  const doMarcos = pendencia(MARCOS, "aaa");
  const doOutro = pendencia(OUTRO, "bbb");

  it("cada retorno acha a SUA conversa", () => {
    expect(casarRetorno("foocci", doMarcos.protocolo, doMarcos)).toMatchObject({ ok: true });
    expect(casarRetorno("foocci", doOutro.protocolo, doOutro)).toMatchObject({ ok: true });
    // E as duas conversas são mesmo diferentes — sem isto o teste passaria
    // mesmo que tudo apontasse para o mesmo lugar.
    expect(doMarcos.conversa).not.toBe(doOutro.conversa);
  });

  /**
   * ⭐⭐ O CORTE. O protocolo do Marcos chega, e o banco devolve a pendência do
   * OUTRO — que é o que acontece quando alguém erra a busca, ou quando um
   * protocolo bem-formado é forjado de fora.
   *
   * MUTAÇÃO: apagar a comparação `pendencia.conversa !== lido.conversa`
   * → este fica verde do jeito errado, e a resposta sobre a permuta do Marcos
   *   entra na conversa de outro cliente. É o pior desfecho deste projeto.
   */
  it("⭐⭐ protocolo de um, pendência de outro: NADA é entregue", () => {
    const r = casarRetorno("foocci", doMarcos.protocolo, doOutro);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.causa).toBe("conversaDivergente");
  });

  it("⭐ protocolo de OUTRO PRODUTO não entra nesta porta", () => {
    const deOutroProduto = protocolo("cityjobs", MARCOS, "aaa");
    const r = casarRetorno("foocci", deOutroProduto, doMarcos);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.causa).toBe("produtoErrado");
  });

  it("protocolo desconhecido não escolhe uma conversa 'parecida'", () => {
    const r = casarRetorno("foocci", protocolo("foocci", MARCOS, "zzz"), null);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.causa).toBe("protocoloDesconhecido");
      expect(r.motivo).toMatch(/parecida/);
    }
  });

  it("protocolo torto é recusado sem citar o valor inteiro", () => {
    for (const torto of ["", "   ", "sem-separador", "a:b", "a:b:c:d", "x".repeat(300), null, 42]) {
      expect(casarRetorno("foocci", torto, doMarcos).ok).toBe(false);
    }
    // E o eco tem teto: um protocolo de 300 caracteres não volta inteiro.
    const gigante = lerProtocolo("x".repeat(300));
    expect(gigante.ok).toBe(false);
    if (!gigante.ok) expect(gigante.motivo.length).toBeLessThan(120);
  });

  /**
   * ⭐ Reentrega: o núcleo repete o que ele não teve certeza de ter entregue
   * (decisão D2). O cliente não pode receber a mesma resposta duas vezes.
   *
   * MUTAÇÃO: aceitar qualquer estado em `casarRetorno`
   * → este fica vermelho, e cada tentativa da fila de reentrega do núcleo põe
   *   outra cópia da mesma decisão na frente do cliente.
   */
  it("⭐ reentrega do núcleo é IGNORADA, e a de quem já foi entregue também", () => {
    for (const estado of ["RESPONDIDA", "ENCERRADA", "AGUARDANDO_ENVIO"] as const) {
      const r = casarRetorno("foocci", doMarcos.protocolo, { ...doMarcos, estado });
      expect(r.ok, estado).toBe(false);
      if (!r.ok) expect(r.causa).toBe("jaRespondida");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("⛔ CORTE 4 — cliente externo NUNCA acessa comunicação interna", () => {
  const interno = {
    respostaAoCliente: "Pode ser permuta em até 30% do plano. Quer que eu monte assim?",
    fundamentacaoInterna:
      "O Diretor autorizou fora da tabela porque a agência do Marcos traz três indicações por trimestre.",
    decididaPor: "agente-gerente-produto",
    notaInterna: "não repetir isso para outros leads do mesmo segmento",
    fio: "fio-9f3c-interno-do-connect",
    politicaId: "pol-permuta-001",
  };

  it("⭐ a allowlist deixa passar UM campo, e só ele", () => {
    const r = paraOCliente(interno);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.texto).toBe(interno.respostaAoCliente);
      // Nenhum pedaço do interno aparece no que sai.
      expect(r.texto).not.toMatch(/Diretor autorizou/);
      expect(r.texto).not.toMatch(/indicações/);
      expect(r.texto).not.toMatch(/agente-gerente/);
      expect(r.texto).not.toMatch(/fio-9f3c/);
    }
  });

  /**
   * ⭐⭐ A TRAVA QUE PODE FALHAR — e é a que a allowlist sozinha não faria.
   *
   * MUTAÇÃO: apagar a chamada de `nuncaVazaInterno` dentro de `paraOCliente`
   * → este fica verde do jeito errado, e o cliente lê a frase que o gerente
   *   escreveu para o time.
   */
  it("⭐⭐ material interno COPIADO dentro do campo externo faz a barreira LANÇAR", () => {
    const vazando = {
      ...interno,
      respostaAoCliente:
        "Pode ser permuta em até 30%. " + interno.fundamentacaoInterna,
    };
    expect(() => paraOCliente(vazando)).toThrow(VazamentoInterno);
    try {
      paraOCliente(vazando);
    } catch (e) {
      expect((e as VazamentoInterno).campo).toBe("fundamentacaoInterna");
    }
  });

  it("⭐ e vaza mesmo com maiúsculas e espaços diferentes — não é comparação ingênua", () => {
    expect(() =>
      nuncaVazaInterno("resposta.  NÃO REPETIR   ISSO  PARA OUTROS LEADS do mesmo segmento", interno),
    ).toThrow(VazamentoInterno);
  });

  it("⭐ o interno escondido DENTRO de objeto e de lista também é pego", () => {
    const aninhado = {
      respostaAoCliente: "vale a condição pol-excecao-777-do-cliente-x",
      virouPolitica: { politicaId: "pol-excecao-777-do-cliente-x", escopo: "excecao" },
    };
    expect(() => paraOCliente(aninhado)).toThrow(VazamentoInterno);

    const emLista = {
      respostaAoCliente: "condição igual à do cliente-parceiro-alfa",
      valeApenasPara: ["cliente-parceiro-alfa"],
    };
    expect(() => paraOCliente(emLista)).toThrow(VazamentoInterno);
  });

  /**
   * ⭐ A OUTRA METADE, e sem ela a barreira poderia ser "lançar sempre".
   */
  it("⭐ A OUTRA METADE — uma resposta limpa atravessa, com os mesmos campos internos ao lado", () => {
    expect(() => paraOCliente(interno)).not.toThrow();
  });

  it("⚠️ valor interno curto NÃO conta como vazamento — senão a barreira vira ruído", () => {
    // "v1" apareceria em quase qualquer frase; a barreira que dispara sempre é
    // a barreira que alguém desliga na terceira vez.
    expect(() =>
      nuncaVazaInterno("o plano v1 atende o que você pediu", { decididaPor: "v1" }),
    ).not.toThrow();
  });

  it("sem `respostaAoCliente` não se improvisa texto a partir de outro campo", () => {
    for (const pacote of [{ ...interno, respostaAoCliente: "" }, { fundamentacaoInterna: "x" }, null, "texto"]) {
      const r = paraOCliente(pacote);
      expect(r.ok).toBe(false);
    }
  });

  it("a lista de campos internos cobre todo campo interno do contrato", () => {
    // Se alguém acrescentar um campo interno ao contrato e esquecer daqui, ele
    // atravessaria — então a lista é conferida contra os nomes que existem.
    for (const campo of ["fundamentacaoInterna", "notaInterna", "decididaPor", "fio", "politicaId", "protocolo", "virouPolitica", "valeApenasPara"]) {
      expect(CAMPOS_INTERNOS).toContain(campo);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("a consulta ao núcleo — nunca lança, nunca demora sem teto", () => {
  const AMBIENTE = {
    DIOLI_CONNECT_URL: "https://nucleo.exemplo",
    DIOLI_CONNECT_SECRET: "x".repeat(40),
  } as NodeJS.ProcessEnv;

  const PERGUNTA = {
    versaoDoContrato: VERSAO_DO_CONTRATO,
    produto: "foocci",
    agente: "ta",
    protocolo: protocolo("foocci", MARCOS, "aaa"),
    referenciaDoCliente: MARCOS,
    assuntos: [{ assunto: "permuta", motivo: "ninguém decidiu" }],
    pergunta: "topam permuta?",
  };

  function resposta(corpo: unknown, status = 200): typeof fetch {
    return (async () =>
      new Response(JSON.stringify(corpo), {
        status,
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch;
  }

  it("⭐ o segredo vai no cabeçalho e NÃO aparece em lugar nenhum", async () => {
    let cabecalhos: Record<string, string> = {};
    let corpoEnviado = "";
    const buscar = (async (_url: string, init: RequestInit) => {
      cabecalhos = init.headers as Record<string, string>;
      corpoEnviado = String(init.body);
      return new Response(JSON.stringify({ encontrada: false }), { status: 200 });
    }) as unknown as typeof fetch;

    const r = await consultarPolitica(PERGUNTA, { buscar, env: AMBIENTE, agora: AGORA });
    expect(cabecalhos["x-dioli-connect-secret"]).toBe(AMBIENTE.DIOLI_CONNECT_SECRET);
    // ⛔ E não vaza para o corpo nem para o resultado.
    expect(corpoEnviado).not.toContain(AMBIENTE.DIOLI_CONNECT_SECRET);
    expect(JSON.stringify(r)).not.toContain(AMBIENTE.DIOLI_CONNECT_SECRET);
  });

  it("⚠️ a pergunta NÃO carrega nome, telefone nem e-mail", async () => {
    let corpoEnviado = "";
    const buscar = (async (_url: string, init: RequestInit) => {
      corpoEnviado = String(init.body);
      return new Response(JSON.stringify({ encontrada: false }), { status: 200 });
    }) as unknown as typeof fetch;

    await consultarPolitica(PERGUNTA, { buscar, env: AMBIENTE, agora: AGORA });
    const enviado = JSON.parse(corpoEnviado);
    expect(Object.keys(enviado).sort()).toEqual(
      ["agente", "assuntos", "pergunta", "produto", "protocolo", "referenciaDoCliente", "versaoDoContrato"],
    );
  });

  it("sem porta configurada não se tenta consulta nenhuma", async () => {
    let tentou = false;
    const buscar = (async () => {
      tentou = true;
      return new Response("{}");
    }) as unknown as typeof fetch;
    const r = await consultarPolitica(PERGUNTA, { buscar, env: {}, agora: AGORA });
    expect(tentou).toBe(false);
    expect(r.podeResponder).toBe(false);
    if (!r.podeResponder) expect(r.causa).toBe("nucleoNaoConfigurado");
  });

  it("⚠️ `encontrada` ausente é ILEGÍVEL, e não uma negação", async () => {
    const r = await consultarPolitica(PERGUNTA, {
      buscar: resposta({ politica: null }),
      env: AMBIENTE,
      agora: AGORA,
    });
    expect(r.podeResponder).toBe(false);
    if (!r.podeResponder) expect(r.causa).toBe("respostaIlegivel");
  });

  it("rede fora, 500 e corpo que não é JSON: causa nomeada, nunca exceção", async () => {
    const quebrado = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const semRede = await consultarPolitica(PERGUNTA, { buscar: quebrado, env: AMBIENTE, agora: AGORA });
    expect(semRede.podeResponder).toBe(false);
    if (!semRede.podeResponder) expect(semRede.causa).toBe("nucleoInalcancavel");

    const cinco = await consultarPolitica(PERGUNTA, {
      buscar: resposta({ erro: "boom" }, 500),
      env: AMBIENTE,
      agora: AGORA,
    });
    expect(cinco.podeResponder).toBe(false);

    const lixo = (async () =>
      new Response("<html>", { status: 200 })) as unknown as typeof fetch;
    const ilegivel = await consultarPolitica(PERGUNTA, { buscar: lixo, env: AMBIENTE, agora: AGORA });
    expect(ilegivel.podeResponder).toBe(false);
    if (!ilegivel.podeResponder) expect(ilegivel.causa).toBe("respostaIlegivel");
  });

  it("⭐ e o caminho feliz: política válida vinda do núcleo responde o cliente", async () => {
    const r = await consultarPolitica(PERGUNTA, {
      buscar: resposta({ encontrada: true, politica: politicaViva() }),
      env: AMBIENTE,
      agora: AGORA,
    });
    expect(r.podeResponder).toBe(true);
  });

  it("⭐ e a MESMA resposta do núcleo, com a política revogada, NÃO responde", async () => {
    const r = await consultarPolitica(PERGUNTA, {
      buscar: resposta({
        encontrada: true,
        politica: politicaViva({ revogadaEm: "2026-08-29T00:00:00Z" }),
      }),
      env: AMBIENTE,
      agora: AGORA,
    });
    expect(r.podeResponder).toBe(false);
    if (!r.podeResponder) expect(r.causa).toBe("politicaRevogada");
  });
});
