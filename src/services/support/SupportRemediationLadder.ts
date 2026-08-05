/**
 * SupportRemediationLadder — a ESCADA DE AÇÃO do Agente de Suporte (o freio de mão).
 *
 * O agente sempre pode DIAGNOSTICAR, EXPLICAR e SUGERIR. O que a escada governa é
 * a EXECUÇÃO de remediação em produção:
 *
 *   DIAGNOSE / EXPLAIN / SUGGEST  → sempre ligados (100% read-only / texto).
 *   AUTO_REMEDIATE                → só ações da ALLOWLIST, e só quando a escada
 *                                   estiver acima de SHADOW.
 *   arbitrary                     → NUNCA. Não existe caminho para rodar comando livre.
 *
 * Degraus (espelham a escada de governança do Brain):
 *   SHADOW_ONLY (default) → ALLOWLIST → RESTAURANT_WIDE
 *
 * Fase 0: começa em SHADOW_ONLY e a allowlist ativa é VAZIA — o agente propõe, mas
 * nada executa. Abrir a escada e povoar a allowlist é decisão humana, degrau a
 * degrau, com auditoria. O texto livre do usuário NUNCA vira comando: ele dispara
 * o raciocínio, e o raciocínio só pode ESCOLHER entre ações pré-declaradas aqui.
 */

export type RemediationMode = "SHADOW_ONLY" | "ALLOWLIST" | "RESTAURANT_WIDE";

export interface RemediationAction {
  key: string;
  label: string;
  /** O que a ação faz, em uma frase. */
  description: string;
  /** Toda ação da allowlist é reversível e idempotente — pré-requisito para existir. */
  reversible: true;
  idempotent: true;
  /** Máximo de tentativas antes de escalar. */
  maxAttempts: number;
  /** Ligada para execução? Fase 0: tudo false (só catálogo). */
  enabled: boolean;
}

/**
 * CATÁLOGO de ações candidatas — seguras e reversíveis por construção. TODAS
 * nascem `enabled: false` (só existem como alvo de proposta). Ligar uma ação é
 * um ato deliberado, revisado, com o executor implementado por trás (Fase 1+).
 */
export const REMEDIATION_CATALOG: readonly RemediationAction[] = [
  {
    key: "reprocess_meta_inbound",
    label: "Reprocessar entrada do WhatsApp (Meta)",
    description: "Reprocessa a fila de webhooks de entrada dos últimos minutos que ficaram presos.",
    reversible: true, idempotent: true, maxAttempts: 2, enabled: false,
  },
  // A ação "reconectar instância Evolution" saiu em 04/08/2026 junto com o
  // provedor. Não foi substituída: reconectar a Meta exige login do dono pela
  // própria Meta (OAuth), e não há botão que o Agente de TI possa apertar. Uma
  // ação que não existe na escada de remediação é melhor que uma que finge.
  {
    key: "requeue_stuck_campaign",
    label: "Reenfileirar campanha travada",
    description: "Limpa/reenfileira execuções de campanha presas em SENDING/PENDING há muito tempo.",
    reversible: true, idempotent: true, maxAttempts: 1, enabled: false,
  },
];

/** Estado atual da escada. Fase 0: SHADOW_ONLY, hard-coded. Fase 1: virá do DB por restaurante. */
export function currentMode(): RemediationMode {
  return "SHADOW_ONLY";
}

export interface RemediationPlan {
  /** Ação escolhida (do catálogo), ou null quando nenhuma cobre o caso. */
  action: RemediationAction | null;
  /** true só quando a ação existe, está enabled E a escada permite executar. */
  canExecuteNow: boolean;
  /** Motivo legível — sempre preenchido (por que executa / por que não). */
  reason: string;
  /** Sempre: escalar para humano quando não dá para executar com segurança. */
  escalate: boolean;
}

/** Busca a ação pelo key (o reasoner só pode referenciar keys deste catálogo). */
export function findAction(key: string | null | undefined): RemediationAction | null {
  if (!key) return null;
  return REMEDIATION_CATALOG.find((a) => a.key === key) ?? null;
}

/**
 * Decide se a ação candidata pode ser executada AGORA. Puro e conservador:
 * na Fase 0 (SHADOW_ONLY) nada executa — sempre escala. Nunca inventa ação
 * fora do catálogo.
 */
export function planRemediation(actionKey: string | null | undefined, mode: RemediationMode = currentMode()): RemediationPlan {
  const action = findAction(actionKey);

  if (!action) {
    return {
      action: null,
      canExecuteNow: false,
      reason: actionKey
        ? `Ação "${actionKey}" não está no catálogo seguro — escalar para humano.`
        : "Nenhuma ação automática cobre este caso — escalar com o diagnóstico.",
      escalate: true,
    };
  }

  if (mode === "SHADOW_ONLY") {
    return {
      action,
      canExecuteNow: false,
      reason: `Escada em SOMBRA: "${action.label}" seria a ação, mas nada é executado. Proposta registrada; humano decide.`,
      escalate: true,
    };
  }

  if (!action.enabled) {
    return {
      action,
      canExecuteNow: false,
      reason: `"${action.label}" ainda não está habilitada para execução — escalar.`,
      escalate: true,
    };
  }

  // Escada acima de sombra E ação habilitada → poderia executar (Fase 1+ liga o executor real).
  return {
    action,
    canExecuteNow: true,
    reason: `"${action.label}" está habilitada e a escada permite — executar com auditoria (máx ${action.maxAttempts} tentativa(s)).`,
    escalate: false,
  };
}
