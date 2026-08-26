/**
 * A PONTE — do "oi" do cliente até o que o TA responde.
 *
 * ── O QUE FALTAVA, EXATAMENTE ───────────────────────────────────────────────
 *
 * As duas pontas existiam e não se encontravam:
 *
 *   · `FoocciSalesInbound` recebe o "oi", reconhece de quem é e registra —
 *     e diz, no próprio cabeçalho, que **não redige e não envia nada**;
 *   · `responder()` compõe a fala do TA, e nada o chamava.
 *
 * Este arquivo é a fiação entre os dois. Ele não inventa comportamento novo:
 * decide **se** o TA pode falar, chama quem compõe, e grava o que sairia.
 *
 * ── OS SETE PORTÕES, NESTA ORDEM ────────────────────────────────────────────
 *
 * A ordem é o desenho, e cada degrau existe por um motivo que já custou caro
 * em algum lugar:
 *
 *   1. **O TA está ligado?** `sdr_ia_config.ligado` é a chave mestra do CEO.
 *      Desligado, esta função para no primeiro `if` — e é assim que ela nasce.
 *   2. **O lead é da IA?** Se um humano assumiu, o TA **cala**. Falar por cima
 *      de quem assumiu é o defeito que faz o cliente receber duas respostas
 *      diferentes da mesma empresa no mesmo minuto.
 *   3. **A pessoa pediu silêncio?** `LeadContactSafety` decide, e a resposta
 *      dele é definitiva.
 *   4. **Estamos na janela de horário?** Robô que responde às 3 h da manhã
 *      denuncia que é robô — e a regra de horário existe antes disso.
 *   5. **Ele já insistiu demais?** `maxSemResposta` para sozinho. Sem este
 *      degrau, o TA vira perseguição automatizada.
 *   6. **Compor.** `responder()` monta a fala a partir da base de verdade.
 *   7. **Gravar como PENDENTE.** Nunca entregar daqui.
 *
 * ── POR QUE ELA NÃO ENVIA, E ISSO NÃO É PROVISÓRIO ──────────────────────────
 *
 * O que sai desta função é uma linha em `lead_mensagens` com status PENDENTE.
 * Quem entrega é o canal, e o canal só entrega com `FOOCCI_SDR_SEND_ENABLED`
 * ligada — decisão do CEO, separada de "o TA está ligado".
 *
 * São duas chaves de propósito: **receber e pensar é seguro; falar com um
 * estranho em nome da empresa é outra coisa.** Uma mensagem PENDENTE que nunca
 * saiu é visível e corrigível; uma que saiu sem autorização não volta.
 *
 * ── E QUANDO É CASO DE GENTE ────────────────────────────────────────────────
 *
 * O TA não responde E chama gente ao mesmo tempo. Se o gatilho disparou, ele
 * diz que vai chamar alguém e **para** — o dossiê vai junto, pelo caminho já
 * provado de `passarParaGente`. Mandar a resposta de venda junto com o "vou
 * chamar alguém" é o que faz o lead responder à pergunta errada.
 */

import type { PrismaClient, Prisma } from "@prisma/client";
import { responder, type Resposta } from "./responder";
import { VERSAO_1 } from "./ficha";
import { registrarSaida } from "../conversa";
import { passarParaGente } from "../handoff";
import { pediuSilencio, foraDaJanela } from "@/services/foocci-sdr/LeadContactSafety";

/**
 * Aceita a transação além do cliente solto — igual a `conversa.ts` e
 * `handoff.ts`. O webhook chama esta função **dentro** de `comIdentidade`, que
 * abre transação para declarar o papel ao RLS; sem isto o tipo obrigaria a
 * escrever fora da identidade, que é onde a trava do banco não enxerga.
 */
type Cliente = PrismaClient | Prisma.TransactionClient;

export type MotivoDeCalar =
  | "taDesligado"
  | "leadNaoEDaIA"
  | "pediuSilencio"
  | "foraDeHorario"
  | "insistiuDemais"
  | "leadNaoExiste"
  /** O gatilho de gente disparou e o handoff recusou. Ninguém fala. */
  | "handoffRecusado"
  /** Ele compôs e o banco não aceitou. A fala existiu e se perdeu. */
  | "naoConseguiuGravar"
  /** Alguma coisa quebrou no caminho. O turno morre calado, o webhook não. */
  | "quebrou";

export type ResultadoDoTurno =
  /** Ele respondeu. A mensagem está gravada como PENDENTE. */
  | { falou: true; mensagemId: string; resposta: Resposta }
  /** Ele parou e chamou gente. Não há resposta de venda a enviar. */
  | { falou: false; chamouGente: true; handoffId: string; motivo: string }
  /** Ele calou, e o motivo é sempre nomeado. */
  | { falou: false; chamouGente: false; motivo: MotivoDeCalar; detalhe: string };

