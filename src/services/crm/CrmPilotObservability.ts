/**
 * CrmPilotObservability — a leitura honesta do piloto do Agente de CRM.
 *
 * A escada (SHADOW_ONLY → ALLOWLIST → RESTAURANT_WIDE) já existe e já tem os
 * portões. O que faltava era enxergar: em que degrau cada restaurante está, o
 * que a prova A/B está dizendo, e — a parte que mais importa — SE JÁ DÁ PARA
 * CONCLUIR ALGUMA COISA.
 *
 * A regra que este arquivo defende é a mesma do CrmPhraseSelector: paciência.
 * Uma diferença de conversão com pouca amostra não é resultado, é ruído. Abrir
 * o agente para o restaurante inteiro por causa de 8 envios contra 6 seria o
 * jeito mais rápido de destruir a confiança do lojista.
 *
 * Por isso o veredito nunca é "o agente é melhor" com base em opinião: é um
 * teste z de duas proporções, determinístico, com o número na frente. Quando o
 * teste não conclui, ele diz que não conclui — que é uma resposta legítima e a
 * mais comum no começo.
 *
 * READ-ONLY por construção. Este arquivo NÃO promove, NÃO escreve config e NÃO
 * envia. Promover é decisão de gente, tomada com este relatório na mão.
 */

import { prisma } from "@/lib/prisma";
import { getCrmPilotConfig, type CrmPilotConfig, type CrmPilotMode } from "./CrmAgentPilotService";
import { runCrmPilotGates, type CrmPilotGates } from "./crmAgentGovernance";

/** A marca que o runner grava quando a mensagem foi composta pelo agente. */
export const CHAVE_DO_AGENTE = "agent:crm";

/** Envios mínimos em CADA braço antes de o teste ser levado a sério. */
export const MIN_POR_BRACO = 100;

/** |z| a partir do qual a diferença deixa de ser explicável por acaso (~95%). */
export const Z_CRITICO = 1.96;

const SENT_STATUSES = ["SENT", "DELIVERED", "READ"] as const;

export interface Braco {
  envios: number;
  conversoes: number;
  /** Taxa crua. Sem suavização: aqui o número é para julgar, não para ponderar. */
  taxa: number;
}

export type VereditoDoTeste = "AGENTE_MELHOR" | "CONTROLE_MELHOR" | "EMPATE" | "AMOSTRA_INSUFICIENTE";

export interface ComparacaoAB {
  agente: Braco;
  controle: Braco;
  /** Diferença relativa do agente sobre o controle, em %. null sem base. */
  liftPct: number | null;
  z: number | null;
  veredito: VereditoDoTeste;
  leitura: string;
}

function braco(envios: number, conversoes: number): Braco {
  return { envios, conversoes, taxa: envios > 0 ? conversoes / envios : 0 };
}

/**
 * Teste z de duas proporções.
 *
 * Escolhido por ser determinístico, sem dependência e auditável — dá para
 * conferir a conta na mão. Não é um estudo clínico: é o mínimo para separar
 * "o agente converte mais" de "essa semana deu sorte".
 */
export function zDeDuasProporcoes(a: Braco, b: Braco): number | null {
  if (a.envios <= 0 || b.envios <= 0) return null;
  const pAgrupado = (a.conversoes + b.conversoes) / (a.envios + b.envios);
  if (pAgrupado <= 0 || pAgrupado >= 1) return null;
  const erro = Math.sqrt(pAgrupado * (1 - pAgrupado) * (1 / a.envios + 1 / b.envios));
  if (erro === 0) return null;
  return (a.taxa - b.taxa) / erro;
}

/** Compara os dois braços e diz, em português, o que dá para afirmar. */
export function compararBracos(agente: Braco, controle: Braco): ComparacaoAB {
  const liftPct = controle.taxa > 0
    ? Number((((agente.taxa - controle.taxa) / controle.taxa) * 100).toFixed(1))
    : null;

  const faltaAgente   = Math.max(0, MIN_POR_BRACO - agente.envios);
  const faltaControle = Math.max(0, MIN_POR_BRACO - controle.envios);

  if (faltaAgente > 0 || faltaControle > 0) {
    return {
      agente, controle, liftPct, z: null,
      veredito: "AMOSTRA_INSUFICIENTE",
      leitura:
        `Ainda não dá para concluir nada. Faltam ${faltaAgente} envio(s) no braço do agente e ` +
        `${faltaControle} no do sorteio para chegar aos ${MIN_POR_BRACO} de cada lado. ` +
        "Diferença com pouca amostra é sorte, não resultado.",
    };
  }

  const z = zDeDuasProporcoes(agente, controle);
  if (z === null) {
    return {
      agente, controle, liftPct, z: null,
      veredito: "AMOSTRA_INSUFICIENTE",
      leitura: "Não houve conversão nenhuma nos dois braços — não há o que comparar ainda.",
    };
  }

  const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
  const base = `Agente ${pct(agente.taxa)} (${agente.conversoes}/${agente.envios}) × sorteio ${pct(controle.taxa)} (${controle.conversoes}/${controle.envios}).`;

  if (z >= Z_CRITICO) {
    return { agente, controle, liftPct, z: Number(z.toFixed(2)), veredito: "AGENTE_MELHOR",
      leitura: `${base} O agente converte mais, e a amostra sustenta a afirmação (z=${z.toFixed(2)}).` };
  }
  if (z <= -Z_CRITICO) {
    return { agente, controle, liftPct, z: Number(z.toFixed(2)), veredito: "CONTROLE_MELHOR",
      leitura: `${base} O SORTEIO está convertendo mais que o agente (z=${z.toFixed(2)}). Não promova — investigue.` };
  }
  return { agente, controle, liftPct, z: Number(z.toFixed(2)), veredito: "EMPATE",
    leitura: `${base} A diferença cabe dentro do acaso (z=${z.toFixed(2)}). Empate técnico — deixe rodar mais.` };
}

