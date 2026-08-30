/**
 * ⭐ O SDR CONSULTANDO O GERENTE — as duas metades, e o chão que não sai.
 *
 * O que este arquivo cobra:
 *
 *   1. a consulta sai pela porta do Connect, em `producao`, com o caso do lead;
 *   2. ela **não** vaza o segredo em lugar nenhum;
 *   3. TODA falha vira `consultado: false` com causa nomeada — nunca exceção,
 *      nunca silêncio, nunca "a porta respondeu 200 então deu certo";
 *   4. a resposta do gerente é `null` e está ESCRITA, porque a porta entrega e
 *      não colhe resposta.
 */

import { describe, expect, it, vi } from "vitest";
import {
  CAMINHO_DO_DESPACHO,
  TETO_DE_ESPERA_MS,
  VARIAVEL_DA_URL,
  assuntoDaConsulta,
  consultarGerente,
  perguntaAoGerente,
  type PedidoDeConsulta,
} from "./consultarGerente";
import { CABECALHO_DO_SEGREDO, VARIAVEL_DO_SEGREDO } from "@/services/connect/porta";
import { DIRETOR_DO_PRODUTO, GERENTE_DO_PRODUTO } from "@/services/connect/cadastro";
import { conferirPedido } from "@/services/connect/contrato";

const SEGREDO = "um-segredo-bem-longo-de-verdade";

const AMBIENTE: NodeJS.ProcessEnv = {
  [VARIAVEL_DO_SEGREDO]: SEGREDO,
  [VARIAVEL_DA_URL]: "https://foocci.example",
} as NodeJS.ProcessEnv;

const PEDIDO: PedidoDeConsulta = {
  /** ⭐ O endereço de volta — é por ele que a resposta acha a conversa. */
  protocolo: "foocci:lead-1:aaa",
  foraDaAlcada: [
    { assunto: "escopoAcimaDaCapacidade", motivo: "não existe escopo sob medida contratável hoje." },
    { assunto: "permuta", motivo: "a empresa não decidiu se aceita permuta." },
  ],
  caso: {
    leadId: "lead-1",
    nome: "Marcos",
    resumo: 'O lead escreveu: "28–30 posts/mês, 3 carrosséis/semana; topam permuta?"',
    oQueTrava: "escopo acima da tabela e permuta",
    historico: [{ deQuem: "cliente", texto: "é a terceira vez que escrevo" }],
  },
};

