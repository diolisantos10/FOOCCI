/**
 * A PONTE — o pedaço que faltava entre "temos o contato" e "a mensagem saiu".
 *
 * ── O BURACO, LEVANTADO EM 07/09/2026 ───────────────────────────────────────
 *
 * A máquina de prospecção da casa está inteira: importação de lote, base legal
 * obrigatória, portão de abordagem fria, teto diário, interruptor, tela. E era
 * **toda de leitura**. Nada nela alcançava o envio. Uma casa que sabe dizer
 * quem abordar e não sabe abordar.
 *
 * Este arquivo é o único caminho por onde uma abordagem sai. Um só, de
 * propósito: dois caminhos para falar com estranho é como se perde a conta do
 * que a empresa disse a quem.
 *
 * ── AS CINCO TRAVAS, NESTA ORDEM E POR ESTE MOTIVO ─────────────────────────
 *
 *   1. **O portão do lead** — fala do DESTINATÁRIO: pediu silêncio? tem
 *      telefone? o consentimento ainda vale? já tentamos demais?
 *   2. **O freio de ritmo** — fala de NÓS: quantas já saíram nesta hora e neste
 *      dia. Vem depois do portão porque recusar por ritmo alguém que nem podia
 *      ser abordado esconderia o motivo verdadeiro.
 *   3. **Gravar antes de enviar** — o pior caso vira uma linha PENDENTE
 *      visível, e não um cliente que recebeu sem o sistema saber.
 *   4. **A Supervisora** (desde 12/09/2026) — uma SEGUNDA opinião, agora com a
 *      linha PENDENTE já existindo, sobre se ESTE É O MOMENTO de mandar o
 *      template a ESTE lead (frequência, repetição, opt-out). Ela nunca
 *      reescreve o template — só libera ou barra. Ver
 *      `supervisora/adequacaoDoTemplate.ts`; em OFF/SHADOW nunca impede.
 *   5. **A entrega** — e o resultado dela é registrado na própria linha, com o
 *      motivo por escrito quando a Meta recusa.
 *
 * ── ⚠️ O QUE ESTE ARQUIVO NÃO FAZ ──────────────────────────────────────────
 *
 * **Não percorre lista.** Ele aborda UM lead. Quem varre uma lista chamando
 * isto em laço é outro arquivo, e é lá que mora a decisão de quantos por vez —
 * com o freio dizendo não muito antes de a lista acabar.
 */

import type { PrismaClient, Prisma } from "@prisma/client";
import { registrarSaida, confirmarEnvio, registrarFalhaDeEnvio } from "./conversa";
import { conferirRitmo } from "./freioDeRitmo";
import {
  avaliarContatoDeLead,
  avaliarAbordagemDeProspeccao,
  recusaDeProspeccao,
  recusaDeSilencio,
  pediuSilencio,
  REGRA,
  type LeadSafetyDecision,
  type LeadBlockReason,
} from "@/services/foocci-sdr/LeadContactSafety";
import { contarAbordagensDeHoje } from "./prospeccao/selecao";
import { parametrosDoEnvioAgora } from "@/services/foocci-sdr/modelosDaMeta";
import { escolherModeloLiberado } from "@/services/foocci-sdr/modelosLiberados";
import {
  canalDeVendasPronto,
  enviarModeloDeVendas,
  type ModeloDeAbordagem,
} from "@/services/foocci-sdr/FoocciSalesChannel";
import { avaliarAdequacaoDoTemplate, type HistoricoDeAbordagens } from "./supervisora/adequacaoDoTemplate";

type Cliente = PrismaClient | Prisma.TransactionClient;

export type ResultadoDaAbordagem =
  | { abordou: true; mensagemId: string }
  | {
      abordou: false;
      motivo:
        | "leadNaoExiste"
        /** O portão do lead recusou. `detalhe` traz o motivo declarado por ele. */
        | "portaoRecusou"
        /** O modelo exige uma variável que este contato não tem. Linha ruim da lista, não defeito do canal. */
        | "semDadoParaOModelo"
        /** Teto de abordagens da hora ou do dia. Não é falha — é o freio. */
        | "ritmo"
        | "naoConseguiuGravar"
        | "aMetaRecusou"
        /** A Supervisora avaliou o momento/frequência desta abordagem e
         *  impediu o envio (GUARD/INTERVENTION). Ver
         *  `supervisora/adequacaoDoTemplate.ts` — o texto do template NUNCA é
         *  alterado por ela; só liberado ou barrado. Em SHADOW/OFF este
         *  motivo nunca acontece. */
        | "supervisoraRecusou";
      detalhe: string;
    };

