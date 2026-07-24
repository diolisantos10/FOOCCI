/**
 * SupportKnowledgeMap — o "mapa do sistema" que o Agente de Suporte conhece.
 *
 * Dado ESTÁTICO e puro (sem DB, sem I/O): a arquitetura do FOOCCI em alto nível,
 * os modos de falha conhecidos e o runbook de cada um. É a fonte de verdade de
 * DOMÍNIO do agente — o que ele "estudou" sobre o sistema — que o reasoner injeta
 * no prompt junto com os sinais read-only do momento (SupportSystemProbe).
 *
 * Manter isto curado e honesto é o que separa um diagnóstico útil de um palpite.
 * Cada modo de falha aponta os SINAIS que o confirmam e a AÇÃO de remediação
 * candidata (que só executa se estiver na allowlist da escada — ver
 * SupportRemediationLadder).
 */

export interface SubsystemInfo {
  key: string;
  name: string;
  /** O que quebra a experiência quando este subsistema cai. */
  impact: string;
  /** Sinais read-only que revelam a saúde deste subsistema. */
  signals: string[];
}

export interface FailureMode {
  key: string;
  subsystem: string;
  /** Como o usuário costuma DESCREVER o sintoma (linguagem do lojista). */
  symptom: string;
  /** A causa provável, em termos técnicos. */
  likelyCause: string;
  /** Sinais que CONFIRMAM esta causa (o agente exige sinal antes de concluir). */
  confirmingSignals: string[];
  /** Runbook: o passo-a-passo da correção. */
  runbook: string[];
  /** Chave da ação de remediação candidata (na allowlist), ou null = só humano. */
  remediationAction: string | null;
  /** Severidade default deste modo de falha. */
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

export const SUBSYSTEMS: readonly SubsystemInfo[] = [
  {
    key: "database",
    name: "Banco de dados (Postgres)",
    impact: "Se cai, nada funciona: painel, pedidos, cardápio — tudo depende do banco.",
    signals: ["/api/health → db", "erros P1001/P1017 (conexão)", "'too many clients already'"],
  },
  {
    key: "whatsapp_meta",
    name: "WhatsApp Cloud API (Meta)",
    impact: "Se cai, o restaurante para de receber e responder mensagens no canal oficial.",
    signals: ["/api/integracoes/whatsapp/meta/status", "/api/admin/meta/diag", "webhooks de entrada"],
  },
  {
    key: "whatsapp_evolution",
    name: "WhatsApp não-oficial (Evolution)",
    impact: "Se cai, a instância desconecta e as campanhas/atendimento por Evolution param.",
    signals: ["/api/evolution/status → open|close|connecting"],
  },
  {
    key: "payments",
    name: "Pagamentos (Mercado Pago / Pix)",
    impact: "Se cai, o cliente não consegue pagar e o pedido não fecha.",
    signals: ["webhook do Mercado Pago", "MP_WEBHOOK_SECRET presente", "status do pedido travado em 'aguardando pagamento'"],
  },
  {
    key: "deploy_migrations",
    name: "Deploy e migrações (Railway/Prisma)",
    impact: "Se trava, uma versão nova não sobe ou o schema fica inconsistente.",
    signals: ["deploy FAILED", "P3009 (migração travada)", "preDeploy migrate-deploy.sh"],
  },
  {
    key: "ai_brain",
    name: "IA / Brain (OpenAI)",
    impact: "Se cai, os agentes caem para o modo seguro (fallback) e param de raciocinar.",
    signals: ["OPENAI_API_KEY presente/válida", "401 Incorrect API key", "reasoningMode = FALLBACK"],
  },
  {
    key: "campaign_queue",
    name: "Fila de campanhas de CRM",
    impact: "Se trava, campanhas param de sair ou ficam presas em envio.",
    signals: ["job de campanha zumbi", "execuções presas em PENDING/SENDING"],
  },
];

export const FAILURE_MODES: readonly FailureMode[] = [
  {
    key: "meta_inbound_stopped",
    subsystem: "whatsapp_meta",
    symptom: "Os pedidos/mensagens pararam de chegar no WhatsApp, mas dá pra enviar.",
    likelyCause: "Webhook de entrada do Meta dessinscrito ou fila de entrada presa.",
    confirmingSignals: ["/api/admin/meta/diag mostra subscribed_apps vazio ou phone sem inbound"],
    runbook: [
      "Conferir /api/admin/meta/diag: número conectado? subscribed_apps presente?",
      "Se dessinscrito: re-subscrever o app ao webhook (ação de integração).",
      "Reprocessar a fila de entrada dos últimos minutos.",
      "Confirmar recebimento com uma mensagem de teste.",
    ],
    remediationAction: "reprocess_meta_inbound",
    severity: "HIGH",
  },
  {
    key: "evolution_disconnected",
    subsystem: "whatsapp_evolution",
    symptom: "O WhatsApp (não-oficial) caiu / apareceu como desconectado.",
    likelyCause: "Instância Evolution em estado 'close' — sessão caiu.",
    confirmingSignals: ["/api/evolution/status = close"],
    runbook: [
      "Conferir /api/evolution/status.",
      "Se 'close': disparar reconexão da instância (ação de integração).",
      "Se pedir QR novamente: escalar — precisa do humano reparear o aparelho.",
    ],
    remediationAction: "reconnect_evolution",
    severity: "HIGH",
  },
  {
    key: "db_connection_exhaustion",
    subsystem: "database",
    symptom: "O sistema todo ficou fora do ar / erro ao abrir qualquer tela.",
    likelyCause: "Exaustão de conexões do Postgres ('too many clients already').",
    confirmingSignals: ["/api/health db = unreachable", "logs com 'too many clients'"],
    runbook: [
      "Conferir /api/health (db).",
      "Se exaustão de conexão: escalar para reciclar as conexões do Postgres.",
      "Verificar se houve tempestade de deploys concorrentes.",
    ],
    remediationAction: null, // reciclar Postgres é ação de infra — humano por ora.
    severity: "CRITICAL",
  },
  {
    key: "migration_stuck_p3009",
    subsystem: "deploy_migrations",
    symptom: "A versão nova não sobe / deploy falhando repetidamente.",
    likelyCause: "Migração travada (P3009) bloqueando o preDeploy.",
    confirmingSignals: ["deploy FAILED com P3009", "migrate-deploy.sh em retry"],
    runbook: [
      "Conferir o log do deploy: é P3009?",
      "O migrate-deploy.sh já tenta auto-recuperar (rollback + reaplicar).",
      "Se persistir após os retries: escalar com o nome da migração travada.",
    ],
    remediationAction: null, // já há auto-heal no preDeploy; resto é humano.
    severity: "HIGH",
  },
  {
    key: "ai_key_invalid",
    subsystem: "ai_brain",
    symptom: "As IAs pararam de responder direito / respostas genéricas.",
    likelyCause: "OPENAI_API_KEY ausente ou inválida — Brain em fallback.",
    confirmingSignals: ["/api/health openaiKey = false", "401 Incorrect API key nos logs"],
    runbook: [
      "Conferir /api/health (openaiKey presente?).",
      "Se inválida/ausente: escalar para rotacionar a chave (segredo — nunca expor).",
      "Após corrigir: confirmar que reasoningMode voltou a LLM via probe.",
    ],
    remediationAction: null, // troca de segredo é sempre humano.
    severity: "HIGH",
  },
  {
    key: "campaign_queue_stuck",
    subsystem: "campaign_queue",
    symptom: "As campanhas não estão saindo / travadas.",
    likelyCause: "Job de campanha zumbi ou execuções presas em SENDING.",
    confirmingSignals: ["execuções antigas ainda em PENDING/SENDING"],
    runbook: [
      "Conferir se há execuções presas há muito tempo.",
      "Reenfileirar/limpar o job zumbi (ação segura e reversível).",
      "Confirmar que a próxima janela de envio processa normalmente.",
    ],
    remediationAction: "requeue_stuck_campaign",
    severity: "MEDIUM",
  },
];

/** Bloco de texto compacto do mapa, para injetar no prompt do reasoner. */
export function buildKnowledgeMapContext(): string {
  const subs = SUBSYSTEMS.map((s) => `• ${s.name} — ${s.impact} (sinais: ${s.signals.join("; ")})`).join("\n");
  const modes = FAILURE_MODES.map((m) =>
    [
      `— [${m.subsystem}] ${m.symptom}`,
      `  causa provável: ${m.likelyCause}`,
      `  confirma com: ${m.confirmingSignals.join("; ")}`,
      `  ação candidata: ${m.remediationAction ?? "NENHUMA (escalar para humano)"} · severidade ${m.severity}`,
    ].join("\n"),
  ).join("\n");

  return [
    "━━━ MAPA DO SISTEMA FOOCCI (o que você conhece) ━━━",
    "SUBSISTEMAS:",
    subs,
    "",
    "MODOS DE FALHA CONHECIDOS (sintoma → causa → sinal → ação):",
    modes,
    "━━━",
  ].join("\n");
}

/** Sobreposição mínima de palavras para considerar um modo de falha (evita que
 *  uma única palavra genérica — "pedidos", "banco" — force um diagnóstico). */
const MIN_MATCH_SCORE = 2;

/** Acha o(s) modo(s) de falha cujo sintoma casa com o relato (heurística por palavra-chave).
 *  Conservador de propósito: na dúvida NÃO casa — o agente prefere pedir mais
 *  informação a inventar uma causa. */
export function matchFailureModes(report: string): FailureMode[] {
  const t = report.toLowerCase();
  const hits: Array<{ m: FailureMode; score: number }> = [];
  for (const m of FAILURE_MODES) {
    const words = `${m.symptom} ${m.likelyCause}`.toLowerCase().match(/[a-zà-ú]{4,}/g) ?? [];
    const uniq = [...new Set(words)];
    const score = uniq.filter((w) => t.includes(w)).length;
    if (score >= MIN_MATCH_SCORE) hits.push({ m, score });
  }
  return hits.sort((a, b) => b.score - a.score).map((h) => h.m);
}
