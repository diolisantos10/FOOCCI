/**
 * CrmShadowTrainingService — a esteira de treino do agente de CRM.
 *
 * POR QUE EXISTE. O recepcionista tem um replay noturno que enche a evidência
 * dele toda madrugada (`brain-shadow-replay.yml`). O CRM não tinha nada
 * equivalente: a sombra dele só gravava DEPOIS de um disparo real, no máximo 3
 * por campanha. Resultado: um agente parecia progredir e o outro parecia parado,
 * e a diferença não era competência — era esteira. Isto é a esteira que faltava.
 *
 * O QUE ELA FAZ, toda noite:
 *   1. monta casos a partir de dado REAL (comportamento de clientes de verdade)
 *      com DESTINATÁRIO SINTÉTICO, mais um catálogo adversarial fixo;
 *   2. pede ao agente que componha — pelo MESMO caminho da produção
 *      (`reasonCrmMessageForSnapshot` → `reasonAsAgent({agentId:"crm"})`);
 *   3. julga com portão determinístico (`julgarCasoDeTreino`), que só REBAIXA o
 *      veredito do Brain, nunca melhora;
 *   4. grava como evidência de sombra com `sampleOrigin: "TRAINING"`.
 *
 * O QUE ELA NÃO FAZ, por construção:
 *   • não envia mensagem — não importa nada de canal, fila ou disparo;
 *   • não escreve em cliente, campanha ou execução;
 *   • não mistura a contagem dela com a de produção: a origem TRAINING é lida
 *     separadamente pelo gate (`CRM_SHADOW_EVIDENCE`), e o degrau que abre para
 *     todos os clientes reais continua exigindo amostra de vida real.
 *
 * A trava contra envio é verificada por teste estático de imports
 * (`CrmShadowTrainingService.semEnvio.test.ts`): prompt é aviso, código é trava.
 */

import { prisma } from "@/lib/prisma";
import { reasonCrmMessageForSnapshot } from "@/services/crm/CrmAgentReasoner";
import { recordShadowOutcome } from "@/services/brain/runtime/BrainShadowEvidenceService";
import { julgarCasoDeTreino, type TrainingVerdict } from "@/services/brain/training/TrainingCase";
import {
  ADVERSARIAL_SHARE,
  carregarCardapio,
  carregarContexto,
  carregarPerfisReais,
  montarCasosAdversariais,
  montarCasosDePerfil,
  type CrmTrainingCase,
} from "./CrmTrainingCases";

/** Teto de casos por restaurante por rodada — controle de gasto de IA. */
export const DEFAULT_CASES_PER_RESTAURANT = 24;
/** Quantos restaurantes a rodada cobre. Os de base maior primeiro. */
export const DEFAULT_MAX_RESTAURANTS = 3;

export interface CrmTrainingOptions {
  /** Restringe a um restaurante. Omitido = os de maior base. */
  restaurantId?: string;
  casesPerRestaurant?: number;
  maxRestaurants?: number;
  /** Monta os casos e NÃO chama a IA nem grava. Serve para conferir o lote. */
  dryRun?: boolean;
  now?: Date;
}

export interface CrmTrainingRestaurantResult {
  restaurantId: string;
  casesBuilt: number;
  perfisReais: number;
  adversariais: number;
  recorded: number;
  errors: number;
  byVerdict: Record<TrainingVerdict, number>;
  /** Motivo quando o restaurante rendeu menos do que o teto (base pequena, etc.). */
  note?: string;
}

export interface CrmTrainingResult {
  restaurants: CrmTrainingRestaurantResult[];
  totalCases: number;
  totalRecorded: number;
  byVerdict: Record<TrainingVerdict, number>;
  dryRun: boolean;
  /** Invariantes. Não são decoração: o workflow reprova a rodada se mudarem. */
  runtimeTouched: false;
  messagesSent: 0;
}

function zeroVerdicts(): Record<TrainingVerdict, number> {
  return { PASS: 0, FAIL: 0, NEEDS_REVIEW: 0 };
}

/**
 * Restaurantes-alvo: os de maior base de clientes, que é onde o treino rende.
 *
 * Por que não "os que estão na escada": em SHADOW_ONLY ninguém tem linha de
 * config (a ausência JÁ significa SHADOW_ONLY), então filtrar por config
 * devolveria lista vazia e a esteira nunca rodaria. Tamanho de base é o critério
 * que de fato separa quem tem perfil para treinar de quem não tem.
 */
async function escolherRestaurantes(opts: CrmTrainingOptions): Promise<string[]> {
  if (opts.restaurantId) return [opts.restaurantId];
  const max = Math.max(1, Math.min(opts.maxRestaurants ?? DEFAULT_MAX_RESTAURANTS, 20));
  const grupos = await prisma.customer
    .groupBy({
      by: ["restaurantId"],
      where: { isGuest: false },
      _count: { _all: true },
      orderBy: { _count: { restaurantId: "desc" } },
      take: max,
    })
    .catch(() => [] as Array<{ restaurantId: string; _count: { _all: number } }>);
  return grupos.map((g) => g.restaurantId);
}