/** Uma porta de mentira que responde o que o teste mandar, guardando a chamada. */
function porta(resposta: { status: number; corpo: unknown }) {
  const chamadas: Array<{ url: string; init: RequestInit }> = [];
  const buscar = (async (url: unknown, init: unknown) => {
    chamadas.push({ url: String(url), init: init as RequestInit });
    return {
      ok: resposta.status >= 200 && resposta.status < 300,
      status: resposta.status,
      json: async () => resposta.corpo,
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { buscar, chamadas };
}

const EXECUTADO = {
  status: 200,
  corpo: {
    estado: "executado",
    fio: "connect:foocci:11111111-1111-1111-1111-111111111111",
    rodadaId: "rodada-1",
    caixa: { estado: "entregue" },
    rascunho: false,
    natureza: "OPERACAO_REAL",
  },
};

// ═══════════════════════════════════════════════════════════════════════════
describe("⭐ a consulta sai, e sai pelo contrato da porta", () => {
  it("chama a porta do Connect, no caminho certo, com o cabeçalho do segredo", async () => {
    const p = porta(EXECUTADO);
    const r = await consultarGerente(PEDIDO, { buscar: p.buscar, env: AMBIENTE });

    expect(r.consultado, JSON.stringify(r)).toBe(true);
    expect(p.chamadas).toHaveLength(1);
    expect(p.chamadas[0]!.url).toBe(`https://foocci.example${CAMINHO_DO_DESPACHO}`);
    const headers = p.chamadas[0]!.init.headers as Record<string, string>;
    expect(headers[CABECALHO_DO_SEGREDO]).toBe(SEGREDO);
  });

  /**
   * ⭐ ESTE É O TESTE QUE IMPEDE A CONSULTA DE NASCER MORTA.
   *
   * O corpo que a consulta monta é passado pela conferência REAL da porta. Se um
   * dia o contrato mudar e este corpo deixar de atravessá-lo, o vermelho aparece
   * aqui — e não numa conversa com um cliente esperando.
   *
   * MUTAÇÃO: trocar `acao: "receber"` por `acao: "iniciar"` em
   * `consultarGerente.ts` → vermelho, porque `iniciar` recusa `mensagem`.
   */
  it("⭐ o corpo montado ATRAVESSA a conferência de verdade do contrato", async () => {
    const p = porta(EXECUTADO);
    await consultarGerente(PEDIDO, { buscar: p.buscar, env: AMBIENTE });

    const corpo = JSON.parse(String(p.chamadas[0]!.init.body));

    // ── ⚠️ AS DUAS PORTAS SÃO DUAS, E ESTA CONFERÊNCIA É A DE CÁ ───────────
    //
    // `conferirPedido` é a conferência da porta de ENTRADA do Foocci (Control
    // Room → produto). Este corpo vai para a porta do NÚCLEO (produto → Control
    // Room), que é outra e exige dois campos a mais: `protocolo` (o endereço de
    // volta) e `foraDaAlcada` (a classificação — o núcleo não deduz assunto
    // lendo prosa, e recusa o despacho sem ela).
    //
    // Conferir o corpo INTEIRO contra o contrato de entrada é medir o contrato
    // errado, e foi o que apareceu quando `foraDaAlcada` entrou: vermelho aqui
    // dizendo "campo desconhecido", sobre uma porta que não é o destino desta
    // mensagem.
    //
    // ⛔ E a correção NÃO é acrescentar os dois nomes à `CAMPOS_ACEITOS` da
    // porta de entrada. A regra daquele arquivo é explícita: acrescentar um
    // nome ali é acrescentar entrada à porta corporativa, e *"só se faz junto
    // com o código que lê o campo"*. A porta de entrada não lê nenhum dos dois;
    // abrir entrada para campo que ninguém lê é justamente o que ela proíbe.
    //
    // O que este teste continua medindo — e é o que lhe dá valor — é que tudo o
    // que as duas portas têm em comum atravessa a conferência REAL.
    const SO_DA_PORTA_DO_NUCLEO = ["protocolo", "foraDaAlcada"];
    const comum: Record<string, unknown> = { ...corpo };
    for (const campo of SO_DA_PORTA_DO_NUCLEO) delete comum[campo];

    const c = conferirPedido(comum);
    expect(c.ok, JSON.stringify(c)).toBe(true);
    if (!c.ok) return;

    // ⭐ E a outra metade da separação: os dois campos de saída ESTÃO no corpo,
    // e são exatamente estes dois. Sem esta asserção, apagar `foraDaAlcada` de
    // `consultarGerente.ts` deixaria este teste verde — e a escalada morreria
    // na porta do núcleo sem ninguém aqui ficar sabendo.
    expect(Object.keys(corpo).filter((k) => SO_DA_PORTA_DO_NUCLEO.includes(k)).sort()).toEqual([
      "foraDaAlcada",
      "protocolo",
    ]);
    expect(corpo.foraDaAlcada).toHaveLength(2);

    expect(c.pedido.modo).toBe("producao");
    expect(c.pedido.sintetico).toBe(false);
    expect(c.pedido.de).toBe(DIRETOR_DO_PRODUTO);
    expect(c.pedido.para).toBe(GERENTE_DO_PRODUTO);
    // O caso do lead chegou inteiro do outro lado.
    expect(c.pedido.caso?.leadId).toBe("lead-1");
    expect(c.pedido.caso?.nome).toBe("Marcos");
    expect(c.pedido.caso?.historico).toHaveLength(1);
    // E a pergunta cita os DOIS assuntos — meia resposta faz o cliente voltar.
    expect(c.pedido.mensagem).toContain("escopoAcimaDaCapacidade");
    expect(c.pedido.mensagem).toContain("permuta");
  });

  it("a origem verdadeira (o TA) vai escrita, para o rastro não dizer que o Diretor perguntou sozinho", () => {
    expect(perguntaAoGerente(PEDIDO)).toMatch(/agente comercial \(TA\)/i);
  });

  it("o assunto cita os assuntos, e o caso NÃO vai enfiado dentro dele", () => {
    const a = assuntoDaConsulta(PEDIDO.foraDaAlcada);
    expect(a).toContain("permuta");
    expect(a).not.toContain("Marcos");
  });

  /**
   * MUTAÇÃO: pôr o segredo em qualquer campo do corpo, ou no `detalhe` de uma
   * recusa → vermelho aqui.
   */
  it("⛔ o segredo aparece SÓ no cabeçalho — nunca no corpo, nunca no resultado", async () => {
    const p = porta({ status: 401, corpo: { estado: "recusado", motivo: "segredo inválido" } });
    const r = await consultarGerente(PEDIDO, { buscar: p.buscar, env: AMBIENTE });

    expect(String(p.chamadas[0]!.init.body)).not.toContain(SEGREDO);
    expect(JSON.stringify(r)).not.toContain(SEGREDO);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("⭐ o que a consulta devolve — e o que ela se recusa a prometer", () => {
  it("no sucesso devolve fio, rodada relida e o carimbo da caixa", async () => {
    const r = await consultarGerente(PEDIDO, { buscar: porta(EXECUTADO).buscar, env: AMBIENTE });
    expect(r.consultado).toBe(true);
    if (!r.consultado) return;
    expect(r.fio).toBe(EXECUTADO.corpo.fio);
    expect(r.rodadaId).toBe("rodada-1");
    expect(r.estadoNaCaixa).toBe("entregue");
  });

  /**
   * ⭐ MUTAÇÃO: fazer `respostaDoGerente` receber o `artefato` da porta
   * → vermelho. O artefato é um relatório de ensaio, e lê-lo como resposta do
   * gerente é exatamente a mentira que o Connect existe para matar.
   */
  it("⭐ a resposta do gerente é `null`, e o campo EXISTE — a porta entrega, não colhe", async () => {
    const r = await consultarGerente(PEDIDO, { buscar: porta(EXECUTADO).buscar, env: AMBIENTE });
    expect(r.consultado).toBe(true);
    if (!r.consultado) return;
    expect(r.respostaDoGerente).toBeNull();
    expect("respostaDoGerente" in r).toBe(true);
    // E o dossiê diz isso com todas as letras para quem pegar a fila.
    expect(r.paraODossie).toMatch(/ENTREGA e não colhe resposta/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("⭐ toda falha vira causa nomeada — e nunca exceção", () => {
  /**
   * MUTAÇÃO: apagar o portão 0 de `consultarGerente` → ela tenta um `fetch` para
   * `undefined/api/...` e este teste fica vermelho (a causa muda).
   */
  it("porta não configurada: nem tenta, e diz que não tentou", async () => {
    for (const env of [
      {} as NodeJS.ProcessEnv,
      { [VARIAVEL_DO_SEGREDO]: SEGREDO } as NodeJS.ProcessEnv,
      { [VARIAVEL_DA_URL]: "https://x.example" } as NodeJS.ProcessEnv,
      // Segredo curto = porta desligada, pela regra da própria porta.
      { [VARIAVEL_DO_SEGREDO]: "curto", [VARIAVEL_DA_URL]: "https://x.example" } as NodeJS.ProcessEnv,
    ]) {
      const p = porta(EXECUTADO);
      const r = await consultarGerente(PEDIDO, { buscar: p.buscar, env });
      expect(r.consultado).toBe(false);
      if (r.consultado) continue;
      expect(r.causa).toBe("portaNaoConfigurada");
      expect(p.chamadas).toHaveLength(0);
      // ⛔ E não diz QUAL faltou: isso seria informação sobre o segredo.
      expect(r.detalhe).not.toContain(SEGREDO);
    }
  });

  it("A OUTRA METADE — configurada, ela tenta", async () => {
    const p = porta(EXECUTADO);
    await consultarGerente(PEDIDO, { buscar: p.buscar, env: AMBIENTE });
    expect(p.chamadas).toHaveLength(1);
  });

  it("a porta recusou (4xx com motivo) → `portaRecusou`, com o motivo no dossiê", async () => {
    const p = porta({ status: 422, corpo: { estado: "recusado", motivo: "o fio foi aberto por outro" } });
    const r = await consultarGerente(PEDIDO, { buscar: p.buscar, env: AMBIENTE });
    expect(r.consultado).toBe(false);
    if (r.consultado) return;
    expect(r.causa).toBe("portaRecusou");
    expect(r.paraODossie).toContain("o fio foi aberto por outro");
  });

  it("`nao_verificavel` NUNCA vira sucesso — nem com 2xx por engano", async () => {
    for (const status of [502, 200]) {
      const p = porta({ status, corpo: { estado: "nao_verificavel", motivo: "a releitura falhou" } });
      const r = await consultarGerente(PEDIDO, { buscar: p.buscar, env: AMBIENTE });
      expect(r.consultado, String(status)).toBe(false);
      if (r.consultado) continue;
      expect(r.causa).toBe("naoVerificavel");
    }
  });

  /**
   * ⭐⭐ MUTAÇÃO: trocar o portão final por `if (!resposta.ok)` — ou seja, tratar
   * 2xx como sucesso → este teste fica vermelho. É o mesmo defeito que o Dioli
   * Connect existe para matar ("o despachante disse ok"), agora do lado de cá.
   */
  it('⭐ "a porta respondeu 200" NÃO é prova: sem `rodadaId`, não houve consulta', async () => {
    for (const corpo of [
      { estado: "executado", fio: "f", caixa: {} },
      { estado: "executado", rodadaId: "r", caixa: {} },
      { estado: "executado", fio: "f", rodadaId: 7, caixa: {} },
      { ok: true },
    ]) {
      const p = porta({ status: 200, corpo });
      const r = await consultarGerente(PEDIDO, { buscar: p.buscar, env: AMBIENTE });
      expect(r.consultado, JSON.stringify(corpo)).toBe(false);
      if (r.consultado) continue;
      expect(r.causa).toBe("respostaIlegivel");
    }
  });

  it("corpo que não é JSON → `respostaIlegivel`, e não uma exceção", async () => {
    const buscar = (async () =>
      ({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error("não é JSON");
        },
      }) as unknown as Response) as unknown as typeof fetch;
    const r = await consultarGerente(PEDIDO, { buscar, env: AMBIENTE });
    expect(r.consultado).toBe(false);
    if (r.consultado) return;
    expect(r.causa).toBe("respostaIlegivel");
  });

  it("a porta inalcançável (rede, DNS, TLS) → `portaInalcancavel`, sem lançar", async () => {
    const buscar = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const r = await consultarGerente(PEDIDO, { buscar, env: AMBIENTE });
    expect(r.consultado).toBe(false);
    if (r.consultado) return;
    expect(r.causa).toBe("portaInalcancavel");
    expect(r.detalhe).toContain("ECONNREFUSED");
  });

  /**
   * ⭐ MUTAÇÃO: apagar o `AbortController`/`setTimeout` de `consultarGerente`
   * → este teste pendura e estoura o tempo do vitest.
   */
  it("⭐ estourar o teto de espera → `demorouDemais`, e o cliente não espera mais", async () => {
    const buscar = ((_url: unknown, init: unknown) => {
      const signal = (init as RequestInit).signal!;
      return new Promise<Response>((_, rejeitar) => {
        signal.addEventListener("abort", () => {
          const e = new Error("abortado");
          e.name = "AbortError";
          rejeitar(e);
        });
      });
    }) as unknown as typeof fetch;

    vi.useFakeTimers();
    try {
      const promessa = consultarGerente(PEDIDO, { buscar, env: AMBIENTE });
      await vi.advanceTimersByTimeAsync(TETO_DE_ESPERA_MS + 1);
      const r = await promessa;
      expect(r.consultado).toBe(false);
      if (r.consultado) return;
      expect(r.causa).toBe("demorouDemais");
    } finally {
      vi.useRealTimers();
    }
  });

  /**
   * ⭐ O CHÃO. Toda causa de falha tem que produzir uma frase de dossiê que
   * avise que NINGUÉM foi acionado — senão quem pega a fila acha que já foi.
   */
  it("⭐ toda falha escreve no dossiê que ninguém foi acionado", async () => {
    const falhas = [
      porta({ status: 422, corpo: { estado: "recusado", motivo: "x" } }),
      porta({ status: 502, corpo: { estado: "nao_verificavel", motivo: "x" } }),
      porta({ status: 200, corpo: { estado: "executado" } }),
    ];
    for (const p of falhas) {
      const r = await consultarGerente(PEDIDO, { buscar: p.buscar, env: AMBIENTE });
      expect(r.consultado).toBe(false);
      if (r.consultado) continue;
      expect(r.paraODossie).toMatch(/Ninguém do outro lado foi acionado/);
    }
  });
});
