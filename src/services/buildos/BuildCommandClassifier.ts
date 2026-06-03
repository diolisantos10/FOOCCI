/**
 * BuildCommandClassifier — deterministic, keyword-based classification (Pri 1.3).
 *
 * NO LLM, NO network, NO side effects. Pure functions that infer basic intent
 * metadata from a command's text so later phases can reason about it safely.
 *
 * Safety bias (per spec): when uncertain, classify ONE LEVEL HIGHER. Sensitive
 * areas (payment, auth, database, WhatsApp sending, customer/runtime flow) are
 * NEVER LOW. Destructive language on data/production is CRITICAL. Audit-only can
 * lower the execution intent but never hides the sensitive area's risk.
 */

export type TaskType =
  | "UNKNOWN" | "FEATURE" | "FIX" | "REFACTOR" | "DOCS"
  | "UI_UX" | "CONFIG" | "TEST" | "SECURITY" | "AUDIT";

export type ExecutionIntent =
  | "UNKNOWN" | "AUDIT_ONLY" | "IMPLEMENT" | "FIX" | "REVIEW" | "EXPLAIN";

export type RiskLevel = "UNKNOWN" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface BuildCommandClassification {
  taskType: TaskType;
  executionIntent: ExecutionIntent;
  targetArea: string; // normalized slug, or "unknown"
  riskLevel: RiskLevel;
  requiresHumanConfirmation: boolean;
  classificationSummary: string;
}

// ── helpers ─────────────────────────────────────────────────────────────────────