/**
 * O modelo configurado para abordagem.
 *
 * Mantido para conferências e compatibilidade com rotinas antigas. O envio real
 * da Sala não confia mais neste valor: ele sorteia somente entre os modelos
 * APPROVED que o operador marcou como "Pode enviar".
 */
export function modeloConfigurado(env: NodeJS.ProcessEnv = process.env): {
  nome: string;
  idioma: string;
} {
  return {
    nome: (env.FOOCCI_SDR_MODELO_ABORDAGEM ?? "").trim(),
    idioma: (env.FOOCCI_SDR_MODELO_IDIOMA ?? "pt_BR").trim(),
  };
}

/**
 * O primeiro nome, para `{{1}}`.
 *
 * ⚠️ Função separada e exportada de propósito. Quando o texto exato do modelo
 * chegar da Meta, é AQUI que a ordem e a quantidade das variáveis mudam — e o
 * teste que guarda isso não precisa saber de banco nem de envio.
 *
 * Nome vazio vira `null`, e não string vazia: `enviarModeloDeVendas` recusa
 * variável vazia, e é melhor não mandar do que mandar "Olá , tudo bem?".
 */
export function primeiroNome(nome: string | null | undefined): string | null {
  const limpo = (nome ?? "").trim();
  if (!limpo) return null;

  // Lead cujo "nome" é o próprio telefone não vira saudação. Chamar alguém de
  // "5511" é pior que não chamar pelo nome.
  if (/^[\d\s()+-]+$/.test(limpo)) return null;

  return limpo.split(/\s+/)[0] ?? null;
}

/**
 * ⭐ A SAUDAÇÃO DO MODELO — e por que ela não é `primeiroNome` para todo mundo.
 *
 * ── O DEFEITO QUE ISTO EVITA, medido no arquivo de 4.880 contatos ───────────
 *
 * A lista de prospecção é de ESTABELECIMENTOS, não de pessoas. A coluna "Nome"
 * traz `.it Pizza`, `100% Espetos`, `Bar do Zé`. Cortar no primeiro espaço, que
 * é o certo para gente, produz:
 *
 *     "Olá .it"        "Olá 100%"        "Olá Bar"
 *
 * Isso é pior que não saudar: parece defeito, porque é. E a lista tem 4.880.
 *
 * ── COMO A DECISÃO É TOMADA SEM ADIVINHAR ───────────────────────────────────
 *
 * Não por heurística de texto ("parece nome de empresa?"), que erraria em
 * "Marina Gambarini Restaurante" e em "Zé". Pela PROVENIÊNCIA, que o dado já
 * carrega: `fonte = LISTA_PROSPECCAO` é uma lista de negócios; um lead do
 * formulário do site é uma pessoa que digitou o próprio nome.
 *
 * O guarda contra telefone-como-nome continua valendo nos dois casos.
 */
export function saudacaoDoLead(lead: {
  nome: string | null;
  restaurante: string | null;
  fonte: string | null;
}): string | null {
  if (lead.fonte === "LISTA_PROSPECCAO") {
    const bruto = (lead.restaurante ?? lead.nome ?? "").trim();
    if (!bruto) return null;
    if (/^[\d\s()+-]+$/.test(bruto)) return null;
    return bruto;
  }

  return primeiroNome(lead.nome);
}

export function resumoDoModelo(modelo: ModeloDeAbordagem): string {
  const vars = modelo.parametros.length ? ` (${modelo.parametros.join(" · ")})` : "";
  return `[modelo: ${modelo.nome}]${vars}`;
}

export function renderizarCorpoDoModelo(
  corpo: string,
  parametros: string[],
): { ok: true; texto: string } | { ok: false; falta: string } {
  const texto = corpo.replace(/\{\{(\d+)\}\}/g, (marcador, numero: string) => {
    const valor = parametros[Number(numero) - 1];
    return valor == null || valor.trim() === "" ? marcador : valor;
  });

  const pendente = texto.match(/\{\{\d+\}\}/)?.[0];
  if (pendente) return { ok: false, falta: `não foi possível renderizar ${pendente} do modelo aprovado` };
  return { ok: true, texto };
}