// ─────────────────────────────────────────────────────────────────────────────
//  As últimas decisões do agente — o "o que ele está fazendo" da casa dele
// ─────────────────────────────────────────────────────────────────────────────

export interface DecisaoRecente {
  quando: Date;
  /** SOMBRA = registrou sem enviar (brainShadowLog). ENVIO_REAL = saiu de verdade (campaignExecution). */
  origem: "SOMBRA" | "ENVIO_REAL";
  /** A situação que ele estava resolvendo (intent do runner ou nome da campanha). */
  situacao: string;
  /** O que ele enviou — ou enviaria, em sombra. */
  mensagem: string;
  /** Só em SOMBRA: veredito de coerência do crítico (PASS | FAIL | NEEDS_REVIEW). */
  coerencia: string | null;
  /** Só em SOMBRA: confiança declarada do raciocínio. */
  confianca: number | null;
  /** Só em ENVIO_REAL: status do envio (SENT | DELIVERED | READ | …). */
  status: string | null;
  /** Só em ENVIO_REAL: o cliente converteu depois da mensagem? */
  converteu: boolean | null;
}

/**
 * As últimas decisões do agente, misturando sombra e envio real em ordem
 * cronológica. Em SHADOW_ONLY só existem linhas de sombra; quando a allowlist
 * liga, os envios reais (variantKey = agent:crm) entram na mesma lista.
 * READ-ONLY como o resto do arquivo. Falha de leitura devolve lista vazia.
 */
export async function lerDecisoesRecentes(restaurantId: string, limit = 12): Promise<DecisaoRecente[]> {
  const take = Math.min(Math.max(1, limit), 50);

  const [sombra, reais] = await Promise.all([
    prisma.brainShadowLog.findMany({
      where: { restaurantId, agentId: "crm" },
      orderBy: { createdAt: "desc" },
      take,
      select: { createdAt: true, intent: true, coherence: true, confidence: true, wouldReply: true },
    }).catch(() => []),
    prisma.campaignExecution.findMany({
      where: { restaurantId, variantKey: CHAVE_DO_AGENTE },
      orderBy: { createdAt: "desc" },
      take,
      select: {
        createdAt: true, status: true, messageText: true, converted: true,
        campaign: { select: { name: true } },
      },
    }).catch(() => []),
  ]);

  const linhas: DecisaoRecente[] = [
    ...sombra.map((s): DecisaoRecente => ({
      quando: s.createdAt,
      origem: "SOMBRA",
      situacao: s.intent,
      mensagem: s.wouldReply,
      coerencia: s.coherence,
      confianca: s.confidence,
      status: null,
      converteu: null,
    })),
    ...reais.map((r): DecisaoRecente => ({
      quando: r.createdAt,
      origem: "ENVIO_REAL",
      situacao: r.campaign?.name ?? "campanha",
      mensagem: r.messageText ?? "",
      coerencia: null,
      confianca: null,
      status: String(r.status),
      converteu: r.converted,
    })),
  ];

  return linhas.sort((a, b) => b.quando.getTime() - a.quando.getTime()).slice(0, take);
}

// ─────────────────────────────────────────────────────────────────────────────
//  O relatório
// ─────────────────────────────────────────────────────────────────────────────

export type ProximoDegrau = "ALLOWLIST" | "RESTAURANT_WIDE" | null;

export interface ObservacaoDoPiloto {
  restaurantId: string;
  modo: CrmPilotMode;
  pausado: boolean;
  abTestPercent: number;
  telefonesNaAllowlist: number;
  proximoDegrau: ProximoDegrau;
  gates: CrmPilotGates | null;
  ab: ComparacaoAB;
  /** true só quando gates E prova A/B sustentam o próximo degrau. */
  prontoParaPromover: boolean;
  /** O que falta, em frases que o dono lê sem tradutor. */
  bloqueios: string[];
  veredito: string;
  /** Invariante: este relatório nunca muda nada. */
  runtimeTouched: false;
}