/** Monta o lote de um restaurante. Separado para o teste poder ler o lote sem IA. */
export async function montarLote(
  restaurantId: string,
  casesPerRestaurant: number,
  now: Date,
): Promise<{ casos: CrmTrainingCase[]; perfisReais: number; adversariais: number; note?: string }> {
  const ctx = await carregarContexto(restaurantId, now);
  const cardapio = await carregarCardapio(restaurantId);

  const adversariais = montarCasosAdversariais(ctx, cardapio);
  // Os adversariais são o piso do lote: mesmo com a base vazia, eles rodam. É
  // deles que sai a medição dos casos onde o agente erra.
  const cotaAdversarial = Math.min(adversariais.length, Math.max(1, Math.round(casesPerRestaurant * ADVERSARIAL_SHARE)));
  const cotaPerfis = Math.max(0, casesPerRestaurant - cotaAdversarial);

  const perfis = cotaPerfis > 0 ? await carregarPerfisReais(restaurantId, cotaPerfis, now) : [];
  const casosPerfil = montarCasosDePerfil(perfis, ctx);

  const note =
    casosPerfil.length < cotaPerfis
      ? `base rendeu ${casosPerfil.length} de ${cotaPerfis} perfis reais pedidos`
      : undefined;

  return {
    casos: [...casosPerfil, ...adversariais.slice(0, cotaAdversarial)],
    perfisReais: casosPerfil.length,
    adversariais: Math.min(adversariais.length, cotaAdversarial),
    note,
  };
}

/**
 * Roda a esteira. Best-effort por caso: um erro isolado não derruba o lote — mas
 * ele é CONTADO, porque "0 amostras e 0 erros" e "0 amostras e 24 erros" são
 * diagnósticos opostos e o relatório precisa distinguir.
 */
export async function runCrmShadowTraining(opts: CrmTrainingOptions = {}): Promise<CrmTrainingResult> {
  const now = opts.now ?? new Date();
  const dryRun = opts.dryRun === true;
  const casesPerRestaurant = Math.max(1, Math.min(opts.casesPerRestaurant ?? DEFAULT_CASES_PER_RESTAURANT, 200));

  const alvos = await escolherRestaurantes(opts);
  const restaurants: CrmTrainingRestaurantResult[] = [];
  const total = zeroVerdicts();

  for (const restaurantId of alvos) {
    const linha: CrmTrainingRestaurantResult = {
      restaurantId,
      casesBuilt: 0,
      perfisReais: 0,
      adversariais: 0,
      recorded: 0,
      errors: 0,
      byVerdict: zeroVerdicts(),
    };

    let lote;
    try {
      lote = await montarLote(restaurantId, casesPerRestaurant, now);
    } catch (err) {
      linha.errors += 1;
      linha.note = `falha ao montar o lote: ${err instanceof Error ? err.message.slice(0, 120) : "erro"}`;
      restaurants.push(linha);
      continue;
    }

    linha.casesBuilt = lote.casos.length;
    linha.perfisReais = lote.perfisReais;
    linha.adversariais = lote.adversariais;
    if (lote.note) linha.note = lote.note;

    if (dryRun) {
      restaurants.push(linha);
      continue;
    }

    for (const caso of lote.casos) {
      try {
        const r = await reasonCrmMessageForSnapshot(restaurantId, caso.input.snapshot, {
          couponCode: caso.input.couponCode,
        });
        if (!r.ok) {
          linha.errors += 1;
          continue;
        }

        const judgement = julgarCasoDeTreino(caso.expectation, {
          message: r.message,
          brainVerdict: (r.coherence as TrainingVerdict) ?? "NEEDS_REVIEW",
          reasoningMode: r.reasoningMode ?? "FALLBACK",
          escalated: r.shouldEscalate === true,
        });

        await recordShadowOutcome({
          restaurantId,
          // O "destinatário" do caso. Não é conversa, não é telefone: é a chave
          // do caso de treino, legível em qualquer perícia futura.
          conversationId: `crm-treino:${caso.key}`,
          agentId: "crm",
          sampleOrigin: "TRAINING",
          intent: `treino:${caso.kind}:${caso.key}`,
          reasoningMode: r.reasoningMode ?? "FALLBACK",
          engine: "crm-agent",
          confidence: r.confidence ?? 0,
          coherence: judgement.verdict,
          wouldEscalate: r.shouldEscalate === true,
          // O alerta carrega a própria evidência: veredito + motivo + a peça.
          wouldReply:
            judgement.reasons.length > 0
              ? `[${judgement.verdict}: ${judgement.reasons.join(" | ")}] ${r.message ?? ""}`
              : (r.message ?? ""),
        });

        linha.recorded += 1;
        linha.byVerdict[judgement.verdict] += 1;
        total[judgement.verdict] += 1;
      } catch (err) {
        linha.errors += 1;
        console.warn("[CrmShadowTraining] caso falhou", {
          restaurantId,
          caso: caso.key,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    restaurants.push(linha);
  }

  return {
    restaurants,
    totalCases: restaurants.reduce((s, r) => s + r.casesBuilt, 0),
    totalRecorded: restaurants.reduce((s, r) => s + r.recorded, 0),
    byVerdict: total,
    dryRun,
    runtimeTouched: false,
    messagesSent: 0,
  };
}