interface LeadParaAbordar {
  id: string;
  nome: string | null;
  whatsapp: string | null;
  optOutAt: Date | null;
  consentAt: Date | null;
  createdAt: Date;
  lastContactedAt: Date | null;
  restaurante: string | null;
  fonte: string | null;
  cidade: string | null;
}

const SELECT_LEAD_PARA_ABORDAR = {
  id: true,
  nome: true,
  whatsapp: true,
  optOutAt: true,
  consentAt: true,
  createdAt: true,
  lastContactedAt: true,
  restaurante: true,
  fonte: true,
  cidade: true,
} as const;

export const FONTE_DE_LISTA = "LISTA_PROSPECCAO";

type PortaoDoLead =
  | { portao: "morno" }
  | { portao: "frio"; baseLegal: string; prospeccaoLiberada: boolean; descansoHoras: number }
  | { portao: "recusado"; decisao: LeadSafetyDecision };

export async function escolherPortaoDoLead(
  db: Cliente,
  lead: { id: string; fonte: string | null; optOutAt: Date | null },
  agora: Date,
): Promise<PortaoDoLead> {
  if (pediuSilencio(lead.optOutAt)) {
    return {
      portao: "recusado",
      decisao: recusaDeSilencio(),
    };
  }

  if (lead.fonte !== FONTE_DE_LISTA) return { portao: "morno" };

  const item = await db.itemDeProspeccao.findFirst({
    where: { leadId: lead.id },
    orderBy: { criadoEm: "desc" },
    select: { lote: { select: { situacao: true, proveniencia: true } } },
  });

  if (!item) {
    return {
      portao: "recusado",
      decisao: recusaDeProspeccao(
        "PROSPECCAO_SEM_BASE_LEGAL",
        "O lead diz vir de lista, e não há lote que o autorize — sem isso não se aborda ninguém.",
      ),
    };
  }

  const config = await db.prospeccaoConfig.findUnique({ where: { id: "singleton" } });
  const ligada = Boolean(config?.outboundLigado) && !config?.pausadoEm;
  const tetoDoDia = config?.limiteDiario ?? 0;
  const usadosHoje = ligada ? await contarAbordagensDeHoje(db, agora) : 0;

  return {
    portao: "frio",
    baseLegal: item.lote.proveniencia ?? "",
    prospeccaoLiberada: ligada && usadosHoje < tetoDoDia,
    descansoHoras: Math.max(REGRA.descansoHoras, config?.horasEntreAbordagens ?? REGRA.descansoHoras),
  };
}

async function avaliarPortaoDoLead(
  db: Cliente,
  lead: LeadParaAbordar,
  agora: Date,
): Promise<LeadSafetyDecision> {
  const tentativas = await db.leadMensagem.count({
    where: { leadId: lead.id, direcao: "SAIDA" },
  });

  const escolha = await escolherPortaoDoLead(db, lead, agora);

  return escolha.portao === "recusado"
    ? escolha.decisao
    : escolha.portao === "frio"
      ? avaliarAbordagemDeProspeccao({
          telefone: lead.whatsapp,
          optOutAt: lead.optOutAt,
          tentativas,
          ultimoContatoEm: lead.lastContactedAt,
          historicoConhecido: true,
          canalPronto: canalDeVendasPronto(),
          prospeccaoLiberada: escolha.prospeccaoLiberada,
          baseLegalDeclarada: escolha.baseLegal,
          descansoHoras: escolha.descansoHoras,
          agora,
        })
      : avaliarContatoDeLead({
          telefone: lead.whatsapp,
          optOutAt: lead.optOutAt,
          consentimentoEm: lead.consentAt,
          tentativas,
          ultimoContatoEm: lead.lastContactedAt,
          historicoConhecido: true,
          canalPronto: canalDeVendasPronto(),
          agora,
        });
}

