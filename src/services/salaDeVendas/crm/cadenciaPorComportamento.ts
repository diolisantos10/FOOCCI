/**
 * A CADÊNCIA APRENDE A DIZER "SE" — condição e condição de parada.
 *
 * ── O QUE JÁ EXISTIA, E O QUE FALTAVA ───────────────────────────────────────
 *
 * `followUp.ts` já sabe inscrever, listar passo vencido e avançar. O dado da
 * cadência está pronto: `Cadencia`, `CadenciaPasso`, `LeadCadencia`. O que
 * faltava é o que a auditoria apontou: **ela não sabe fazer "se"**. Todo
 * inscrito percorre os mesmos passos na mesma ordem, aconteça o que acontecer —
 * inclusive depois de o contato já ter respondido, já ter comprado, ou já ter
 * pedido para parar.
 *
 * Este arquivo **não substitui** nada daquilo. Ele envolve: lê o passo vencido
 * de `passosVencidos()`, pergunta ao classificador **em que estado o contato
 * está**, e só então decide entre executar, pular ou parar. Quem grava o avanço
 * continua sendo `avancarCadencia()`; quem encerra continua sendo
 * `encerrarCadencia()`.
 *
 * ── POR QUE A CONDIÇÃO MORA EM CÓDIGO, E NÃO NUMA COLUNA ────────────────────
 *
 * `CadenciaPasso` não tem coluna de condição, e o schema desta entrega está
 * fechado (outra frente trabalha nele). A saída honesta não é inventar um campo
 * de texto livre e interpretá-lo — condição em texto livre vira condição que
 * ninguém consegue testar. É um **catálogo tipado**, indexado por
 * `slug-da-cadência#ordem-do-passo`, com predicado e descrição legível.
 *
 * O custo, declarado: mudar a condição de um passo exige deploy. O ganho é que
 * cada condição é uma função pura, coberta por teste, e um passo sem condição
 * declarada continua funcionando como sempre funcionou (executa).
 * `condicaoDoPasso()` é o ponto único a trocar no dia em que a coluna existir.
 *
 * ── AS TRAVAS NÃO MUDAM ─────────────────────────────────────────────────────
 *
 * Nada aqui envia mensagem. Passo de mensagem executado por IA/SISTEMA sai por
 * `abordarLead()` — o único caminho da casa — e portanto passa pelo portão do
 * lead, pelo freio de ritmo, pela Supervisora e pela chave de envio. **Se a
 * trava recusar, o passo NÃO avança**: ele fica pendente e volta na lista de
 * pendências da rodada. Avançar um passo que não saiu seria perder o toque e
 * ainda marcar como feito.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import type { AutorDaMensagem, TipoDeTarefa } from "@prisma/client";
import {
  passosVencidos,
  avancarCadencia,
  encerrarCadencia,
  criarTarefa,
  type PassoVencido,
} from "../followUp";
import { abordarLead, type ResultadoDaAbordagem } from "../abordar";
import {
  classificarLead,
  type Classificacao,
  type EstadoDeFollowUp,
  type FichaParaClassificar,
} from "./estadoDeFollowUp";

type Cliente = PrismaClient | Prisma.TransactionClient;

// ─────────────────────────────────────────────────────────────────────────────
// A CONDIÇÃO DE PARADA — o que encerra a cadência inteira
// ─────────────────────────────────────────────────────────────────────────────

export type MotivoDeParada = "respondeu" | "comprou" | "pediuRemocao" | "perdido" | "semPerfil";

export interface Parada {
  motivo: MotivoDeParada;
  /** O texto que vai para `motivoDaSaida` — cadência que some sem motivo vira lead abandonado. */
  explicacao: string;
}

/**
 * As paradas, na ordem em que valem.
 *
 * `pediuRemocao` vem primeiro por obrigação legal: mesmo que a pessoa tenha
 * respondido e comprado, o pedido de silêncio é o que encerra, e é esse motivo
 * que precisa ficar escrito na saída para uma auditoria conseguir lê-lo.
 */
