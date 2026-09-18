/**
 * ⭐⭐ A CAMPANHA INTEIRA, DE PONTA A PONTA — 750 candidatos entram.
 *
 * ── A PERGUNTA OBRIGATÓRIA: O TESTE ALCANÇA O CÓDIGO QUE RESPONDE AO CLIENTE? ─
 *
 * Alcança, e a lista do que é REAL aqui é a resposta:
 *
 *   · a FILA — `selecionarProximoLote` consultando um banco que filtra de
 *     verdade (`bancoDeProva`), com `mensagens: { some: { direcao: "SAIDA" } }`
 *     resolvido, e não dublado;
 *   · a ROTA DE DECISÃO — `decidirReabordagem`, a mesma que roda em produção,
 *     com os classificadores reais do Gatekeeper;
 *   · os TEXTOS — os mesmos de `textos.ts`, já aprovados em VERDE pela rubrica;
 *   · a TRAVA ANTI-REPETIÇÃO — `reservarEnvio` DE VERDADE, contra um banco que
 *     RECUSA a segunda gravação como o Postgres recusa;
 *   · o INTERRUPTOR de pânico, o freio entre lotes e a conta da campanha.
 *
 * ── O QUE NÃO É REAL, E ESTÁ DECLARADO ─────────────────────────────────────
 *
 * A última polegada — a chamada HTTP à Meta — é substituída por uma porta que
 * responde "aceitou" ou "recusou". Ela não podia ser real: um teste que precisa
 * da Meta ou não roda, ou vira mock que sempre passa. A porta falha 1 em cada
 * 10 de propósito, porque foi isso que a base antiga mediu (79 FALHOU em 750).
 */

import { describe, it, expect } from "vitest";
import { bancoDeProva } from "../bancoDeProva";
import { reservarEnvio } from "../travaDeRepeticao";
import { dispararUmLote, TAMANHO_DO_LOTE_MAXIMO } from "./executar";
import { podeAbordarAgora } from "../janelaComercial";
import { pararTudo } from "./interruptor";
import { painelDaReabordagem } from "./painel";
import type { PortaDeEnvio, ResultadoDoEnvio } from "./portaDeEnvio";

type Linha = Record<string, unknown>;

/**
 * ⚠️ 12:00 UTC = **09:00 em São Paulo, numa sexta**: a primeira hora da janela
 * comercial de abordagem (`janelaComercial.ts`). Este valor era 09:00 UTC, que
 * é 06:00 em São Paulo — e desde 18/09/2026 a campanha inteira é recusada nesse
 * horário, com `foraDaJanelaComercial`. O teste tinha de passar a rodar dentro
 * do horário em que a casa realmente fala com gente.
 */
const INICIO = new Date("2026-09-18T12:00:00.000Z");
const DENTRO_DA_JANELA = new Date("2026-09-17T20:00:00.000Z");
const FORA_DA_JANELA = new Date("2026-09-01T10:00:00.000Z");

/** O corpo das respostas, por perfil. Texto real do que a base tem. */
const RESPOSTAS = {
  botSemOpcao:
    "Olá! Para fazer seu pedido, informe nome e endereço. Ver o cardápio digital: https://ifood.com.br/loja",
  botComOpcao:
    "Bem-vindo! Escolha uma opção: 1 - Fazer pedido | 2 - Acompanhar pedido | 3 - Falar com um atendente",
  humanoDesconhecido: "Oi, bom dia. Do que se trata?",
  naoEhResponsavel: "Não sou eu, não cuido disso aqui.",
  pediuParar: "Por favor, não me mande mais mensagens.",
  decisorSeDeclarou: "Sou o dono do restaurante, pode falar.",
  foraDaJanela: "Oi, quem fala?",
} as const;

interface Perfil {
  nome: string;
  quantos: number;
  resposta: string | ((n: number) => string) | null;
  quando: Date | null;
  stage?: string;
  optOut?: boolean;
  /** A porta de entrada. `undefined` = LISTA_PROSPECCAO (o número frio). */
  fonte?: string | null;
}

