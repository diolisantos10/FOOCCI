/**
 * O FUNIL DE DISPAROS DO CRM DO RESTAURANTE — quantas saíram, e onde pararam as outras.
 *
 * ⚠️ Isto é o CRM **do restaurante** (o restaurante falando com os clientes DELE),
 * não a área comercial da Foocci. A fonte é `campaign_executions`, a mesma tabela
 * que as travas de segurança consultam — contar por outro caminho seria inventar
 * uma segunda verdade.
 *
 * SOMENTE LEITURA. Todas as consultas são `count` / `findMany` / `groupBy`.
 * Nenhum envio, nenhuma escrita, nenhuma campanha criada, pausada ou promovida.
 * Isso é MEDIDO por `contrato.test.ts` nesta mesma pasta, que lê este fonte.
 *
 * ── O QUE ELE RESPONDE, NESTA ORDEM ─────────────────────────────────────────
 *  1. O NÚMERO REAL: mensagens que saíram na janela, por restaurante.
 *  2. OS DEGRAUS: cada linha da tabela recebeu uma decisão, e a decisão fica
 *     gravada em `status` + `errorMessage`. Este relatório agrupa por ela.
 *  3. A CADÊNCIA: quantos ciclos de fato produziram atividade, e quando foi a
 *     última — o portão `minMinutesBetweenCycles` é contado a partir daí.
 *  4. O TETO EFETIVO: o que está ENFORCED hoje (não o que está salvo na tela).
 *
 * ── O QUE ELE NÃO MEDE, E POR QUÊ ───────────────────────────────────────────
 * Quem NUNCA virou linha em `campaign_executions` não deixou rastro: o
 * candidato que a consulta de audiência cortou (`resolveAudience` corta em 500)
 * ou que ficou fora do `batchCap` do ciclo não é gravado em lugar nenhum. Esse
 * degrau sai como `naoMedido`, com o motivo escrito — ausência de informação
 * não é informação.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import { applyEffectiveSafety, parseSafetyConfig } from "@/lib/crm-safety";
import { montarContaDoDia, type ContaDoDia, type DegrauContado } from "./contaDoDia";

/** Cliente Prisma, ou qualquer coisa com a mesma forma (o teste injeta um duplo). */
export type LeitorDoBanco = Pick<PrismaClient,
  "campaignExecution" | "campaign" | "customer" | "restaurantCRMProfile" | "crmCicloFunil">;

/** Os status que significam "a mensagem saiu". Mesma lista das travas. */
export const STATUS_DE_ENVIO = ["SENT", "DELIVERED", "READ"] as const;

export interface ContagemPorMotivo {
  /** Código de máquina gravado em `errorMessage` (ou `SEM_CODIGO`). */
  codigo: string;
  quantidade: number;
}

export interface DegrauDoFunil {
  degrau: string;
  quantidade: number;
  porMotivo?: ContagemPorMotivo[];
}

export interface LacunaNaoMedida {
  degrau: string;
  motivo: string;
}

export interface FunilDoRestaurante {
  restaurantId: string;
  /** 1. O número real: mensagens que saíram na janela. */
  enviadas: number;
  /** 2. Onde pararam as outras — um degrau por decisão gravada. */
  degraus: DegrauDoFunil[];
  /** Soma de TODAS as linhas da janela (enviadas + todos os degraus). */
  totalDeDecisoes: number;
  /** 3. Cadência: atividade do CRM na janela. */
  cadencia: {
    ultimaAtividadeEm: string | null;
    /** Minutos distintos em que houve atividade — piso do número de ciclos úteis. */
    minutosComAtividade: number;
  };
  /** 4. Teto EFETIVO (enforced), não o que está salvo na tela. */
  tetos: {
    diarioGlobal: number;
    porCiclo: number;
    minutosEntreCiclos: number;
    overrideManual: boolean;
    cooldownHorasPorCliente: number;
    maxPorSemanaPorCliente: number;
    horarioQuieto: string | null;
  };
  /** A base: quem sequer poderia receber. */
  base: {
    clientes: number;
    optOut: number;
    semTelefoneUtil: number;
  };
  /** Campanhas ACTIVE/SCHEDULED e o que cada uma produziu na janela. */
  campanhas: Array<{
    campaignId: string;
    nome: string;
    status: string;
    templateId: string | null;
    ultimaRodadaEm: string | null;
    enviadasNaJanela: number;
    decisoesNaJanela: number;
  }>;
  /**
   * A CONTA DO DIA: de quantos eu podia, quantos mandei, e para cada um que não
   * mandei, qual regra barrou — com a invariante conferida, não afirmada.
   */
  contaDoDia: ContaDoDia;
  /** O que esta fonte NÃO consegue responder, com o motivo. */
  naoMedido: LacunaNaoMedida[];
}