function proximoDe(modo: CrmPilotMode): ProximoDegrau {
  if (modo === "SHADOW_ONLY") return "ALLOWLIST";
  if (modo === "ALLOWLIST") return "RESTAURANT_WIDE";
  return null;
}

/** Os dois braços do A/B a partir das execuções reais. */
export async function lerBracos(restaurantId: string, desde?: Date): Promise<{ agente: Braco; controle: Braco }> {
  const base = {
    restaurantId,
    status: { in: SENT_STATUSES as unknown as never },
    ...(desde ? { createdAt: { gte: desde } } : {}),
  };

  const [envAgente, convAgente, envControle, convControle] = await Promise.all([
    prisma.campaignExecution.count({ where: { ...base, variantKey: CHAVE_DO_AGENTE } }),
    prisma.campaignExecution.count({ where: { ...base, variantKey: CHAVE_DO_AGENTE, converted: true } }),
    prisma.campaignExecution.count({ where: { ...base, NOT: { variantKey: CHAVE_DO_AGENTE } } }),
    prisma.campaignExecution.count({ where: { ...base, NOT: { variantKey: CHAVE_DO_AGENTE }, converted: true } }),
  ]);

  return { agente: braco(envAgente, convAgente), controle: braco(envControle, convControle) };
}

/**
 * O relatório do piloto de um restaurante.
 *
 * Junta três coisas que hoje moram em lugares diferentes: onde ele está na
 * escada, se os portões passam, e o que a prova A/B diz. Sem isso, promover
 * vira palpite — e promover no palpite foi o que este projeto inteiro existe
 * para evitar.
 */
export async function observarPiloto(restaurantId: string, desde?: Date): Promise<ObservacaoDoPiloto> {
  const config: CrmPilotConfig = await getCrmPilotConfig(restaurantId);
  const proximoDegrau = proximoDe(config.mode);

  const [bracos, gates] = await Promise.all([
    lerBracos(restaurantId, desde).catch(() => ({ agente: braco(0, 0), controle: braco(0, 0) })),
    proximoDegrau
      ? runCrmPilotGates(restaurantId, proximoDegrau).catch(() => null)
      : Promise.resolve(null),
  ]);

  const ab = compararBracos(bracos.agente, bracos.controle);
  const bloqueios: string[] = [];

  if (config.paused) bloqueios.push("O piloto está PAUSADO (rollback ativo). Nada do agente sai enquanto isso.");
  if (gates && !gates.gatePass)      bloqueios.push(`Portão de qualidade reprovado: ${gates.gateReason}`);
  if (gates && !gates.shadowEvidence) {
    bloqueios.push(
      `Evidência de sombra insuficiente: ${gates.shadowSamples} amostra(s), ` +
      `${(gates.shadowPassRate * 100).toFixed(0)}% de coerência. Deixe o shadow colher mais disparos reais.`,
    );
  }

  // A prova A/B só vale como exigência quando já existe um braço do agente —
  // em SHADOW_ONLY nada do agente sai, então cobrar A/B seria um beco sem saída.
  const jaTemBracoDoAgente = bracos.agente.envios > 0;
  if (proximoDegrau === "RESTAURANT_WIDE") {
    if (!jaTemBracoDoAgente) {
      bloqueios.push("A allowlist ainda não produziu nenhum envio do agente — não há prova A/B para ler.");
    } else if (ab.veredito === "CONTROLE_MELHOR") {
      bloqueios.push("A prova A/B está CONTRA o agente: o sorteio converte mais. Não abrir.");
    } else if (ab.veredito !== "AGENTE_MELHOR") {
      bloqueios.push(`A prova A/B ainda não sustenta a abertura. ${ab.leitura}`);
    }
  }

  const prontoParaPromover = proximoDegrau !== null && !config.paused && bloqueios.length === 0 && Boolean(gates?.allPass);

  const veredito = proximoDegrau === null
    ? "Já está no topo da escada (RESTAURANT_WIDE). O que resta é vigiar a prova A/B."
    : prontoParaPromover
      ? `Pronto para ${proximoDegrau}. A promoção continua sendo decisão sua — este relatório não puxa gatilho.`
      : `Ainda NÃO promover para ${proximoDegrau}. ${bloqueios.length} pendência(s).`;

  return {
    restaurantId,
    modo: config.mode,
    pausado: config.paused,
    abTestPercent: config.abTestPercent,
    telefonesNaAllowlist: config.allowlistedPhones.length,
    proximoDegrau,
    gates,
    ab,
    prontoParaPromover,
    bloqueios,
    veredito,
    runtimeTouched: false,
  };
}