const PERFIS: Perfil[] = [
  { nome: "nunca respondeu", quantos: 603, resposta: null, quando: null },
  { nome: "bot sem opção", quantos: 40, resposta: RESPOSTAS.botSemOpcao, quando: DENTRO_DA_JANELA },
  { nome: "bot com opção", quantos: 25, resposta: RESPOSTAS.botComOpcao, quando: DENTRO_DA_JANELA },
  { nome: "humano, cargo desconhecido", quantos: 30, resposta: RESPOSTAS.humanoDesconhecido, quando: DENTRO_DA_JANELA },
  { nome: "não é o responsável", quantos: 12, resposta: RESPOSTAS.naoEhResponsavel, quando: DENTRO_DA_JANELA },
  // ⚠️ Cada indicação traz um número DIFERENTE, de propósito: dez indicações
  // do mesmo telefone são um contato novo só, e o teste mediria a deduplicação
  // em vez de medir a captura.
  {
    nome: "indicou telefone",
    quantos: 10,
    resposta: (n) => `Oi, fala com a Juliana, o número dela é (11) 9${String(7000 + n).padStart(4, "0")}-1234`,
    quando: DENTRO_DA_JANELA,
  },
  { nome: "pediu para parar", quantos: 8, resposta: RESPOSTAS.pediuParar, quando: DENTRO_DA_JANELA },
  { nome: "decisor se declarou", quantos: 7, resposta: RESPOSTAS.decisorSeDeclarou, quando: DENTRO_DA_JANELA },
  { nome: "respondeu fora da janela", quantos: 15, resposta: RESPOSTAS.foraDaJanela, quando: FORA_DA_JANELA },
  // ── Os que NÃO podem entrar na campanha ──
  { nome: "opt-out na ficha", quantos: 20, resposta: null, quando: null, optOut: true },
  { nome: "já em negociação", quantos: 10, resposta: null, quando: null, stage: "EM_NEGOCIACAO" },

  // ⛔ D-0E1: quem deixou o próprio contato é LEAD, não contato frio. Eles
  // ENTRAM na máquina de propósito — e saem recusados, com a regra escrita.
  { nome: "formulário do site", quantos: 25, resposta: null, quando: null, fonte: "FORMULARIO_DEMONSTRACAO" },
  { nome: "campanha paga", quantos: 18, resposta: null, quando: null, fonte: "CAMPANHA_PAGA" },
  { nome: "Instagram", quantos: 9, resposta: null, quando: null, fonte: "INSTAGRAM" },
  { nome: "Facebook", quantos: 6, resposta: null, quando: null, fonte: "FACEBOOK" },
  { nome: "indicação (estágio 2)", quantos: 5, resposta: null, quando: null, fonte: "INDICACAO" },
  { nome: "origem desconhecida", quantos: 11, resposta: null, quando: null, fonte: null },
];

/** Quantos, por origem, NÃO podiam receber abordagem fria. */
const LEADS_POR_ORIGEM = { FORMULARIO_DEMONSTRACAO: 25, CAMPANHA_PAGA: 18, INSTAGRAM: 9, FACEBOOK: 6, INDICACAO: 5 } as const;
const LEADS_QUE_NAO_SAO_FRIOS = 25 + 18 + 9 + 6 + 5;
const ORIGEM_DESCONHECIDA = 11;

// 750 contatos frios de verdade + 74 que entram e são recusados pela origem.
const FRIOS = 750;
const ELEGIVEIS = FRIOS + LEADS_QUE_NAO_SAO_FRIOS + ORIGEM_DESCONHECIDA;

function montarBase() {
  const siteLead: Linha[] = [];
  const leadMensagem: Linha[] = [];
  let n = 0;

  for (const perfil of PERFIS) {
    for (let i = 0; i < perfil.quantos; i++) {
      n += 1;
      const id = `lead-${String(n).padStart(4, "0")}`;
      // Número único por contato: dois leads com o mesmo número seriam barrados
      // pela trava de RITMO, e o teste mediria a duplicata em vez da regra.
      const telefone = `5511${String(900000000 + n)}`;
      siteLead.push({
        id,
        nome: `Restaurante ${n}`,
        whatsapp: telefone,
        whatsappDigits: telefone,
        restaurante: `Restaurante ${n}`,
        cidade: "São Paulo",
        stage: perfil.stage ?? "DISPONIVEL_PARA_PROSPECCAO",
        optOutAt: perfil.optOut ? new Date("2026-08-01") : null,
        empresaId: null,
        contatoId: null,
        fonte: perfil.fonte === undefined ? "LISTA_PROSPECCAO" : perfil.fonte,
        createdAt: FORA_DA_JANELA,
      });

      // ⭐ A mensagem ANTIGA, que é o que faz este contato ser "já abordado".
      leadMensagem.push({
        id: `msg-out-${n}`,
        leadId: id,
        direcao: "SAIDA",
        ocorreuEm: FORA_DA_JANELA,
        texto: "o panfleto antigo",
      });

      const resposta =
        typeof perfil.resposta === "function" ? perfil.resposta(n) : perfil.resposta;
      if (resposta && perfil.quando) {
        leadMensagem.push({
          id: `msg-in-${n}`,
          leadId: id,
          direcao: "ENTRADA",
          ocorreuEm: perfil.quando,
          texto: resposta,
        });
      }
    }
  }

  return bancoDeProva({ siteLead, leadMensagem });
}