export interface RaioXDeDisparos {
  janela: { desde: string; ate: string };
  restaurantes: FunilDoRestaurante[];
  /** Somatório entre restaurantes — o número que o CEO pergunta. */
  totais: { enviadas: number; decisoes: number; restaurantes: number };
  naoMedidoGlobal: LacunaNaoMedida[];
}

const SEM_CODIGO = "SEM_CODIGO";

/** As lacunas que valem para qualquer restaurante — declaradas, não omitidas. */
const LACUNAS_ESTRUTURAIS: LacunaNaoMedida[] = [
  {
    degrau: "candidato cortado pelo teto de audiência (500 por consulta)",
    motivo:
      "`resolveAudience` aplica `take: 500` DENTRO da consulta. Quem fica fora " +
      "desse corte não é devolvido a ninguém e não vira elegível nem degrau. " +
      "⚠️ O OUTRO corte deste degrau — o `batchCap` do ciclo — DEIXOU de ser " +
      "lacuna em 17/09/2026: agora é gravado em `crm_ciclo_funil` e aparece em " +
      "`contaDoDia.cortadosAntesDoBanco`.",
  },
  {
    degrau: "ciclo que nem chegou a rodar",
    motivo:
      "O portão `minMinutesBetweenCycles` devolve o ciclo inteiro sem gravar nada. " +
      "O número de ciclos pulados só existe no log do processo, não no banco.",
  },
  {
    degrau: "campanha fora da janela de dia/hora",
    motivo:
      "`isCampaignDueNow` recusa antes de qualquer escrita. Sem linha, sem contagem.",
  },
];