export const PARADAS: readonly { motivo: MotivoDeParada; casa: (c: Classificacao) => boolean; explicacao: string }[] = [
  {
    motivo: "pediuRemocao",
    casa: (c) => c.estado === "PEDIU_SILENCIO",
    explicacao: "o contato pediu para parar de receber mensagens",
  },
  {
    motivo: "comprou",
    casa: (c) => c.estado === "VIROU_CLIENTE",
    explicacao: "a venda foi fechada — daqui em diante quem cuida é a jornada de pós-venda",
  },
  {
    motivo: "perdido",
    casa: (c) => c.estado === "VENDA_PERDIDA",
    explicacao: "a venda foi perdida com motivo registrado — reativação é campanha, não cadência",
  },
  {
    motivo: "semPerfil",
    casa: (c) => c.estado === "LEAD_SEM_PERFIL",
    explicacao: "medido e sem perfil — seguir a cadência gastaria o teto diário de quem qualifica",
  },
  {
    motivo: "respondeu",
    casa: (c) => c.estado === "PENSANDO",
    explicacao: "o contato respondeu e está decidindo — cadência automática em cima de quem respondeu atropela a conversa",
  },
];

/** A cadência deve parar? Função pura sobre a classificação. */
export function conferirParada(c: Classificacao): Parada | null {
  for (const p of PARADAS) {
    if (p.casa(c)) return { motivo: p.motivo, explicacao: p.explicacao };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// A CONDIÇÃO DO PASSO — ramificar por comportamento
// ─────────────────────────────────────────────────────────────────────────────

export interface CondicaoDePasso {
  /** Legível, e é ela que vai para o registro quando o passo é pulado. */
  descricao: string;
  /** Os estados em que este passo faz sentido. Vazio = qualquer um. */
  estados: readonly EstadoDeFollowUp[];
  /** Filtro extra sobre a ficha, quando o estado não basta. */
  extra?: (f: FichaParaClassificar) => boolean;
}

/**
 * O catálogo, indexado por `slug#ordem`.
 *
 * Os slugs são os das cadências que `semear.ts` cria — e só eles. Uma cadência ausente daqui
 * não quebra nada: seus passos rodam incondicionalmente, como sempre rodaram.
 */
export const CATALOGO_DE_CONDICOES: Readonly<Record<string, CondicaoDePasso>> = {
  // Quem sumiu: o segundo toque só faz sentido se ele CONTINUA sumido.
  "retomada-sem-resposta#1": {
    descricao: "só toca de novo quem continua em silêncio",
    estados: ["CLIENTE_SUMIU", "NUNCA_RESPONDEU"],
  },
  "retomada-sem-resposta#2": {
    descricao: "o último toque é para quem sumiu de vez, não para quem nunca respondeu a nada",
    estados: ["CLIENTE_SUMIU"],
  },
  // Carrinho: só vale enquanto o carrinho estiver de pé.
  "carrinho-abandonado#0": {
    descricao: "só lembra do pedido quem ainda tem pedido montado e não fechado",
    estados: ["CARRINHO_ABANDONADO"],
  },
  "carrinho-abandonado#1": {
    descricao: "o segundo lembrete exige que o carrinho continue parado",
    estados: ["CARRINHO_ABANDONADO"],
  },
  // Pagamento: quem disse sim e não pagou precisa de link, e só ele.
  "pagamento-abandonado#0": {
    descricao: "quem aceitou e não pagou recebe o link — ninguém mais",
    estados: ["PAGAMENTO_ABANDONADO"],
  },
  // Proposta parada: o toque é sobre a proposta, e some se ela foi respondida.
  "proposta-sem-retorno#0": {
    descricao: "cobra retorno só de proposta enviada e ainda sem resposta",
    estados: ["PROPOSTA_PARADA"],
  },
  "proposta-sem-retorno#1": {
    descricao: "segunda cobrança, e só com valor estimado — sem valor não há o que negociar",
    estados: ["PROPOSTA_PARADA"],
    extra: (f) => f.valorPotencialCents !== null,
  },
  // Reunião: confirmar só quem tem reunião pendente de confirmação.
  "confirmacao-de-reuniao#0": {
    descricao: "confirma quem tem reunião marcada e ainda não confirmou",
    estados: ["REUNIAO_PENDENTE"],
  },
};

/** A chave do catálogo. Exportada porque o teste e a semeadura usam a mesma. */
export function chaveDaCondicao(slug: string, ordem: number): string {
  return `${slug}#${ordem}`;
}

/**
 * A condição declarada para este passo, ou `null` quando não há nenhuma.
 *
 * ⚠️ **Ponto único de troca.** No dia em que `CadenciaPasso` ganhar coluna de
 * condição, é esta função que passa a lê-la — e nada mais neste arquivo muda.
 */
export function condicaoDoPasso(slug: string, ordem: number): CondicaoDePasso | null {
  return CATALOGO_DE_CONDICOES[chaveDaCondicao(slug, ordem)] ?? null;
}

export function condicaoSatisfeita(
  condicao: CondicaoDePasso | null,
  c: Classificacao,
  f: FichaParaClassificar,
): boolean {
  if (!condicao) return true;
  if (condicao.estados.length && !condicao.estados.includes(c.estado)) return false;
  if (condicao.extra && !condicao.extra(f)) return false;
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// A EXECUÇÃO DE UM PASSO
// ─────────────────────────────────────────────────────────────────────────────

export type DesfechoDoPasso =
  /** Parou a cadência inteira. */
  | { desfecho: "parou"; motivo: MotivoDeParada; explicacao: string }
  /** A condição não casou: o passo foi pulado e a cadência seguiu em frente. */
  | { desfecho: "pulou"; porque: string; proximoEm: Date | null; terminou: boolean }
  /** Mensagem saiu (ou tarefa criada) e a cadência avançou. */
  | { desfecho: "executou"; comoFez: "mensagem" | "tarefa"; proximoEm: Date | null; terminou: boolean }
  /**
   * Uma trava recusou. O passo **não avançou** — fica pendente e volta na
   * próxima rodada, e aparece na lista de pendências desta.
   */
  | { desfecho: "pendente"; motivo: string; detalhe: string }
  | { desfecho: "leadSumiuDaBase" };

/** Passos que só fazem sentido como mensagem automática. */
const TIPOS_DE_MENSAGEM: readonly TipoDeTarefa[] = ["MENSAGEM", "FOLLOW_UP", "REENGAJAMENTO"];

/**
 * Um passo é enviado pela máquina quando o executor NÃO é humano e o tipo é de
 * mensagem. Passo de humano vira tarefa — a máquina não liga telefone nem faz
 * reunião, e fingir que faz produziria cadência "executada" sem nada acontecer.
 */
export function ehPassoDeMaquina(executor: AutorDaMensagem, tipo: TipoDeTarefa): boolean {
  return executor !== "HUMANO" && TIPOS_DE_MENSAGEM.includes(tipo);
}

export interface OpcoesDaRodada {
  agora?: Date;
  /** Quem responde pelos toques desta rodada. Sem padrão, como em `abordarLead`. */
  autor: "HUMANO" | "SISTEMA";
  autorUserId: string;
  limite?: number;
  /**
   * O envio, injetável só para teste. O padrão é `abordarLead` — e trocar isto
   * em produção seria abrir o segundo caminho de falar com estranho que
   * `abordar.ts` existe para impedir.
   */
  enviar?: (db: Cliente, p: { leadId: string; autor: "HUMANO" | "SISTEMA"; autorUserId: string; agora: Date }) => Promise<ResultadoDaAbordagem>;
}

/**
 * Executa UM passo vencido, com condição e parada.
 *
 * ── A ORDEM, E POR QUE ELA É ESTA ───────────────────────────────────────────
 *   1. Classificar — sem saber em que estado o contato está, "se" não existe.
 *   2. Parada — encerra a cadência inteira; nada mais importa depois disso.
 *   3. Condição — pula o passo e segue; a cadência continua viva.
 *   4. Executar — mensagem pelas travas, ou tarefa para gente.
 *   5. Avançar — **só depois** de a execução ter dado certo.
 */
export async function executarPasso(
  db: PrismaClient,
  passo: PassoVencido & { cadenciaSlug: string },
  opcoes: OpcoesDaRodada,
): Promise<DesfechoDoPasso> {
  const agora = opcoes.agora ?? new Date();
  const enviar = opcoes.enviar ?? ((cliente, p) => abordarLead(cliente, p));

  const lido = await classificarLead(db, passo.leadId, agora);
  if (!lido) return { desfecho: "leadSumiuDaBase" };

  const { ficha, classificacao } = lido;

  const parada = conferirParada(classificacao);
  if (parada) {
    await encerrarCadencia(db, {
      leadId: passo.leadId,
      motivo: `${parada.motivo}: ${parada.explicacao}`,
      situacao: parada.motivo === "comprou" ? "CONCLUIDA" : "CANCELADA",
    });
    return { desfecho: "parou", motivo: parada.motivo, explicacao: parada.explicacao };
  }

  const condicao = condicaoDoPasso(passo.cadenciaSlug, passo.passo);
  if (!condicaoSatisfeita(condicao, classificacao, ficha)) {
    const avancou = await avancarCadencia(db, { leadCadenciaId: passo.leadCadenciaId, agora });
    const porque = `passo "${passo.titulo}" pulado — ${condicao!.descricao}; o contato está em ${classificacao.estado} (${classificacao.porque})`;
    await registrarPuloNaConversa(db, passo.leadId, porque, opcoes.autor);
    return {
      desfecho: "pulou",
      porque,
      proximoEm: avancou.ok ? avancou.proximoEm : null,
      terminou: avancou.ok ? avancou.terminou : false,
    };
  }

  if (ehPassoDeMaquina(passo.executor, passo.tipo)) {
    const r = await enviar(db, {
      leadId: passo.leadId,
      autor: opcoes.autor,
      autorUserId: opcoes.autorUserId,
      agora,
    });

    if (!r.abordou) {
      // ⛔ NÃO AVANÇA. A trava recusou, o toque não saiu, e marcar como feito
      // perderia o passo para sempre. Ele volta na próxima rodada.
      return { desfecho: "pendente", motivo: r.motivo, detalhe: r.detalhe };
    }

    const avancou = await avancarCadencia(db, { leadCadenciaId: passo.leadCadenciaId, agora });
    return {
      desfecho: "executou",
      comoFez: "mensagem",
      proximoEm: avancou.ok ? avancou.proximoEm : null,
      terminou: avancou.ok ? avancou.terminou : false,
    };
  }

  const criada = await criarTarefaDoPasso(db, passo, agora);
  if (!criada) {
    return { desfecho: "pendente", motivo: "naoConseguiuCriarTarefa", detalhe: "a tarefa do passo foi recusada" };
  }

  const avancou = await avancarCadencia(db, { leadCadenciaId: passo.leadCadenciaId, agora });
  return {
    desfecho: "executou",
    comoFez: "tarefa",
    proximoEm: avancou.ok ? avancou.proximoEm : null,
    terminou: avancou.ok ? avancou.terminou : false,
  };
}

/**
 * Cria a tarefa do passo, sem duplicar.
 *
 * O dedupe é por (lead, cadência, título, ABERTA): a rodada pode rodar duas
 * vezes no mesmo dia — já aconteceu nesta casa — e duas tarefas idênticas
 * abertas fazem duas pessoas ligarem para o mesmo contato.
 */
async function criarTarefaDoPasso(
  db: PrismaClient,
  passo: PassoVencido & { cadenciaSlug: string },
  agora: Date,
): Promise<boolean> {
  const jaTem = await db.leadTarefa.findFirst({
    where: {
      leadId: passo.leadId,
      cadenciaId: passo.leadCadenciaId,
      titulo: passo.titulo,
      situacao: "ABERTA",
    },
    select: { id: true },
  });
  if (jaTem) return true;

  const r = await criarTarefa(
    db,
    {
      leadId: passo.leadId,
      titulo: passo.titulo,
      venceEm: agora,
      tipo: passo.tipo,
      nota: passo.roteiro,
      criadaPor: passo.executor,
      cadenciaId: passo.leadCadenciaId,
    },
    agora,
  );

  return r.ok;
}

/** O pulo fica escrito. Passo que some sem registro vira cadência inexplicável. */
async function registrarPuloNaConversa(
  db: Cliente,
  leadId: string,
  porque: string,
  autor: "HUMANO" | "SISTEMA",
): Promise<void> {
  await db.siteLeadInteraction.create({
    data: { leadId, tipo: "NOTA_INTERNA", actor: autor === "SISTEMA" ? "crm-ia" : "humano", nota: porque, interna: true },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// A RODADA
// ─────────────────────────────────────────────────────────────────────────────

export interface PendenciaDaRodada {
  leadId: string;
  passo: number;
  titulo: string;
  motivo: string;
  detalhe: string;
}

export interface ResultadoDaRodadaDeCadencia {
  vistos: number;
  executados: number;
  pulados: number;
  parados: number;
  /** ⭐ O que a trava recusou. Fica visível — recusa silenciosa é recusa perdida. */
  pendentes: PendenciaDaRodada[];
}

/**
 * Roda os passos vencidos.
 *
 * O `slug` da cadência é buscado aqui porque `passosVencidos()` não o devolve —
 * e é ele que indexa o catálogo de condições. Buscar por inscrição seria uma
 * consulta por passo; buscar as cadências de uma vez é uma só.
 */
export async function rodarCadencias(
  db: PrismaClient,
  opcoes: OpcoesDaRodada,
): Promise<ResultadoDaRodadaDeCadencia> {
  const agora = opcoes.agora ?? new Date();
  const vencidos = await passosVencidos(db, agora, opcoes.limite ?? 100);

  const inscricoes = await db.leadCadencia.findMany({
    where: { id: { in: vencidos.map((v) => v.leadCadenciaId) } },
    select: { id: true, cadencia: { select: { slug: true } } },
  });
  const slugPorInscricao = new Map(inscricoes.map((i) => [i.id, i.cadencia.slug]));

  const saida: ResultadoDaRodadaDeCadencia = {
    vistos: vencidos.length,
    executados: 0,
    pulados: 0,
    parados: 0,
    pendentes: [],
  };

  for (const v of vencidos) {
    const slug = slugPorInscricao.get(v.leadCadenciaId);
    // Sem slug não há como saber qual condição vale. Executar assim mesmo
    // aplicaria "sem condição" a um passo que talvez tenha uma — e a régua
    // verde no lugar errado é pior que régua nenhuma. Vira pendência.
    if (!slug) {
      saida.pendentes.push({
        leadId: v.leadId,
        passo: v.passo,
        titulo: v.titulo,
        motivo: "cadenciaSemSlug",
        detalhe: "a inscrição não devolveu a cadência — a condição do passo não pôde ser conferida",
      });
      continue;
    }

    const r = await executarPasso(db, { ...v, cadenciaSlug: slug }, { ...opcoes, agora });

    if (r.desfecho === "executou") saida.executados += 1;
    else if (r.desfecho === "pulou") saida.pulados += 1;
    else if (r.desfecho === "parou") saida.parados += 1;
    else if (r.desfecho === "pendente") {
      saida.pendentes.push({
        leadId: v.leadId,
        passo: v.passo,
        titulo: v.titulo,
        motivo: r.motivo,
        detalhe: r.detalhe,
      });
    }
  }

  return saida;
}