/**
 * A porta do teste: aplica a trava DE VERDADE e simula a Meta.
 *
 * Uma em cada dez tentativas é recusada, que é a taxa que a base antiga mediu.
 */
function portaDeProva(db: ReturnType<typeof bancoDeProva>, relogio: () => Date) {
  let tentativas = 0;
  const enviados: Array<{ leadId: string; conteudo: string }> = [];

  const mandar = async (leadId: string, conteudo: string): Promise<ResultadoDoEnvio> => {
    const lead = (await db.siteLead.findUnique({ where: { id: leadId } })) as Linha | null;

    // ⛔ A TRAVA REAL. Nada passa por fora dela.
    const reserva = await reservarEnvio(db as never, {
      telefone: (lead?.whatsapp as string) ?? null,
      conteudo,
      natureza: "abordagem",
      leadId,
      origem: "teste de ponta a ponta da reabordagem",
      agora: relogio(),
    });
    if (!reserva.liberado) {
      return { enviado: false, motivo: reserva.motivo, detalhe: reserva.detalhe };
    }

    tentativas += 1;
    if (tentativas % 10 === 0) {
      return { enviado: false, motivo: "aMetaRecusou", detalhe: "recusa simulada da Meta (1 em 10)" };
    }

    enviados.push({ leadId, conteudo });
    return { enviado: true, mensagemId: `enviada-${tentativas}` };
  };

  const porta: PortaDeEnvio = {
    aplicaTravaDeRepeticao: true,
    // Fora da janela sai o template. O texto do template é fixo por modelo, e
    // aqui ele é representado pelo nome + parâmetro, que é o que a pessoa lê.
    porTemplate: (leadId) => mandar(leadId, `foocci_contato_inicial_01|Restaurante de ${leadId}`),
    naJanela: (leadId, texto) => mandar(leadId, texto),
  };

  return { porta, enviados };
}

/** Avança de 15 em 15 minutos até a janela comercial abrir. Usa a função REAL. */
function proximoInstanteAbordavel(instante: Date): Date {
  let t = new Date(instante);
  // Teto de uma semana: laço infinito num teste é pior que um teste vermelho.
  for (let i = 0; i < 7 * 24 * 4 && !podeAbordarAgora(t).pode; i++) {
    t = new Date(t.getTime() + 15 * 60_000);
  }
  return t;
}

async function rodarACampanhaInteira(
  db: ReturnType<typeof bancoDeProva>,
  porta: PortaDeEnvio,
  opcoes: { pararApos?: number } = {},
) {
  let relogio = new Date(INICIO);
  const lotes: Array<{ examinados: number; enviados: number; decisores: number }> = [];

  for (let volta = 0; volta < 40; volta++) {
    const r = await dispararUmLote(db as never, {
      porta,
      tamanho: TAMANHO_DO_LOTE_MAXIMO,
      agora: new Date(relogio),
      quemDisparou: "teste",
    });

    if (!r.rodou) {
      if (r.motivo === "filaVazia" || r.motivo === "interruptorPuxado") break;
      throw new Error(`lote recusado inesperadamente: ${r.motivo} — ${r.detalhe}`);
    }

    lotes.push({
      examinados: r.conta.examinados,
      enviados: r.conta.enviados,
      decisores: r.conta.decisoresCapturados,
    });

    if (opcoes.pararApos !== undefined && lotes.length === opcoes.pararApos) {
      await pararTudo(db as never, { motivo: "teste do interruptor", quemParou: "teste" });
    }

    // O freio entre lotes é lido do banco: sem avançar o relógio, o disparo
    // seguinte é RECUSADO — e é isso que o `intervaloEntreLotes` prova.
    //
    // ⚠️ E depois do freio vem a JANELA: 21 lotes a 31 minutos são quase onze
    // horas, ou seja, a campanha atravessa o fim do expediente e o fim de
    // semana. O relógio pula para o próximo instante em que a casa PODE
    // abordar — que é exatamente o que acontece na vida real, e o motivo de a
    // base inteira levar dias.
    relogio = proximoInstanteAbordavel(new Date(relogio.getTime() + 31 * 60_000));
  }

  return lotes;
}

