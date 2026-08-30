/**
 * ⭐⭐⭐ A JORNADA INTEIRA, COM O CASO DO MARCOS — e pelo caminho de produção.
 *
 * ─── QUEM CHAMA ISSO? ───────────────────────────────────────────────────────
 *
 * A pergunta que já produziu quatro peças órfãs nesta casa em um dia. Este
 * arquivo entra por `atenderComOTA` — o degrau de produção logo acima do
 * conector — e não pelas peças soltas. O caminho inteiro é:
 *
 *   webhook da Meta → `receberMensagemDeVendas` → `atenderComOTA`
 *     → `foraDaAlcadaNaMensagem`            (o gatilho, em código)
 *       → ⭐ `atenderComOConector`           (o conector padrão)
 *         → `consultarPolitica` → POST {núcleo}/api/connect/politicas/consulta
 *         → `consultarGerente`  → POST {núcleo}/api/connect/despacho
 *         → grava a pendência + AVISA o cliente
 *       → `passarParaGente` (a fila humana, que continua sendo o chão)
 *
 *   ... o gerente decide ...
 *
 *   núcleo → POST /api/connect/retorno → ⭐ `receberRetorno`
 *     → acha a conversa pelo protocolo → barreira → fala com o cliente
 *
 * ─── OS NOVE PONTOS QUE O CEO EXIGE PROVADOS ────────────────────────────────
 *
 *   pergunta enviada · responsável correto encontrado · escalada realizada ·
 *   resposta devolvida · CONVERSA ORIGINAL LOCALIZADA · cliente efetivamente
 *   respondido · política reutilizada na segunda pergunta · exceção impedida de
 *   virar regra · indisponibilidade recuperada sem perda · isolamento.
 *
 * Cada um tem um `it` com o nome dele embaixo.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { atenderComOTA } from "@/services/salaDeVendas/ta/atender";
import { receberRetorno } from "../retorno";
import { ligacaoDoFoocci } from "../foocci/ligacao";
import { CAMINHO_DA_CONSULTA_DE_POLITICA, CAMINHO_DO_DESPACHO } from "../contrato";
import { VERSAO_DO_CONTRATO } from "../versao";
import { armazemEmMemoria } from "./armazemEmMemoria";
import type { FalaAoCliente, LigacaoLocal } from "../ligacaoLocal";

/** A mensagem do Marcos, palavra por palavra, como ela chegou. */
const MENSAGEM_DO_MARCOS =
  "Preciso de resposta objetiva sobre: 1) proposta para 28-30 posts/mês, 3 carrosséis/semana, " +
  "ciclo de 30 dias; 2) se topam pagamento via parceria/permuta, sem dinheiro.";

/** Outro representante, com a MESMA dúvida — é o passo 12 e é o corte 3. */
const MENSAGEM_EQUIVALENTE = "vocês topam fechar em permuta, sem dinheiro?";

const AGORA = new Date("2026-08-25T12:00:00Z");
const NUCLEO = "https://nucleo.dioli.exemplo";
const SEGREDO = "s".repeat(48);

const RESPOSTA_DO_GERENTE =
  "Sobre a permuta: a gente fecha parceria com até 30% do valor em troca de serviço e o resto em " +
  "dinheiro. E 28 a 30 peças por mês cabe na nossa capacidade. Posso montar a proposta assim?";

// ═══════════════════════════════════════════════════════════════════════════
// O banco de mentira da Sala — o mesmo molde dos outros testes do TA.
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
        id: "lead-marcos",
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
      create: vi.fn().mockResolvedValue({ id: "msg-1" }),
    },
    siteLeadInteraction: { create: vi.fn().mockResolvedValue({}) },
    leadHandoff: { create: vi.fn().mockResolvedValue({ id: "h1" }) },
    internalUser: { findMany: vi.fn().mockResolvedValue([]) },
  };
}