export async function abordarLead(
  db: Cliente,
  params: {
    leadId: string;
    autor: "HUMANO" | "SISTEMA";
    autorUserId: string;
    agora?: Date;
  },
): Promise<ResultadoDaAbordagem> {
  const agora = params.agora ?? new Date();

  const lead = (await db.siteLead.findUnique({
    where: { id: params.leadId },
    select: SELECT_LEAD_PARA_ABORDAR,
  })) as LeadParaAbordar | null;

  if (!lead) {
    return { abordou: false, motivo: "leadNaoExiste", detalhe: params.leadId };
  }

  const decisao = await avaliarPortaoDoLead(db, lead, agora);

  if (!decisao.sendable) {
    return {
      abordou: false,
      motivo: "portaoRecusou",
      detalhe: `${decisao.reason ?? "sem motivo"}: ${decisao.detail ?? ""}`.trim(),
    };
  }

  const ritmo = await conferirRitmo(db, agora);
  if (!ritmo.pode) {
    return { abordou: false, motivo: "ritmo", detalhe: ritmo.detalhe };
  }

  // A escolha fixa por variável de ambiente foi removida do caminho real de
  // envio. O único grupo elegível é APPROVED na Meta + "Pode enviar" ligado.
  // Sem nenhum modelo nesse grupo, falha fechado: nada sai e não existe fallback.
  const modeloPersistido = await escolherModeloLiberado(db);
  if (!modeloPersistido) {
    return {
      abordou: false,
      motivo: "semDadoParaOModelo",
      detalhe: "nenhum modelo aprovado está marcado como Pode enviar; nada foi enviado",
    };
  }

  const montagem = montarParametros(modeloPersistido.variaveis, {
    ...lead,
    proveniencia: await provenienciaDoLead(db, lead),
  });
  if (!montagem.ok) {
    return { abordou: false, motivo: "semDadoParaOModelo", detalhe: montagem.falta };
  }

  const modelo: ModeloDeAbordagem = {
    nome: modeloPersistido.nome,
    idioma: modeloPersistido.idioma,
    parametros: montagem.parametros,
  };

  const textoIntegral = renderizarCorpoDoModelo(modeloPersistido.corpo, modelo.parametros);
  if (!textoIntegral.ok) {
    return { abordou: false, motivo: "semDadoParaOModelo", detalhe: textoIntegral.falta };
  }

  const historico = await historicoDeAbordagens(db, lead.id, lead.optOutAt);

  const gravada = await registrarSaida(db, {
    leadId: lead.id,
    texto: textoIntegral.texto,
    autor: params.autor,
    autorUserId: params.autorUserId,
    tipo: "TEMPLATE",
    templateNome: modelo.nome || null,
    agora,
  });

  if (!gravada.ok) {
    const porque = gravada.causa === "naoGravou" ? `naoGravou: ${gravada.detalhe}` : gravada.causa;
    return { abordou: false, motivo: "naoConseguiuGravar", detalhe: porque };
  }

  const revisaoDoTemplate = await avaliarAdequacaoDoTemplate(db, {
    mensagemId: gravada.mensagemId,
    leadId: lead.id,
    autor: params.autor,
    autorUserId: params.autorUserId,
    historico,
    agora,
  });

  if (!revisaoDoTemplate.prosseguir) {
    return {
      abordou: false,
      motivo: "supervisoraRecusou",
      detalhe: revisaoDoTemplate.motivoDeRetencao ?? "retido pela Supervisora",
    };
  }

  const envio = await enviarModeloDeVendas(decisao, lead.whatsapp ?? "", modelo);

  if (!envio.ok) {
    await registrarFalhaDeEnvio(db, {
      mensagemId: gravada.mensagemId,
      erro: envio.error ?? "erro sem motivo",
    });
    return { abordou: false, motivo: "aMetaRecusou", detalhe: envio.error ?? "erro sem motivo" };
  }

  await confirmarEnvio(db, {
    mensagemId: gravada.mensagemId,
    waMessageId: envio.providerMessageId ?? `local:${gravada.mensagemId}`,
  });

  return { abordou: true, mensagemId: gravada.mensagemId };
}

type LeadParaOsParametros = {
  nome: string | null;
  restaurante: string | null;
  fonte: string | null;
  cidade?: string | null;
  proveniencia?: string | null;
};

function camposDoModelo(lead: LeadParaOsParametros): Array<{ rotulo: string; valor: string | null }> {
  return [
    {
      rotulo: "nome do contato",
      valor: saudacaoDoLead(lead),
    },
    { rotulo: "nome do restaurante", valor: (lead.restaurante ?? "").trim() || null },
    { rotulo: "procedência da lista", valor: (lead.proveniencia ?? "").trim() || null },
  ];
}

