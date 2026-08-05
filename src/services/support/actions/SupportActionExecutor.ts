/**
 * SupportActionExecutor — o executor que fica FORA do Brain.
 *
 * O Brain propõe (devolve uma chave de allowlist) e nunca executa: não tem
 * tool-calling, e `runtimeTouched` é false por invariante. Este arquivo é o
 * outro lado: recebe a chave, consulta a escada e decide o que acontece.
 *
 * EM SOMBRA (degrau atual) NADA RODA. Nem o passo de prévia, que é read-only.
 * O executor devolve uma PROPOSTA — a oferta honesta + o botão que leva o
 * lojista à tela onde ELE faz — e persiste a evidência de que o agente teria
 * agido. É essa evidência que um humano vai olhar antes de promover.
 *
 * E mesmo quando a escada subir, o passo que ESCREVE continua fora daqui: não
 * existe runner para `humanConfirmStep`. O executor, no máximo, prepara uma
 * prévia; publicar é ato do lojista. Não é política — é ausência de código.
 */

import { recordShadowOutcome } from "@/services/brain/runtime/BrainShadowEvidenceService";
import {
  currentActionMode,
  findSupportAction,
  type SupportAction,
  type SupportActionMode,
} from "./SupportActionCatalog";

/** O que o executor devolve para a interface. Nunca um comando — uma oferta. */
export interface SupportActionProposal {
  key: string;
  label: string;
  /** A frase honesta, no futuro, que a UI pode mostrar junto da resposta. */
  offer: string;
  /** O botão que leva o lojista à tela onde ELE confirma. */
  cta: { label: string; href: string };
  /** O que exatamente o humano vai apertar — dito em voz alta, sempre. */
  humanConfirms: string;
  /** Sombra: sempre false. É a prova de que nada rodou. */
  executed: boolean;
  mode: SupportActionMode;
  reason: string;
}

/** Um preparador de prévia. Nenhum está registrado hoje — a escada está em sombra. */
export type PrepareRunner = (ctx: { restaurantId: string }) => Promise<unknown>;

/**
 * Registro de runners. VAZIO de propósito: o passo de prévia do cardápio é feito
 * pela própria tela do lojista hoje. Quando um runner entrar aqui, ele será um
 * passo NÃO-MUTANTE — e o de confirmação nunca entra.
 */
const PREPARE_RUNNERS: Record<string, PrepareRunner> = {};

export interface ProposeInput {
  /** Chave escolhida pelo Brain. Fora do catálogo → nenhuma proposta. */
  actionKey: string | null | undefined;
  restaurantId: string;
  /** Para amarrar a evidência à conversa (thread da Ajuda). */
  conversationId: string;
  /** Veredito e confiança do turno — a evidência viaja com o caso concreto. */
  evidence: { coherence: string; confidence: number };
  /** Injeção para teste e para o futuro. Produção usa o registro do módulo. */
  runners?: Record<string, PrepareRunner>;
  mode?: SupportActionMode;
  recorder?: typeof recordShadowOutcome;
}

function proposalFrom(
  action: SupportAction,
  mode: SupportActionMode,
  executed: boolean,
  reason: string,
): SupportActionProposal {
  return {
    key: action.key,
    label: action.label,
    offer: action.offer,
    cta: { label: action.humanConfirmStep.cta, href: action.humanConfirmStep.screen },
    humanConfirms: action.humanConfirmStep.what,
    executed,
    mode,
    reason,
  };
}

/**
 * Recebe a chave e devolve a proposta. Nunca lança: falha de evidência não pode
 * derrubar o atendimento (guardrail 5 — a proteção não pode ser mais destrutiva
 * que o problema).
 */
export async function proposeSupportAction(input: ProposeInput): Promise<SupportActionProposal | null> {
  const action = findSupportAction(input.actionKey);
  if (!action) return null; // chave fora do catálogo já foi descartada no Brain; aqui é o segundo dente

  const mode = input.mode ?? currentActionMode();
  const runners = input.runners ?? PREPARE_RUNNERS;
  const record = input.recorder ?? recordShadowOutcome;

  let executed = false;
  let reason: string;

  if (mode === "SHADOW_ONLY") {
    reason =
      `Escada em SOMBRA: "${action.label}" seria a ação. Nada foi executado — ` +
      "a proposta ficou registrada como evidência e o lojista segue no controle.";
  } else if (!action.enabled) {
    reason = `"${action.label}" ainda não está habilitada para execução — o lojista faz pela tela.`;
  } else {
    const runner = runners[action.key];
    if (!runner) {
      reason = `"${action.label}" não tem preparador implementado — o lojista faz pela tela.`;
    } else {
      try {
        await runner({ restaurantId: input.restaurantId });
        executed = true;
        reason = `Prévia preparada (passo read-only). ${action.humanConfirmStep.what}.`;
      } catch (err) {
        reason = `Falha ao preparar a prévia (${err instanceof Error ? err.message.slice(0, 80) : "erro"}) — o lojista faz pela tela.`;
      }
    }
  }

  // Evidência: sem ela, "o agente estava pronto" seria achismo. Best-effort.
  try {
    await record({
      restaurantId: input.restaurantId,
      conversationId: input.conversationId,
      agentId: "suporte-tecnico",
      // Proposta feita dentro de um atendimento real ao lojista.
      sampleOrigin: "PRODUCTION",
      intent: `ACAO_PROPOSTA:${action.key}`,
      // Não é uma amostra de raciocínio LLM — não polui a taxa de coerência da
      // escada do free-form, que só conta reasoningMode === "LLM".
      reasoningMode: "ACTION_PROPOSAL",
      engine: `LADDER:${mode}`,
      confidence: input.evidence.confidence,
      coherence: input.evidence.coherence,
      wouldEscalate: false,
      wouldReply: `${executed ? "EXECUTOU" : "PROPÔS"} ${action.key}: ${reason}`,
    });
  } catch {
    // evidência nunca quebra o atendimento
  }

  return proposalFrom(action, mode, executed, reason);
}