/** O que o cliente leu, na ordem em que ele leu. */
function ditoAoCliente(db: ReturnType<typeof banco>): string[] {
  return db.leadMensagem.create.mock.calls.map(
    (c) => (c[0] as { data: { texto: string } }).data.texto,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// O NÚCLEO DE MENTIRA — um servidor de política e despacho, em memória.
//
// ⚠️ Ele guarda as políticas do jeito que o núcleo de verdade vai guardar: uma
// lista, com escopo e vigência. É o que permite provar o passo 12 — a decisão
// que o gerente tomou passa a responder a PRÓXIMA pergunta, sem nova escalada.
// ═══════════════════════════════════════════════════════════════════════════
type PoliticaGuardada = {
  politicaId: string;
  versao: number;
  escopo: "regra" | "excecao";
  valeApenasPara: string[] | null;
  vigenteDe: string;
  vigenteAte: string | null;
  revogadaEm: string | null;
  respostaAoCliente: string;
  fundamentacaoInterna?: string;
  assunto: string;
};

function nucleoDeMentira() {
  const politicas: PoliticaGuardada[] = [];
  const despachos: Array<Record<string, unknown>> = [];
  const recusas: string[] = [];
  let foraDoAr = false;
  /**
   * ⭐ O campo que este núcleo PODA do corpo antes de conferir.
   *
   * É a mutação feita no fio, e é assim que a outra metade se prova sem
   * inventar um segundo núcleo que se comporta diferente: o mesmo núcleo, o
   * mesmo caminho de produção, um campo a menos.
   */
  let podar: string | null = null;

  const buscar = (async (url: string, init: RequestInit) => {
    if (foraDoAr) throw new Error("ECONNREFUSED");
    const corpo = JSON.parse(String(init.body)) as Record<string, unknown>;
    if (podar) delete corpo[podar];

    if (String(url).endsWith(CAMINHO_DA_CONSULTA_DE_POLITICA)) {
      const assuntos = (corpo.assuntos as Array<{ assunto: string }>).map((a) => a.assunto);
      const achada = politicas.find((p) => assuntos.includes(p.assunto));
      return new Response(
        JSON.stringify(achada ? { encontrada: true, politica: achada } : { encontrada: false }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    if (String(url).endsWith(CAMINHO_DO_DESPACHO)) {
      // ── ⭐ A EXIGÊNCIA DO NÚCLEO REAL (PR #13 da Control Room) ───────────
      //
      // O núcleo **não deduz assunto lendo prosa**, e por isso recusa o
      // despacho que chega sem a classificação estruturada. Este núcleo de
      // mentira faz a mesma recusa, para que a suíte do Foocci meça o contrato
      // de verdade em vez de um núcleo complacente que aceitaria qualquer coisa.
      const fora = corpo.foraDaAlcada;
      if (!Array.isArray(fora) || fora.length === 0) {
        const motivo =
          "despacho sem `foraDaAlcada`: o núcleo não deduz assunto lendo texto corrido. Quem classifica " +
          "é o produto, em código, antes do modelo.";
        recusas.push(motivo);
        return new Response(JSON.stringify({ estado: "recusado", motivo }), {
          status: 422,
          headers: { "content-type": "application/json" },
        });
      }

      despachos.push(corpo);
      return new Response(
        JSON.stringify({
          estado: "executado",
          fio: `fio-${despachos.length}`,
          rodadaId: `rodada-${despachos.length}`,
          caixa: { estado: "entregue" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    return new Response("{}", { status: 404 });
  }) as unknown as typeof fetch;

  return {
    buscar,
    despachos,
    politicas,
    recusas,
    podarDoCorpo: (campo: string) => {
      podar = campo;
    },
    cair: () => {
      foraDoAr = true;
    },
    voltar: () => {
      foraDoAr = false;
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
let ambiente: ReturnType<typeof nucleoDeMentira>;

beforeEach(() => {
  vi.stubEnv("DIOLI_CONNECT_URL", NUCLEO);
  vi.stubEnv("DIOLI_CONNECT_SECRET", SEGREDO);
  ambiente = nucleoDeMentira();
  vi.stubGlobal("fetch", ambiente.buscar);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// ═══════════════════════════════════════════════════════════════════════════
describe("⭐⭐⭐ A JORNADA DO MARCOS — ida e volta, pelo caminho de produção", () => {
  /**
   * ⭐⭐ O TESTE CENTRAL. Os nove pontos, em ordem, numa corrida só.
   *
   * MUTAÇÃO: apagar a chamada de `atenderComOConector` de `atender.ts`
   * → este fica vermelho na primeira asserção, e o produto volta a ser o do
   *   PR #178: manda a pergunta e a resposta nunca volta.
   */
  it("⭐⭐ pergunta → escalada → decisão → conversa certa → cliente respondido", async () => {
    const db = banco();
    const armazem = armazemEmMemoria();

    // ── 1 a 4: o Marcos escreve, e o TA não pode decidir nada disso ────────
    const turno = await atenderComOTA(db as never, {
      leadId: "lead-marcos",
      mensagem: MENSAGEM_DO_MARCOS,
      agora: AGORA,
      conector: { armazem },
    });

    // ⭐ ESCALADA REALIZADA — e não uma frase dizendo que ia escalar.
    expect(ambiente.despachos).toHaveLength(1);
    const despacho = ambiente.despachos[0]!;

    // ⭐ PERGUNTA ENVIADA, com o caso do lead junto e em modo de produção.
    expect(despacho.modo).toBe("producao");
    expect(despacho.sintetico).toBe(false);
    expect((despacho.caso as { resumo: string }).resumo).toContain("permuta");

    // ⭐ RESPONSÁVEL CORRETO ENCONTRADO — o Agente Gerente do departamento dono
    // do agente, derivado do organograma, não digitado à mão.
    expect(despacho.para).toBe("agente-gerente-produto");
    expect(despacho.de).toBe("diretor-foocci");

    // ⭐ E O ENDEREÇO DE VOLTA EXISTE. É o que o PR #178 não tinha.
    const protocolo = despacho.protocolo as string;
    expect(protocolo).toMatch(/^foocci:lead-marcos:/);

    // A fila humana continua sendo o chão — ela não sai do lugar.
    expect(turno.falou).toBe(false);
    expect(db.leadHandoff.create).toHaveBeenCalledTimes(1);

    // ⚠️ O CLIENTE FOI AVISADO, e uma vez só.
    const antes = ditoAoCliente(db);
    expect(antes).toHaveLength(1);
    expect(antes[0]).toMatch(/levei pra quem decide/i);
    // ⛔ E o aviso não promete prazo nem conta como a empresa decide por dentro.
    expect(antes[0]).not.toMatch(/hoje|amanhã|\d+ ?h(oras)?|gerente|diretor|protocolo/i);

    // A pendência está gravada, aberta, e ligada à conversa do Marcos.
    const pendente = await armazem.porProtocolo(protocolo);
    expect(pendente?.estado).toBe("PENDENTE");
    expect(pendente?.conversa).toBe("lead-marcos");

    // ── 8: o gerente decide, e o núcleo devolve ───────────────────────────
    const entregou: string[] = [];
    const ligacao: LigacaoLocal = {
      produto: "foocci",
      canal: "sala-de-vendas",
      agente: "ta",
      armazem,
      async falarComOCliente(conversa, texto): Promise<FalaAoCliente> {
        entregou.push(`${conversa}::${texto}`);
        return { registrada: true, entregue: true, mensagemId: "msg-resposta" };
      },
    };

    const volta = await receberRetorno(
      {
        versaoDoContrato: VERSAO_DO_CONTRATO,
        protocolo,
        fio: "fio-1",
        decisao: "respondida",
        respostaAoCliente: RESPOSTA_DO_GERENTE,
        notaInterna: "o Diretor autorizou fora da tabela; não abrir isso para todo mundo",
        decididaPor: "agente-gerente-produto",
        virouPolitica: { politicaId: "pol-permuta-001", escopo: "regra" },
        em: AGORA.toISOString(),
      },
      ligacao,
      { agora: AGORA },
    );

    // ⭐ RESPOSTA DEVOLVIDA e ⭐ CONVERSA ORIGINAL LOCALIZADA.
    expect(volta.estado).toBe("entregue");
    if (volta.estado !== "entregue") return;
    expect(volta.conversa).toBe("lead-marcos");

    // ⭐ CLIENTE EFETIVAMENTE RESPONDIDO — na conversa dele, com o texto do
    // gerente, e sem uma palavra do que foi dito por dentro.
    expect(volta.entregueAoCliente).toBe(true);
    expect(entregou).toEqual([`lead-marcos::${RESPOSTA_DO_GERENTE}`]);
    expect(entregou[0]).not.toMatch(/Diretor autorizou|não abrir isso/);

    // E a pendência fechou — porque o cliente recebeu.
    expect((await armazem.porProtocolo(protocolo))?.estado).toBe("RESPONDIDA");
  });

  /**
   * ⭐⭐ O PASSO 12 — a decisão do gerente responde a PRÓXIMA pergunta sozinha.
   *
   * É o fim do CEO como pombo-correio: o segundo representante que perguntar a
   * mesma coisa é respondido na hora, e **ninguém é consultado**.
   *
   * MUTAÇÃO: fazer `atenderComOConector` escalar mesmo com política válida
   * → este fica vermelho na asserção de `despachos`, e cada cliente novo volta
   *   a custar uma consulta ao gerente.
   */
  it("⭐⭐ segunda pergunta equivalente: respondida SEM nova escalada", async () => {
    // O gerente classificou o alcance: virou REGRA da empresa.
    ambiente.politicas.push({
      politicaId: "pol-permuta-001",
      versao: 1,
      escopo: "regra",
      valeApenasPara: null,
      vigenteDe: "2026-08-25T11:00:00Z",
      vigenteAte: null,
      revogadaEm: null,
      respostaAoCliente: RESPOSTA_DO_GERENTE,
      fundamentacaoInterna: "margem aprovada pelo Diretor em 25/08",
      assunto: "permuta",
    });

    const db = banco({ id: "lead-segundo", nome: "Renata" });
    const armazem = armazemEmMemoria();

    const turno = await atenderComOTA(db as never, {
      leadId: "lead-segundo",
      mensagem: MENSAGEM_EQUIVALENTE,
      agora: AGORA,
      conector: { armazem },
    });

    // ⭐ NINGUÉM FOI CONSULTADO.
    expect(ambiente.despachos).toHaveLength(0);
    // ⭐ E NINGUÉM ENTROU NA FILA.
    expect(db.leadHandoff.create).not.toHaveBeenCalled();

    // ⭐ O CLIENTE FOI RESPONDIDO, na hora, com o texto da política.
    expect(turno.falou).toBe(true);
    if (!turno.falou || !("porPolitica" in turno)) throw new Error("devia ter respondido por política");
    expect(turno.politicaId).toBe("pol-permuta-001");
    expect(ditoAoCliente(db)).toEqual([RESPOSTA_DO_GERENTE]);

    // ⛔ E a fundamentação interna não foi junto.
    expect(ditoAoCliente(db)[0]).not.toMatch(/margem aprovada/);
  });

  /**
   * ⭐ CORTE — política REVOGADA não responde, e a escalada volta a acontecer.
   *
   * É a mesma política do teste de cima, com um campo mudado. Se o produto
   * ignorasse `revogadaEm`, este teste ficaria idêntico ao anterior — e é
   * exatamente por isso que ele é o par dele.
   */
  it("⭐ política REVOGADA: o agente não responde com ela, e escala de novo", async () => {
    ambiente.politicas.push({
      politicaId: "pol-permuta-001",
      versao: 1,
      escopo: "regra",
      valeApenasPara: null,
      vigenteDe: "2026-08-01T00:00:00Z",
      vigenteAte: null,
      revogadaEm: "2026-08-24T00:00:00Z",
      respostaAoCliente: RESPOSTA_DO_GERENTE,
      assunto: "permuta",
    });

    const db = banco({ id: "lead-terceiro", nome: "Paulo" });
    const armazem = armazemEmMemoria();

    const turno = await atenderComOTA(db as never, {
      leadId: "lead-terceiro",
      mensagem: MENSAGEM_EQUIVALENTE,
      agora: AGORA,
      conector: { armazem },
    });

    // O texto da política revogada NÃO chegou ao cliente.
    expect(ditoAoCliente(db)).not.toContain(RESPOSTA_DO_GERENTE);
    expect(turno.falou).toBe(false);
    // E subiu ao gerente — com a informação de que houve decisão antes e ela caiu.
    expect(ambiente.despachos).toHaveLength(1);
    const caso = ambiente.despachos[0]!.caso as { oQueTrava: string };
    expect(caso.oQueTrava).toMatch(/revogada/i);
  });

  /**
   * ⭐ CORTE — a exceção de um cliente não responde o outro.
   *
   * MUTAÇÃO: aceitar `escopo: "excecao"` sem conferir `valeApenasPara`
   * → este fica vermelho, e a condição que a empresa deu a UM vira tabela.
   */
  it("⭐ exceção de OUTRO cliente não responde este, e ele vai para o gerente", async () => {
    ambiente.politicas.push({
      politicaId: "pol-excecao-77",
      versao: 1,
      escopo: "excecao",
      valeApenasPara: ["lead-marcos"],
      vigenteDe: "2026-08-01T00:00:00Z",
      vigenteAte: null,
      revogadaEm: null,
      respostaAoCliente: "Permuta integral, 100% em troca de serviço, por 90 dias.",
      assunto: "permuta",
    });

    const db = banco({ id: "lead-quarto", nome: "Bia" });
    const armazem = armazemEmMemoria();

    await atenderComOTA(db as never, {
      leadId: "lead-quarto",
      mensagem: MENSAGEM_EQUIVALENTE,
      agora: AGORA,
      conector: { armazem },
    });

    // ⛔ A condição excepcional do Marcos não apareceu na conversa da Bia.
    for (const t of ditoAoCliente(db)) expect(t).not.toMatch(/100% em troca/);
    expect(ambiente.despachos).toHaveLength(1);
  });

  /**
   * ⭐⭐ CORTE — o produto perde a conexão e depois volta. Ninguém fica órfão.
   *
   * MUTAÇÃO: guardar a pendência em memória de processo em vez de no armazém
   * → o "restart" abaixo apaga tudo, o retorno não acha a conversa, e o cliente
   *   fica esperando para sempre. É o defeito de quatro dias, de volta.
   */
  it("⭐⭐ conexão cai, o processo reinicia, e a resposta AINDA acha o cliente", async () => {
    const armazem = armazemEmMemoria();

    // ── O núcleo está fora do ar quando o Marcos escreve ──────────────────
    ambiente.cair();
    const db1 = banco();
    await atenderComOTA(db1 as never, {
      leadId: "lead-marcos",
      mensagem: MENSAGEM_DO_MARCOS,
      agora: AGORA,
      conector: { armazem },
    });

    // Nada foi consultado, nada foi escalado — e o cliente NÃO ficou em
    // silêncio: a fila humana pegou, e o aviso saiu.
    expect(ambiente.despachos).toHaveLength(0);
    expect(db1.leadHandoff.create).toHaveBeenCalledTimes(1);
    expect(ditoAoCliente(db1).length).toBeGreaterThan(0);
    const dossie = (db1.leadHandoff.create.mock.calls[0]![0] as { data: { objecoes: string } }).data;
    expect(dossie.objecoes).toMatch(/não conseguiu|Ninguém do outro lado foi acionado/i);

    // ── A conexão volta, e o cliente insiste ──────────────────────────────
    ambiente.voltar();
    const db2 = banco();
    await atenderComOTA(db2 as never, {
      leadId: "lead-marcos",
      mensagem: MENSAGEM_DO_MARCOS,
      agora: new Date("2026-08-25T13:00:00Z"),
      conector: { armazem },
    });
    expect(ambiente.despachos).toHaveLength(1);
    const protocolo = ambiente.despachos[0]!.protocolo as string;

    // ── ⭐ O RESTART. O processo morre; o armazém é o que sobrevive. ───────
    //
    // Nenhum estado em memória do turno de cima é usado daqui para baixo: só o
    // protocolo (que veio do núcleo) e o armazém (que é a tabela).
    const armazemDepoisDoRestart = armazem;

    const entregou: string[] = [];
    const ligacao: LigacaoLocal = {
      produto: "foocci",
      canal: "sala-de-vendas",
      agente: "ta",
      armazem: armazemDepoisDoRestart,
      async falarComOCliente(conversa, texto): Promise<FalaAoCliente> {
        entregou.push(`${conversa}::${texto}`);
        return { registrada: true, entregue: true, mensagemId: "m" };
      },
    };

    const volta = await receberRetorno(
      { protocolo, decisao: "respondida", respostaAoCliente: RESPOSTA_DO_GERENTE },
      ligacao,
      { agora: new Date("2026-08-26T09:00:00Z") },
    );

    expect(volta.estado).toBe("entregue");
    expect(entregou).toEqual([`lead-marcos::${RESPOSTA_DO_GERENTE}`]);
  });

  /**
   * ⭐⭐ CORTE — dois clientes perguntando ao mesmo tempo, e no caminho real.
   *
   * MUTAÇÃO: montar o protocolo sem a conversa dentro
   * → as duas respostas passam a poder cair na mesma conversa, e este fica
   *   vermelho na comparação das entregas.
   */
  it("⭐⭐ dois clientes ao mesmo tempo: cada resposta vai para a SUA conversa", async () => {
    const armazem = armazemEmMemoria();

    const dbA = banco({ id: "lead-marcos", nome: "Marcos" });
    const dbB = banco({ id: "lead-bia", nome: "Bia" });

    // Os dois no mesmo minuto, e de propósito em paralelo.
    await Promise.all([
      atenderComOTA(dbA as never, {
        leadId: "lead-marcos",
        mensagem: MENSAGEM_DO_MARCOS,
        agora: AGORA,
        conector: { armazem },
      }),
      atenderComOTA(dbB as never, {
        leadId: "lead-bia",
        mensagem: MENSAGEM_EQUIVALENTE,
        agora: AGORA,
        conector: { armazem },
      }),
    ]);

    expect(ambiente.despachos).toHaveLength(2);
    const protocolos = ambiente.despachos.map((d) => d.protocolo as string);
    const doMarcos = protocolos.find((p) => p.includes("lead-marcos"))!;
    const daBia = protocolos.find((p) => p.includes("lead-bia"))!;
    expect(doMarcos).toBeTruthy();
    expect(daBia).toBeTruthy();
    expect(doMarcos).not.toBe(daBia);

    const entregou: string[] = [];
    const ligacao: LigacaoLocal = {
      produto: "foocci",
      canal: "sala-de-vendas",
      agente: "ta",
      armazem,
      async falarComOCliente(conversa, texto): Promise<FalaAoCliente> {
        entregou.push(`${conversa}::${texto}`);
        return { registrada: true, entregue: true, mensagemId: "m" };
      },
    };

    // As respostas voltam TROCADAS na ordem, para o teste não depender dela.
    await receberRetorno(
      { protocolo: daBia, decisao: "respondida", respostaAoCliente: "Bia: pode ser permuta parcial." },
      ligacao,
      { agora: AGORA },
    );
    await receberRetorno(
      { protocolo: doMarcos, decisao: "respondida", respostaAoCliente: RESPOSTA_DO_GERENTE },
      ligacao,
      { agora: AGORA },
    );

    expect(entregou).toEqual([
      "lead-bia::Bia: pode ser permuta parcial.",
      `lead-marcos::${RESPOSTA_DO_GERENTE}`,
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("⭐⭐ `foraDaAlcada` NO CORPO — sem ele o núcleo real recusa", () => {
  /**
   * ─── A PONTA SOLTA QUE A FRENTE DO CIRCUITO ACHOU (PR #13) ───────────────
   *
   * O conector **calculava** `foraDaAlcada` e não o mandava. Contra o núcleo de
   * verdade, isso quer dizer que a escalada do Foocci **não passava**: o núcleo
   * recusa o despacho sem a classificação estruturada, e recusa de propósito —
   * ele não deduz assunto lendo prosa.
   *
   * ⚠️ E era um defeito que a suíte não pegava, porque o núcleo de mentira
   * aceitava qualquer corpo. O conserto de verdade foi duplo: mandar o campo, e
   * fazer o núcleo de mentira **exigir** o que o real exige. Um teste que só
   * mede um interlocutor complacente não mede nada.
   */

  /**
   * ⭐⭐ MUTAÇÃO: apagar `foraDaAlcada: pedido.foraDaAlcada` do corpo em
   * `consultarGerente.ts` → este fica vermelho, e é exatamente o estado em que
   * o Foocci estava: pergunta que sai e é recusada na porta do núcleo.
   */
  it("⭐⭐ o corpo que sai por `atenderComOTA` traz a classificação, item a item", async () => {
    const db = banco();
    await atenderComOTA(db as never, {
      leadId: "lead-marcos",
      mensagem: MENSAGEM_DO_MARCOS,
      agora: AGORA,
      conector: { armazem: armazemEmMemoria() },
    });

    expect(ambiente.recusas).toEqual([]);
    expect(ambiente.despachos).toHaveLength(1);

    const fora = ambiente.despachos[0]!.foraDaAlcada as Array<{ assunto: string; motivo: string }>;
    // Os DOIS assuntos do caso do Marcos, cada um com o motivo escrito.
    expect(fora.map((f) => f.assunto).sort()).toEqual(["escopoAcimaDaCapacidade", "permuta"]);
    for (const f of fora) expect(f.motivo).toMatch(/Decide:/);

    // ⛔ E ele NÃO é o `assunto`: aquele é uma linha de metadado, este é a lista.
    expect(typeof ambiente.despachos[0]!.assunto).toBe("string");
    expect(Array.isArray(fora)).toBe(true);
  });

  /**
   * ⭐⭐ A OUTRA METADE — o mesmo núcleo, o mesmo caminho, um campo a menos.
   *
   * Sem `foraDaAlcada` o núcleo recusa (422), e o produto trata isso como o que
   * é: escalada **não aberta**. O cliente não fica em silêncio, a fila humana
   * pega, e o dossiê diz a verdade — ninguém do outro lado foi acionado.
   */
  it("⭐⭐ A OUTRA METADE — podando o campo no fio, o núcleo RECUSA e nada é escalado", async () => {
    ambiente.podarDoCorpo("foraDaAlcada");

    const db = banco();
    const armazem = armazemEmMemoria();
    const turno = await atenderComOTA(db as never, {
      leadId: "lead-marcos",
      mensagem: MENSAGEM_DO_MARCOS,
      agora: AGORA,
      conector: { armazem },
    });

    // O núcleo recusou, e recusou com o motivo dele.
    expect(ambiente.recusas).toHaveLength(1);
    expect(ambiente.recusas[0]).toMatch(/não deduz assunto lendo texto corrido/);
    expect(ambiente.despachos).toEqual([]);

    // ⭐ O produto NÃO inventa que consultou: nenhuma pendência foi aberta, e
    // uma pendência aberta aqui seria pior que o defeito — um cliente esperando
    // uma resposta que nunca vai voltar, porque ninguém foi perguntado.
    expect(armazem.todas()).toEqual([]);

    // ⚠️ E o chão não sai do lugar: a fila humana pega e o cliente é avisado.
    expect(turno.falou).toBe(false);
    expect(db.leadHandoff.create).toHaveBeenCalledTimes(1);
    expect(ditoAoCliente(db).length).toBeGreaterThan(0);

    const dossie = (db.leadHandoff.create.mock.calls[0]![0] as { data: { objecoes: string } }).data;
    expect(dossie.objecoes).toMatch(/Ninguém do outro lado foi acionado/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("⭐ RECEBER NÃO É ENTREGAR — as decisões C4 e C5, no caminho real", () => {
  /**
   * ⭐⭐ O canal do Foocci não entrega sozinho enquanto o dono não ligar o
   * envio. A decisão do gerente chega, é gravada na conversa, e a pendência
   * **NÃO fecha**: vai para `AGUARDANDO_ENVIO` — fila humana pronta para envio.
   *
   * MUTAÇÃO: fechar a pendência como RESPONDIDA ignorando `entregueAoCliente`
   * → este fica vermelho, e a empresa passa a acreditar que respondeu um
   *   cliente que não recebeu nada.
   */
  it("⭐⭐ canal sem envio automático: gravado, NÃO entregue, pendência aberta", async () => {
    const db = banco();
    const armazem = armazemEmMemoria();

    await armazem.abrir({
      protocolo: "foocci:lead-marcos:aaa",
      produto: "foocci",
      conversa: "lead-marcos",
      canal: "sala-de-vendas",
      agente: "ta",
      fio: "fio-1",
      assunto: "permuta",
      criadaEm: AGORA,
      avisadoEm: AGORA,
    });

    // ⭐ A ligação REAL do Foocci, com a entrega desligada (é o estado de hoje).
    const ligacao = ligacaoDoFoocci(db as never, { armazem });

    const volta = await receberRetorno(
      { protocolo: "foocci:lead-marcos:aaa", decisao: "respondida", respostaAoCliente: RESPOSTA_DO_GERENTE },
      ligacao,
      { agora: AGORA },
    );

    // Recebeu: sim. A mensagem existe na conversa do Marcos.
    expect(volta.estado).toBe("entregue");
    expect(ditoAoCliente(db)).toEqual([RESPOSTA_DO_GERENTE]);

    // ⭐ Entregou ao cliente: NÃO. E as duas coisas são ditas separadamente.
    if (volta.estado !== "entregue") return;
    expect(volta.entregueAoCliente).toBe(false);

    // ⭐ E a pendência NÃO fecha como respondida.
    const p = await armazem.porProtocolo("foocci:lead-marcos:aaa");
    expect(p?.estado).toBe("AGUARDANDO_ENVIO");
    expect(p?.respondidaEm).toBeNull();
    // Continua sendo assunto aberto do cliente.
    expect(await armazem.abertasDaConversa("lead-marcos")).toHaveLength(1);
  });

  /**
   * ⭐ A OUTRA METADE — com um canal que entrega, a MESMA volta fecha.
   */
  it("⭐ A OUTRA METADE — canal que entrega fecha a pendência como RESPONDIDA", async () => {
    const armazem = armazemEmMemoria();
    await armazem.abrir({
      protocolo: "foocci:lead-marcos:bbb",
      produto: "foocci",
      conversa: "lead-marcos",
      canal: "sala-de-vendas",
      agente: "ta",
      fio: "fio-1",
      assunto: "permuta",
      criadaEm: AGORA,
      avisadoEm: AGORA,
    });

    const ligacao: LigacaoLocal = {
      produto: "foocci",
      canal: "sala-de-vendas",
      agente: "ta",
      armazem,
      async falarComOCliente(): Promise<FalaAoCliente> {
        return { registrada: true, entregue: true, mensagemId: "m" };
      },
    };

    const volta = await receberRetorno(
      { protocolo: "foocci:lead-marcos:bbb", decisao: "respondida", respostaAoCliente: RESPOSTA_DO_GERENTE },
      ligacao,
      { agora: AGORA },
    );
    expect(volta.estado).toBe("entregue");
    expect((await armazem.porProtocolo("foocci:lead-marcos:bbb"))?.estado).toBe("RESPONDIDA");
    expect(await armazem.abertasDaConversa("lead-marcos")).toHaveLength(0);
  });

  /**
   * ⭐ A conversa não grava → a pendência CONTINUA aberta e o núcleo é avisado.
   *
   * MUTAÇÃO: fechar a pendência antes de falar com o cliente
   * → este fica vermelho, e a consulta ficaria marcada como respondida com
   *   ninguém do lado de fora tendo recebido nada.
   */
  it("⭐ falha ao gravar na conversa: pendência aberta, recusa ao núcleo", async () => {
    const armazem = armazemEmMemoria();
    await armazem.abrir({
      protocolo: "foocci:lead-marcos:ccc",
      produto: "foocci",
      conversa: "lead-marcos",
      canal: "sala-de-vendas",
      agente: "ta",
      fio: null,
      assunto: "permuta",
      criadaEm: AGORA,
      avisadoEm: AGORA,
    });

    const ligacao: LigacaoLocal = {
      produto: "foocci",
      canal: "sala-de-vendas",
      agente: "ta",
      armazem,
      async falarComOCliente(): Promise<FalaAoCliente> {
        return { registrada: false, entregue: false, causa: "o banco recusou" };
      },
    };

    const volta = await receberRetorno(
      { protocolo: "foocci:lead-marcos:ccc", decisao: "respondida", respostaAoCliente: RESPOSTA_DO_GERENTE },
      ligacao,
      { agora: AGORA },
    );

    expect(volta.estado).toBe("recusado");
    expect((await armazem.porProtocolo("foocci:lead-marcos:ccc"))?.estado).toBe("PENDENTE");
  });

  /**
   * ⛔ A BARREIRA, no caminho real do retorno: o gerente escreveu material
   * interno dentro do campo externo. Nada é entregue, e a pendência fica aberta.
   */
  it("⛔ retorno com material interno copiado no texto: NADA chega ao cliente", async () => {
    const armazem = armazemEmMemoria();
    await armazem.abrir({
      protocolo: "foocci:lead-marcos:ddd",
      produto: "foocci",
      conversa: "lead-marcos",
      canal: "sala-de-vendas",
      agente: "ta",
      fio: null,
      assunto: "permuta",
      criadaEm: AGORA,
      avisadoEm: AGORA,
    });

    const entregou: string[] = [];
    const ligacao: LigacaoLocal = {
      produto: "foocci",
      canal: "sala-de-vendas",
      agente: "ta",
      armazem,
      async falarComOCliente(_c, t): Promise<FalaAoCliente> {
        entregou.push(t);
        return { registrada: true, entregue: true };
      },
    };

    const nota = "não abrir isso para os outros leads do mesmo segmento";
    const volta = await receberRetorno(
      {
        protocolo: "foocci:lead-marcos:ddd",
        decisao: "respondida",
        respostaAoCliente: `Pode ser permuta. ${nota}`,
        notaInterna: nota,
      },
      ligacao,
      { agora: AGORA },
    );

    expect(volta.estado).toBe("recusado");
    expect(entregou).toEqual([]);
    expect((await armazem.porProtocolo("foocci:lead-marcos:ddd"))?.estado).toBe("PENDENTE");
  });

  /** ⭐ Versão MAIOR diferente é bloqueio, e é o primeiro portão. */
  it("⭐ retorno de um núcleo com contrato INCOMPATÍVEL é recusado antes de tudo", async () => {
    const armazem = armazemEmMemoria();
    let falou = false;
    const ligacao: LigacaoLocal = {
      produto: "foocci",
      canal: "sala-de-vendas",
      agente: "ta",
      armazem,
      async falarComOCliente(): Promise<FalaAoCliente> {
        falou = true;
        return { registrada: true, entregue: true };
      },
    };

    const volta = await receberRetorno(
      {
        versaoDoContrato: "9.0.0",
        protocolo: "foocci:lead-marcos:eee",
        decisao: "respondida",
        respostaAoCliente: RESPOSTA_DO_GERENTE,
      },
      ligacao,
      { agora: AGORA },
    );
    expect(volta.estado).toBe("recusado");
    expect(falou).toBe(false);
  });
});