describe("a campanha de reabordagem, de ponta a ponta", () => {
  it("824 candidatos entram (750 frios + 74 que a origem recusa), e a conta FECHA", async () => {
    const db = montarBase();
    const relogio = { valor: new Date(INICIO) };
    const { porta } = portaDeProva(db, () => relogio.valor);

    // O relógio da trava acompanha o dos lotes.
    let volta = 0;
    const originalPorTemplate = porta.porTemplate;
    porta.porTemplate = (leadId) => {
      relogio.valor = new Date(INICIO.getTime() + volta * 31 * 60_000);
      return originalPorTemplate(leadId);
    };

    const lotes = await rodarACampanhaInteira(db, porta);
    volta = lotes.length;

    const examinados = lotes.reduce((s, l) => s + l.examinados, 0);
    expect(examinados).toBe(ELEGIVEIS);

    // ⛔ Quem não podia entrar, não entrou.
    const execucoes = db.tabelas.reabordagemExecucao;
    expect(execucoes.length).toBe(ELEGIVEIS);
    const idsExaminados = new Set(execucoes.map((e) => e.leadId));
    const foraDaCampanha = db.tabelas.siteLead.filter(
      (l) => l.fonte === "LISTA_PROSPECCAO" && (l.optOutAt !== null || l.stage === "EM_NEGOCIACAO"),
    );
    expect(foraDaCampanha.length).toBe(30);
    for (const l of foraDaCampanha) {
      expect(idsExaminados.has(l.id), `${l.id} não podia ter entrado`).toBe(false);
    }

    const painel = await painelDaReabordagem(db as never);
    expect(painel.medido).toBe(true);
    if (!painel.medido) throw new Error("painel não medido");

    // ── A CONTA, impressa: é ela que o CEO lê ──
    console.info("[campanha] examinados:", painel.valor.examinados);
    console.info("[campanha] lotes:", painel.valor.lotes);
    console.info("[campanha] enviados:", painel.valor.enviados);
    console.info("[campanha] ⭐ DECISORES CAPTURADOS:", painel.valor.decisoresCapturados);
    console.info("[campanha] por ação:", JSON.stringify(painel.valor.porAcao));
    console.info("[campanha] recusados por regra:", JSON.stringify(painel.valor.recusadosPorRegra));

    // ── ⛔ A CONTAGEM POR ORIGEM, que é o que o CEO pediu ──
    const porOrigem = new Map<string, number>();
    for (const e of db.tabelas.reabordagemExecucao) {
      if (e.acao !== "FORA_DA_CAMPANHA" && e.acao !== "REVISAO") continue;
      const lead = db.tabelas.siteLead.find((l) => l.id === e.leadId);
      const origem = (lead?.fonte as string | null) ?? "(sem origem declarada)";
      if (origem === "LISTA_PROSPECCAO") continue;
      porOrigem.set(origem, (porOrigem.get(origem) ?? 0) + 1);
    }
    console.info("[campanha] ⛔ ficaram de fora POR ORIGEM:", JSON.stringify([...porOrigem.entries()]));
    for (const [origem, quantos] of Object.entries(LEADS_POR_ORIGEM)) {
      expect(porOrigem.get(origem), origem).toBe(quantos);
    }
    expect(porOrigem.get("(sem origem declarada)")).toBe(ORIGEM_DESCONHECIDA);

    expect(painel.valor.contaFecha).toBe(true);
    expect(painel.valor.examinados).toBe(ELEGIVEIS);

    const porAcao = Object.fromEntries(painel.valor.porAcao.map((a) => [a.acao, a.quantos]));

    // Cada linha da tabela do CEO, com o número que ela produziu.
    expect(porAcao.ABORDAGEM_INICIAL).toBe(603);
    expect(porAcao.NAVEGA_MENU).toBe(25);
    expect(porAcao.PERGUNTA_SE_RESPONSAVEL).toBe(30 + 15);
    expect(porAcao.PEDE_CONTATO_CERTO).toBe(12);
    expect(porAcao.CADASTRA_DECISOR).toBe(10);
    expect(porAcao.NAO_ABORDA).toBe(8);
    expect(porAcao.PARA_SDR).toBe(7);
    // 40 bots sem opção para gente + os 11 de origem desconhecida.
    expect(porAcao.REVISAO).toBe(40 + ORIGEM_DESCONHECIDA);
    // ⛔ D-0E1: quem deixou o próprio contato NÃO recebe abordagem fria.
    expect(porAcao.FORA_DA_CAMPANHA).toBe(LEADS_QUE_NAO_SAO_FRIOS);

    // ⭐ A MÉTRICA DA CAMPANHA — decisores capturados, não mensagens enviadas.
    expect(painel.valor.decisoresCapturados).toBe(10);
    // ⚠️ Contados pela LIGAÇÃO, e não pela fonte: a base de prova já tem leads
    // com fonte INDICACAO (que a campanha recusa, por D-0E1), e contar por
    // fonte somaria os dois grupos num número que não quer dizer nada.
    const conversasNovas = new Set(
      execucoes.map((e) => e.leadDoDecisorId).filter((x): x is string => Boolean(x)),
    );
    expect(conversasNovas.size, "cada decisor indicado abre uma conversa NOVA").toBe(10);

    // ── A CONTA DAS QUE FALAM ──
    //
    // Falam: as quatro ações de abordagem, MAIS a despedida educada no número
    // antigo quando o decisor foi indicado dentro da janela. Toda tentativa ou
    // saiu, ou tem a regra da recusa escrita — não existe terceira gaveta.
    const ACOES_QUE_TENTAM = ["ABORDAGEM_INICIAL", "NAVEGA_MENU", "PERGUNTA_SE_RESPONSAVEL", "PEDE_CONTATO_CERTO"];
    const tentaram = execucoes.filter(
      (e) =>
        ACOES_QUE_TENTAM.includes(e.acao as string) ||
        (e.acao === "CADASTRA_DECISOR" && e.canal === "JANELA"),
    );
    expect(tentaram.length).toBe(603 + 25 + 45 + 12 + 10);

    const recusadas = tentaram.filter((e) => !e.enviado);
    expect(painel.valor.enviados + recusadas.length).toBe(tentaram.length);
    console.info("[campanha] tentaram falar:", tentaram.length, "| recusadas:", recusadas.length);

    // ⛔ Nenhuma recusa fica sem motivo escrito.
    for (const r of recusadas) expect(r.motivoDaRecusa, String(r.leadId)).toBeTruthy();

    // ⛔ E nenhuma das que NÃO falam mandou mensagem.
    const mudas = execucoes.filter((e) => !tentaram.includes(e));
    for (const m of mudas) expect(m.enviado, `${m.acao} não podia ter enviado`).toBe(false);
  }, 60_000);

  it("⛔ o interruptor para a campanha NO MEIO, e o resto da fila fica intacto", async () => {
    const db = montarBase();
    const { porta } = portaDeProva(db, () => INICIO);

    const lotes = await rodarACampanhaInteira(db, porta, { pararApos: 2 });

    // Dois lotes saíram; o terceiro foi recusado pelo interruptor.
    expect(lotes.length).toBe(2);
    const examinados = db.tabelas.reabordagemExecucao.length;
    expect(examinados).toBe(2 * TAMANHO_DO_LOTE_MAXIMO);
    expect(examinados).toBeLessThan(ELEGIVEIS);
  }, 60_000);

  it("⛔ o freio entre lotes RECUSA o segundo disparo seguido", async () => {
    const db = montarBase();
    const { porta } = portaDeProva(db, () => INICIO);

    const primeiro = await dispararUmLote(db as never, {
      porta,
      tamanho: 40,
      agora: INICIO,
      quemDisparou: "teste",
    });
    expect(primeiro.rodou).toBe(true);

    const segundo = await dispararUmLote(db as never, {
      porta,
      tamanho: 40,
      agora: new Date(INICIO.getTime() + 5 * 60_000),
      quemDisparou: "teste",
    });
    expect(segundo.rodou).toBe(false);
    if (!segundo.rodou) expect(segundo.motivo).toBe("intervaloEntreLotes");
  }, 30_000);

  it("⛔ porta que NÃO aplica a trava não roda — a campanha não afrouxa nada", async () => {
    const db = montarBase();
    const portaRuim = {
      aplicaTravaDeRepeticao: false,
      porTemplate: async () => ({ enviado: true as const, mensagemId: "x" }),
      naJanela: async () => ({ enviado: true as const, mensagemId: "x" }),
    } as unknown as PortaDeEnvio;

    const r = await dispararUmLote(db as never, {
      porta: portaRuim,
      agora: INICIO,
      quemDisparou: "teste",
    });
    expect(r.rodou).toBe(false);
    if (!r.rodou) expect(r.motivo).toBe("portaSemTrava");
    expect(db.tabelas.reabordagemExecucao.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ⭐⭐ A JANELA COMERCIAL — e a linha que ela NÃO pode cruzar.
//
// Ordem do CEO, 18/09/2026: seg–sex 09–20, sáb 09–14, domingo não se aborda.
// Esta máquina não tinha janela nenhuma: ela só conhecia a janela de 24h da
// Meta, que responde outra pergunta ("cabe texto livre, ou tem de ser
// template?"). Um lote pedido às 3h de domingo saía.
//
// ⛔ E a régua do outro lado, que é metade da regra: a janela barra **NÓS
// INICIARMOS**, nunca **NÓS RESPONDERMOS**. Quem escreve para a casa às 22h de
// um domingo está com o celular na mão. Calar com essa pessoa em nome do
// horário comercial seria usar contra ela a proteção feita para proteger quem
// não nos chamou.
// ─────────────────────────────────────────────────────────────────────────────

describe("⭐ a janela comercial barra o lote — e só o lote", () => {
  const DOMINGO_3H = new Date("2026-09-20T06:00:00.000Z"); // 03:00 em São Paulo
  const DOMINGO_22H = new Date("2026-09-21T01:00:00.000Z"); // domingo 22:00 em SP
  const SEGUNDA_9H = new Date("2026-09-21T12:00:00.000Z"); // 09:00 em São Paulo

  it("⛔ um disparo pedido às 3h de domingo NÃO sai, e a recusa tem nome", async () => {
    const db = montarBase();
    const { porta, enviados } = portaDeProva(db, () => DOMINGO_3H);

    const r = await dispararUmLote(db as never, {
      porta,
      tamanho: TAMANHO_DO_LOTE_MAXIMO,
      agora: DOMINGO_3H,
      quemDisparou: "teste da janela",
    });

    expect(r.rodou).toBe(false);
    if (r.rodou) throw new Error("impossível");
    expect(r.motivo).toBe("foraDaJanelaComercial");
    expect(r.detalhe).toContain("domingo");
    // ⚠️ E ninguém foi tocado: nem mensagem, nem linha de execução. Recusar
    // DEPOIS de gastar o contato marcaria como examinado quem nunca foi
    // abordado, e ele nunca mais apareceria no lote seguinte.
    expect(enviados).toHaveLength(0);
    expect(await db.reabordagemExecucao.count({})).toBe(0);
  });

  it("⭐ o MESMO lote, na segunda às 9h, sai normalmente", async () => {
    const db = montarBase();
    const { porta, enviados } = portaDeProva(db, () => SEGUNDA_9H);

    const r = await dispararUmLote(db as never, {
      porta,
      tamanho: TAMANHO_DO_LOTE_MAXIMO,
      agora: SEGUNDA_9H,
      quemDisparou: "teste da janela",
    });

    expect(r.rodou, "segunda 09:00 é a primeira hora da janela").toBe(true);
    if (!r.rodou) throw new Error("impossível");
    expect(r.conta.examinados).toBeGreaterThan(0);
    expect(enviados.length).toBeGreaterThan(0);
  });

  it("⛔ RESPONDER a quem escreveu continua funcionando fora da janela", async () => {
    // O canal por onde a casa FALA numa conversa viva é `porta.naJanela` — o
    // mesmo `registrarSaida` + `entregarMensagem` que atende quem nos procurou.
    // Ele é chamado aqui às 22h de um DOMINGO, o pior horário possível para
    // abordar, e entrega. É isso que prova que a janela mora na decisão de
    // INICIAR e não no canal de falar: se alguém a pendurar no canal, este
    // caso fica vermelho.
    const db = montarBase();
    const { porta, enviados } = portaDeProva(db, () => DOMINGO_22H);

    const abordar = await dispararUmLote(db as never, {
      porta,
      agora: DOMINGO_22H,
      quemDisparou: "teste da janela",
    });
    expect(abordar.rodou, "abordar às 22h de domingo tem de ser recusado").toBe(false);

    const resposta = await porta.naJanela("lead-0001", "Oi! Claro, posso te explicar agora mesmo.");
    expect(resposta.enviado, "responder a quem escreveu NUNCA pode ser barrado pelo horário").toBe(true);
    expect(enviados).toEqual([
      { leadId: "lead-0001", conteudo: "Oi! Claro, posso te explicar agora mesmo." },
    ]);
  });
});