function norm(text: string): string {
  // lowercase + strip accents so "diagnóstico" matches "diagnostico", etc.
  return (text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function hasAny(haystack: string, needles: string[]): boolean {
  return needles.some((n) => haystack.includes(norm(n)));
}

const RISK_ORDER: RiskLevel[] = ["UNKNOWN", "LOW", "MEDIUM", "HIGH", "CRITICAL"];

/** Return the higher of two risk levels (UNKNOWN is treated as lowest). */
function maxRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  return RISK_ORDER.indexOf(a) >= RISK_ORDER.indexOf(b) ? a : b;
}

// ── audit-only detection ────────────────────────────────────────────────────────

/** True when the operator explicitly asked NOT to implement / only analyze. */
export function isAuditOnlyRequest(normalized: string): boolean {
  return hasAny(normalized, [
    "nao implemente", "nao implementar", "nao mexa", "nao mexer",
    "apenas analise", "apenas analisar", "so analisar", "so analise",
    "somente analise", "sem implementar", "nao altere", "nao alterar",
    "raio-x", "raio x", "raiox",
  ]);
}

// ── task type ───────────────────────────────────────────────────────────────────

export function detectTaskType(text: string): TaskType {
  const t = norm(text);

  // Audit signals (strong, checked first).
  if (hasAny(t, ["raio-x", "raio x", "raiox", "audit", "auditar", "auditoria",
                 "analisar", "analise", "verificar", "diagnostico", "diagnostic",
                 "investigar", "revisar codigo"])) {
    return "AUDIT";
  }
  // Security.
  if (hasAny(t, ["seguranca", "security", "vulnerabilidade", "vazamento",
                 "injection", "prompt injection", "permissao", "permissoes"])) {
    return "SECURITY";
  }
  // Fix.
  if (hasAny(t, ["corrigir", "consertar", "bug", "erro", "quebrou", "quebrado",
                 "nao funciona", "falha", "fix", "defeito"])) {
    return "FIX";
  }
  // Tests.
  if (hasAny(t, ["teste", "testes", "test ", "unit test", "cobertura de teste"])) {
    return "TEST";
  }
  // Config.
  if (hasAny(t, ["config", "configuracao", "variavel de ambiente", "env ",
                 "feature flag", "flag ", "setting", "ajustar config"])) {
    return "CONFIG";
  }
  // Docs.
  if (hasAny(t, ["documentar", "documentacao", "docs", "readme", "comentario"])) {
    return "DOCS";
  }
  // Refactor.
  if (hasAny(t, ["refatorar", "refactor", "reorganizar", "limpar codigo",
                 "simplificar"])) {
    return "REFACTOR";
  }
  // UI/UX.
  if (hasAny(t, ["ui", "ux", "interface", "tela", "layout", "visual", "design",
                 "botao", "card", "icone", "cor ", "estilo"])) {
    return "UI_UX";
  }
  // Feature / implement.
  if (hasAny(t, ["criar", "implementar", "adicionar", "nova funcao",
                 "nova funcionalidade", "feature", "novo recurso", "construir"])) {
    return "FEATURE";
  }
  return "UNKNOWN";
}

// ── execution intent ────────────────────────────────────────────────────────────

export function detectExecutionIntent(text: string): ExecutionIntent {
  const t = norm(text);

  // Explicit "do not implement / only analyze" always wins → audit-only.
  if (isAuditOnlyRequest(t)) return "AUDIT_ONLY";

  if (hasAny(t, ["explicar", "explique", "como funciona", "o que e", "entender"])) {
    return "EXPLAIN";
  }
  if (hasAny(t, ["revisar", "review", "avaliar", "dar feedback"])) {
    return "REVIEW";
  }
  if (hasAny(t, ["corrigir", "consertar", "bug", "erro", "quebrou", "fix",
                 "nao funciona"])) {
    return "FIX";
  }
  if (hasAny(t, ["criar", "implementar", "adicionar", "construir", "desenvolver",
                 "nova funcao", "nova funcionalidade", "feature", "fazer"])) {
    return "IMPLEMENT";
  }
  return "UNKNOWN";
}

// ── target area ─────────────────────────────────────────────────────────────────

/** Ordered area matchers — first match wins (most sensitive listed first). */
const AREA_MATCHERS: Array<{ area: string; keywords: string[] }> = [
  { area: "payment",      keywords: ["pix", "pagamento", "mercado pago", "mercadopago", "stone", "cobranca", "fatura"] },
  { area: "checkout",     keywords: ["checkout", "finalizar pedido", "carrinho", "cart "] },
  { area: "auth",         keywords: ["auth", "login", "senha", "permissao", "permissoes", "admin secret", "token", "sessao", "autenticacao"] },
  { area: "database",     keywords: ["banco", "database", "migration", "tabela", "prisma", "sql"] },
  { area: "waiter",       keywords: ["waiter", "garcom", "/pedido", "pedido", "atendente", "waiterbrain"] },
  { area: "whatsapp",     keywords: ["whatsapp", "evolution", "webhook", "wa "] },
  { area: "crm",          keywords: ["crm", "campanha", "automacao", "recuperacao", "lead"] },
  { area: "menu",         keywords: ["cardapio", "menu", "produto", "item do cardapio"] },
  { area: "delivery",     keywords: ["entrega", "delivery", "frete", "zona de entrega"] },
  { area: "analytics",    keywords: ["analytics", "relatorio", "metrica", "dashboard de dados"] },
  { area: "integrations", keywords: ["integracao", "integracoes", "saipos", "api externa"] },
  { area: "buildos",      keywords: ["build os", "buildos", "prompt relay", "prompt-relay"] },
  { area: "admin",        keywords: ["admin", "painel", "dashboard", "master"] },
  { area: "ui",           keywords: ["ui", "ux", "interface", "tela", "layout", "visual", "design", "botao", "card", "icone"] },
];

export function detectTargetArea(text: string): string {
  const t = norm(text);
  for (const m of AREA_MATCHERS) {
    if (hasAny(t, m.keywords)) return m.area;
  }
  return "unknown";
}

// ── risk level ──────────────────────────────────────────────────────────────────

/** Areas that must NEVER be classified below HIGH. */
const HIGH_FLOOR_AREAS = new Set(["payment", "checkout", "auth", "database", "waiter", "whatsapp"]);
/** Areas that must never be below MEDIUM. */
const MEDIUM_FLOOR_AREAS = new Set(["admin", "crm", "analytics", "integrations", "buildos", "menu", "delivery"]);

export function detectRiskLevel(
  text: string,
  taskType: TaskType,
  targetArea: string,
  _executionIntent: ExecutionIntent,
): RiskLevel {
  const t = norm(text);
  void taskType; // task type does not lower risk; area + destructiveness drive it

  // 1. Destructive language → CRITICAL (never reduced by audit-only).
  const destructive = hasAny(t, [
    "apagar", "deletar", "delete", "remover tudo", "limpar tabela",
    "drop table", "truncate", "resetar producao", "reset producao",
    "wipe", "destrutivo", "zerar banco", "apagar banco", "apagar dados",
    "deletar dados", "formatar",
  ]);
  const touchesData = hasAny(t, ["banco", "database", "tabela", "dados", "producao", "production"]);
  if (destructive && (touchesData || targetArea === "database" || targetArea === "payment")) {
    return "CRITICAL";
  }
  // Destructive language on its own is at least HIGH.
  let risk: RiskLevel = destructive ? "HIGH" : "UNKNOWN";

  // 2. Area floors.
  if (HIGH_FLOOR_AREAS.has(targetArea)) risk = maxRisk(risk, "HIGH");
  else if (MEDIUM_FLOOR_AREAS.has(targetArea)) risk = maxRisk(risk, "MEDIUM");

  // 3. Security/auth destructive combos → CRITICAL.
  if ((targetArea === "auth" || targetArea === "database") && destructive) {
    risk = maxRisk(risk, "CRITICAL");
  }

  // 4. Low-risk signals (cosmetic) — only when NOT in a sensitive area.
  const cosmetic = hasAny(t, ["texto", "copy", "label", "icone", "rotulo", "traducao", "wording"]);
  if (risk === "UNKNOWN") {
    if (cosmetic) risk = "LOW";
    else risk = "MEDIUM"; // uncertain → bias one level up from LOW
  }

  return risk;
}

// ── summary ─────────────────────────────────────────────────────────────────────

const TASK_LABELS: Record<TaskType, string> = {
  UNKNOWN: "Indefinido", FEATURE: "Nova funcionalidade", FIX: "Correção",
  REFACTOR: "Refatoração", DOCS: "Documentação", UI_UX: "UI/UX",
  CONFIG: "Configuração", TEST: "Testes", SECURITY: "Segurança", AUDIT: "Auditoria",
};
const INTENT_LABELS: Record<ExecutionIntent, string> = {
  UNKNOWN: "intenção indefinida", AUDIT_ONLY: "apenas auditar",
  IMPLEMENT: "implementar", FIX: "corrigir", REVIEW: "revisar", EXPLAIN: "explicar",
};
const RISK_LABELS: Record<RiskLevel, string> = {
  UNKNOWN: "risco indefinido", LOW: "risco baixo", MEDIUM: "risco médio",
  HIGH: "risco alto", CRITICAL: "risco crítico",
};

export function buildClassificationSummary(c: Omit<BuildCommandClassification, "classificationSummary">): string {
  const area = c.targetArea === "unknown" ? "área não identificada" : `área: ${c.targetArea}`;
  const confirm = c.requiresHumanConfirmation ? " · requer confirmação humana" : "";
  return `${TASK_LABELS[c.taskType]} (${INTENT_LABELS[c.executionIntent]}) · ${area} · ${RISK_LABELS[c.riskLevel]}${confirm}`;
}

// ── top-level classifier ────────────────────────────────────────────────────────

export function classifyBuildCommandText(text: string): BuildCommandClassification {
  const taskType = detectTaskType(text);
  const executionIntent = detectExecutionIntent(text);
  const targetArea = detectTargetArea(text);
  const riskLevel = detectRiskLevel(text, taskType, targetArea, executionIntent);

  // Confirmation required for MEDIUM/HIGH/CRITICAL (and any non-trivial uncertainty).
  const requiresHumanConfirmation =
    riskLevel === "MEDIUM" || riskLevel === "HIGH" || riskLevel === "CRITICAL" || riskLevel === "UNKNOWN";

  const partial = { taskType, executionIntent, targetArea, riskLevel, requiresHumanConfirmation };
  return { ...partial, classificationSummary: buildClassificationSummary(partial) };
}