async function historicoDeAbordagens(
  db: Cliente,
  leadId: string,
  optOutAt: Date | null,
): Promise<HistoricoDeAbordagens> {
  const [tentativasAnteriores, ultima] = await Promise.all([
    db.leadMensagem.count({ where: { leadId, direcao: "SAIDA", tipo: "TEMPLATE" } }),
    db.leadMensagem.findFirst({
      where: { leadId, direcao: "SAIDA", tipo: "TEMPLATE" },
      orderBy: { ocorreuEm: "desc" },
      select: { ocorreuEm: true },
    }),
  ]);

  return {
    tentativasAnteriores,
    ultimaAbordagemEm: ultima?.ocorreuEm ?? null,
    optOutAt,
  };
}

async function provenienciaDoLead(db: Cliente, lead: LeadParaAbordar): Promise<string | null> {
  if (lead.fonte !== FONTE_DE_LISTA) return null;
  const item = await db.itemDeProspeccao.findFirst({
    where: { leadId: lead.id },
    orderBy: { criadoEm: "desc" },
    select: { lote: { select: { proveniencia: true } } },
  });
  return (item?.lote.proveniencia ?? "").trim() || null;
}

export function montarParametros(
  quantas: number,
  lead: LeadParaOsParametros,
): { ok: true; parametros: string[] } | { ok: false; falta: string } {
  if (quantas <= 0) return { ok: true, parametros: [] };

  const disponiveis = camposDoModelo(lead);

  if (quantas > disponiveis.length) {
    return {
      ok: false,
      falta: `o modelo pede ${quantas} variáveis e o sistema só sabe preencher ${disponiveis.length}`,
    };
  }

  const parametros: string[] = [];
  for (let i = 0; i < quantas; i++) {
    const campo = disponiveis[i]!;
    if (!campo.valor) {
      return { ok: false, falta: `este contato não tem ${campo.rotulo} para a variável {{${i + 1}}}` };
    }
    parametros.push(campo.valor);
  }

  return { ok: true, parametros };
}

export type ResultadoDoDiagnostico =
  | { leadId: string; pronto: false; motivo: "leadNaoExiste"; detalhe: string }
  | {
      leadId: string;
      pronto: false;
      motivo: "portaoRecusou";
      razao: LeadBlockReason | null;
      detalhe: string;
    }
  | {
      leadId: string;
      pronto: false;
      motivo: "semDadoParaOModelo";
      quantas: number;
      camposFaltando: string[];
      detalhe: string;
    }
  | { leadId: string; pronto: true; quantas: number; parametros: string[] };

export async function diagnosticarAbordagem(
  db: Cliente,
  params: { leadId: string; agora?: Date },
): Promise<ResultadoDoDiagnostico> {
  const agora = params.agora ?? new Date();

  const lead = (await db.siteLead.findUnique({
    where: { id: params.leadId },
    select: SELECT_LEAD_PARA_ABORDAR,
  })) as LeadParaAbordar | null;

  if (!lead) {
    return { leadId: params.leadId, pronto: false, motivo: "leadNaoExiste", detalhe: params.leadId };
  }

  const decisao = await avaliarPortaoDoLead(db, lead, agora);

  if (!decisao.sendable) {
    return {
      leadId: lead.id,
      pronto: false,
      motivo: "portaoRecusou",
      razao: decisao.reason,
      detalhe: `${decisao.reason ?? "sem motivo"}: ${decisao.detail ?? ""}`.trim(),
    };
  }

  const quantas = await parametrosDoEnvioAgora(db);
  const leadComProveniencia = {
    ...lead,
    proveniencia: await provenienciaDoLead(db, lead),
  };
  const montagem = montarParametros(quantas, leadComProveniencia);

  if (!montagem.ok) {
    const camposFaltando = camposDoModelo(leadComProveniencia)
      .slice(0, quantas)
      .filter((c) => !c.valor)
      .map((c) => c.rotulo);

    return {
      leadId: lead.id,
      pronto: false,
      motivo: "semDadoParaOModelo",
      quantas,
      camposFaltando,
      detalhe: montagem.falta,
    };
  }

  return { leadId: lead.id, pronto: true, quantas, parametros: montagem.parametros };
}