export interface PedidoDeTurno {
  leadId: string;
  /** O que o cliente acabou de escrever. */
  mensagem: string;
  agora?: Date;
}

/**
 * O TA atende um turno.
 *
 * **Nunca lança**, e a casca é aqui em cima de propósito. Quem chama esta função
 * é o webhook da Meta, e a Meta **reentrega o que falhou**: uma exceção não
 * perde uma resposta, ela vira laço — a mesma mensagem batendo na mesma falha
 * de minuto em minuto.
 *
 * O que a casca NÃO faz é engolir. A quebra volta nomeada, com a mensagem do
 * erro dentro, porque um `catch` que devolve silêncio é como um defeito vira
 * "o TA simplesmente não respondeu aquele cliente" — e ninguém acha.
 */
export async function atenderComOTA(
  db: Cliente,
  pedido: PedidoDeTurno,
): Promise<ResultadoDoTurno> {
  try {
    return await executarTurno(db, pedido);
  } catch (e) {
    return {
      falou: false,
      chamouGente: false,
      motivo: "quebrou",
      detalhe: `o turno quebrou: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

async function executarTurno(
  db: Cliente,
  pedido: PedidoDeTurno,
): Promise<ResultadoDoTurno> {
  const agora = pedido.agora ?? new Date();

  const calar = (motivo: MotivoDeCalar, detalhe: string): ResultadoDoTurno => ({
    falou: false,
    chamouGente: false,
    motivo,
    detalhe,
  });

  // ── 1. A chave mestra ───────────────────────────────────────────────────
  const config = await db.sdrIaConfig.findUnique({
    where: { slug: "ta" },
    select: {
      ligado: true,
      maxSemResposta: true,
      versaoAtivaId: true,
      horaInicio: true,
      horaFim: true,
    },
  });

  if (!config?.ligado) {
    return calar("taDesligado", "o TA está desligado — nada foi composto");
  }
  // Sem versão publicada o TA fica calado, e o schema já diz isso com essas
  // palavras. Ligado sem versão seria um agente sem identidade nem proibições.
  if (!config.versaoAtivaId) {
    return calar("taDesligado", "o TA está ligado mas não tem versão publicada");
  }

  const lead = await db.siteLead.findUnique({
    where: { id: pedido.leadId },
    select: { id: true, nome: true, atendidoPor: true, optOutAt: true },
  });

  if (!lead) return calar("leadNaoExiste", `lead ${pedido.leadId} não existe`);

  // ── 2. O lead é da IA? ──────────────────────────────────────────────────
  //
  // `AGUARDANDO_HUMANO` também cala: o TA já pediu gente, e voltar a falar
  // desfaz o pedido dele mesmo na frente do cliente.
  if (lead.atendidoPor !== "NINGUEM" && lead.atendidoPor !== "IA") {
    return calar(
      "leadNaoEDaIA",
      `o lead está com ${lead.atendidoPor} — o TA não fala por cima de quem assumiu`,
    );
  }

  // ── 3. Pediu silêncio? ──────────────────────────────────────────────────
  //
  // ⚠️ Aqui NÃO se chama `avaliarContatoDeLead`, e a ausência é deliberada.
  // Aquele portão governa **abordar** um estranho: conta tentativas, exige 48h
  // de descanso, cobra consentimento de menos de 90 dias. Aplicá-lo a quem
  // acabou de escrever recusaria resposta a um cliente por "já foram duas
  // tentativas" — usar a proteção contra a pessoa que ela protege.
  //
  // Do portão vale uma regra só, e é a que atravessa os dois atos: silêncio
  // pedido. Ela vem de lá importada, nunca copiada.
  if (pediuSilencio(lead.optOutAt)) {
    return calar("pediuSilencio", "esta pessoa pediu para não receber mensagens");
  }

  // ── 4. Janela de horário ────────────────────────────────────────────────
  //
  // A janela vem da CONFIGURAÇÃO, não da constante do SDR de abordagem: a tela
  // do TA mostra `horaInicio`/`horaFim` como ajuste do dono, e um botão que o
  // código ignora ensina que a configuração vale quando ela não vale.
  //
  // ⚠️ Anotado e NÃO resolvido: quem escreve às 23 h está esperando resposta
  // agora, e calar pode ser pior que responder fora do horário. A janela foi
  // desenhada para proteger quem NÃO chamou. Soltar o TA da madrugada é decisão
  // do CEO, não minha — enquanto ela não vier, vale o horário configurado.
  if (foraDaJanela(agora, { inicioHora: config.horaInicio, fimHora: config.horaFim })) {
    return calar(
      "foraDeHorario",
      `fora da janela do TA (${config.horaInicio}h–${config.horaFim}h, dias úteis, horário de São Paulo)`,
    );
  }

  // ── 5. Insistiu demais? ─────────────────────────────────────────────────
  const semResposta = await db.leadMensagem.count({
    where: {
      leadId: lead.id,
      direcao: "SAIDA",
      ocorreuEm: { gt: await ultimaEntrada(db, lead.id) },
    },
  });

  if (semResposta >= config.maxSemResposta) {
    return calar(
      "insistiuDemais",
      `${semResposta} mensagens sem resposta, o limite é ${config.maxSemResposta}`,
    );
  }

  // ── 6. Compor ───────────────────────────────────────────────────────────
  const jaPerguntou = await perguntasJaFeitas(db, lead.id);
  const r = responder(
    { mensagem: pedido.mensagem, nome: lead.nome, jaPerguntou },
    VERSAO_1,
  );

  // ── 7a. É caso de gente: chama e PARA ───────────────────────────────────
  if (r.handoff.deve && r.handoff.motivo) {
    const h = await passarParaGente(db, {
      leadId: lead.id,
      motivoEscrito: r.porque,
      motivoExplicito: r.handoff.motivo,
      dossie: {
        // O resumo é o que `validarDossie` exige, e por um motivo prático:
        // quem pegar a fila lê ISTO antes de abrir a conversa. A frase literal
        // do cliente vale mais que qualquer paráfrase — é o que fez o TA parar.
        resumo: `O cliente escreveu: "${pedido.mensagem}"`,
        proximaAcao: "responder a esta mensagem — o TA parou e não respondeu nada",
      },
      agora,
    });

    if (h.ok) {
      return { falou: false, chamouGente: true, handoffId: h.handoffId, motivo: h.motivo };
    }

    // O handoff recusou. As duas saídas erradas: responder com a fala de venda
    // (ignora o gatilho que disparou) ou calar mentindo o motivo. Fica o motivo
    // verdadeiro, nomeado, e o lead segue com a IA para a próxima tentativa —
    // `passarParaGente` só troca o dono depois de validar, então nada ficou
    // pela metade.
    return calar("handoffRecusado", `o handoff recusou: ${h.causa}`);
  }

  // ── 7b. Grava o que ele diria. PENDENTE, sempre ─────────────────────────
  const gravada = await registrarSaida(db, {
    leadId: lead.id,
    // IA, e não SISTEMA: `SISTEMA` é cadência e template operacional, coisa que
    // ninguém redigiu. Isto aqui é fala composta, e a auditoria precisa poder
    // separar "o robô escreveu" de "a máquina disparou o passo 2".
    autor: "IA",
    texto: r.texto,
    agora,
  });

  if (!gravada.ok) {
    // Só acontece se o texto vier vazio — `responder()` promete que não vem,
    // mas a promessa mora em outro arquivo. Sem este ramo, uma quebra lá viraria
    // um `undefined` silencioso no id da mensagem.
    return calar("naoConseguiuGravar", `a mensagem não foi gravada: ${gravada.causa}`);
  }

  return { falou: true, mensagemId: gravada.mensagemId, resposta: r };
}

/** O instante da última coisa que o cliente escreveu. Epoch quando nunca. */
async function ultimaEntrada(db: Cliente, leadId: string): Promise<Date> {
  const m = await db.leadMensagem.findFirst({
    where: { leadId, direcao: "ENTRADA" },
    orderBy: { ocorreuEm: "desc" },
    select: { ocorreuEm: true },
  });
  return m?.ocorreuEm ?? new Date(0);
}

/**
 * Quais perguntas da sondagem já foram feitas.
 *
 * Derivado das mensagens que já saíram, e não de um contador guardado: um
 * contador se dessincroniza no dia em que uma mensagem é apagada, e aí o TA
 * repete uma pergunta que a pessoa já respondeu — que é a coisa que mais
 * denuncia um robô numa conversa.
 */
async function perguntasJaFeitas(db: Cliente, leadId: string): Promise<number[]> {
  const saidas = await db.leadMensagem.findMany({
    where: { leadId, direcao: "SAIDA" },
    select: { texto: true },
  });

  const ditas = saidas.map((s) => s.texto ?? "");
  return VERSAO_1.perguntas
    .map((p, i) => (ditas.some((t) => t.includes(p)) ? i : -1))
    .filter((i) => i >= 0);
}
