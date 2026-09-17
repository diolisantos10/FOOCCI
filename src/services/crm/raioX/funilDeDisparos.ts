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

/** Cliente Prisma, ou qualquer coisa com a mesma forma (o teste injeta um duplo). */
export type LeitorDoBanco = Pick<PrismaClient,
  "campaignExecution" | "campaign" | "customer" | "restaurantCRMProfile">;

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
    degrau: "candidato cortado antes de virar linha",
    motivo:
      "`resolveAudience` corta a audiência em 500 por consulta e o ciclo ainda " +
      "aplica `batchCap`. Quem fica de fora não gera linha em campaign_executions, " +
      "então não existe contagem — só o tamanho do segmento, que é outra pergunta.",
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