function contarPorMotivo(
  linhas: Array<{ errorMessage: string | null }>,
): ContagemPorMotivo[] {
  const mapa = new Map<string, number>();
  for (const l of linhas) {
    const chave = l.errorMessage?.trim() || SEM_CODIGO;
    mapa.set(chave, (mapa.get(chave) ?? 0) + 1);
  }
  return [...mapa.entries()]
    .map(([codigo, quantidade]) => ({ codigo, quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade);
}

/**
 * "Para cada um que não mandei, QUAL regra o barrou."
 *
 * Todo veredito que não é envio vira um degrau nomeado `STATUS:CODIGO` — o
 * status diz a família (bloqueio de segurança, falha de canal, pulo de cadastro)
 * e o código diz a regra exata (CUSTOMER_OPTED_OUT, MISSING_PHONE, ...).
 * PENDING entra também: linha sem veredito ainda é alguém que não recebeu, e
 * varrê-la para debaixo do tapete é justamente como um degrau vira invisível.
 */
function contarBarradosPorRegra(
  linhas: Array<{ status: string; errorMessage: string | null }>,
): DegrauContado[] {
  const mapa = new Map<string, number>();
  for (const l of linhas) {
    if ((STATUS_DE_ENVIO as readonly string[]).includes(l.status)) continue;
    const chave = `${l.status}:${l.errorMessage?.trim() || SEM_CODIGO}`;
    mapa.set(chave, (mapa.get(chave) ?? 0) + 1);
  }
  return [...mapa.entries()].map(([degrau, quantidade]) => ({ degrau, quantidade }));
}

function horarioQuieto(cfg: { quietHoursEnabled: boolean; quietHoursStart: string; quietHoursEnd: string; timezone: string }): string | null {
  if (!cfg.quietHoursEnabled) return null;
  return `${cfg.quietHoursStart}–${cfg.quietHoursEnd} (${cfg.timezone})`;
}

/**
 * Monta o funil. `desde`/`ate` delimitam a janela; `ate` é exclusivo.
 * `restaurantIds` vazio = todos os restaurantes com atividade na janela.
 */
export async function raioXDeDisparos(
  db: LeitorDoBanco,
  opcoes: { desde: Date; ate: Date; restaurantIds?: string[] },
): Promise<RaioXDeDisparos> {
  const { desde, ate } = opcoes;
  const janela: Prisma.DateTimeFilter = { gte: desde, lt: ate };

  // Quem teve atividade na janela. `restaurantId` é desnormalizado e pode ser
  // nulo em linhas antigas: essas caem em "(sem restaurante)" em vez de sumir.
  const linhasDaJanela = await db.campaignExecution.findMany({
    where: {
      createdAt: janela,
      ...(opcoes.restaurantIds?.length ? { restaurantId: { in: opcoes.restaurantIds } } : {}),
    },
    select: {
      restaurantId: true, campaignId: true, status: true,
      errorMessage: true, sentAt: true, createdAt: true,
    },
  });

  const porRestaurante = new Map<string, typeof linhasDaJanela>();
  for (const l of linhasDaJanela) {
    const chave = l.restaurantId ?? "(sem restaurante)";
    const arr = porRestaurante.get(chave) ?? [];
    arr.push(l);
    porRestaurante.set(chave, arr);
  }
  for (const rid of opcoes.restaurantIds ?? []) {
    if (!porRestaurante.has(rid)) porRestaurante.set(rid, []);
  }

  const restaurantes: FunilDoRestaurante[] = [];

  for (const [rid, linhas] of porRestaurante) {
    const real = rid !== "(sem restaurante)";

    const perfil = real
      ? await db.restaurantCRMProfile.findUnique({
          where: { restaurantId: rid },
          select: { whatsAppSafetyConfig: true },
        })
      : null;
    const cfg = applyEffectiveSafety(parseSafetyConfig(perfil?.whatsAppSafetyConfig));

    const enviadas = linhas.filter((l) => (STATUS_DE_ENVIO as readonly string[]).includes(l.status)).length;

    const degraus: DegrauDoFunil[] = [];
    for (const status of ["BLOCKED", "FAILED", "SKIPPED", "PENDING"] as const) {
      const doStatus = linhas.filter((l) => l.status === status);
      if (doStatus.length === 0) continue;
      degraus.push({
        degrau: status,
        quantidade: doStatus.length,
        porMotivo: contarPorMotivo(doStatus),
      });
    }

    const minutos = new Set(linhas.map((l) => l.createdAt.toISOString().slice(0, 16)));
    const ultima = linhas.reduce<Date | null>(
      (mx, l) => (mx === null || l.createdAt > mx ? l.createdAt : mx), null);

    const [clientes, optOut, semTelefone] = real
      ? await Promise.all([
          db.customer.count({ where: { restaurantId: rid } }),
          db.customer.count({ where: { restaurantId: rid, hasOptedOut: true } }),
          db.customer.count({ where: { restaurantId: rid, crmContactable: false } }),
        ])
      : [0, 0, 0];

    // O degrau que antes sumia: o corte do `batchCap`, agora gravado pelo runner.
    // Sem rodada registrada na janela, `temRodada` é false — e aí a conta NÃO se
    // declara fechada, em vez de inventar um zero.
    const rodadas = real
      ? await db.crmCicloFunil.findMany({
          where:  { restaurantId: rid, ocorridoEm: janela },
          select: { campaignId: true, elegiveis: true, noLote: true, cortados: true },
        })
      : [];
    const campanhasMedidas = new Set(rodadas.map((r) => r.campaignId));
    const cortesDoCiclo = {
      temRodada: rodadas.length > 0,
      elegiveis: rodadas.reduce((s, r) => s + r.elegiveis, 0),
      cortados:  rodadas.reduce((s, r) => s + r.cortados, 0),
    };
    // Só as linhas das campanhas MEDIDAS entram na invariante (ver contaDoDia).
    const linhasMedidas = linhas.filter((l) => campanhasMedidas.has(l.campaignId));

    const ativas = real
      ? await db.campaign.findMany({
          where: { restaurantId: rid, status: { in: ["ACTIVE", "SCHEDULED"] as never[] } },
          select: { id: true, name: true, status: true, templateId: true, lastRunAt: true },
        })
      : [];

    const campanhas = ativas.map((c) => {
      const suas = linhas.filter((l) => l.campaignId === c.id);
      return {
        campaignId: c.id,
        nome: c.name,
        status: String(c.status),
        templateId: c.templateId,
        ultimaRodadaEm: c.lastRunAt ? c.lastRunAt.toISOString() : null,
        enviadasNaJanela: suas.filter((l) => (STATUS_DE_ENVIO as readonly string[]).includes(l.status)).length,
        decisoesNaJanela: suas.length,
      };
    });

    restaurantes.push({
      restaurantId: rid,
      enviadas,
      degraus,
      totalDeDecisoes: linhas.length,
      cadencia: {
        ultimaAtividadeEm: ultima ? ultima.toISOString() : null,
        minutosComAtividade: minutos.size,
      },
      tetos: {
        diarioGlobal: cfg.dailyGlobalCap,
        porCiclo: cfg.crmWhatsAppSafety.globalCycleLimit,
        minutosEntreCiclos: cfg.crmWhatsAppSafety.minMinutesBetweenCycles,
        overrideManual: cfg.manualOverride,
        cooldownHorasPorCliente: cfg.customerCooldownHours,
        maxPorSemanaPorCliente: cfg.maxPerWeekPerCustomer,
        horarioQuieto: horarioQuieto(cfg),
      },
      base: { clientes, optOut, semTelefoneUtil: semTelefone },
      campanhas,
      contaDoDia: montarContaDoDia({
        restaurantId: rid,
        tetoDiario:   cfg.dailyGlobalCap,
        enviadasHoje: enviadas,
        enviadasNoCiclo: linhasMedidas.filter(
          (l) => (STATUS_DE_ENVIO as readonly string[]).includes(l.status)).length,
        // Cada degrau GRAVADO vira uma entrada por motivo de máquina — é assim
        // que "para cada um que não mandei, QUAL regra o barrou" vira número.
        barrados:     contarBarradosPorRegra(linhasMedidas),
        cortadosAntesDoBanco: cortesDoCiclo.cortados > 0
          ? [{ degrau: "CORTADO_ANTES_DO_BANCO", quantidade: cortesDoCiclo.cortados }]
          : [],
        elegiveisMedidos: cortesDoCiclo.temRodada ? cortesDoCiclo.elegiveis : null,
      }),
      naoMedido: LACUNAS_ESTRUTURAIS,
    });
  }

  restaurantes.sort((a, b) => b.enviadas - a.enviadas || b.totalDeDecisoes - a.totalDeDecisoes);

  return {
    janela: { desde: desde.toISOString(), ate: ate.toISOString() },
    restaurantes,
    totais: {
      enviadas: restaurantes.reduce((s, r) => s + r.enviadas, 0),
      decisoes: restaurantes.reduce((s, r) => s + r.totalDeDecisoes, 0),
      restaurantes: restaurantes.length,
    },
    naoMedidoGlobal: LACUNAS_ESTRUTURAIS,
  };
}
